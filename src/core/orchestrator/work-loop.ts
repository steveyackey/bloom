// =============================================================================
// Agent Work Loop
// =============================================================================
// This module contains the main work loop for agents. It polls for tasks,
// creates worktrees, runs agent sessions, and handles post-task operations.
// All progress is reported via the EventHandler callback.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { type AgentName, createAgent } from "../../agents";
import { getDefaultAgentName, loadUserConfig } from "../../infra/config";
import { addWorktree, getWorktreePath, listRepos, listWorktrees, pullDefaultBranch } from "../../infra/git";
import { PromptCompiler } from "../../prompts/compiler";
import { loadTasks, saveTasks, updateTaskStatus } from "../../tasks";
import type { EventHandler } from "./events";
import {
  acquireMergeLock,
  checkUncommittedChanges,
  cleanupMergedBranchesForTask,
  createPullRequest,
  ensureTargetWorktree,
  performMerge,
  pushBranchToRemote,
  pushMergedBranch,
  releaseMergeLockForBranch,
  setTaskDone,
  setTaskPendingMerge,
} from "./post-task";
import { buildCommitResumePrompt, buildMergeConflictPrompt, getTaskForAgent, saveTaskSessionId } from "./task-prompt";

// =============================================================================
// Types
// =============================================================================

export interface WorkLoopOptions {
  /** Path to tasks.yaml file */
  tasksFile: string;
  /** Bloom workspace directory */
  bloomDir: string;
  /** Repos directory within bloomDir */
  reposDir: string;
  /** Polling interval in milliseconds */
  pollIntervalMs: number;
  /** Optional agent provider override (overrides user config) */
  agentProviderOverride?: string;
}

// =============================================================================
// Constants
// =============================================================================

const MAX_COMMIT_RETRIES = 3;

// =============================================================================
// Work Loop
// =============================================================================

/**
 * Run the agent work loop. This function polls for available tasks,
 * assigns them to the agent, and handles post-task operations.
 *
 * @param agentName - The name of the agent (used for task assignment)
 * @param options - Work loop configuration
 * @param onEvent - Callback for progress events
 */
