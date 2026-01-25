// =============================================================================
// Task Prompt Building
// =============================================================================
// This module handles fetching available tasks and building prompts for agents.

import { getWorktreePath, listRepos } from "../../infra/git";
import {
  type GitConfig,
  getTaskBranch,
  getTaskMergeTarget,
  getTaskPRTarget,
  type Task,
  type TaskStep,
} from "../../task-schema";
import {
  getAvailableTasks,
  getCompletedSteps,
  getCurrentStep,
  hasSteps,
  loadTasks,
  saveTasks,
  updateTaskStatus,
} from "../../tasks";

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

/**
 * Information about the current step when a task has steps.
 */
export interface StepInfo {
  stepId: string;
  stepIndex: number;
  totalSteps: number;
  instruction: string;
  acceptanceCriteria: string[];
  isFirstStep: boolean;
  /** Completed steps for context in prompt */
  previousSteps: Array<{ id: string; instruction: string }>;
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
  /** Step info if task has pending steps */
  stepInfo?: StepInfo;
  /** True if there are more steps after the current one */
  hasMoreSteps?: boolean;
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

  // Check if task has steps
  let stepInfo: StepInfo | undefined;
  let hasMoreSteps = false;
  let prompt: string;

  if (hasSteps(task)) {
    const currentStepResult = getCurrentStep(task);
    if (currentStepResult) {
      const { step, index } = currentStepResult;
      const completedSteps = getCompletedSteps(task);
      const totalSteps = task.steps!.length;

      stepInfo = {
        stepId: step.id,
        stepIndex: index,
        totalSteps,
        instruction: step.instruction,
        acceptanceCriteria: step.acceptance_criteria,
        isFirstStep: index === 0,
        previousSteps: completedSteps.map((s) => ({
          id: s.id,
          instruction: s.instruction.split("\n")[0] || s.instruction, // First line only for context
        })),
      };

      hasMoreSteps = index < totalSteps - 1;
      prompt = buildStepPrompt(task, step, index, totalSteps, gitInfo, taskCli, gitConfig);
    } else {
      // All steps are done - build regular task completion prompt
      prompt = buildTaskPrompt(task, gitInfo, taskCli, gitConfig);
    }
  } else {
    // No steps - build regular task prompt
    prompt = buildTaskPrompt(task, gitInfo, taskCli, gitConfig);
  }

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
    stepInfo,
    hasMoreSteps,
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

/**
 * Build a prompt for a specific step within a task.
 * First step includes full task context; subsequent steps are minimal continuations.
 */
function buildStepPrompt(
  task: Task,
  step: TaskStep,
  stepIndex: number,
  totalSteps: number,
  gitInfo: GitTaskInfo | null,
  taskCli: string,
  _gitConfig?: GitConfig
): string {
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === totalSteps - 1;
  const completedSteps = getCompletedSteps(task);

  let prompt = "";

  if (isFirstStep) {
    // First step: include full task context
    prompt += `# Task: ${task.title}\n\n`;
    prompt += `## Task ID: ${task.id}\n\n`;
    prompt += `This task has ${totalSteps} steps. You'll work on one step at a time.\n\n`;

    if (task.acceptance_criteria.length > 0) {
      prompt += `## Overall Task Acceptance Criteria\n`;
      prompt += `${task.acceptance_criteria.map((c) => `- ${c}`).join("\n")}\n\n`;
    }

    if (task.ai_notes.length > 0) {
      prompt += `## Previous Notes\n${task.ai_notes.map((n) => `- ${n}`).join("\n")}\n\n`;
    }
  } else {
    // Subsequent steps: minimal context, reference previous work
    prompt += `# Continuing Task: ${task.title}\n\n`;
    prompt += `## Progress: Step ${stepIndex + 1} of ${totalSteps}\n\n`;

    if (completedSteps.length > 0) {
      prompt += `## Completed Steps\n`;
      for (const completed of completedSteps) {
        prompt += `- ✓ **${completed.id}**: ${completed.instruction.split("\n")[0]}\n`;
      }
      prompt += "\n";
    }
  }

  // Current step instruction
  prompt += `## Current Step: ${step.id} (${stepIndex + 1}/${totalSteps})\n\n`;
  prompt += `### Instruction\n${step.instruction}\n\n`;

  if (step.acceptance_criteria.length > 0) {
    prompt += `### Step Acceptance Criteria\n`;
    prompt += `${step.acceptance_criteria.map((c) => `- ${c}`).join("\n")}\n\n`;
  }

  // Git workflow (only on first step to avoid repetition)
  if (isFirstStep && gitInfo) {
    prompt += `## Git Workflow\n`;
    prompt += `- **Working branch**: \`${gitInfo.branch}\`\n`;
    prompt += `- **Base branch**: \`${gitInfo.baseBranch}\`\n`;

    if (gitInfo.openPR && gitInfo.prBase) {
      prompt += `- **PR target**: \`${gitInfo.prBase}\` (created after ALL steps complete)\n\n`;
    } else if (gitInfo.mergeInto) {
      prompt += `- **Merge target**: \`${gitInfo.mergeInto}\` (merged after ALL steps complete)\n\n`;
    }

    prompt += `**Do NOT switch branches** - stay on \`${gitInfo.branch}\`.\n\n`;
  }

  // Instructions for completing the step
  prompt += `## When This Step Is Complete\n\n`;
  prompt += `1. Commit your changes for this step\n`;
  prompt += `2. Mark the step as done:\n`;
  prompt += `   \`\`\`bash\n`;
  prompt += `   ${taskCli} step done ${step.id}\n`;
  prompt += `   \`\`\`\n`;
  prompt += `3. Exit immediately after marking the step done\n\n`;

  if (isLastStep) {
    prompt += `**This is the final step.** After completing it, the task will be ready for git operations (push/merge/PR).\n\n`;
  } else {
    prompt += `After you exit, Bloom will resume your session with the next step. Your context will be preserved.\n\n`;
  }

  prompt += `## Important\n`;
  prompt += `- Only work on THIS step's instruction\n`;
  prompt += `- Commit after completing the step\n`;
  prompt += `- Run \`${taskCli} step done ${step.id}\` then EXIT\n`;
  prompt += `- Do NOT mark the overall task as done until all steps are complete\n\n`;

  prompt += `Begin working on step ${step.id} now.`;

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
 * Build a continuation prompt for the next step in a task.
 * This is used when resuming the agent session with the next step.
 */
export function buildNextStepPrompt(task: Task, stepIndex: number, taskCli: string): string {
  if (!task.steps || stepIndex >= task.steps.length) {
    throw new Error(`Invalid step index ${stepIndex} for task ${task.id}`);
  }

  const step = task.steps[stepIndex];
  if (!step) {
    throw new Error(`Step at index ${stepIndex} not found for task ${task.id}`);
  }
  const totalSteps = task.steps.length;
  const isLastStep = stepIndex === totalSteps - 1;
  const completedSteps = task.steps.slice(0, stepIndex).filter((s) => s.status === "done");

  let prompt = `# Continuing Task: ${task.title}\n\n`;
  prompt += `## Progress: Step ${stepIndex + 1} of ${totalSteps}\n\n`;

  if (completedSteps.length > 0) {
    prompt += `## Completed Steps\n`;
    for (const completed of completedSteps) {
      prompt += `- ✓ **${completed.id}**: ${completed.instruction.split("\n")[0] || completed.instruction}\n`;
    }
    prompt += "\n";
  }

  // Current step instruction
  prompt += `## Current Step: ${step.id} (${stepIndex + 1}/${totalSteps})\n\n`;
  prompt += `### Instruction\n${step.instruction}\n\n`;

  if (step.acceptance_criteria.length > 0) {
    prompt += `### Step Acceptance Criteria\n`;
    prompt += `${step.acceptance_criteria.map((c) => `- ${c}`).join("\n")}\n\n`;
  }

  // Instructions for completing the step
  prompt += `## When This Step Is Complete\n\n`;
  prompt += `1. Commit your changes for this step\n`;
  prompt += `2. Mark the step as done:\n`;
  prompt += `   \`\`\`bash\n`;
  prompt += `   ${taskCli} step done ${step.id}\n`;
  prompt += `   \`\`\`\n`;
  prompt += `3. Exit immediately after marking the step done\n\n`;

  if (isLastStep) {
    prompt += `**This is the final step.** After completing it, the task will be ready for git operations (push/merge/PR).\n\n`;
  } else {
    prompt += `After you exit, Bloom will resume your session with the next step. Your context will be preserved.\n\n`;
  }

  prompt += `## Important\n`;
  prompt += `- Only work on THIS step's instruction\n`;
  prompt += `- Commit after completing the step\n`;
  prompt += `- Run \`${taskCli} step done ${step.id}\` then EXIT\n`;
  prompt += `- Do NOT mark the overall task as done until all steps are complete\n\n`;

  prompt += `Begin working on step ${step.id} now.`;

  return prompt;
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
