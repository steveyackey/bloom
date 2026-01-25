import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Task, TasksFile } from "../src/task-schema";
import {
  allStepsComplete,
  findStep,
  findTask,
  getAllAgents,
  getAvailableTasks,
  getCompletedSteps,
  getCurrentStep,
  getNextStep,
  getTasksByStatus,
  hasSteps,
  loadTasks,
  primeTasks,
  resetStuckTasks,
  saveTasks,
  updateStepStatus,
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

  test("loadTasks throws with clear error when file does not exist", async () => {
    const nonExistentFile = join(TEST_DIR, "does-not-exist.yaml");
    await expect(loadTasks(nonExistentFile)).rejects.toThrow("Tasks file not found");
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

// =============================================================================
// Step Helpers
// =============================================================================

describe("Step Helpers", () => {
  function createTaskWithSteps(overrides: Partial<Task> = {}): Task {
    return createTask({
      steps: [
        { id: "step-1", instruction: "Do step 1", status: "pending", acceptance_criteria: [] },
        { id: "step-2", instruction: "Do step 2", status: "pending", acceptance_criteria: [] },
        { id: "step-3", instruction: "Do step 3", status: "pending", acceptance_criteria: [] },
      ],
      ...overrides,
    });
  }

  describe("findStep", () => {
    test("finds step by ID in root task", () => {
      const task = createTaskWithSteps({ id: "task-1" });
      const result = findStep([task], "step-2");

      expect(result).not.toBeNull();
      expect(result?.step.id).toBe("step-2");
      expect(result?.task.id).toBe("task-1");
      expect(result?.index).toBe(1);
    });

    test("finds step in nested subtasks", () => {
      const subtask = createTaskWithSteps({ id: "subtask-1" });
      const parent = createTask({ id: "parent", subtasks: [subtask] });
      const result = findStep([parent], "step-1");

      expect(result).not.toBeNull();
      expect(result?.task.id).toBe("subtask-1");
    });

    test("returns null for non-existent step", () => {
      const task = createTaskWithSteps();
      expect(findStep([task], "non-existent")).toBeNull();
    });

    test("returns null for task without steps", () => {
      const task = createTask({ id: "no-steps" });
      expect(findStep([task], "step-1")).toBeNull();
    });
  });

  describe("getCurrentStep", () => {
    test("returns first pending step", () => {
      const task = createTaskWithSteps();
      const result = getCurrentStep(task);

      expect(result).not.toBeNull();
      expect(result?.step.id).toBe("step-1");
      expect(result?.index).toBe(0);
    });

    test("returns first non-done step when some are completed", () => {
      const task = createTaskWithSteps();
      task.steps![0]!.status = "done";
      const result = getCurrentStep(task);

      expect(result).not.toBeNull();
      expect(result?.step.id).toBe("step-2");
      expect(result?.index).toBe(1);
    });

    test("returns null when all steps are done", () => {
      const task = createTaskWithSteps();
      for (const s of task.steps!) {
        s.status = "done";
      }

      expect(getCurrentStep(task)).toBeNull();
    });

    test("returns null for task without steps", () => {
      const task = createTask();
      expect(getCurrentStep(task)).toBeNull();
    });

    test("returns null for task with empty steps array", () => {
      const task = createTask({ steps: [] });
      expect(getCurrentStep(task)).toBeNull();
    });
  });

  describe("getNextStep", () => {
    test("returns next step after given index", () => {
      const task = createTaskWithSteps();
      const next = getNextStep(task, 0);

      expect(next).not.toBeNull();
      expect(next?.id).toBe("step-2");
    });

    test("returns null when at last step", () => {
      const task = createTaskWithSteps();
      expect(getNextStep(task, 2)).toBeNull();
    });

    test("returns null for task without steps", () => {
      const task = createTask();
      expect(getNextStep(task, 0)).toBeNull();
    });
  });

  describe("hasSteps", () => {
    test("returns true for task with steps", () => {
      const task = createTaskWithSteps();
      expect(hasSteps(task)).toBe(true);
    });

    test("returns false for task without steps", () => {
      const task = createTask();
      expect(hasSteps(task)).toBe(false);
    });

    test("returns false for task with empty steps array", () => {
      const task = createTask({ steps: [] });
      expect(hasSteps(task)).toBe(false);
    });
  });

  describe("allStepsComplete", () => {
    test("returns true when all steps are done", () => {
      const task = createTaskWithSteps();
      for (const s of task.steps!) {
        s.status = "done";
      }
      expect(allStepsComplete(task)).toBe(true);
    });

    test("returns false when any step is not done", () => {
      const task = createTaskWithSteps();
      task.steps![0]!.status = "done";
      task.steps![1]!.status = "in_progress";
      expect(allStepsComplete(task)).toBe(false);
    });

    test("returns true for task without steps", () => {
      const task = createTask();
      expect(allStepsComplete(task)).toBe(true);
    });

    test("returns true for task with empty steps array", () => {
      const task = createTask({ steps: [] });
      expect(allStepsComplete(task)).toBe(true);
    });
  });

  describe("getCompletedSteps", () => {
    test("returns only completed steps", () => {
      const task = createTaskWithSteps();
      task.steps![0]!.status = "done";
      task.steps![1]!.status = "done";

      const completed = getCompletedSteps(task);

      expect(completed).toHaveLength(2);
      expect(completed.map((s) => s.id)).toEqual(["step-1", "step-2"]);
    });

    test("returns empty array when no steps are done", () => {
      const task = createTaskWithSteps();
      expect(getCompletedSteps(task)).toEqual([]);
    });

    test("returns empty array for task without steps", () => {
      const task = createTask();
      expect(getCompletedSteps(task)).toEqual([]);
    });
  });

  describe("updateStepStatus", () => {
    test("updates step status to in_progress with started_at timestamp", () => {
      const task = createTaskWithSteps({ id: "task-1" });
      const tasks = [task];

      const result = updateStepStatus(tasks, "step-1", "in_progress");

      expect(result).toBe(true);
      expect(task.steps![0]!.status).toBe("in_progress");
      expect(task.steps![0]!.started_at).toBeDefined();
      expect(task.steps![0]!.completed_at).toBeUndefined();
    });

    test("updates step status to done with completed_at timestamp", () => {
      const task = createTaskWithSteps({ id: "task-1" });
      const step = task.steps![0]!;
      step.status = "in_progress";
      step.started_at = "2024-01-01T00:00:00.000Z";
      const tasks = [task];

      const result = updateStepStatus(tasks, "step-1", "done");

      expect(result).toBe(true);
      expect(step.status as string).toBe("done");
      expect(step.completed_at).toBeDefined();
    });

    test("does not override existing started_at", () => {
      const task = createTaskWithSteps({ id: "task-1" });
      const originalStartTime = "2024-01-01T00:00:00.000Z";
      task.steps![0]!.started_at = originalStartTime;
      const tasks = [task];

      updateStepStatus(tasks, "step-1", "in_progress");

      expect(task.steps![0]!.started_at).toBe(originalStartTime);
    });

    test("returns false for non-existent step", () => {
      const task = createTaskWithSteps({ id: "task-1" });
      const tasks = [task];

      const result = updateStepStatus(tasks, "non-existent", "done");

      expect(result).toBe(false);
    });

    test("finds and updates step in nested subtasks", () => {
      const subtask = createTaskWithSteps({ id: "subtask-1" });
      const parent = createTask({ id: "parent", subtasks: [subtask] });
      const tasks = [parent];

      const result = updateStepStatus(tasks, "step-2", "done");

      expect(result).toBe(true);
      expect(subtask.steps![1]!.status).toBe("done");
    });
  });
});
