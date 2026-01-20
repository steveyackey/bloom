// =============================================================================
// Shared Context for CLI Commands
// =============================================================================

import { join, resolve } from "node:path";

// Base directory (project root)
export const BLOOM_DIR = resolve(import.meta.dirname ?? ".", "../..");
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
