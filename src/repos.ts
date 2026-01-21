// =============================================================================
// Repository Management - Bare repos with worktrees
// =============================================================================

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as YAML from "yaml";
import { z } from "zod";
import { expandRepoUrl, extractRepoName, loadUserConfig, normalizeGitUrl } from "./user-config";

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

  // Save to repos file
  const reposFile = await loadReposFile(bloomDir);
  reposFile.repos.push({
    name: repoName,
    url: normalizedUrl,
    defaultBranch,
    addedAt: new Date().toISOString(),
  });
  await saveReposFile(bloomDir, reposFile);

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
  const worktreesDir = getWorktreesDir(bloomDir, name);

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

  const bareRepoPath = getBareRepoPath(bloomDir, repoName);
  const worktreesDir = getWorktreesDir(bloomDir, repoName);

  // Remove worktrees directory
  if (existsSync(worktreesDir)) {
    console.log(`Removing worktrees: ${worktreesDir}`);
    rmSync(worktreesDir, { recursive: true, force: true });
  }

  // Remove bare repo
  if (existsSync(bareRepoPath)) {
    console.log(`Removing bare repo: ${bareRepoPath}`);
    rmSync(bareRepoPath, { recursive: true, force: true });
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
  options?: { create?: boolean }
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
    // Create new branch and worktree
    result = runGit(["worktree", "add", "-b", branch, worktreePath], bareRepoPath);
  } else {
    // Checkout existing branch
    result = runGit(["worktree", "add", worktreePath, branch], bareRepoPath);
    if (!result.success) {
      // Try with origin/branch
      result = runGit(["worktree", "add", "-b", branch, worktreePath, `origin/${branch}`], bareRepoPath);
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
