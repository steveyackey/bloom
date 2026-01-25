// =============================================================================
// Git Status and Branch Operations
// =============================================================================

import { existsSync } from "node:fs";
import { getBareRepoPath, loadReposFile, runGit } from "./config";

// Re-export branchExists from config for backwards compatibility
export { branchExists } from "./config";

import { listWorktrees } from "./worktree";

// =============================================================================
// Git Status
// =============================================================================

export interface GitStatusResult {
  exists: boolean;
  clean: boolean;
  hasUncommittedChanges: boolean;
  hasUntrackedFiles: boolean;
  hasStagedChanges: boolean;
  modifiedFiles: string[];
  untrackedFiles: string[];
  stagedFiles: string[];
}

/**
 * Check if a worktree has uncommitted changes.
 */
export function getWorktreeStatus(worktreePath: string): GitStatusResult {
  if (!existsSync(worktreePath)) {
    return {
      exists: false,
      clean: true,
      hasUncommittedChanges: false,
      hasUntrackedFiles: false,
      hasStagedChanges: false,
      modifiedFiles: [],
      untrackedFiles: [],
      stagedFiles: [],
    };
  }

  const result = runGit(["status", "--porcelain"], worktreePath);
  if (!result.success) {
    return {
      exists: true,
      clean: true,
      hasUncommittedChanges: false,
      hasUntrackedFiles: false,
      hasStagedChanges: false,
      modifiedFiles: [],
      untrackedFiles: [],
      stagedFiles: [],
    };
  }

  // Don't use trim() - leading spaces are significant in git status porcelain format
  const lines = result.output.split("\n").filter((line) => line.length > 0);
  const modifiedFiles: string[] = [];
  const untrackedFiles: string[] = [];
  const stagedFiles: string[] = [];

  for (const line of lines) {
    const indexStatus = line[0];
    const workTreeStatus = line[1];
    const file = line.slice(3);

    if (indexStatus === "?") {
      untrackedFiles.push(file);
    } else {
      if (indexStatus !== " " && indexStatus !== "?") {
        stagedFiles.push(file);
      }
      if (workTreeStatus !== " " && workTreeStatus !== "?") {
        modifiedFiles.push(file);
      }
    }
  }

  return {
    exists: true,
    clean: lines.length === 0,
    hasUncommittedChanges: modifiedFiles.length > 0 || stagedFiles.length > 0,
    hasUntrackedFiles: untrackedFiles.length > 0,
    hasStagedChanges: stagedFiles.length > 0,
    modifiedFiles,
    untrackedFiles,
    stagedFiles,
  };
}

// =============================================================================
// Branch Operations
// =============================================================================

/**
 * Push a branch to remote.
 */
export function pushBranch(
  worktreePath: string,
  branch: string,
  options?: { setUpstream?: boolean }
): { success: boolean; error?: string } {
  const args = ["push"];
  if (options?.setUpstream) {
    args.push("-u", "origin", branch);
  } else {
    args.push("origin", branch);
  }

  const result = runGit(args, worktreePath);
  return {
    success: result.success,
    error: result.success ? undefined : result.error,
  };
}

/**
 * Get the current branch of a worktree.
 */
export function getCurrentBranch(worktreePath: string): string | null {
  const result = runGit(["rev-parse", "--abbrev-ref", "HEAD"], worktreePath);
  if (!result.success) return null;
  return result.output.trim();
}

/**
 * Merge a source branch into the current branch (target worktree).
 * Must be run from the target worktree where the target branch is checked out.
 */
export function mergeBranch(
  worktreePath: string,
  sourceBranch: string,
  options?: { message?: string; noFf?: boolean }
): { success: boolean; error?: string; output?: string } {
  const args = ["merge"];

  if (options?.noFf) {
    args.push("--no-ff");
  }

  if (options?.message) {
    args.push("-m", options.message);
  }

  args.push(sourceBranch);

  const result = runGit(args, worktreePath);
  return {
    success: result.success,
    error: result.success ? undefined : result.error,
    output: result.output,
  };
}

/**
 * Delete a local branch (after it's been merged).
 */
export function deleteLocalBranch(
  bareRepoPath: string,
  branch: string,
  options?: { force?: boolean }
): { success: boolean; error?: string } {
  const args = ["branch", options?.force ? "-D" : "-d", branch];
  const result = runGit(args, bareRepoPath);
  return {
    success: result.success,
    error: result.success ? undefined : result.error,
  };
}

/**
 * Find branches that have been merged into a target branch.
 */
export function getMergedBranches(bareRepoPath: string, targetBranch: string): string[] {
  const result = runGit(["branch", "--merged", targetBranch], bareRepoPath);
  if (!result.success) return [];

  return result.output
    .split("\n")
    .map((line) => line.trim().replace(/^[*+] /, "")) // Strip * (current) or + (other worktree) prefix
    .filter((branch) => branch && branch !== targetBranch);
}

/**
 * Clean up merged branches.
 * Returns list of deleted branches.
 *
 * IMPORTANT: This will never delete the default branch (main/master) or branches
 * with active worktrees to prevent accidental loss of important branches.
 */
export async function cleanupMergedBranches(
  bloomDir: string,
  repoName: string,
  targetBranch: string
): Promise<{ deleted: string[]; skipped: string[]; failed: Array<{ branch: string; error: string }> }> {
  const bareRepoPath = getBareRepoPath(bloomDir, repoName);
  const mergedBranches = getMergedBranches(bareRepoPath, targetBranch);

  const deleted: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ branch: string; error: string }> = [];

  // Get the default branch to protect it from deletion
  const reposFile = await loadReposFile(bloomDir);
  const repo = reposFile.repos.find((r) => r.name === repoName);
  const defaultBranch = repo?.defaultBranch || "main";

  // Protected branches that should never be deleted
  const protectedBranches = new Set([defaultBranch, "main", "master"]);

  // Get list of worktrees - branches with active worktrees should be skipped
  const worktrees = await listWorktrees(bloomDir, repoName);
  const worktreeBranches = new Set(worktrees.map((w) => w.branch));

  for (const branch of mergedBranches) {
    // Never delete protected branches (default branch, main, master)
    if (protectedBranches.has(branch)) {
      skipped.push(branch);
      continue;
    }

    // Skip branches with active worktrees - don't remove them automatically
    if (worktreeBranches.has(branch)) {
      skipped.push(branch);
      continue;
    }

    const deleteResult = deleteLocalBranch(bareRepoPath, branch);
    if (deleteResult.success) {
      deleted.push(branch);
    } else {
      failed.push({ branch, error: deleteResult.error || "Unknown error" });
    }
  }

  return { deleted, skipped, failed };
}
