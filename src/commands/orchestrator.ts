// =============================================================================
// Orchestrator and Agent Work Loop
// =============================================================================

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { type AgentName, createAgent } from "../agents";
import { logger } from "../logger";
import { OrchestratorTUI } from "../orchestrator-tui";
import { PromptCompiler } from "../prompts/compiler";
import {
  addWorktree,
  cleanupMergedBranches,
  getWorktreePath,
  getWorktreeStatus,
  listRepos,
  listWorktrees,
  mergeBranch,
  pullDefaultBranch,
  pushBranch,
  releaseMergeLock,
  waitForMergeLock,
} from "../repos";
import { createDashboardService } from "../services";
import { type GitConfig, getTaskBranch, getTaskMergeTarget, getTaskPRTarget } from "../task-schema";
import {
  getAllAgents,
  getAllRepos,
  getAvailableTasks,
  loadTasks,
  primeTasks,
  resetStuckTasks,
  saveTasks,
  updateTaskStatus,
} from "../tasks";
import { getDefaultAgentName, loadUserConfig } from "../user-config";
import { BLOOM_DIR, FLOATING_AGENT, getTasksFile, POLL_INTERVAL_MS, REPOS_DIR } from "./context";

// =============================================================================
// Types
// =============================================================================

interface GitTaskInfo {
  branch: string;
  baseBranch?: string;
  mergeInto?: string;
  /** If true, create a PR instead of auto-merging */
  openPR?: boolean;
  /** Target branch for the PR (if openPR is true) */
  prBase?: string;
  worktreePath: string;
}

interface TaskGetResult {
  available: boolean;
  taskId?: string;
  title?: string;
  repo?: string | null;
  gitInfo?: GitTaskInfo | null;
  prompt?: string;
  taskCli?: string;
  gitConfig?: GitConfig;
  /** Existing session ID if resuming interrupted work */
  sessionId?: string;
  /** Agent provider override for this task (e.g., "claude", "copilot"). If not set, uses config default. */
  agent?: string;
}

interface AgentConfig {
  name: string;
  command?: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** If set, run this service in-process instead of spawning a subprocess */
  service?: import("../orchestrator-tui").InProcessService;
}

// =============================================================================
// Agent Work Loop
// =============================================================================