export async function runAgentWorkLoop(
  agentName: string,
  options: WorkLoopOptions,
  onEvent: EventHandler
): Promise<void> {
  const { tasksFile, bloomDir, reposDir, pollIntervalMs, agentProviderOverride } = options;

  // Load user config to determine default agent provider
  const userConfig = await loadUserConfig();
  const defaultProvider = (agentProviderOverride || getDefaultAgentName(userConfig)) as AgentName;

  onEvent({
    type: "agent:started",
    agentName,
    provider: defaultProvider,
    pollInterval: pollIntervalMs,
  });

  if (agentProviderOverride) {
    onEvent({
      type: "log",
      level: "info",
      message: `Agent provider override: ${defaultProvider}`,
    });
  }

  // Cache agents by provider to avoid recreating them
  const agentCache = new Map<string, Awaited<ReturnType<typeof createAgent>>>();

  // Track commit retry attempts per task to prevent infinite loops
  const commitRetryCount = new Map<string, number>();

  async function getOrCreateAgent(provider: string) {
    if (!agentCache.has(provider)) {
      onEvent({
        type: "log",
        level: "debug",
        message: `Creating agent for provider: ${provider}`,
      });
      const agent = await createAgent("nonInteractive", { agentName: provider });
      agentCache.set(provider, agent);
    }
    return agentCache.get(provider)!;
  }

  // Create default agent initially
  await getOrCreateAgent(defaultProvider);

  while (true) {
    try {
      const taskResult = await getTaskForAgent(agentName, tasksFile, bloomDir);

      if (!taskResult.available) {
        onEvent({ type: "agent:idle", agentName });
        await Bun.sleep(pollIntervalMs);
        continue;
      }

      onEvent({
        type: "task:found",
        taskId: taskResult.taskId!,
        title: taskResult.title!,
        agentName,
        repo: taskResult.repo,
      });

      let workingDir = bloomDir;

      if (taskResult.repo) {
        // Check if repo is a path or just a name
        const isPath = taskResult.repo.startsWith("./") || taskResult.repo.startsWith("/");

        if (isPath) {
          // Direct path - resolve it relative to bloomDir
          workingDir = resolve(bloomDir, taskResult.repo);
        } else {
          // Repo name - use bare repo architecture
          const repoName = taskResult.repo;

          if (taskResult.gitInfo) {
            // Pull latest from origin before creating worktree
            onEvent({
              type: "git:pulling",
              repo: repoName,
            });

            const pullResult = await pullDefaultBranch(bloomDir, repoName);

            onEvent({
              type: "git:pulled",
              repo: repoName,
              updated: pullResult.updated || false,
              error: pullResult.success ? undefined : pullResult.error,
            });

            // Lazy worktree creation - create only when agent picks up work
            const worktrees = await listWorktrees(bloomDir, repoName);
            const worktreeExists = worktrees.some((w) => w.branch === taskResult.gitInfo!.branch);

            if (!worktreeExists) {
              onEvent({
                type: "worktree:creating",
                repo: repoName,
                branch: taskResult.gitInfo.branch,
                baseBranch: taskResult.gitInfo.baseBranch,
              });

              const result = await addWorktree(bloomDir, repoName, taskResult.gitInfo.branch, {
                create: true,
                baseBranch: taskResult.gitInfo.baseBranch,
              });

              onEvent({
                type: "worktree:created",
                repo: repoName,
                branch: taskResult.gitInfo.branch,
                success: result.success,
                error: result.error,
              });
            }
            workingDir = taskResult.gitInfo.worktreePath;
          } else {
            // No branch specified - use the default branch worktree
            const reposList = await listRepos(bloomDir);
            const repo = reposList.find((r) => r.name === repoName);
            if (repo) {
              workingDir = getWorktreePath(bloomDir, repoName, repo.defaultBranch);
            } else {
              workingDir = join(reposDir, repoName);
            }
          }
        }

        // Verify the working directory exists
        if (!existsSync(workingDir)) {
          onEvent({
            type: "error",
            message: `Working directory does not exist: ${workingDir}. Run 'bloom repo sync' to clone missing repos.`,
          });
        }
      }

      // Determine which agent provider to use for this task
      const taskProvider = (taskResult.agent ?? defaultProvider) as AgentName;
      if (taskResult.agent) {
        onEvent({
          type: "log",
          level: "info",
          message: `Task specifies agent: ${taskProvider}`,
        });
      }

      // Get or create the agent for this provider
      const agent = await getOrCreateAgent(taskProvider);

      // Compile the agent system prompt
      const compiler = new PromptCompiler();
      const systemPrompt = await compiler.loadAndCompile("agent-system", {
        variables: {
          AGENT_NAME: agentName,
          TASK_ID: taskResult.taskId!,
          TASK_CLI: taskResult.taskCli!,
        },
      });

      // Only use session ID if the task's agent matches the provider
      const canResumeSession = !taskResult.agent || taskResult.agent === defaultProvider;
      const sessionIdToUse = canResumeSession ? taskResult.sessionId : undefined;

      onEvent({
        type: "task:started",
        taskId: taskResult.taskId!,
        agentName,
        workingDir,
        provider: taskProvider,
        resuming: !!sessionIdToUse,
      });

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
      const errorOrOutput = `${result.error || ""} ${result.output || ""}`;
      const hasFatalSessionPattern =
        errorOrOutput.includes("tool_use") ||
        errorOrOutput.includes("concurrency") ||
        errorOrOutput.includes("must be unique") ||
        errorOrOutput.includes("must start with") ||
        errorOrOutput.includes("invalid_format") ||
        errorOrOutput.includes("invalid_request_error");
      const wasResuming = !!sessionIdToUse;
      const isFatalSessionError = !result.success && (hasFatalSessionPattern || wasResuming);

      // Save session ID for future resumption (only if session is healthy)
      if (result.sessionId && taskResult.taskId && !isFatalSessionError) {
        await saveTaskSessionId(tasksFile, taskResult.taskId, result.sessionId);
      } else if (isFatalSessionError && taskResult.taskId) {
        onEvent({
          type: "session:corrupted",
          taskId: taskResult.taskId,
          wasResuming,
          reason: hasFatalSessionPattern ? errorOrOutput.slice(0, 200) : "Session failed during resume",
        });
        await saveTaskSessionId(tasksFile, taskResult.taskId, undefined);
      }

      if (result.success) {
        onEvent({
          type: "task:completed",
          taskId: taskResult.taskId!,
          agentName,
          duration,
        });

        // Post-task validation: check for uncommitted changes
        if (taskResult.gitInfo) {
          const status = checkUncommittedChanges(taskResult.gitInfo, onEvent);

          if (!status.clean) {
            // Resume agent to finish the git work
            const resumePrompt = buildCommitResumePrompt(status, taskResult.gitConfig);

            result = await agent.run({
              systemPrompt,
              prompt: resumePrompt,
              startingDirectory: workingDir,
              agentName,
              taskId: taskResult.taskId,
              sessionId: result.sessionId,
            });

            // Save updated session ID
            if (result.sessionId && taskResult.taskId) {
              await saveTaskSessionId(tasksFile, taskResult.taskId, result.sessionId);
            }

            // Check if uncommitted changes still exist after resume
            const postResumeStatus = checkUncommittedChanges(taskResult.gitInfo, onEvent);
            if (!postResumeStatus.clean) {
              const taskId = taskResult.taskId!;
              const retries = (commitRetryCount.get(taskId) || 0) + 1;
              commitRetryCount.set(taskId, retries);

              onEvent({
                type: "commit:retry",
                taskId,
                attempt: retries,
                maxAttempts: MAX_COMMIT_RETRIES,
              });

              if (retries >= MAX_COMMIT_RETRIES) {
                // Max retries reached - mark task as blocked
                onEvent({
                  type: "task:blocked",
                  taskId,
                  agentName,
                  reason: `Max commit retries (${MAX_COMMIT_RETRIES}) reached`,
                });

                const blockedTasksFile = await loadTasks(tasksFile);
                updateTaskStatus(blockedTasksFile.tasks, taskId, "blocked");
                await saveTasks(tasksFile, blockedTasksFile);
                commitRetryCount.delete(taskId);
              } else {
                // Clear session ID to force a fresh session on next attempt
                await saveTaskSessionId(tasksFile, taskId, undefined);
              }

              // Skip remaining git operations for this task
              continue;
            } else {
              // Commit succeeded - clear retry counter
              if (taskResult.taskId) {
                commitRetryCount.delete(taskResult.taskId);
              }
            }
          }

          // Push source branch if configured
          if (taskResult.gitConfig?.push_to_remote && taskResult.gitInfo.branch) {
            pushBranchToRemote(taskResult.gitInfo, onEvent);
          }

          // Create PR if open_pr is configured
          if (taskResult.gitInfo.openPR && taskResult.gitInfo.prBase && taskResult.repo) {
            createPullRequest(taskResult.gitInfo, taskResult.taskId!, taskResult.title!, taskResult.prompt, onEvent);
          }

          // Auto merge into target branch if configured
          if (taskResult.gitInfo.mergeInto && taskResult.repo) {
            await handleMerge(
              {
                taskId: taskResult.taskId!,
                taskTitle: taskResult.title!,
                repo: taskResult.repo,
                gitInfo: taskResult.gitInfo,
                gitConfig: taskResult.gitConfig,
                prompt: taskResult.prompt,
                bloomDir,
                tasksFile,
                agentName,
              },
              agent,
              systemPrompt,
              result.sessionId,
              onEvent
            );
          }

          // Auto cleanup merged branches if configured
          if (taskResult.gitConfig?.auto_cleanup_merged && taskResult.gitInfo.mergeInto && taskResult.repo) {
            await cleanupMergedBranchesForTask(
              {
                taskId: taskResult.taskId!,
                taskTitle: taskResult.title!,
                repo: taskResult.repo,
                gitInfo: taskResult.gitInfo,
                gitConfig: taskResult.gitConfig,
                bloomDir,
                tasksFile,
                agentName,
              },
              onEvent
            );
          }
        }
      } else {
        onEvent({
          type: "task:failed",
          taskId: taskResult.taskId!,
          agentName,
          duration,
          error: result.error || "Unknown error",
        });
      }

      await Bun.sleep(1000);
    } catch (err) {
      onEvent({
        type: "error",
        message: "Error in work loop",
        context: { error: String(err) },
      });
      await Bun.sleep(pollIntervalMs);
    }
  }
}

