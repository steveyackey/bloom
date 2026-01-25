// =============================================================================
// Git Configuration and Paths
// =============================================================================

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as YAML from "yaml";
import { z } from "zod";

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
// Git Command Helper
// =============================================================================

export function runGit(args: string[], cwd?: string): { success: boolean; output: string; error: string } {
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

export function getDefaultBranch(bareRepoPath: string): string {
  // Try to get the default branch from the remote HEAD
  const result = runGit(["symbolic-ref", "HEAD"], bareRepoPath);
  if (result.success) {
    // Returns something like "refs/heads/main"
    const match = result.output.trim().match(/refs\/heads\/(.+)/);
    if (match?.[1]) return match[1];
  }
  return "main"; // fallback
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

// =============================================================================
// Config File Operations
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
