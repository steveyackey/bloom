import { z } from "zod";

// =============================================================================
// Task Status
// =============================================================================

export const TaskStatusSchema = z.enum([
  "todo",
  "ready_for_agent",
  "assigned",
  "in_progress",
  "done_pending_merge",
  "done",
  "blocked",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// =============================================================================
// Git Configuration (top-level)
// =============================================================================

export const GitConfigSchema = z.object({
  /** Push to remote after each task completes successfully (default: false) */
  push_to_remote: z.boolean().default(false),
  /** Automatically delete local branches that have been merged (default: false) */
  auto_cleanup_merged: z.boolean().default(false),
});
export type GitConfig = z.infer<typeof GitConfigSchema>;

// =============================================================================
// Task Schema (recursive for subtasks)
// =============================================================================

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  phase?: number;
  depends_on: string[];
  /** Folder path to execute this task in */
  repo?: string;
  /** Working branch for this task. Worktree path is derived from this (slashes -> hyphens) */
  branch?: string;
  /** Base branch to create the working branch from if it doesn't exist (default: repo's default branch) */
  base_branch?: string;
  /** Branch to merge working branch into when task completes. Same as `branch` means no merge needed */
  merge_into?: string;
  /** If true, create a GitHub PR instead of auto-merging. PR targets merge_into branch (or repo default) */
  open_pr?: boolean;
  /** Agent group name for this task (used for parallel execution grouping) */
  agent_name?: string;
  /** Agent provider to use for this task (claude, copilot, codex, goose, opencode). Overrides config default. */
  agent?: string;
  instructions?: string;
  acceptance_criteria: string[];
  ai_notes: string[];
  subtasks: Task[];
  /** Points to a validation task that verifies this task's work (e.g. run tests, lint) */
  validation_task_id?: string;
  /** If true, this task requires human approval before downstream tasks can proceed */
  checkpoint?: boolean;
  /** Claude session ID for resuming interrupted work */
  session_id?: string;
};

export const TaskSchema: z.ZodType<Task> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    status: TaskStatusSchema.default("todo"),
    phase: z.number().int().positive().optional(),
    depends_on: z.array(z.string()).default([]),
    repo: z.string().optional(),
    branch: z.string().optional(),
    base_branch: z.string().optional(),
    merge_into: z.string().optional(),
    open_pr: z.boolean().optional(),
    agent_name: z.string().optional(),
    agent: z.string().optional(),
    instructions: z.string().optional(),
    acceptance_criteria: z.array(z.string()).default([]),
    ai_notes: z.array(z.string()).default([]),
    subtasks: z.array(TaskSchema).default([]),
    validation_task_id: z.string().optional(),
    checkpoint: z.boolean().optional(),
    session_id: z.string().optional(),
  })
);

// =============================================================================
// Tasks File Schema
// =============================================================================

export const TasksFileSchema = z.object({
  /** Git configuration for the project */
  git: GitConfigSchema.optional(),
  /** Array of tasks */
  tasks: z.array(TaskSchema).default([]),
});
export type TasksFile = z.infer<typeof TasksFileSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

export function createTask(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return TaskSchema.parse(partial);
}

export function createTasksFile(tasks: Task[] = [], git?: Partial<GitConfig>): TasksFile {
  return TasksFileSchema.parse({ tasks, git });
}

/**
 * Get the working branch for a task.
 */
export function getTaskBranch(task: Task): string | undefined {
  return task.branch;
}

/**
 * Determine if a task requires a merge step after completion.
 * Returns the target branch if merge is needed, undefined otherwise.
 * Note: Returns undefined if open_pr is true (PR workflow, not auto-merge).
 */
export function getTaskMergeTarget(task: Task): string | undefined {
  // open_pr means create a PR, not auto-merge
  if (task.open_pr) return undefined;
  const branch = getTaskBranch(task);
  if (!branch || !task.merge_into) return undefined;
  // Same branch = no merge needed
  if (task.merge_into === branch) return undefined;
  return task.merge_into;
}

/**
 * Determine if a task should create a PR after completion.
 * Returns the target branch for the PR if open_pr is true, undefined otherwise.
 */
export function getTaskPRTarget(task: Task): string | undefined {
  if (!task.open_pr) return undefined;
  const branch = getTaskBranch(task);
  if (!branch) return undefined;
  // Return merge_into if set, otherwise undefined (orchestrator will use repo default)
  return task.merge_into;
}

/**
 * Sanitize a branch name for filesystem path (replace slashes with hyphens).
 */
export function sanitizeBranchName(branch: string): string {
  return branch.replace(/\//g, "-");
}

// =============================================================================
// Validation
// =============================================================================

export function validateTasksFile(data: unknown): TasksFile {
  const parsed = TasksFileSchema.parse(data);
  // Additional semantic validation
  validateTaskGitConfig(parsed.tasks);
  return parsed;
}

export function safeValidateTasksFile(
  data: unknown
): { success: true; data: TasksFile } | { success: false; error: z.ZodError | Error } {
  const result = TasksFileSchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  try {
    validateTaskGitConfig(result.data.tasks);
    return { success: true, data: result.data };
  } catch (err) {
    return { success: false, error: err as Error };
  }
}

/**
 * Validate that tasks with git branch settings have the required repo field.
 */
function validateTaskGitConfig(tasks: Task[]): void {
  for (const task of tasks) {
    if ((task.branch || task.base_branch || task.merge_into || task.open_pr) && !task.repo) {
      throw new Error(
        `Task "${task.id}" has git branch settings (branch/base_branch/merge_into/open_pr) but no repo specified. ` +
          `Add a 'repo' field pointing to the repository name.`
      );
    }
    if (task.subtasks.length > 0) {
      validateTaskGitConfig(task.subtasks);
    }
  }
  validateBranchNamingConflicts(tasks);
}

/**
 * Validate that merge_into branches don't conflict with child branch naming.
 * Git doesn't allow a branch 'foo/bar' to exist if 'foo/bar/baz' exists,
 * because refs are stored as filesystem paths.
 */
function validateBranchNamingConflicts(tasks: Task[]): void {
  // Collect all branches and merge targets grouped by repo
  const repoInfo = new Map<string, { branches: Set<string>; mergeTargets: Set<string> }>();

  function collectBranches(taskList: Task[]) {
    for (const task of taskList) {
      if (task.repo) {
        if (!repoInfo.has(task.repo)) {
          repoInfo.set(task.repo, { branches: new Set(), mergeTargets: new Set() });
        }
        const info = repoInfo.get(task.repo)!;
        if (task.branch) {
          info.branches.add(task.branch);
        }
        if (task.merge_into) {
          info.mergeTargets.add(task.merge_into);
        }
      }
      if (task.subtasks.length > 0) {
        collectBranches(task.subtasks);
      }
    }
  }

  collectBranches(tasks);

  // Check for conflicts: a merge target can't be a prefix of any branch
  for (const [repo, info] of repoInfo) {
    for (const mergeTarget of info.mergeTargets) {
      const prefix = `${mergeTarget}/`;
      for (const branch of info.branches) {
        if (branch.startsWith(prefix)) {
          throw new Error(
            `Branch naming conflict in repo '${repo}': merge target '${mergeTarget}' conflicts with branch '${branch}'. ` +
              `Git cannot create '${mergeTarget}' when '${branch}' exists because refs are stored as filesystem paths. ` +
              `Rename the merge target to something like '${mergeTarget}-base' or '${mergeTarget}-integration'.`
          );
        }
      }
    }
  }
}
