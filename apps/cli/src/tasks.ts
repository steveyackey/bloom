// =============================================================================
// Task File I/O and Helper Functions
// =============================================================================

import { existsSync } from "node:fs";
import YAML from "yaml";
import { askQuestion } from "./human-queue";
import { type Task, type TaskStatus, type TaskStep, type TasksFile, validateTasksFile } from "./task-schema";

// =============================================================================
// File I/O
// =============================================================================

export async function loadTasks(tasksFile: string): Promise<TasksFile> {
  if (!existsSync(tasksFile)) {
    throw new Error(`Tasks file not found: ${tasksFile}`);
  }
  const content = await Bun.file(tasksFile).text();
  const parsed = YAML.parse(content);
  return validateTasksFile(parsed);
}

export async function saveTasks(tasksFile: string, tasks: TasksFile): Promise<void> {
  const content = YAML.stringify(tasks, { lineWidth: 0 });
  await Bun.write(tasksFile, content);
}

// =============================================================================
// Task Helpers
// =============================================================================

export function findTask(tasks: Task[], taskId: string): Task | undefined {
  for (const task of tasks) {
    if (task.id === taskId) return task;
    const found = findTask(task.subtasks, taskId);
    if (found) return found;
  }
  return undefined;
}

export function updateTaskStatus(tasks: Task[], taskId: string, status: TaskStatus, agentName?: string): boolean {
  for (const task of tasks) {
    if (task.id === taskId) {
      task.status = status;
      if (agentName) task.agent_name = agentName;

      // Record timestamps for timing metrics
      const now = new Date().toISOString();
      if (status === "in_progress" && !task.started_at) {
        task.started_at = now;
      }
      if (status === "done" || status === "done_pending_merge") {
        task.completed_at = now;
      }

      return true;
    }
    if (updateTaskStatus(task.subtasks, taskId, status, agentName)) return true;
  }
  return false;
}

export function getAllAgents(tasks: Task[]): Set<string> {
  const agents = new Set<string>();
  function collect(taskList: Task[]) {
    for (const task of taskList) {
      if (task.agent_name) agents.add(task.agent_name);
      collect(task.subtasks);
    }
  }
  collect(tasks);
  return agents;
}

export function getAllRepos(tasks: Task[]): Set<string> {
  const repos = new Set<string>();
  function collect(taskList: Task[]) {
    for (const task of taskList) {
      if (task.repo) repos.add(task.repo);
      collect(task.subtasks);
    }
  }
  collect(tasks);
  return repos;
}

export function getAvailableTasks(tasks: Task[], agentName?: string): Task[] {
  const completedIds = new Set<string>();

  function collectIds(taskList: Task[]) {
    for (const task of taskList) {
      // Only fully done tasks count as completed for dependency purposes.
      // done_pending_merge does NOT count - dependent tasks must wait for merge to complete.
      // This ensures tasks stay blocked until their dependencies are fully merged.
      if (task.status === "done") completedIds.add(task.id);
      collectIds(task.subtasks);
    }
  }
  collectIds(tasks);

  const available: Task[] = [];
  function findAvailable(taskList: Task[]) {
    for (const task of taskList) {
      const isReady = task.status === "todo" || task.status === "ready_for_agent";
      const isResumable = task.status === "in_progress" && agentName && task.agent_name === agentName;
      // done_pending_merge tasks need to resume for merge-only processing
      const needsMerge = task.status === "done_pending_merge" && agentName && task.agent_name === agentName;

      if (!isReady && !isResumable && !needsMerge) {
        findAvailable(task.subtasks);
        continue;
      }

      // For merge-only tasks (done_pending_merge), skip dependency check.
      // They already passed dependencies when they started - they just need to finish merging.
      // For new/resumable tasks, check that dependencies are complete.
      const depsComplete = needsMerge || task.depends_on.every((dep) => completedIds.has(dep));
      if (!depsComplete) {
        findAvailable(task.subtasks);
        continue;
      }

      if (agentName && task.agent_name && task.agent_name !== agentName) {
        findAvailable(task.subtasks);
        continue;
      }

      // Skip checkpoint tasks - they're handled via human questions, not agents
      if (isCheckpointTask(task)) {
        findAvailable(task.subtasks);
        continue;
      }

      available.push(task);
      findAvailable(task.subtasks);
    }
  }
  findAvailable(tasks);
  return available;
}

export function getTasksByStatus(tasks: Task[], status: TaskStatus): Task[] {
  const result: Task[] = [];
  function collect(taskList: Task[]) {
    for (const task of taskList) {
      if (task.status === status) result.push(task);
      collect(task.subtasks);
    }
  }
  collect(tasks);
  return result;
}

export function getTasksByAgent(tasks: Task[], agentName: string): Task[] {
  const result: Task[] = [];
  function collect(taskList: Task[]) {
    for (const task of taskList) {
      if (task.agent_name === agentName) result.push(task);
      collect(task.subtasks);
    }
  }
  collect(tasks);
  return result;
}

export function formatTask(task: Task, indent = ""): string {
  const agent = task.agent_name ? ` (${task.agent_name})` : "";
  const repo = task.repo ? ` [${task.repo}]` : "";
  return `${indent}${task.id}: ${task.title}${agent}${repo}`;
}

export function getStatusIcon(status: TaskStatus): string {
  switch (status) {
    case "done":
      return "✓";
    case "done_pending_merge":
      return "⏳";
    case "in_progress":
      return "▶";
    case "assigned":
      return "●";
    case "ready_for_agent":
      return "○";
    case "blocked":
      return "✗";
    case "todo":
      return "·";
    default:
      return "?";
  }
}