// =============================================================================
// Merge Handler
// =============================================================================

async function handleMerge(
  ctx: {
    taskId: string;
    taskTitle: string;
    repo: string;
    gitInfo: NonNullable<Awaited<ReturnType<typeof getTaskForAgent>>["gitInfo"]>;
    gitConfig?: Awaited<ReturnType<typeof getTaskForAgent>>["gitConfig"];
    prompt?: string;
    bloomDir: string;
    tasksFile: string;
    agentName: string;
  },
  agent: Awaited<ReturnType<typeof createAgent>>,
  systemPrompt: string,
  sessionId: string | undefined,
  onEvent: EventHandler
): Promise<void> {
  // Set status to done_pending_merge before attempting merge
  await setTaskPendingMerge(ctx.tasksFile, ctx.taskId);

  // Acquire merge lock
  const lockResult = await acquireMergeLock(ctx, onEvent);
  if (lockResult.timedOut) {
    return;
  }

  const targetBranch = ctx.gitInfo.mergeInto!;

  try {
    // Ensure target worktree exists
    const worktreeResult = await ensureTargetWorktree(ctx, onEvent);
    if (!worktreeResult.exists) {
      return;
    }

    if (!worktreeResult.clean) {
      onEvent({
        type: "log",
        level: "warn",
        message: `Cannot merge: target worktree (${targetBranch}) has uncommitted changes`,
      });
      return;
    }

    // Perform the merge
    const mergeResult = performMerge(ctx, onEvent);

    if (mergeResult.success) {
      // Push merged target branch if configured
      if (ctx.gitConfig?.push_to_remote) {
        pushMergedBranch(ctx, onEvent);
      }

      // Update status to done
      await setTaskDone(ctx.tasksFile, ctx.taskId);
    } else if (mergeResult.conflictResolutionNeeded) {
      // Have the agent resolve conflicts
      onEvent({
        type: "merge:conflict_resolving",
        sourceBranch: ctx.gitInfo.branch,
        targetBranch,
      });

      const targetWorktreePath = getWorktreePath(ctx.bloomDir, ctx.repo, targetBranch);
      const conflictPrompt = buildMergeConflictPrompt(
        ctx.taskId,
        ctx.taskTitle,
        ctx.gitInfo.branch,
        targetBranch,
        targetWorktreePath,
        ctx.prompt,
        ctx.gitConfig
      );

      const conflictResult = await agent.run({
        systemPrompt,
        prompt: conflictPrompt,
        startingDirectory: targetWorktreePath,
        agentName: ctx.agentName,
        taskId: ctx.taskId,
        sessionId,
      });

      if (conflictResult.sessionId && ctx.taskId) {
        await saveTaskSessionId(ctx.tasksFile, ctx.taskId, conflictResult.sessionId);
      }

      onEvent({
        type: "merge:conflict_resolved",
        sourceBranch: ctx.gitInfo.branch,
        targetBranch,
        success: conflictResult.success,
      });

      if (conflictResult.success) {
        // Push if configured
        if (ctx.gitConfig?.push_to_remote) {
          pushMergedBranch(ctx, onEvent);
        }

        // Update status to done
        await setTaskDone(ctx.tasksFile, ctx.taskId);
      }
      // If conflict resolution failed, task remains in done_pending_merge for manual intervention
    }
  } finally {
    // Always release the lock
    releaseMergeLockForBranch(ctx.bloomDir, ctx.repo, targetBranch);
    onEvent({
      type: "log",
      level: "debug",
      message: `Released merge lock on ${targetBranch}`,
    });
  }
}
