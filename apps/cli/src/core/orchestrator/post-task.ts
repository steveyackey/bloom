// =============================================================================
// Post-Task Git Operations
// =============================================================================
// This module handles git operations after a task completes:
// - Checking for uncommitted changes
// - Pushing branches to remote
// - Creating pull requests
// - Merging branches with conflict resolution
// - Cleaning up merged branches

import {
  addWorktree,
  cleanupMergedBranches,
  getWorktreePath,
  getWorktreeStatus,
  mergeBranch,
  pushBranch,
  releaseMergeLock,
  waitForMergeLock,
} from "../../infra/git";
import { createPullRequest as hostingCreatePullRequest } from "../../infra/git-hosting";
import type { GitConfig } from "../../task-schema";
import { loadTasks, saveTasks, updateTaskStatus } from "../../tasks";
import type { EventHandler } from "./events";
import type { GitTaskInfo } from "./task-prompt";

// =============================================================================
// Uncommitted Changes Check
// =============================================================================

export interface UncommittedChangesResult {
  clean: boolean;
  modifiedFiles: string[];
  untrackedFiles: string[];
  stagedFiles: string[];
}

/**
 * Check for uncommitted changes in a worktree.
 */
export function checkUncommittedChanges(gitInfo: GitTaskInfo, onEvent: EventHandler): UncommittedChangesResult {
  const status = getWorktreeStatus(gitInfo.worktreePath);

  if (!status.clean) {
    onEvent({
      type: "git:uncommitted_changes",
      branch: gitInfo.branch,
      modifiedFiles: status.modifiedFiles,
      untrackedFiles: status.untrackedFiles,
      stagedFiles: status.stagedFiles,
    });
  }

  return {
    clean: status.clean,
    modifiedFiles: status.modifiedFiles,
    untrackedFiles: status.untrackedFiles,
    stagedFiles: status.stagedFiles,
  };
}

// =============================================================================
// Push Branch
// =============================================================================

/**
 * Push a branch to remote if configured.
 */
export function pushBranchToRemote(gitInfo: GitTaskInfo, onEvent: EventHandler): { success: boolean; error?: string } {
  const status = getWorktreeStatus(gitInfo.worktreePath);
  if (!status.clean) {
    return { success: false, error: "Worktree has uncommitted changes" };
  }

  onEvent({
    type: "git:pushing",
    branch: gitInfo.branch,
    remote: "origin",
  });

  const result = pushBranch(gitInfo.worktreePath, gitInfo.branch, {
    setUpstream: true,
  });

  onEvent({
    type: "git:pushed",
    branch: gitInfo.branch,
    remote: "origin",
    success: result.success,
    error: result.error,
  });

  return result;
}

// =============================================================================
// Create Pull Request
// =============================================================================

export interface CreatePRResult {
  success: boolean;
  url?: string;
  alreadyExists?: boolean;
  error?: string;
}

/**
 * Create a pull request using the appropriate hosting CLI (gh or fj).
 */
