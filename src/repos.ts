// =============================================================================
// Repository Management - Bare repos with worktrees
// =============================================================================

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as YAML from "yaml";
import { z } from "zod";
import {
  ensureGitProtocolConfigured,
  expandRepoUrl,
  extractRepoName,
  loadUserConfig,
  normalizeGitUrl,
} from "./user-config";

// =============================================================================
// Schema for bloom.config.yaml (project-level)
// =============================================================================

const RepoEntrySchema = z.object({
  name: z.string(),
  url: z.string(), // Normalized URL (based on user's protocol preference)
  defaultBranch: z.string().default("main"),
  addedAt: z.string(), // ISO timestamp
});

const ConfigFileSchema = z.object({
  version: z.number().default(1),
  repos: z.array(RepoEntrySchema).default([]),
});

export type RepoEntry = z.infer<typeof RepoEntrySchema>;
export type ConfigFile = z.infer<typeof ConfigFileSchema>;
// Backwards compat alias
export type ReposFile = ConfigFile;

// =============================================================================
// Paths
// =============================================================================

export function getReposFilePath(bloomDir: string): string {
  return join(bloomDir, "bloom.config.yaml");
}

export function getReposDir(bloomDir: string): string {
  return join(bloomDir, "repos");
}

export function getBareRepoPath(bloomDir: string, repoName: string): string {
  return join(getWorktreesDir(bloomDir, repoName), `${repoName}.git`);
}

export function getWorktreesDir(bloomDir: string, repoName: string): string {
  return join(getReposDir(bloomDir), repoName);
}

