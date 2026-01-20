import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Task, TasksFile } from "../src/task-schema";
import {
  findTask,
  getAllAgents,
  getAvailableTasks,
  getTasksByStatus,
  loadTasks,
  primeTasks,
  resetStuckTasks,
  saveTasks,
  updateTaskStatus,
} from "../src/tasks";

const TEST_DIR = join(import.meta.dirname, ".test-data");
const TEST_TASKS_FILE = join(TEST_DIR, "tasks.yaml");

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    title: "Test Task",
    status: "todo",
    depends_on: [],
    acceptance_criteria: [],
    ai_notes: [],
    subtasks: [],
    ...overrides,
  };
}

const noOpLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
};

describe("Task Persistence", () => {
  beforeEach(async () => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    // Create empty tasks file for tests
    await saveTasks(TEST_TASKS_FILE, { tasks: [] });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("empty tasks file loads as empty task list", async () => {
    const tasksFile = await loadTasks(TEST_TASKS_FILE);
    expect(tasksFile.tasks).toEqual([]);
  });

  test("tasks persist across saves and loads", async () => {
    const task = createTask({ id: "persist-test", title: "Persistence Test" });
    await saveTasks(TEST_TASKS_FILE, { tasks: [task] });

    const loaded = await loadTasks(TEST_TASKS_FILE);
    expect(loaded.tasks).toHaveLength(1);
    expect(loaded.tasks[0]!.title).toBe("Persistence Test");
  });

  test("task metadata survives round-trip (notes, criteria, deps)", async () => {
    const task = createTask({
      id: "metadata-test",
      ai_notes: ["Note from agent"],
      acceptance_criteria: ["Must pass tests"],
      depends_on: ["other-task"],
      agent_name: "test-agent",
    });
    await saveTasks(TEST_TASKS_FILE, { tasks: [task] });

    const loaded = await loadTasks(TEST_TASKS_FILE);
    expect(loaded.tasks[0]!.ai_notes).toContain("Note from agent");
    expect(loaded.tasks[0]!.acceptance_criteria).toContain("Must pass tests");
    expect(loaded.tasks[0]!.depends_on).toContain("other-task");
    expect(loaded.tasks[0]!.agent_name).toBe("test-agent");
  });
});

describe("Task Discovery", () => {
  test("can find any task by ID regardless of nesting depth", () => {
    const deepNested = createTask({ id: "deep-nested" });
    const nested = createTask({ id: "nested", subtasks: [deepNested] });
    const root = createTask({ id: "root", subtasks: [nested] });

    expect(findTask([root], "deep-nested")?.id).toBe("deep-nested");
    expect(findTask([root], "nested")?.id).toBe("nested");
    expect(findTask([root], "root")?.id).toBe("root");
  });

  test("returns undefined for non-existent task ID", () => {
    const tasks = [createTask({ id: "exists" })];
    expect(findTask(tasks, "does-not-exist")).toBeUndefined();
  });
});

describe("Agent Work Assignment", () => {
  test("agents only see tasks assigned to them", () => {
    const tasks = [
      createTask({ id: "t1", status: "ready_for_agent", agent_name: "alice" }),
      createTask({ id: "t2", status: "ready_for_agent", agent_name: "bob" }),
      createTask({ id: "t3", status: "ready_for_agent", agent_name: "alice" }),
    ];

    const aliceTasks = getAvailableTasks(tasks, "alice");
    expect(aliceTasks).toHaveLength(2);
    expect(aliceTasks.every((t) => t.agent_name === "alice")).toBe(true);
  });

  test("floating agent picks up unassigned tasks", () => {
    const tasks = [
      createTask({ id: "assigned", status: "ready_for_agent", agent_name: "alice" }),
      createTask({ id: "unassigned", status: "ready_for_agent" }), // no agent_name
    ];

    const floatingTasks = getAvailableTasks(tasks, "floating");
    expect(floatingTasks).toHaveLength(1);
    expect(floatingTasks[0]!.id).toBe("unassigned");
  });

  test("agents see todo and ready_for_agent tasks, but not done or blocked", () => {
    // Both todo and ready_for_agent are workable states
    // done and blocked tasks should not be available
    const tasks = [
      createTask({ id: "todo", status: "todo", agent_name: "alice" }),
      createTask({ id: "ready", status: "ready_for_agent", agent_name: "alice" }),
      createTask({ id: "done", status: "done", agent_name: "alice" }),
      createTask({ id: "blocked", status: "blocked", agent_name: "alice" }),
    ];

    const available = getAvailableTasks(tasks, "alice");
    expect(available).toHaveLength(2);
    expect(available.map((t) => t.id).sort()).toEqual(["ready", "todo"]);
  });

  test("starting work on a task claims it for the agent", () => {
    const tasks = [createTask({ id: "work", status: "ready_for_agent" })];

    updateTaskStatus(tasks, "work", "in_progress", "worker-agent");

    expect(tasks[0]!.status).toBe("in_progress");
    expect(tasks[0]!.agent_name).toBe("worker-agent");
  });
});

describe("Task Workflow", () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("priming promotes todo tasks with completed dependencies to ready_for_agent", async () => {
    const dependency = createTask({ id: "dep", status: "done" });
    const dependent = createTask({ id: "main", status: "todo", depends_on: ["dep"] });
    const tasksFile: TasksFile = { tasks: [dependency, dependent] };
    await saveTasks(TEST_TASKS_FILE, tasksFile);

    const primed = await primeTasks(TEST_TASKS_FILE, tasksFile, noOpLogger);

    expect(primed).toBe(1);
    const loaded = await loadTasks(TEST_TASKS_FILE);
    const mainTask = findTask(loaded.tasks, "main");
    expect(mainTask?.status).toBe("ready_for_agent");
  });

  test("priming does NOT promote tasks with incomplete dependencies", async () => {
    const dependency = createTask({ id: "dep", status: "in_progress" });
    const dependent = createTask({ id: "main", status: "todo", depends_on: ["dep"] });
    const tasksFile: TasksFile = { tasks: [dependency, dependent] };
    await saveTasks(TEST_TASKS_FILE, tasksFile);

    const primed = await primeTasks(TEST_TASKS_FILE, tasksFile, noOpLogger);

    expect(primed).toBe(0);
    expect(findTask(tasksFile.tasks, "main")?.status).toBe("todo");
  });

  test("resetting stuck tasks returns them to ready_for_agent pool", async () => {
    // An "in_progress" task with no active agent is considered stuck
    const stuck = createTask({
      id: "stuck",
      status: "in_progress",
      agent_name: "dead-agent",
    });
    const tasksFile: TasksFile = { tasks: [stuck] };

    const resetCount = resetStuckTasks(tasksFile, noOpLogger);

    expect(resetCount).toBe(1);
    expect(tasksFile.tasks[0]!.status).toBe("ready_for_agent");
  });
});

