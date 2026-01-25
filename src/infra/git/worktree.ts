// =============================================================================
// Worktree Management
// =============================================================================

import { existsSync } from "node:fs";
import { branchExists, getBareRepoPath, getDefaultBranch, getWorktreePath, runGit } from "./config";

export async function addWorktree(
  bloomDir: string,
  repoName: string,
  branch: string,
  options?: { create?: boolean; baseBranch?: string }
): Promise<{ success: boolean; path: string; error?: string }> {
  const bareRepoPath = getBareRepoPath(bloomDir, repoName);
  const worktreePath = getWorktreePath(bloomDir, repoName, branch);

  if (!existsSync(bareRepoPath)) {
    return { success: false, path: "", error: `Repository '${repoName}' not found` };
  }

  if (existsSync(worktreePath)) {
    return { success: false, path: worktreePath, error: `Worktree for branch '${branch}' already exists` };
  }

  let result: { success: boolean; output: string; error: string };

  if (options?.create) {
    // Check if the branch already exists locally
    const targetBranchExists = branchExists(bareRepoPath, branch);

    if (targetBranchExists.local) {
      // Branch already exists locally - just add the worktree pointing to it
      result = runGit(["worktree", "add", worktreePath, branch], bareRepoPath);
    } else if (targetBranchExists.remote) {
      // Branch exists on remote but not locally - create local tracking branch
      result = runGit(["worktree", "add", "-b", branch, worktreePath, `origin/${branch}`], bareRepoPath);
    } else {
      // Create new branch - determine the start point
      let startPoint: string | undefined;

      if (options.baseBranch) {
        // Try the specified base branch first
        const baseExists = branchExists(bareRepoPath, options.baseBranch);
        if (baseExists.local) {
          startPoint = options.baseBranch;
        } else if (baseExists.remote) {
          startPoint = `origin/${options.baseBranch}`;
        }
        // If base branch doesn't exist, fall through to use default branch
      }

      // Fall back to default branch if no valid start point yet
      if (!startPoint) {
        const defaultBranch = getDefaultBranch(bareRepoPath);
        const defaultExists = branchExists(bareRepoPath, defaultBranch);
        if (defaultExists.local) {
          startPoint = defaultBranch;
        } else if (defaultExists.remote) {
          startPoint = `origin/${defaultBranch}`;
        }
      }

      if (startPoint) {
        result = runGit(["worktree", "add", "-b", branch, worktreePath, startPoint], bareRepoPath);
      } else {
        // Create from current HEAD as last resort
        result = runGit(["worktree", "add", "-b", branch, worktreePath], bareRepoPath);
      }
    }
  } else {
    // Checkout existing branch
    const targetExists = branchExists(bareRepoPath, branch);

    if (targetExists.local) {
      // Branch exists locally - just add the worktree
      result = runGit(["worktree", "add", worktreePath, branch], bareRepoPath);
    } else if (targetExists.remote) {
      // Branch exists on remote - create local tracking branch
      result = runGit(["worktree", "add", "-b", branch, worktreePath, `origin/${branch}`], bareRepoPath);
    } else {
      // Branch doesn't exist anywhere - create from default branch
      const defaultBranch = getDefaultBranch(bareRepoPath);
      const defaultExists = branchExists(bareRepoPath, defaultBranch);
      let startPoint: string | undefined;

      if (defaultExists.local) {
        startPoint = defaultBranch;
      } else if (defaultExists.remote) {
        startPoint = `origin/${defaultBranch}`;
      }

      if (startPoint) {
        result = runGit(["worktree", "add", "-b", branch, worktreePath, startPoint], bareRepoPath);
      } else {
        // Last resort - create from HEAD
        result = runGit(["worktree", "add", "-b", branch, worktreePath], bareRepoPath);
      }
    }
  }

  if (!result.success) {
    return { success: false, path: "", error: result.error };
  }

  // Set upstream tracking branch if remote branch exists
  runGit(["branch", "--set-upstream-to", `origin/${branch}`, branch], worktreePath);

  return { success: true, path: worktreePath };
}

export async function removeWorktree(
  bloomDir: string,
  repoName: string,
  branch: string
): Promise<{ success: boolean; error?: string }> {
  const bareRepoPath = getBareRepoPath(bloomDir, repoName);
  const worktreePath = getWorktreePath(bloomDir, repoName, branch);

  if (!existsSync(worktreePath)) {
    return { success: false, error: `Worktree for branch '${branch}' not found` };
  }

  const result = runGit(["worktree", "remove", worktreePath], bareRepoPath);

  if (!result.success) {
    // Force remove if normal remove fails
    const forceResult = runGit(["worktree", "remove", "--force", worktreePath], bareRepoPath);
    if (!forceResult.success) {
      return { success: false, error: forceResult.error };
    }
  }

  return { success: true };
}

export async function listWorktrees(
  bloomDir: string,
  repoName: string
): Promise<Array<{ path: string; branch: string; commit: string }>> {
  const bareRepoPath = getBareRepoPath(bloomDir, repoName);

  if (!existsSync(bareRepoPath)) {
    return [];
  }

  const result = runGit(["worktree", "list", "--porcelain"], bareRepoPath);
  if (!result.success) {
    return [];
  }

  const worktrees: Array<{ path: string; branch: string; commit: string }> = [];
  const lines = result.output.split("\n");

  let current: { path: string; branch: string; commit: string } | null = null;

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      if (current) worktrees.push(current);
      current = { path: line.slice(9), branch: "", commit: "" };
    } else if (line.startsWith("HEAD ") && current) {
      current.commit = line.slice(5);
    } else if (line.startsWith("branch ") && current) {
      current.branch = line.slice(7).replace("refs/heads/", "");
    }
  }

  if (current) worktrees.push(current);

  // Filter out the bare repo itself
  return worktrees.filter((w) => w.branch !== "");
}