export function getWorktreePath(bloomDir: string, repoName: string, branch: string): string {
  // Sanitize branch name for filesystem (replace / with -)
  const safeBranch = branch.replace(/\//g, "-");
  return join(getWorktreesDir(bloomDir, repoName), safeBranch);
}

// =============================================================================
// Repos File Operations
// =============================================================================

export async function loadReposFile(bloomDir: string): Promise<ConfigFile> {
  const filePath = getReposFilePath(bloomDir);

  if (!existsSync(filePath)) {
    return { version: 1, repos: [] };
  }

  try {
    const content = await Bun.file(filePath).text();
    const parsed = YAML.parse(content) || {};
    return ConfigFileSchema.parse(parsed);
  } catch {
    return { version: 1, repos: [] };
  }
}

export async function saveReposFile(bloomDir: string, data: ReposFile): Promise<void> {
  const filePath = getReposFilePath(bloomDir);
  await Bun.write(filePath, YAML.stringify(data, { indent: 2 }));
}

export async function findRepo(bloomDir: string, nameOrUrl: string): Promise<RepoEntry | undefined> {
  const reposFile = await loadReposFile(bloomDir);
  return reposFile.repos.find((r) => r.name === nameOrUrl || r.url === nameOrUrl || r.url.includes(nameOrUrl));
}

// =============================================================================
// Git Operations
// =============================================================================

function runGit(args: string[], cwd?: string): { success: boolean; output: string; error: string } {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return {
    success: result.status === 0,
    output: result.stdout?.toString() || "",
    error: result.stderr?.toString() || "",
  };
}

function getDefaultBranch(bareRepoPath: string): string {
  // Try to get the default branch from the remote HEAD
  const result = runGit(["symbolic-ref", "HEAD"], bareRepoPath);
  if (result.success) {
    // Returns something like "refs/heads/main"
    const match = result.output.trim().match(/refs\/heads\/(.+)/);
    if (match?.[1]) return match[1];
  }
  return "main"; // fallback
}

// =============================================================================
// Clone Command
// =============================================================================

export interface CloneResult {
  success: boolean;
  repoName: string;
  bareRepoPath: string;
  worktreePath: string;
  defaultBranch: string;
  error?: string;
}

export async function cloneRepo(bloomDir: string, url: string, options?: { name?: string }): Promise<CloneResult> {
  // Ensure git protocol is configured (prompts on first shorthand URL if needed)
  await ensureGitProtocolConfigured(url);

  const userConfig = await loadUserConfig();
  // Expand shorthand (org/repo) to full URL, then normalize to preferred protocol
  const expandedUrl = expandRepoUrl(url, userConfig.gitProtocol);
  const normalizedUrl = normalizeGitUrl(expandedUrl, userConfig.gitProtocol);
  const repoName = options?.name || extractRepoName(normalizedUrl);

  const reposDir = getReposDir(bloomDir);
  const bareRepoPath = getBareRepoPath(bloomDir, repoName);
  const worktreesDir = getWorktreesDir(bloomDir, repoName);

  // Require workspace to be initialized
  if (!existsSync(reposDir)) {
    return {
      success: false,
      repoName,
      bareRepoPath,
      worktreePath: "",
      defaultBranch: "",
      error: "Workspace not initialized. Run 'bloom init' first.",
    };
  }

  // Check if already cloned
  if (existsSync(bareRepoPath)) {
    return {
      success: false,
      repoName,
      bareRepoPath,
      worktreePath: "",
      defaultBranch: "",
      error: `Repository '${repoName}' already exists at ${bareRepoPath}`,
    };
  }

  // Ensure repo directory exists (bare repo goes inside it)
  if (!existsSync(worktreesDir)) {
    mkdirSync(worktreesDir, { recursive: true });
  }

  // Clone as bare repository
  console.log(`Cloning ${normalizedUrl} as bare repo...`);
  const cloneResult = runGit(["clone", "--bare", normalizedUrl, bareRepoPath]);

  if (!cloneResult.success) {
    return {
      success: false,
      repoName,
      bareRepoPath,
      worktreePath: "",
      defaultBranch: "",
      error: `Failed to clone: ${cloneResult.error}`,
    };
  }

  // Configure the bare repo to fetch all branches
  runGit(["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"], bareRepoPath);

  // Fetch to get all remote branches
  runGit(["fetch", "origin"], bareRepoPath);

  // Get the default branch
  const defaultBranch = getDefaultBranch(bareRepoPath);

  // Create worktree for default branch
  const worktreePath = getWorktreePath(bloomDir, repoName, defaultBranch);
  console.log(`Creating worktree for '${defaultBranch}' branch...`);

  const worktreeResult = runGit(["worktree", "add", worktreePath, defaultBranch], bareRepoPath);

  if (!worktreeResult.success) {
    // Try with origin/branch if local branch doesn't exist
    const worktreeResult2 = runGit(
      ["worktree", "add", "-b", defaultBranch, worktreePath, `origin/${defaultBranch}`],
      bareRepoPath
    );
    if (!worktreeResult2.success) {
      return {
        success: false,
        repoName,
        bareRepoPath,
        worktreePath,
        defaultBranch,
        error: `Failed to create worktree: ${worktreeResult2.error}`,
      };
    }
  }

  // Set upstream tracking branch for the default branch
  runGit(["branch", "--set-upstream-to", `origin/${defaultBranch}`, defaultBranch], worktreePath);

  // Save to repos file (only if not already present)
  const reposFile = await loadReposFile(bloomDir);
  const existingRepo = reposFile.repos.find((r) => r.name === repoName);
  if (!existingRepo) {
    reposFile.repos.push({
      name: repoName,
      url: normalizedUrl,
      defaultBranch,
      addedAt: new Date().toISOString(),
    });
    await saveReposFile(bloomDir, reposFile);
  }

  return {
    success: true,
    repoName,
    bareRepoPath,
    worktreePath,
    defaultBranch,
  };
}

// =============================================================================
// Create Command (new local repo)
// =============================================================================

export interface CreateRepoResult {
  success: boolean;
  repoName: string;
  bareRepoPath: string;
  worktreePath: string;
  defaultBranch: string;
  error?: string;
}

export async function createRepo(
  bloomDir: string,
  name: string,
  options?: { defaultBranch?: string }
): Promise<CreateRepoResult> {
  const defaultBranch = options?.defaultBranch || "main";
  const reposDir = getReposDir(bloomDir);
  const bareRepoPath = getBareRepoPath(bloomDir, name);

  // Require workspace to be initialized
  if (!existsSync(reposDir)) {
    return {
      success: false,
      repoName: name,
      bareRepoPath,
      worktreePath: "",
      defaultBranch,
      error: "Workspace not initialized. Run 'bloom init' first.",
    };
  }

  // Check if already exists
  if (existsSync(bareRepoPath)) {
    return {
      success: false,
      repoName: name,
      bareRepoPath,
      worktreePath: "",
      defaultBranch,
      error: `Repository '${name}' already exists at ${bareRepoPath}`,
    };
  }

  // Initialize bare repository
  console.log(`Creating new repository '${name}'...`);
  mkdirSync(bareRepoPath, { recursive: true });
  const initResult = runGit(["init", "--bare"], bareRepoPath);

  if (!initResult.success) {
    rmSync(bareRepoPath, { recursive: true, force: true });
    return {
      success: false,
      repoName: name,
      bareRepoPath,
      worktreePath: "",
      defaultBranch,
      error: `Failed to initialize bare repo: ${initResult.error}`,
    };
  }

  // Set default branch
  runGit(["symbolic-ref", "HEAD", `refs/heads/${defaultBranch}`], bareRepoPath);

  // Configure git user for commits (needed in CI where global config may not exist)
  runGit(["config", "user.email", "bloom@localhost"], bareRepoPath);
  runGit(["config", "user.name", "Bloom"], bareRepoPath);

  // Create worktree for default branch with orphan (no commits yet)
  const worktreePath = getWorktreePath(bloomDir, name, defaultBranch);
  console.log(`Creating worktree for '${defaultBranch}' branch...`);

  // For a new repo, we need to create an orphan branch worktree
  // Try the modern --orphan flag first (Git 2.38+)
  let worktreeResult = runGit(["worktree", "add", "--orphan", "-b", defaultBranch, worktreePath], bareRepoPath);

  // Fall back for older Git versions that don't support --orphan
  if (!worktreeResult.success && worktreeResult.error.includes("unknown option")) {
    // Create an empty tree and initial commit in the bare repo
    const emptyTreeResult = runGit(["hash-object", "-t", "tree", "--stdin"], bareRepoPath);
    if (!emptyTreeResult.success) {
      return {
        success: false,
        repoName: name,
        bareRepoPath,
        worktreePath,
        defaultBranch,
        error: `Failed to create empty tree: ${emptyTreeResult.error}`,
      };
    }
    const emptyTreeHash = emptyTreeResult.output.trim();

    // Create an initial empty commit
    const commitResult = runGit(["commit-tree", "-m", "Initial commit", emptyTreeHash], bareRepoPath);
    if (!commitResult.success) {
      return {
        success: false,
        repoName: name,
        bareRepoPath,
        worktreePath,
        defaultBranch,
        error: `Failed to create initial commit: ${commitResult.error}`,
      };
    }
    const commitHash = commitResult.output.trim();

    // Update the branch ref to point to this commit
    runGit(["update-ref", `refs/heads/${defaultBranch}`, commitHash], bareRepoPath);

    // Now create a normal worktree (not orphan)
    worktreeResult = runGit(["worktree", "add", worktreePath, defaultBranch], bareRepoPath);
  }

  if (!worktreeResult.success) {
    return {
      success: false,
      repoName: name,
      bareRepoPath,
      worktreePath,
      defaultBranch,
      error: `Failed to create worktree: ${worktreeResult.error}`,
    };
  }

  // Create initial commit so the repo is in a usable state
  const readmeContent = `# ${name}\n\nA new repository created with bloom.\n`;
  const readmePath = join(worktreePath, "README.md");
  await Bun.write(readmePath, readmeContent);

  // Configure git user for commits (needed in CI where global config may not exist)
  runGit(["config", "user.email", "bloom@localhost"], worktreePath);
  runGit(["config", "user.name", "Bloom"], worktreePath);

  runGit(["add", "README.md"], worktreePath);
  runGit(["commit", "-m", "Initial commit"], worktreePath);

  // Save to repos file (no remote URL yet)
  const reposFile = await loadReposFile(bloomDir);
  reposFile.repos.push({
    name,
    url: "", // No remote yet
    defaultBranch,
    addedAt: new Date().toISOString(),
  });
  await saveReposFile(bloomDir, reposFile);

  return {
    success: true,
    repoName: name,
    bareRepoPath,
    worktreePath,
    defaultBranch,
  };
}

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

// =============================================================================
// Worktree Management
// =============================================================================

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

// =============================================================================
// Git Status and Validation
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

/**
 * Check if a branch exists locally or remotely.
 */
export function branchExists(bareRepoPath: string, branch: string): { local: boolean; remote: boolean } {
  const localResult = runGit(["rev-parse", "--verify", `refs/heads/${branch}`], bareRepoPath);
  const remoteResult = runGit(["rev-parse", "--verify", `refs/remotes/origin/${branch}`], bareRepoPath);

  return {
    local: localResult.success,
    remote: remoteResult.success,
  };
}

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

// =============================================================================
// Merge Lock - Prevents concurrent merges to the same branch
// =============================================================================

export interface MergeLock {
  agentName: string;
  sourceBranch: string;
  targetBranch: string;
  acquiredAt: string;
  pid: number;
}

function getMergeLockDir(bloomDir: string): string {
  return join(bloomDir, ".merge-locks");
}

function getMergeLockPath(bloomDir: string, repoName: string, targetBranch: string): string {
  // Sanitize branch name for filename
  const safeBranch = targetBranch.replace(/\//g, "_");
  return join(getMergeLockDir(bloomDir), `${repoName}-${safeBranch}.lock`);
}

/**
 * Acquire a merge lock for a target branch. Returns true if lock acquired.
 * If another agent holds the lock, returns false with info about the holder.
 */
export async function acquireMergeLock(
  bloomDir: string,
  repoName: string,
  targetBranch: string,
  agentName: string,
  sourceBranch: string
): Promise<{ acquired: boolean; holder?: MergeLock }> {
  const lockDir = getMergeLockDir(bloomDir);
  const lockPath = getMergeLockPath(bloomDir, repoName, targetBranch);

  // Ensure lock directory exists
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }

  // Check if lock exists
  if (existsSync(lockPath)) {
    try {
      const content = await Bun.file(lockPath).text();
      const holder: MergeLock = JSON.parse(content);

      // Check if lock is stale (older than 10 minutes or process is dead)
      const lockAge = Date.now() - new Date(holder.acquiredAt).getTime();
      const isStale = lockAge > 10 * 60 * 1000; // 10 minutes

      // Check if holder process is still alive
      let processAlive = false;
      try {
        process.kill(holder.pid, 0); // Signal 0 just checks if process exists
        processAlive = true;
      } catch {
        processAlive = false;
      }

      if (!isStale && processAlive) {
        return { acquired: false, holder };
      }
      // Lock is stale or process is dead, we can take it
    } catch {
      // Invalid lock file, we can take it
    }
  }

  // Acquire the lock
  const lock: MergeLock = {
    agentName,
    sourceBranch,
    targetBranch,
    acquiredAt: new Date().toISOString(),
    pid: process.pid,
  };

  await Bun.write(lockPath, JSON.stringify(lock, null, 2));
  return { acquired: true };
}

/**
 * Release a merge lock.
 */
export function releaseMergeLock(bloomDir: string, repoName: string, targetBranch: string): void {
  const lockPath = getMergeLockPath(bloomDir, repoName, targetBranch);
  if (existsSync(lockPath)) {
    rmSync(lockPath);
  }
}

/**
 * Wait for a merge lock to become available, with progress callback.
 * Returns when lock is acquired.
 */
export async function waitForMergeLock(
  bloomDir: string,
  repoName: string,
  targetBranch: string,
  agentName: string,
  sourceBranch: string,
  options?: {
    pollIntervalMs?: number;
    onWaiting?: (holder: MergeLock, waitTimeMs: number) => void;
    maxWaitMs?: number;
  }
): Promise<{ acquired: boolean; timedOut?: boolean }> {
  const pollInterval = options?.pollIntervalMs ?? 5000;
  const maxWait = options?.maxWaitMs ?? 5 * 60 * 1000; // 5 minutes default
  const startTime = Date.now();

  while (true) {
    const result = await acquireMergeLock(bloomDir, repoName, targetBranch, agentName, sourceBranch);

    if (result.acquired) {
      return { acquired: true };
    }

    const waitTime = Date.now() - startTime;

    if (waitTime >= maxWait) {
      return { acquired: false, timedOut: true };
    }

    if (options?.onWaiting && result.holder) {
      options.onWaiting(result.holder, waitTime);
    }

    await Bun.sleep(pollInterval);
  }
}
