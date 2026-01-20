// =============================================================================
// Shared Context for CLI Commands
// =============================================================================

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

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

// Find the project root (git root with bloom.config.yaml, or just git root, or cwd)
function findProjectRoot(): string {
  const gitRoot = findGitRoot();
  if (gitRoot) {
    // Check if bloom.config.yaml exists at git root
    if (existsSync(join(gitRoot, "bloom.config.yaml"))) {
      return gitRoot;
    }
    // Use git root even without config (init will create it)
    return gitRoot;
  }
  // Fall back to current working directory
  return process.cwd();
}

// Base directory (project root - git root of cwd)
export const BLOOM_DIR = findProjectRoot();
export const REPOS_DIR = join(BLOOM_DIR, "repos");
export const DEFAULT_TASKS_FILE = join(BLOOM_DIR, "tasks.yaml");
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
