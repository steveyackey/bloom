// =============================================================================
// Dynamic Completion Providers - Live data readers for CLI argument completion
// =============================================================================

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { getBareRepoPath } from "../infra/git";
import { type Task, TaskStatusSchema, validateTasksFile } from "../task-schema";
import { getAllAgents } from "../tasks";

// =============================================================================
// Types
// =============================================================================

export type CompletionItem = string;

// =============================================================================
// Task Status Provider
// =============================================================================

/**
 * Returns the list of valid task statuses.
 * This is static data from the schema.
 */
export function getTaskStatuses(): CompletionItem[] {
  return TaskStatusSchema.options;
}

// =============================================================================
// Task ID Provider
// =============================================================================

/**
 * Extract all task IDs from a tasks file (including subtasks).
 */
function extractTaskIds(tasks: Task[]): string[] {
  const ids: string[] = [];
  for (const task of tasks) {
    ids.push(task.id);
    if (task.subtasks.length > 0) {
      ids.push(...extractTaskIds(task.subtasks));
    }
  }
  return ids;
}

/**
 * Reads task IDs from a tasks.yaml file (synchronous version for shell completions).
 * @param tasksFilePath - Path to the tasks.yaml file
 */
export function getTaskIdsSync(tasksFilePath: string): CompletionItem[] {
  try {
    if (!existsSync(tasksFilePath)) {
      return [];
    }
    const content = readFileSync(tasksFilePath, "utf-8");
    const parsed = YAML.parse(content);
    const tasksFile = validateTasksFile(parsed);
    return extractTaskIds(tasksFile.tasks);
  } catch {
    return [];
  }
}

// =============================================================================
// Repo Name Provider
// =============================================================================

/**
 * Reads repository names from bloom config (synchronous version for shell completions).
 * @param bloomDir - Path to the bloom workspace directory (contains bloom.config.yaml)
 */
export function getRepoNamesSync(bloomDir: string): CompletionItem[] {
  try {
    const configPath = join(bloomDir, "bloom.config.yaml");
    if (!existsSync(configPath)) {
      return [];
    }
    const content = readFileSync(configPath, "utf-8");
    const parsed = YAML.parse(content) || {};
    const repos = parsed.repos || [];
    return repos.map((repo: { name: string }) => repo.name);
  } catch {
    return [];
  }
}

// =============================================================================
// Agent Name Provider
// =============================================================================

/**
 * Reads agent names from tasks file (synchronous version for shell completions).
 * Returns agents that are assigned to tasks.
 * @param tasksFilePath - Path to the tasks.yaml file
 */
export function getAgentNamesSync(tasksFilePath: string): CompletionItem[] {
  try {
    if (!existsSync(tasksFilePath)) {
      return [];
    }
    const content = readFileSync(tasksFilePath, "utf-8");
    const parsed = YAML.parse(content);
    const tasksFile = validateTasksFile(parsed);
    const agents = getAllAgents(tasksFile.tasks);
    return Array.from(agents);
  } catch {
    return [];
  }
}

// =============================================================================
// Question ID Provider
// =============================================================================

/**
 * Reads question IDs from the .questions/ directory (synchronous version for shell completions).
 * @param tasksFilePath - Path to the tasks.yaml file (questions are stored relative to it)
 */
export function getQuestionIdsSync(tasksFilePath: string): CompletionItem[] {
  try {
    const questionsDir = join(dirname(tasksFilePath), ".questions");
    if (!existsSync(questionsDir)) {
      return [];
    }
    const files = readdirSync(questionsDir).filter((f) => f.endsWith(".json"));
    return files.map((f) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

// =============================================================================
// Interjection ID Provider
// =============================================================================

/**
 * Reads interjection IDs from the .interjections/ directory (synchronous version for shell completions).
 * @param tasksFilePath - Path to the tasks.yaml file (interjections are stored relative to it)
 */
export function getInterjectionIdsSync(tasksFilePath: string): CompletionItem[] {
  try {
    const interjectionsDir = join(dirname(tasksFilePath), ".interjections");
    if (!existsSync(interjectionsDir)) {
      return [];
    }
    const files = readdirSync(interjectionsDir).filter((f) => f.endsWith(".json"));
    return files.map((f) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

// =============================================================================
// Branch Name Provider
// =============================================================================

/**
 * Reads branch names from a bare repo (synchronous version for shell completions).
 * Returns local and remote branch names, deduped, without origin/ prefix.
 * @param bloomDir - Path to the bloom workspace directory
 * @param repoName - Name of the repository
 */
export function getBranchNamesSync(bloomDir: string, repoName: string): CompletionItem[] {
  try {
    const bareRepoPath = getBareRepoPath(bloomDir, repoName);
    if (!existsSync(bareRepoPath)) {
      return [];
    }

    const result = spawnSync("git", ["branch", "-a", "--format=%(refname:short)"], {
      cwd: bareRepoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.status !== 0) {
      return [];
    }

    const output = result.stdout?.toString() || "";
    const branches = output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((branch) => branch.replace(/^origin\//, ""))
      .filter((branch) => branch !== "HEAD");

    return [...new Set(branches)];
  } catch {
    return [];
  }
}