async function getTaskForAgent(agentName: string): Promise<TaskGetResult> {
  const tasksFile = await loadTasks(getTasksFile());
  const available = getAvailableTasks(tasksFile.tasks, agentName);

  const task = available[0];
  if (!task) {
    return { available: false };
  }

  updateTaskStatus(tasksFile.tasks, task.id, "in_progress", agentName);
  await saveTasks(getTasksFile(), tasksFile);

  const taskCli = `bloom -f "${getTasksFile()}"`;
  const gitConfig = tasksFile.git;

  // Build git info if task has a branch
  let gitInfo: GitTaskInfo | null = null;
  const branch = getTaskBranch(task);

  if (branch && task.repo) {
    const repoName = task.repo;
    const isPath = repoName.startsWith("./") || repoName.startsWith("/");

    if (!isPath) {
      // Get repo info to determine base branch
      const reposList = await listRepos(BLOOM_DIR);
      const repo = reposList.find((r) => r.name === repoName);
      const defaultBranch = repo?.defaultBranch || "main";
      const baseBranch = task.base_branch || defaultBranch;
      const mergeInto = getTaskMergeTarget(task);
      const prTarget = getTaskPRTarget(task);

      gitInfo = {
        branch,
        baseBranch,
        mergeInto,
        openPR: task.open_pr,
        prBase: prTarget ?? (task.open_pr ? defaultBranch : undefined),
        worktreePath: getWorktreePath(BLOOM_DIR, repoName, branch),
      };
    }
  }

  let prompt = `# Task: ${task.title}\n\n## Task ID: ${task.id}\n\n`;

  if (task.instructions) {
    prompt += `## Instructions\n${task.instructions}\n\n`;
  }

  if (task.acceptance_criteria.length > 0) {
    prompt += `## Acceptance Criteria\n${task.acceptance_criteria.map((c) => `- ${c}`).join("\n")}\n\n`;
  }

  if (task.depends_on.length > 0) {
    prompt += `## Dependencies (completed)\n${task.depends_on.map((d) => `- ${d}`).join("\n")}\n\n`;
  }

  if (task.ai_notes.length > 0) {
    prompt += `## Previous Notes\n${task.ai_notes.map((n) => `- ${n}`).join("\n")}\n\n`;
  }

  // Add git workflow instructions if applicable
  if (gitInfo) {
    prompt += `## Git Workflow\n`;
    prompt += `- **Working branch**: \`${gitInfo.branch}\`\n`;
    prompt += `- **Base branch**: \`${gitInfo.baseBranch}\`\n`;

    if (gitInfo.openPR && gitInfo.prBase) {
      prompt += `- **PR target**: \`${gitInfo.prBase}\` (PR will be created automatically after task completes)\n\n`;
    } else if (gitInfo.mergeInto) {
      prompt += `- **Merge target**: \`${gitInfo.mergeInto}\` (handled automatically after task completes)\n\n`;
    }

    // IMPORTANT: Agents should NOT switch branches or merge - worktrees require each branch
    // to be checked out in only one place. The CLI handles merging from the target worktree.
    prompt += `### Important - Worktree Safety\n`;
    prompt += `**Do NOT switch branches or run \`git checkout\`** - this worktree is dedicated to \`${gitInfo.branch}\`.\n`;
    prompt += `The merge will be handled automatically by the orchestrator after you mark the task done.\n\n`;

    prompt += `### Before marking done:\n`;
    prompt += `1. Commit all changes with a descriptive message\n`;
    if (gitConfig?.push_to_remote) {
      prompt += `2. Push your branch to remote:\n`;
      prompt += `   \`\`\`bash\n`;
      prompt += `   git push -u origin ${gitInfo.branch}\n`;
      prompt += `   \`\`\`\n`;
    }
    prompt += `\n`;
  }

  prompt += `## Your Mission
Complete this task according to the instructions and acceptance criteria above.
When finished, mark the task as done using:
  ${taskCli} done ${task.id}

If you encounter blockers, mark it as blocked:
  ${taskCli} block ${task.id}

Begin working on the task now.`;

  return {
    available: true,
    taskId: task.id,
    title: task.title,
    repo: task.repo || null,
    gitInfo,
    prompt,
    taskCli,
    gitConfig,
    sessionId: task.session_id, // Resume existing session if available
    agent: task.agent, // Per-task agent provider override
  };
}

/**
 * Save or clear the session ID on a task for later resumption.
 * Pass empty string or undefined to clear the session ID.
 */
async function saveTaskSessionId(taskId: string, sessionId: string | undefined): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());

  function updateSession(tasks: import("../task-schema").Task[]): boolean {
    for (const task of tasks) {
      if (task.id === taskId) {
        // Clear session_id if empty, otherwise set it
        task.session_id = sessionId || undefined;
        return true;
      }
      if (updateSession(task.subtasks)) return true;
    }
    return false;
  }

  if (updateSession(tasksFile.tasks)) {
    await saveTasks(getTasksFile(), tasksFile);
  }
}

