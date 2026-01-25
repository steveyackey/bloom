// =============================================================================
// Clone and Create Repository Operations
// =============================================================================

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  ensureGitProtocolConfigured,
  expandRepoUrl,
  extractRepoName,
  loadUserConfig,
  normalizeGitUrl,
} from "../config";
import {
  getBareRepoPath,
  getDefaultBranch,
  getReposDir,
  getWorktreePath,
  getWorktreesDir,
  loadReposFile,
  runGit,
  saveReposFile,
} from "./config";

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
