// =============================================================================
// Sync, Pull, Remove, and List Operations
// =============================================================================

import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { cloneRepo } from "./clone";
import { getBareRepoPath, getWorktreePath, getWorktreesDir, loadReposFile, runGit, saveReposFile } from "./config";

// =============================================================================
// Pull Default Branch Updates
// =============================================================================

export interface PullResult {
  success: boolean;
  repoName: string;
  updated: boolean;
  error?: string;
}

export interface PullAllResult {
  updated: string[];
  upToDate: string[];
  failed: Array<{ name: string; error: string }>;
}

/**
 * Pull updates for a repo's default branch worktree.
 * This fetches from remote and pulls changes into the default branch worktree.
 */
export async function pullDefaultBranch(bloomDir: string, repoName: string): Promise<PullResult> {
  const reposFile = await loadReposFile(bloomDir);
  const repo = reposFile.repos.find((r) => r.name === repoName);

  if (!repo) {
    return { success: false, repoName, updated: false, error: `Repository '${repoName}' not found in config` };
  }

  // Skip repos without a remote URL (local-only repos)
  if (!repo.url) {
    return { success: true, repoName, updated: false };
  }

  const bareRepoPath = getBareRepoPath(bloomDir, repoName);
  const worktreePath = getWorktreePath(bloomDir, repoName, repo.defaultBranch);

  if (!existsSync(bareRepoPath)) {
    return { success: false, repoName, updated: false, error: `Bare repo not found at ${bareRepoPath}` };
  }

  if (!existsSync(worktreePath)) {
    return { success: false, repoName, updated: false, error: `Default branch worktree not found at ${worktreePath}` };
  }

  // First, fetch all updates to the bare repo
  const fetchResult = runGit(["fetch", "--all"], bareRepoPath);
  if (!fetchResult.success) {
    return { success: false, repoName, updated: false, error: `Failed to fetch: ${fetchResult.error}` };
  }

  // Pull updates into the default branch worktree
  const pullResult = runGit(["pull", "--ff-only"], worktreePath);
  if (!pullResult.success) {
    // Check if it failed because of local changes or merge conflicts
    if (pullResult.error.includes("local changes") || pullResult.error.includes("uncommitted")) {
      return {
        success: false,
        repoName,
        updated: false,
        error: `Cannot pull: uncommitted changes in ${repo.defaultBranch}. Commit or stash changes first.`,
      };
    }
    if (pullResult.error.includes("Not possible to fast-forward")) {
      return {
        success: false,
        repoName,
        updated: false,
        error: `Cannot pull: local branch has diverged from remote. Manual merge required.`,
      };
    }
    return { success: false, repoName, updated: false, error: `Failed to pull: ${pullResult.error}` };
  }

  // Check if we actually updated
  // "Already up to date" means no changes, anything else (like "Updating" or file changes) means updated
  const combinedOutput = pullResult.output + pullResult.error;
  const alreadyUpToDate =
    combinedOutput.includes("Already up to date") || combinedOutput.includes("Already up-to-date");
  const wasUpdated = !alreadyUpToDate;

  return { success: true, repoName, updated: wasUpdated };
}

/**
 * Pull updates for all repos' default branches.
 * This ensures you have the latest code before planning.
 */
export async function pullAllDefaultBranches(bloomDir: string): Promise<PullAllResult> {
  const reposFile = await loadReposFile(bloomDir);
  const result: PullAllResult = {
    updated: [],
    upToDate: [],
    failed: [],
  };

  for (const repo of reposFile.repos) {
    // Skip repos without a remote URL (local-only repos)
    if (!repo.url) {
      result.upToDate.push(repo.name);
      continue;
    }

    const pullResult = await pullDefaultBranch(bloomDir, repo.name);

    if (pullResult.success) {
      if (pullResult.updated) {
        result.updated.push(repo.name);
      } else {
        result.upToDate.push(repo.name);
      }
    } else {
      result.failed.push({ name: repo.name, error: pullResult.error || "Unknown error" });
    }
  }

  return result;
}

// =============================================================================
// Sync Command
// =============================================================================

export interface SyncResult {
  cloned: string[];
  skipped: string[];
  failed: Array<{ name: string; error: string }>;
}

export async function syncRepos(bloomDir: string): Promise<SyncResult> {
  const reposFile = await loadReposFile(bloomDir);
  const result: SyncResult = {
    cloned: [],
    skipped: [],
    failed: [],
  };

  for (const repo of reposFile.repos) {
    const bareRepoPath = getBareRepoPath(bloomDir, repo.name);

    if (existsSync(bareRepoPath)) {
      // Already exists, just fetch updates
      console.log(`Fetching updates for ${repo.name}...`);
      const fetchResult = runGit(["fetch", "--all"], bareRepoPath);
      if (fetchResult.success) {
        result.skipped.push(repo.name);
      } else {
        result.failed.push({ name: repo.name, error: fetchResult.error });
      }
      continue;
    }

    // Clone missing repo
    console.log(`Cloning missing repo: ${repo.name}...`);
    const cloneResult = await cloneRepo(bloomDir, repo.url, { name: repo.name });

    if (cloneResult.success) {
      result.cloned.push(repo.name);
    } else {
      result.failed.push({ name: repo.name, error: cloneResult.error || "Unknown error" });
    }
  }

  return result;
}

// =============================================================================
// Remove Command
// =============================================================================

export async function removeRepo(bloomDir: string, repoName: string): Promise<{ success: boolean; error?: string }> {
  const reposFile = await loadReposFile(bloomDir);
  const repoIndex = reposFile.repos.findIndex((r) => r.name === repoName);

  if (repoIndex === -1) {
    return { success: false, error: `Repository '${repoName}' not found in config` };
  }

  const worktreesDir = getWorktreesDir(bloomDir, repoName);

  // Remove the entire repo directory (includes bare repo and all worktrees)
  // The bare repo lives at {worktreesDir}/{repoName}.git, so removing worktreesDir
  // removes everything
  if (existsSync(worktreesDir)) {
    console.log(`Removing repository: ${worktreesDir}`);
    rmSync(worktreesDir, { recursive: true, force: true });
  }

  // Update repos file
  reposFile.repos.splice(repoIndex, 1);
  await saveReposFile(bloomDir, reposFile);

  return { success: true };
}

// =============================================================================
// List Command
// =============================================================================

export interface RepoInfo {
  name: string;
  url: string;
  defaultBranch: string;
  worktrees: string[];
  exists: boolean;
}

export async function listRepos(bloomDir: string): Promise<RepoInfo[]> {
  const reposFile = await loadReposFile(bloomDir);
  const repos: RepoInfo[] = [];

  for (const repo of reposFile.repos) {
    const bareRepoPath = getBareRepoPath(bloomDir, repo.name);
    const worktreesDir = getWorktreesDir(bloomDir, repo.name);
    const exists = existsSync(bareRepoPath);

    let worktrees: string[] = [];
    if (exists && existsSync(worktreesDir)) {
      try {
        worktrees = readdirSync(worktreesDir).filter((f) => {
          const fullPath = join(worktreesDir, f);
          return existsSync(join(fullPath, ".git"));
        });
      } catch {
        // Ignore errors
      }
    }

    repos.push({
      name: repo.name,
      url: repo.url,
      defaultBranch: repo.defaultBranch,
      worktrees,
      exists,
    });
  }

  return repos;
}