describe("Agent Registry", () => {
  test("getAllAgents discovers all unique agents from tasks", () => {
    const tasks = [
      createTask({ agent_name: "alice" }),
      createTask({ agent_name: "bob" }),
      createTask({ agent_name: "alice" }), // duplicate
      createTask({}), // no agent
    ];

    const agents = getAllAgents(tasks);

    expect(agents.size).toBe(2);
    expect(agents.has("alice")).toBe(true);
    expect(agents.has("bob")).toBe(true);
  });

  test("getAllAgents finds agents in nested subtasks", () => {
    const subtask = createTask({ agent_name: "nested-agent" });
    const parent = createTask({ agent_name: "parent-agent", subtasks: [subtask] });

    const agents = getAllAgents([parent]);

    expect(agents.has("nested-agent")).toBe(true);
    expect(agents.has("parent-agent")).toBe(true);
  });
});

describe("Task Filtering", () => {
  test("can filter tasks by status for dashboard views", () => {
    const tasks = [
      createTask({ id: "a", status: "done" }),
      createTask({ id: "b", status: "in_progress" }),
      createTask({ id: "c", status: "done" }),
    ];

    const done = getTasksByStatus(tasks, "done");

    expect(done).toHaveLength(2);
    expect(done.map((t) => t.id).sort()).toEqual(["a", "c"]);
  });
});
