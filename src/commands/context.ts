// =============================================================================
// Shared Context for CLI Commands
// =============================================================================

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Find the git root of the current working directory
export function findGitRoot(): string | null {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status === 0 && result.stdout) {
    return result.stdout.trim();
  }
  return null;
}

// Check if we're in a git repository
export function isInGitRepo(): boolean {
  return findGitRoot() !== null;
}

// Search upward from cwd to find bloom.config.yaml
function findBloomRoot(): string | null {
  let dir = process.cwd();
  const root = dirname(dir);

  while (dir !== root) {
    if (existsSync(join(dir, "bloom.config.yaml"))) {
      return dir;
    }
    dir = dirname(dir);
  }

  // Check root as well
  if (existsSync(join(root, "bloom.config.yaml"))) {
    return root;
  }

  return null;
}

// Find the project root (bloom.config.yaml location, or git root, or cwd)
function findProjectRoot(): string {
  // First, search upward for bloom.config.yaml
  const bloomRoot = findBloomRoot();
  if (bloomRoot) {
    return bloomRoot;
  }

  // Fall back to git root (for init command)
  const gitRoot = findGitRoot();
  if (gitRoot) {
    return gitRoot;
  }

  // Fall back to current working directory
  return process.cwd();
}

// Base directory (bloom workspace root)
export const BLOOM_DIR = findProjectRoot();
export const REPOS_DIR = join(BLOOM_DIR, "repos");
// Default tasks file is in the current working directory, not the git root
export const DEFAULT_TASKS_FILE = join(process.cwd(), "tasks.yaml");
export const POLL_INTERVAL_MS = 10_000;
export const FLOATING_AGENT = "floating";

// Mutable tasks file path (can be overridden via CLI)
let tasksFile = DEFAULT_TASKS_FILE;

export function getTasksFile(): string {
  return tasksFile;
}

export function setTasksFile(path: string): void {
  tasksFile = resolve(path);
}