export async function runAgentWorkLoop(agentName: string): Promise<void> {
  const agentLog = logger.agent(agentName);
  agentLog.info(`Starting work loop (polling every ${POLL_INTERVAL_MS / 1000}s)...`);

  // Load user config to determine default agent provider
  const userConfig = await loadUserConfig();
  const defaultProvider = getDefaultAgentName(userConfig) as AgentName;
  agentLog.debug(`Default agent provider: ${defaultProvider}`);

  // Cache agents by provider to avoid recreating them
  const agentCache = new Map<string, Awaited<ReturnType<typeof createAgent>>>();

  async function getOrCreateAgent(provider: string) {
    if (!agentCache.has(provider)) {
      agentLog.debug(`Creating agent for provider: ${provider}`);
      const agent = await createAgent("nonInteractive", { agentName: provider });
      agentCache.set(provider, agent);
    }
    return agentCache.get(provider)!;
  }

  // Create default agent initially
  await getOrCreateAgent(defaultProvider);

  while (true) {
    try {
      const taskResult = await getTaskForAgent(agentName);

      if (!taskResult.available) {
        agentLog.debug("No work available. Sleeping...");
        await Bun.sleep(POLL_INTERVAL_MS);
        continue;
      }

      agentLog.info(`Found work: ${taskResult.taskId} - ${taskResult.title}`);

      let workingDir = BLOOM_DIR;

      if (taskResult.repo) {
        // Check if repo is a path or just a name
        const isPath = taskResult.repo.startsWith("./") || taskResult.repo.startsWith("/");

        if (isPath) {
          // Direct path - resolve it relative to BLOOM_DIR
          workingDir = resolve(BLOOM_DIR, taskResult.repo);
        } else {
          // Repo name - use bare repo architecture
          const repoName = taskResult.repo;

          if (taskResult.gitInfo) {
            // Pull latest from origin before creating worktree to ensure we start fresh
            agentLog.info(`Pulling latest updates for ${repoName}...`);
            const pullResult = await pullDefaultBranch(BLOOM_DIR, repoName);
            if (pullResult.success) {
              if (pullResult.updated) {
                agentLog.info(`Updated ${repoName} to latest`);
              } else {
                agentLog.debug(`${repoName} already up to date`);
              }
            } else {
              agentLog.warn(`Failed to pull ${repoName}: ${pullResult.error}`);
              agentLog.info("Proceeding with existing local state...");
            }

            // Lazy worktree creation - create only when agent picks up work
            const worktrees = await listWorktrees(BLOOM_DIR, repoName);
            const worktreeExists = worktrees.some((w) => w.branch === taskResult.gitInfo!.branch);

            if (!worktreeExists) {
              agentLog.info(`Creating worktree for branch: ${taskResult.gitInfo.branch}`);
              if (taskResult.gitInfo.baseBranch) {
                agentLog.info(`  Base branch: ${taskResult.gitInfo.baseBranch}`);
              }
              const result = await addWorktree(BLOOM_DIR, repoName, taskResult.gitInfo.branch, {
                create: true,
                baseBranch: taskResult.gitInfo.baseBranch,
              });
              if (!result.success) {
                agentLog.error(`Failed to create worktree: ${result.error}`);
              }
            }
            workingDir = taskResult.gitInfo.worktreePath;
          } else {
            // No branch specified - use the default branch worktree
            const reposList = await listRepos(BLOOM_DIR);
            const repo = reposList.find((r) => r.name === repoName);
            if (repo) {
              workingDir = getWorktreePath(BLOOM_DIR, repoName, repo.defaultBranch);
            } else {
              workingDir = join(REPOS_DIR, repoName);
            }
          }
        }

        // Verify the working directory exists
        if (!existsSync(workingDir)) {
          agentLog.error(`Working directory does not exist: ${workingDir}`);
          agentLog.error("Run 'bloom repo sync' to clone missing repos.");
        }
      }

      // Determine which agent provider to use for this task
      // Per-task agent overrides config default
      const taskProvider = (taskResult.agent ?? defaultProvider) as AgentName;
      if (taskResult.agent) {
        agentLog.info(`Task specifies agent: ${taskProvider}`);
      }

      // Get or create the agent for this provider
      const agent = await getOrCreateAgent(taskProvider);

      // Compile the agent system prompt using the PromptCompiler
      // This injects task context variables into the prompt template
      const compiler = new PromptCompiler();
      const systemPrompt = await compiler.loadAndCompile("agent-system", {
        variables: {
          AGENT_NAME: agentName,
          TASK_ID: taskResult.taskId!,
          TASK_CLI: taskResult.taskCli!,
        },
      });

      agentLog.info(`Starting ${taskProvider} session in: ${workingDir}`);

      // Only use session ID if the task's agent matches the provider
      // Session IDs are provider-specific (Claude IDs won't work with OpenCode, etc.)
      const canResumeSession = !taskResult.agent || taskResult.agent === defaultProvider;
      const sessionIdToUse = canResumeSession ? taskResult.sessionId : undefined;

      const startTime = Date.now();
      let result = await agent.run({
        systemPrompt,
        prompt: taskResult.prompt!,
        startingDirectory: workingDir,
        agentName,
        taskId: taskResult.taskId,
        sessionId: sessionIdToUse,
      });
      const duration = Math.round((Date.now() - startTime) / 1000);

      // Check for fatal session errors that indicate corrupted state
      // These errors mean we should NOT save/reuse this session
      const isFatalSessionError =
        result.error &&
        (result.error.includes("tool_use") ||
          result.error.includes("concurrency") ||
          result.error.includes("must be unique") ||
          result.error.includes("must start with") ||
          result.error.includes("invalid_format"));

      // Save session ID for future resumption (only if session is healthy)
      if (result.sessionId && taskResult.taskId && !isFatalSessionError) {
        await saveTaskSessionId(taskResult.taskId, result.sessionId);
      } else if (isFatalSessionError && taskResult.taskId) {
        // Clear corrupted session ID so next attempt starts fresh
        agentLog.warn("Session appears corrupted, clearing session ID for fresh start");
        await saveTaskSessionId(taskResult.taskId, undefined);
      }

      if (result.success) {
        agentLog.info(`Task ${taskResult.taskId} completed successfully (${duration}s)`);

        // Post-task validation: check for uncommitted changes
        if (taskResult.gitInfo) {
          const status = getWorktreeStatus(taskResult.gitInfo.worktreePath);

          if (!status.clean) {
            agentLog.warn(`Branch ${taskResult.gitInfo.branch} has uncommitted changes:`);
            if (status.modifiedFiles.length > 0) {
              agentLog.warn(`  Modified: ${status.modifiedFiles.join(", ")}`);
            }
            if (status.untrackedFiles.length > 0) {
              agentLog.warn(`  Untracked: ${status.untrackedFiles.join(", ")}`);
            }
            if (status.stagedFiles.length > 0) {
              agentLog.warn(`  Staged: ${status.stagedFiles.join(", ")}`);
            }

            // Resume agent to finish the git work
            agentLog.info("Resuming agent to commit remaining changes...");
            const resumePrompt = `The task is marked as done but there are uncommitted changes in the working directory:
${status.modifiedFiles.length > 0 ? `- Modified files: ${status.modifiedFiles.join(", ")}` : ""}
${status.untrackedFiles.length > 0 ? `- Untracked files: ${status.untrackedFiles.join(", ")}` : ""}
${status.stagedFiles.length > 0 ? `- Staged files: ${status.stagedFiles.join(", ")}` : ""}

Please commit all changes and ${taskResult.gitConfig?.push_to_remote ? "push to remote" : "ensure work is saved"}.`;

            result = await agent.run({
              systemPrompt,
              prompt: resumePrompt,
              startingDirectory: workingDir,
              agentName,
              taskId: taskResult.taskId,
              sessionId: result.sessionId, // Resume the same session
            });

            // Save updated session ID
            if (result.sessionId && taskResult.taskId) {
              await saveTaskSessionId(taskResult.taskId, result.sessionId);
            }
          }

          // Push source branch if configured (required for PR creation)
          if (taskResult.gitConfig?.push_to_remote && taskResult.gitInfo.branch) {
            const postStatus = getWorktreeStatus(taskResult.gitInfo.worktreePath);
            if (postStatus.clean) {
              agentLog.info(`Pushing branch ${taskResult.gitInfo.branch} to remote...`);
              const pushResult = pushBranch(taskResult.gitInfo.worktreePath, taskResult.gitInfo.branch, {
                setUpstream: true,
              });
              if (pushResult.success) {
                agentLog.info(`Pushed ${taskResult.gitInfo.branch} successfully`);
              } else {
                agentLog.warn(`Failed to push: ${pushResult.error}`);
              }
            }
          }

          // Create PR if open_pr is configured
          if (taskResult.gitInfo.openPR && taskResult.gitInfo.prBase && taskResult.repo) {
            const sourceBranch = taskResult.gitInfo.branch;
            const targetBranch = taskResult.gitInfo.prBase;

            // Build PR body from task details
            let prBody = "";
            if (taskResult.prompt) {
              // Extract instructions from prompt
              const instructionsMatch = taskResult.prompt.match(/## Instructions\n([\s\S]*?)(?=\n## |$)/);
              if (instructionsMatch?.[1]) {
                prBody += `## Summary\n${instructionsMatch[1].trim()}\n\n`;
              }
              // Extract acceptance criteria
              const acMatch = taskResult.prompt.match(/## Acceptance Criteria\n([\s\S]*?)(?=\n## |$)/);
              if (acMatch?.[1]) {
                prBody += `## Acceptance Criteria\n${acMatch[1].trim()}\n`;
              }
            }

            agentLog.info(`Creating PR: ${sourceBranch} -> ${targetBranch}...`);

            try {
              const ghResult = Bun.spawnSync(
                [
                  "gh",
                  "pr",
                  "create",
                  "--title",
                  taskResult.title || `Task: ${taskResult.taskId}`,
                  "--body",
                  prBody || `Automated PR for task ${taskResult.taskId}`,
                  "--base",
                  targetBranch,
                  "--head",
                  sourceBranch,
                ],
                {
                  cwd: taskResult.gitInfo.worktreePath,
                  stdout: "pipe",
                  stderr: "pipe",
                }
              );

              if (ghResult.exitCode === 0) {
                const prUrl = ghResult.stdout.toString().trim();
                agentLog.info(`PR created: ${prUrl}`);
              } else {
                const stderr = ghResult.stderr.toString().trim();
                // Check if PR already exists
                if (stderr.includes("already exists")) {
                  agentLog.info(`PR already exists for ${sourceBranch}`);
                } else {
                  agentLog.warn(`Failed to create PR: ${stderr}`);
                }
              }
            } catch (err) {
              agentLog.warn(`Error creating PR: ${err}`);
            }
          }

          // Auto merge into target branch if configured
          // IMPORTANT: We do this from the TARGET worktree, not the source worktree
          if (taskResult.gitInfo.mergeInto && taskResult.repo) {
            // Set status to done_pending_merge before attempting merge
            // This ensures we can recover if the orchestrator is killed mid-merge
            agentLog.info(`Setting task ${taskResult.taskId} to done_pending_merge...`);
            const pendingTasksFile = await loadTasks(getTasksFile());
            updateTaskStatus(pendingTasksFile.tasks, taskResult.taskId!, "done_pending_merge");
            await saveTasks(getTasksFile(), pendingTasksFile);
            const targetWorktreePath = getWorktreePath(BLOOM_DIR, taskResult.repo, taskResult.gitInfo.mergeInto);
            const targetBranch = taskResult.gitInfo.mergeInto;
            const sourceBranch = taskResult.gitInfo.branch;

            // Acquire merge lock to prevent concurrent merges to same branch
            agentLog.info(`Waiting for merge lock on ${targetBranch}...`);
            const lockResult = await waitForMergeLock(
              BLOOM_DIR,
              taskResult.repo,
              targetBranch,
              agentName,
              sourceBranch,
              {
                pollIntervalMs: 5000,
                maxWaitMs: 5 * 60 * 1000, // 5 minutes
                onWaiting: (holder, waitTimeMs) => {
                  const waitSecs = Math.round(waitTimeMs / 1000);
                  agentLog.info(
                    `Waiting for merge lock (${waitSecs}s) - held by ${holder.agentName} merging ${holder.sourceBranch}`
                  );
                },
              }
            );

            if (lockResult.timedOut) {
              agentLog.warn(`Timed out waiting for merge lock on ${targetBranch}. Skipping merge.`);
            } else {
              // We have the lock - proceed with merge
              try {
                // Check if target worktree exists, create it if not
                let targetStatus = getWorktreeStatus(targetWorktreePath);
                if (!targetStatus.exists) {
                  agentLog.info(`Creating worktree for merge target: ${targetBranch}`);
                  const createResult = await addWorktree(BLOOM_DIR, taskResult.repo, targetBranch, {
                    create: false, // Checkout existing branch
                  });
                  if (!createResult.success) {
                    agentLog.error(`Failed to create target worktree: ${createResult.error}`);
                  } else {
                    targetStatus = getWorktreeStatus(targetWorktreePath);
                  }
                }

                if (targetStatus.exists) {
                  // Make sure target worktree is clean before merging
                  if (targetStatus.clean) {
                    agentLog.info(`Merging ${sourceBranch} into ${targetBranch} from target worktree...`);
                    const mergeResult = mergeBranch(targetWorktreePath, sourceBranch, {
                      noFf: true,
                      message: `Merge ${sourceBranch}: ${taskResult.title}`,
                    });
                    if (mergeResult.success) {
                      agentLog.info(`Merged ${sourceBranch} into ${targetBranch} successfully`);

                      // Push merged target branch if configured
                      if (taskResult.gitConfig?.push_to_remote) {
                        agentLog.info(`Pushing ${targetBranch} to remote...`);
                        const targetPush = pushBranch(targetWorktreePath, targetBranch);
                        if (targetPush.success) {
                          agentLog.info(`Pushed ${targetBranch} successfully`);
                        } else {
                          agentLog.warn(`Failed to push ${targetBranch}: ${targetPush.error}`);
                        }
                      }

                      // Merge successful - update status from done_pending_merge to done
                      agentLog.info(`Setting task ${taskResult.taskId} to done (merge complete)...`);
                      const doneTasksFile = await loadTasks(getTasksFile());
                      updateTaskStatus(doneTasksFile.tasks, taskResult.taskId!, "done");
                      await saveTasks(getTasksFile(), doneTasksFile);
                    } else {
                      // Merge failed - likely conflicts. Have the agent resolve them.
                      // NOTE: We still hold the merge lock during conflict resolution,
                      // so other agents will wait in queue until we're done.
                      agentLog.warn(`Merge failed: ${mergeResult.error}`);
                      agentLog.info("Resuming agent to resolve merge conflicts (merge lock held)...");

                      const conflictPrompt = `## Merge Conflict Resolution Required

The merge of \`${sourceBranch}\` into \`${targetBranch}\` has conflicts.

### Context
- **Task**: ${taskResult.title} (${taskResult.taskId})
- **Source branch**: \`${sourceBranch}\`
- **Target branch**: \`${targetBranch}\`
- **Working directory**: \`${targetWorktreePath}\` (the TARGET worktree, not your original worktree)
- **Merge lock**: You have exclusive access - other agents are waiting for you to finish

### Your Goal
Resolve the merge conflicts while preserving the intent of the original task:
${taskResult.prompt?.split("## Instructions")[1]?.split("## Acceptance Criteria")[0]?.trim() || "See original task instructions."}

### Steps
1. You are now in the TARGET worktree (\`${targetBranch}\` branch)
2. Use \`git status\` to see conflicting files
3. Open each conflicting file and resolve the conflicts
4. Stage resolved files: \`git add <file>\`
5. Complete the merge: \`git commit -m "Merge ${sourceBranch}: ${taskResult.title}"\`
${taskResult.gitConfig?.push_to_remote ? `6. Push the result: \`git push origin ${targetBranch}\`` : ""}

### Important
- Do NOT switch branches - stay on \`${targetBranch}\`
- Prioritize preserving the functionality from the task while keeping the target branch stable
- Work efficiently - other agents may be waiting for this merge lock
- If conflicts are too complex, abort with \`git merge --abort\` and report the issue`;

                      const conflictResult = await agent.run({
                        systemPrompt,
                        prompt: conflictPrompt,
                        startingDirectory: targetWorktreePath, // Work from target worktree
                        agentName,
                        taskId: taskResult.taskId,
                        sessionId: result.sessionId, // Resume same session for context
                      });

                      if (conflictResult.sessionId && taskResult.taskId) {
                        await saveTaskSessionId(taskResult.taskId, conflictResult.sessionId);
                      }

                      if (conflictResult.success) {
                        agentLog.info("Agent resolved merge conflicts successfully");

                        // Push if configured
                        if (taskResult.gitConfig?.push_to_remote) {
                          const finalStatus = getWorktreeStatus(targetWorktreePath);
                          if (finalStatus.clean) {
                            agentLog.info(`Pushing ${targetBranch} to remote...`);
                            const targetPush = pushBranch(targetWorktreePath, targetBranch);
                            if (targetPush.success) {
                              agentLog.info(`Pushed ${targetBranch} successfully`);
                            } else {
                              agentLog.warn(`Failed to push ${targetBranch}: ${targetPush.error}`);
                            }
                          }
                        }

                        // Merge successful after conflict resolution - update status to done
                        agentLog.info(
                          `Setting task ${taskResult.taskId} to done (merge complete after conflict resolution)...`
                        );
                        const conflictDoneTasksFile = await loadTasks(getTasksFile());
                        updateTaskStatus(conflictDoneTasksFile.tasks, taskResult.taskId!, "done");
                        await saveTasks(getTasksFile(), conflictDoneTasksFile);
                      } else {
                        agentLog.warn("Agent could not resolve merge conflicts. Manual intervention needed.");
                        // Task remains in done_pending_merge status for manual intervention
                      }
                    }
                  } else {
                    agentLog.warn(`Cannot merge: target worktree (${targetBranch}) has uncommitted changes`);
                  }
                } else {
                  agentLog.warn(`Cannot merge: failed to create target worktree for ${targetBranch}`);
                }
              } finally {
                // Always release the lock
                releaseMergeLock(BLOOM_DIR, taskResult.repo, targetBranch);
                agentLog.debug(`Released merge lock on ${targetBranch}`);
              }
            }
          }

          // Auto cleanup merged branches if configured
          if (taskResult.gitConfig?.auto_cleanup_merged && taskResult.gitInfo.mergeInto && taskResult.repo) {
            agentLog.info(`Cleaning up branches merged into ${taskResult.gitInfo.mergeInto}...`);
            const cleanup = await cleanupMergedBranches(BLOOM_DIR, taskResult.repo, taskResult.gitInfo.mergeInto);
            if (cleanup.deleted.length > 0) {
              agentLog.info(`Deleted merged branches: ${cleanup.deleted.join(", ")}`);
            }
            if (cleanup.failed.length > 0) {
              for (const f of cleanup.failed) {
                agentLog.warn(`Failed to delete ${f.branch}: ${f.error}`);
              }
            }
          }
        }
      } else {
        agentLog.error(`Task ${taskResult.taskId} ended with error after ${duration}s: ${result.error}`);
      }

      await Bun.sleep(1000);
    } catch (err) {
      agentLog.error("Error in work loop:", err);
      await Bun.sleep(POLL_INTERVAL_MS);
    }
  }
}

// =============================================================================
// Orchestrator
// =============================================================================

export async function startOrchestrator(): Promise<void> {
  logger.orchestrator.info("Checking repos...");
  const repos = await listRepos(BLOOM_DIR);
  if (repos.length === 0) {
    logger.orchestrator.info("No repos configured. Use 'bloom repo clone <url>' to add one.");
  } else {
    const missingRepos = repos.filter((r) => !r.exists);
    if (missingRepos.length > 0) {
      logger.orchestrator.warn(`Missing repos: ${missingRepos.map((r) => r.name).join(", ")}. Run 'bloom repo sync'.`);
    } else {
      logger.orchestrator.info(`Found ${repos.length} repo(s): ${repos.map((r) => r.name).join(", ")}`);
    }
  }

  let agents: Set<string>;
  let taskRepos: Set<string>;
  try {
    logger.orchestrator.info("Validating tasks.yaml...");
    const tasksFile = await loadTasks(getTasksFile());

    // Extract repos referenced in tasks
    taskRepos = getAllRepos(tasksFile.tasks);

    // Pull latest updates only for repos used in tasks
    if (taskRepos.size > 0) {
      const existingRepos = repos.filter((r) => r.exists).map((r) => r.name);
      const reposToPull = [...taskRepos].filter((r) => existingRepos.includes(r));

      if (reposToPull.length > 0) {
        logger.orchestrator.info(`Pulling latest updates for task repos: ${reposToPull.join(", ")}...`);

        const updated: string[] = [];
        const upToDate: string[] = [];
        const failed: { name: string; error: string }[] = [];

        for (const repoName of reposToPull) {
          const result = await pullDefaultBranch(BLOOM_DIR, repoName);
          if (!result.success) {
            failed.push({ name: repoName, error: result.error || "Unknown error" });
          } else if (result.updated) {
            updated.push(repoName);
          } else {
            upToDate.push(repoName);
          }
        }

        if (updated.length > 0) {
          logger.orchestrator.info(`Updated: ${updated.join(", ")}`);
        }
        if (upToDate.length > 0) {
          logger.orchestrator.info(`Already up to date: ${upToDate.join(", ")}`);
        }
        if (failed.length > 0) {
          for (const { name, error } of failed) {
            logger.orchestrator.warn(`Failed to pull ${name}: ${error}`);
          }
          logger.orchestrator.info("Proceeding with existing local state.");
        }
      }
    }

    logger.orchestrator.info("Checking for stuck tasks...");
    const resetCount = resetStuckTasks(tasksFile, logger.reset);
    if (resetCount > 0) {
      logger.orchestrator.info(`Reset ${resetCount} stuck task(s)`);
      await saveTasks(getTasksFile(), tasksFile);
    }

    logger.orchestrator.info("Priming tasks...");
    const primedCount = await primeTasks(getTasksFile(), tasksFile, logger.prime);
    if (primedCount > 0) {
      logger.orchestrator.info(`Primed ${primedCount} task(s) to ready_for_agent`);
    } else {
      logger.orchestrator.debug("No tasks needed priming");
    }

    agents = getAllAgents(tasksFile.tasks);
  } catch (err) {
    // Check if it's a YAML parsing error
    if (err instanceof Error && (err.name === "YAMLParseError" || err.message.includes("YAML"))) {
      logger.orchestrator.error("Failed to parse tasks.yaml - likely a YAML syntax error.");
      logger.orchestrator.error("Run 'bloom validate' for details, then fix the issues.");
      logger.orchestrator.error(`Error: ${err.message}`);
      process.exit(1);
    }
    logger.orchestrator.warn("No tasks.yaml or no agents defined yet. Creating session with dashboard only.");
    agents = new Set();
  }

  await startTUI(agents);
}

async function startTUI(agents: Set<string>): Promise<void> {
  const agentConfigs: AgentConfig[] = [];
  // Always pass the tasks file explicitly since subprocesses run in BLOOM_DIR,
  // not the original pwd where the user ran `bloom run`
  // Note: Global flags must come AFTER the command name for Clerc CLI parsing
  const tasksFile = getTasksFile();

  // Dashboard pane (runs in-process - no subprocess needed)
  agentConfigs.push({
    name: "dashboard",
    service: createDashboardService(tasksFile),
  });

  // Human Questions pane (needs interactive terminal, must be subprocess)
  agentConfigs.push({ name: "questions", command: ["bloom", "questions-dashboard", "-f", tasksFile], cwd: BLOOM_DIR });

  // Agent panes (spawn claude CLI, must be subprocess)
  for (const agentName of [...agents].sort()) {
    agentConfigs.push({
      name: agentName,
      command: ["bloom", "agent", "run", agentName, "-f", tasksFile],
      cwd: BLOOM_DIR,
    });
  }

  // Floating agent (spawn claude CLI, must be subprocess)
  agentConfigs.push({
    name: FLOATING_AGENT,
    command: ["bloom", "agent", "run", FLOATING_AGENT, "-f", tasksFile],
    cwd: BLOOM_DIR,
  });

  logger.orchestrator.info("Starting TUI...");
  const tui = new OrchestratorTUI(agentConfigs);
  await tui.start();
}