// =============================================================================
// Task Priming
// =============================================================================

function isCheckpointTask(task: Task): boolean {
  // Prefer explicit checkpoint field, fall back to legacy title detection
  return task.checkpoint === true || task.title.includes("[CHECKPOINT]");
}

export async function primeTasks(
  tasksFile: string,
  tasks: TasksFile,
  logger: { info: (msg: string) => void }
): Promise<number> {
  const completedIds = new Set<string>();

  function collectCompleted(taskList: Task[]) {
    for (const task of taskList) {
      // Only fully done tasks count as completed for dependency purposes.
      // done_pending_merge does NOT count - dependent tasks must wait for merge to complete.
      if (task.status === "done") completedIds.add(task.id);
      collectCompleted(task.subtasks);
    }
  }
  collectCompleted(tasks.tasks);

  let primedCount = 0;
  const checkpointTasks: Task[] = [];

  function primeTaskList(taskList: Task[]) {
    for (const task of taskList) {
      if (task.status !== "todo") {
        primeTaskList(task.subtasks);
        continue;
      }

      const depsComplete = task.depends_on.length === 0 || task.depends_on.every((dep) => completedIds.has(dep));

      if (depsComplete) {
        task.status = "ready_for_agent";
        primedCount++;
        logger.info(`${task.id} → ready_for_agent`);

        // Track checkpoint tasks for question creation
        if (isCheckpointTask(task)) {
          checkpointTasks.push(task);
        }
      }

      primeTaskList(task.subtasks);
    }
  }
  primeTaskList(tasks.tasks);

  if (primedCount > 0) {
    await saveTasks(tasksFile, tasks);
  }

  // Create questions for checkpoint tasks that just became ready
  for (const task of checkpointTasks) {
    // Build location info if task has branch/repo
    let locationInfo = "";
    if (task.branch && task.repo) {
      const safeBranch = task.branch.replace(/\//g, "-");
      const worktreePath = `repos/${task.repo}/${safeBranch}`;
      locationInfo = `\n\n📍 **Location:**\n  Repo: ${task.repo}\n  Branch: ${task.branch}\n  Path: cd ${worktreePath}`;
    }

    const question = `[CHECKPOINT] Task "${task.title}" is ready for review.${locationInfo}\n\n${task.instructions || "Please review and mark as done when complete."}\n\nMark task ${task.id} as done?`;
    await askQuestion("orchestrator", question, {
      taskId: task.id,
      questionType: "yes_no",
      action: {
        type: "set_status",
        onYes: "done",
        onNo: "blocked",
      },
    });
    logger.info(`Created checkpoint question for ${task.id}`);
  }

  return primedCount;
}

export function resetStuckTasks(tasks: TasksFile, logger: { info: (msg: string) => void }): number {
  let resetCount = 0;

  function reset(taskList: Task[]) {
    for (const task of taskList) {
      if (task.status === "in_progress") {
        logger.info(`${task.id} (was in_progress)`);
        task.status = "ready_for_agent";
        resetCount++;
      }
      reset(task.subtasks);
    }
  }

  reset(tasks.tasks);
  return resetCount;
}

// =============================================================================
// Step Helpers
// =============================================================================

export interface StepSearchResult {
  task: Task;
  step: TaskStep;
  index: number;
}

/**
 * Find a step by ID across all tasks.
 * Step IDs are typically formatted as "task-id.N" (e.g., "refactor-auth.1").
 */
export function findStep(tasks: Task[], stepId: string): StepSearchResult | null {
  for (const task of tasks) {
    if (task.steps) {
      const index = task.steps.findIndex((s) => s.id === stepId);
      if (index !== -1) {
        const step = task.steps[index];
        if (step) {
          return { task, step, index };
        }
      }
    }
    // Check subtasks recursively
    const found = findStep(task.subtasks, stepId);
    if (found) return found;
  }
  return null;
}

/**
 * Get the current (first non-done) step for a task.
 * Returns null if task has no steps or all steps are done.
 */
export function getCurrentStep(task: Task): { step: TaskStep; index: number } | null {
  if (!task.steps || task.steps.length === 0) return null;
  const index = task.steps.findIndex((s) => s.status !== "done");
  if (index === -1) return null;
  const step = task.steps[index];
  if (!step) return null;
  return { step, index };
}

/**
 * Get the next pending step after the given index.
 * Returns null if there are no more steps.
 */
export function getNextStep(task: Task, currentIndex: number): TaskStep | null {
  if (!task.steps || currentIndex >= task.steps.length - 1) return null;
  return task.steps[currentIndex + 1] ?? null;
}

/**
 * Check if a task has steps and any are still pending.
 */
export function hasSteps(task: Task): boolean {
  return !!task.steps && task.steps.length > 0;
}

/**
 * Check if all steps in a task are complete.
 */
export function allStepsComplete(task: Task): boolean {
  if (!task.steps || task.steps.length === 0) return true;
  return task.steps.every((s) => s.status === "done");
}

/**
 * Get completed steps for a task (for context in prompts).
 */
export function getCompletedSteps(task: Task): TaskStep[] {
  if (!task.steps) return [];
  return task.steps.filter((s) => s.status === "done");
}

/**
 * Update a step's status with proper timestamp handling.
 */
export function updateStepStatus(tasks: Task[], stepId: string, status: TaskStep["status"]): boolean {
  const found = findStep(tasks, stepId);
  if (!found) return false;

  const { step } = found;
  step.status = status;

  const now = new Date().toISOString();
  if (status === "in_progress" && !step.started_at) {
    step.started_at = now;
  }
  if (status === "done") {
    step.completed_at = now;
  }

  return true;
}
