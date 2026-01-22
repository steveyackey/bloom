// =============================================================================
// Task File I/O and Helper Functions
// =============================================================================

import { existsSync } from "node:fs";
import YAML from "yaml";
import { askQuestion } from "./human-queue";
import { type Task, type TaskStatus, type TasksFile, validateTasksFile } from "./task-schema";

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

      if (!isReady && !isResumable) {
        findAvailable(task.subtasks);
        continue;
      }

      const depsComplete = task.depends_on.every((dep) => completedIds.has(dep));
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
    const question = `[CHECKPOINT] Task "${task.title}" is ready for review.\n\n${task.instructions || "Please review and mark as done when complete."}\n\nMark task ${task.id} as done?`;
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
