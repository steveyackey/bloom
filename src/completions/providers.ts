// =============================================================================
// Dynamic Completion Providers - Live data readers for CLI argument completion
// =============================================================================

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { loadReposFile } from "../repos";
import { type Task, TaskStatusSchema, validateTasksFile } from "../task-schema";
import { getAllAgents, loadTasks } from "../tasks";

// =============================================================================
// Types
// =============================================================================

export type CompletionItem = string;
export type CompletionProvider = () => Promise<CompletionItem[]>;

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
 * Reads task IDs from a tasks.yaml file (async version).
 * @param tasksFilePath - Path to the tasks.yaml file
 */
export async function getTaskIds(tasksFilePath: string): Promise<CompletionItem[]> {
  try {
    if (!existsSync(tasksFilePath)) {
      return [];
    }
    const tasksFile = await loadTasks(tasksFilePath);
    return extractTaskIds(tasksFile.tasks);
  } catch {
    return [];
  }
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
 * Reads repository names from bloom config (async version).
 * @param bloomDir - Path to the bloom workspace directory (contains bloom.config.yaml)
 */
export async function getRepoNames(bloomDir: string): Promise<CompletionItem[]> {
  try {
    const configFile = await loadReposFile(bloomDir);
    return configFile.repos.map((repo) => repo.name);
  } catch {
    return [];
  }
}

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
 * Reads agent names from tasks file and config (async version).
 * Returns agents that are assigned to tasks.
 * @param tasksFilePath - Path to the tasks.yaml file
 */
export async function getAgentNames(tasksFilePath: string): Promise<CompletionItem[]> {
  try {
    if (!existsSync(tasksFilePath)) {
      return [];
    }
    const tasksFile = await loadTasks(tasksFilePath);
    const agents = getAllAgents(tasksFile.tasks);
    return Array.from(agents);
  } catch {
    return [];
  }
}

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
 * Reads question IDs from the .questions/ directory (async version).
 * @param tasksFilePath - Path to the tasks.yaml file (questions are stored relative to it)
 */
export async function getQuestionIds(tasksFilePath: string): Promise<CompletionItem[]> {
  return getQuestionIdsSync(tasksFilePath);
}

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
 * Reads interjection IDs from the .interjections/ directory (async version).
 * @param tasksFilePath - Path to the tasks.yaml file (interjections are stored relative to it)
 */
export async function getInterjectionIds(tasksFilePath: string): Promise<CompletionItem[]> {
  return getInterjectionIdsSync(tasksFilePath);
}

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