export function createPullRequest(
  gitInfo: GitTaskInfo,
  taskId: string,
  taskTitle: string,
  prompt: string | undefined,
  onEvent: EventHandler
): CreatePRResult {
  if (!gitInfo.openPR || !gitInfo.prBase) {
    return { success: false, error: "PR not configured for this task" };
  }

  const sourceBranch = gitInfo.branch;
  const targetBranch = gitInfo.prBase;

  // Build PR body from task details
  let prBody = "";
  if (prompt) {
    // Extract instructions from prompt
    const instructionsMatch = prompt.match(/## Instructions\n([\s\S]*?)(?=\n## |$)/);
    if (instructionsMatch?.[1]) {
      prBody += `## Summary\n${instructionsMatch[1].trim()}\n\n`;
    }
    // Extract acceptance criteria
    const acMatch = prompt.match(/## Acceptance Criteria\n([\s\S]*?)(?=\n## |$)/);
    if (acMatch?.[1]) {
      prBody += `## Acceptance Criteria\n${acMatch[1].trim()}\n`;
    }
  }

  onEvent({
    type: "git:pr_creating",
    sourceBranch,
    targetBranch,
  });

  const result = hostingCreatePullRequest({
    title: taskTitle || `Task: ${taskId}`,
    body: prBody || `Automated PR for task ${taskId}`,
    baseBranch: targetBranch,
    headBranch: sourceBranch,
    cwd: gitInfo.worktreePath,
  });

  if (result.success) {
    onEvent({
      type: "git:pr_created",
      url: result.url,
      sourceBranch,
      targetBranch,
      alreadyExists: result.alreadyExists,
    });
  } else {
    onEvent({
      type: "git:pr_created",
      sourceBranch,
      targetBranch,
      error: result.error,
    });
  }

  return result;
}

// =============================================================================
// Merge Operations
// =============================================================================

export interface MergeContext {
  taskId: string;
  taskTitle: string;
  repo: string;
  gitInfo: GitTaskInfo;
  gitConfig?: GitConfig;
  prompt?: string;
  bloomDir: string;
  tasksFile: string;
  agentName: string;
}

export interface MergeResult {
  success: boolean;
  conflictResolutionNeeded?: boolean;
  error?: string;
}

/**
 * Set task status to done_pending_merge before attempting merge.
 */
export async function setTaskPendingMerge(tasksFile: string, taskId: string): Promise<void> {
  const tasksData = await loadTasks(tasksFile);
  updateTaskStatus(tasksData.tasks, taskId, "done_pending_merge");
  await saveTasks(tasksFile, tasksData);
}

/**
 * Set task status to done after successful merge.
 */
export async function setTaskDone(tasksFile: string, taskId: string): Promise<void> {
  const tasksData = await loadTasks(tasksFile);
  updateTaskStatus(tasksData.tasks, taskId, "done");
  await saveTasks(tasksFile, tasksData);
}

/**
 * Acquire merge lock for a branch.
 */
export async function acquireMergeLock(
  ctx: MergeContext,
  onEvent: EventHandler
): Promise<{ acquired: boolean; timedOut: boolean }> {
  const result = await waitForMergeLock(
    ctx.bloomDir,
    ctx.repo,
    ctx.gitInfo.mergeInto!,
    ctx.agentName,
    ctx.gitInfo.branch,
    {
      pollIntervalMs: 5000,
      maxWaitMs: 5 * 60 * 1000, // 5 minutes
      onWaiting: (holder, waitTimeMs) => {
        onEvent({
          type: "merge:lock_waiting",
          targetBranch: ctx.gitInfo.mergeInto!,
          holder: holder.agentName,
          holderBranch: holder.sourceBranch,
          waitTime: waitTimeMs,
        });
      },
    }
  );

  if (result.timedOut) {
    onEvent({
      type: "merge:lock_timeout",
      targetBranch: ctx.gitInfo.mergeInto!,
    });
    return { acquired: false, timedOut: true };
  }

  onEvent({
    type: "merge:lock_acquired",
    targetBranch: ctx.gitInfo.mergeInto!,
  });

  return { acquired: true, timedOut: false };
}

/**
 * Release merge lock for a branch.
 */
export function releaseMergeLockForBranch(bloomDir: string, repo: string, targetBranch: string): void {
  releaseMergeLock(bloomDir, repo, targetBranch);
}

/**
 * Ensure target worktree exists for merge.
 */
export async function ensureTargetWorktree(
  ctx: MergeContext,
  onEvent: EventHandler
): Promise<{ exists: boolean; clean: boolean; error?: string }> {
  const targetWorktreePath = getWorktreePath(ctx.bloomDir, ctx.repo, ctx.gitInfo.mergeInto!);

  let status = getWorktreeStatus(targetWorktreePath);
  if (!status.exists) {
    onEvent({
      type: "worktree:creating",
      repo: ctx.repo,
      branch: ctx.gitInfo.mergeInto!,
    });

    const createResult = await addWorktree(ctx.bloomDir, ctx.repo, ctx.gitInfo.mergeInto!, {
      create: false, // Checkout existing branch
    });

    onEvent({
      type: "worktree:created",
      repo: ctx.repo,
      branch: ctx.gitInfo.mergeInto!,
      success: createResult.success,
      error: createResult.error,
    });

    if (!createResult.success) {
      return { exists: false, clean: false, error: createResult.error };
    }

    status = getWorktreeStatus(targetWorktreePath);
  }

  return { exists: status.exists, clean: status.clean };
}

/**
 * Perform the actual merge operation.
 */
export function performMerge(ctx: MergeContext, onEvent: EventHandler): MergeResult {
  const targetWorktreePath = getWorktreePath(ctx.bloomDir, ctx.repo, ctx.gitInfo.mergeInto!);
  const sourceBranch = ctx.gitInfo.branch;
  const targetBranch = ctx.gitInfo.mergeInto!;

  onEvent({
    type: "git:merging",
    sourceBranch,
    targetBranch,
  });

  const mergeResult = mergeBranch(targetWorktreePath, sourceBranch, {
    noFf: true,
    message: `Merge ${sourceBranch}: ${ctx.taskTitle}`,
  });

  if (mergeResult.success) {
    onEvent({
      type: "git:merged",
      sourceBranch,
      targetBranch,
    });
    return { success: true };
  }

  onEvent({
    type: "git:merge_conflict",
    sourceBranch,
    targetBranch,
    error: mergeResult.error || "Unknown merge error",
  });

  return {
    success: false,
    conflictResolutionNeeded: true,
    error: mergeResult.error,
  };
}

/**
 * Push target branch after merge.
 */
export function pushMergedBranch(ctx: MergeContext, onEvent: EventHandler): { success: boolean; error?: string } {
  const targetWorktreePath = getWorktreePath(ctx.bloomDir, ctx.repo, ctx.gitInfo.mergeInto!);
  const targetBranch = ctx.gitInfo.mergeInto!;

  onEvent({
    type: "git:pushing",
    branch: targetBranch,
    remote: "origin",
  });

  const result = pushBranch(targetWorktreePath, targetBranch);

  onEvent({
    type: "git:pushed",
    branch: targetBranch,
    remote: "origin",
    success: result.success,
    error: result.error,
  });

  return result;
}

// =============================================================================
// Branch Cleanup
// =============================================================================

/**
 * Clean up branches that have been merged into the target.
 * Also removes worktrees and remote branches (if push_to_remote is enabled).
 */
export async function cleanupMergedBranchesForTask(ctx: MergeContext, onEvent: EventHandler): Promise<void> {
  const result = await cleanupMergedBranches(ctx.bloomDir, ctx.repo, ctx.gitInfo.mergeInto!, {
    deleteRemote: ctx.gitConfig?.push_to_remote ?? false,
  });

  onEvent({
    type: "git:cleanup",
    targetBranch: ctx.gitInfo.mergeInto!,
    deleted: result.deleted,
    failed: result.failed,
    worktreesRemoved: result.worktreesRemoved,
    remotesDeleted: result.remotesDeleted,
    remotesFailed: result.remotesFailed,
  });
}
