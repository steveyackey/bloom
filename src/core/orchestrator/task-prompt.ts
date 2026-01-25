// =============================================================================
// Task Prompt Building
// =============================================================================
// This module handles fetching available tasks and building prompts for agents.

import { getWorktreePath, listRepos } from "../../infra/git";
import { type GitConfig, getTaskBranch, getTaskMergeTarget, getTaskPRTarget, type Task } from "../../task-schema";
import { getAvailableTasks, loadTasks, saveTasks, updateTaskStatus } from "../../tasks";

// =============================================================================
// Types
// =============================================================================

export interface GitTaskInfo {
  branch: string;
  baseBranch?: string;
  mergeInto?: string;
  /** If true, create a PR instead of auto-merging */
  openPR?: boolean;
  /** Target branch for the PR (if openPR is true) */
  prBase?: string;
  worktreePath: string;
}

export interface TaskGetResult {
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

// =============================================================================
// Task Fetching
// =============================================================================

/**
 * Get the next available task for an agent and build the prompt.
 */
export async function getTaskForAgent(agentName: string, tasksFile: string, bloomDir: string): Promise<TaskGetResult> {
  const tasksData = await loadTasks(tasksFile);
  const available = getAvailableTasks(tasksData.tasks, agentName);

  const task = available[0];
  if (!task) {
    return { available: false };
  }

  updateTaskStatus(tasksData.tasks, task.id, "in_progress", agentName);
  await saveTasks(tasksFile, tasksData);

  const taskCli = `bloom -f "${tasksFile}"`;
  const gitConfig = tasksData.git;

  // Build git info if task has a branch
  let gitInfo: GitTaskInfo | null = null;
  const branch = getTaskBranch(task);

  if (branch && task.repo) {
    const repoName = task.repo;
    const isPath = repoName.startsWith("./") || repoName.startsWith("/");

    if (!isPath) {
      // Get repo info to determine base branch
      const reposList = await listRepos(bloomDir);
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
        worktreePath: getWorktreePath(bloomDir, repoName, branch),
      };
    }
  }

  const prompt = buildTaskPrompt(task, gitInfo, taskCli, gitConfig);

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
 * Build the task prompt with instructions and git workflow.
 */
function buildTaskPrompt(task: Task, gitInfo: GitTaskInfo | null, taskCli: string, gitConfig?: GitConfig): string {
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

  return prompt;
}

// =============================================================================
// Session Management
// =============================================================================

/**
 * Save or clear the session ID on a task for later resumption.
 * Pass empty string or undefined to clear the session ID.
 */
export async function saveTaskSessionId(
  tasksFile: string,
  taskId: string,
  sessionId: string | undefined
): Promise<void> {
  const tasksData = await loadTasks(tasksFile);

  function updateSession(tasks: Task[]): boolean {
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

  if (updateSession(tasksData.tasks)) {
    await saveTasks(tasksFile, tasksData);
  }
}

/**
 * Build a prompt for resuming an agent to commit changes.
 */
export function buildCommitResumePrompt(
  status: { modifiedFiles: string[]; untrackedFiles: string[]; stagedFiles: string[] },
  gitConfig?: GitConfig
): string {
  return `The task is marked as done but there are uncommitted changes in the working directory:
${status.modifiedFiles.length > 0 ? `- Modified files: ${status.modifiedFiles.join(", ")}` : ""}
${status.untrackedFiles.length > 0 ? `- Untracked files: ${status.untrackedFiles.join(", ")}` : ""}
${status.stagedFiles.length > 0 ? `- Staged files: ${status.stagedFiles.join(", ")}` : ""}

Please commit all changes and ${gitConfig?.push_to_remote ? "push to remote" : "ensure work is saved"}.`;
}

/**
 * Build a prompt for resolving merge conflicts.
 */
export function buildMergeConflictPrompt(
  taskId: string,
  taskTitle: string,
  sourceBranch: string,
  targetBranch: string,
  targetWorktreePath: string,
  originalPrompt: string | undefined,
  gitConfig?: GitConfig
): string {
  // Extract instructions from original prompt if available
  const instructionsMatch = originalPrompt?.match(/## Instructions\n([\s\S]*?)(?=\n## |$)/);
  const instructions = instructionsMatch?.[1]?.trim() || "See original task instructions.";

  return `## Merge Conflict Resolution Required

The merge of \`${sourceBranch}\` into \`${targetBranch}\` has conflicts.

### Context
- **Task**: ${taskTitle} (${taskId})
- **Source branch**: \`${sourceBranch}\`
- **Target branch**: \`${targetBranch}\`
- **Working directory**: \`${targetWorktreePath}\` (the TARGET worktree, not your original worktree)
- **Merge lock**: You have exclusive access - other agents are waiting for you to finish

### Your Goal
Resolve the merge conflicts while preserving the intent of the original task:
${instructions}

### Steps
1. You are now in the TARGET worktree (\`${targetBranch}\` branch)
2. Use \`git status\` to see conflicting files
3. Open each conflicting file and resolve the conflicts
4. Stage resolved files: \`git add <file>\`
5. Complete the merge: \`git commit -m "Merge ${sourceBranch}: ${taskTitle}"\`
${gitConfig?.push_to_remote ? `6. Push the result: \`git push origin ${targetBranch}\`` : ""}

### Important
- Do NOT switch branches - stay on \`${targetBranch}\`
- Prioritize preserving the functionality from the task while keeping the target branch stable
- Work efficiently - other agents may be waiting for this merge lock
- If conflicts are too complex, abort with \`git merge --abort\` and report the issue`;
}
