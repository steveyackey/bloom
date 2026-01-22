import { describe, expect, test } from "bun:test";
import {
  createTask,
  createTasksFile,
  type GitConfig,
  getTaskBranch,
  getTaskMergeTarget,
  safeValidateTasksFile,
  sanitizeBranchName,
  type TaskStatus,
  validateTasksFile,
} from "../src/task-schema";

describe("task-schema", () => {
  describe("createTask", () => {
    test("creates task with minimal required fields", () => {
      const task = createTask({ id: "test-1", title: "Test Task" });

      expect(task.id).toBe("test-1");
      expect(task.title).toBe("Test Task");
      expect(task.status).toBe("todo");
      expect(task.depends_on).toEqual([]);
      expect(task.acceptance_criteria).toEqual([]);
      expect(task.ai_notes).toEqual([]);
      expect(task.subtasks).toEqual([]);
    });

    test("creates task with custom status", () => {
      const task = createTask({ id: "test-1", title: "Test", status: "in_progress" });
      expect(task.status).toBe("in_progress");
    });

    test("creates task with all optional fields", () => {
      const task = createTask({
        id: "test-1",
        title: "Test Task",
        status: "assigned",
        phase: 2,
        depends_on: ["dep-1", "dep-2"],
        repo: "my-repo",
        branch: "feature/test",
        base_branch: "main",
        merge_into: "develop",
        agent_name: "test-agent",
        instructions: "Do the thing",
        acceptance_criteria: ["AC1", "AC2"],
        ai_notes: ["Note 1"],
        subtasks: [],
        validation_task_id: "val-1",
        checkpoint: true,
        session_id: "session-123",
      });

      expect(task.phase).toBe(2);
      expect(task.depends_on).toEqual(["dep-1", "dep-2"]);
      expect(task.repo).toBe("my-repo");
      expect(task.branch).toBe("feature/test");
      expect(task.base_branch).toBe("main");
      expect(task.merge_into).toBe("develop");
      expect(task.agent_name).toBe("test-agent");
      expect(task.instructions).toBe("Do the thing");
      expect(task.acceptance_criteria).toEqual(["AC1", "AC2"]);
      expect(task.ai_notes).toEqual(["Note 1"]);
      expect(task.validation_task_id).toBe("val-1");
      expect(task.checkpoint).toBe(true);
      expect(task.session_id).toBe("session-123");
    });

    test("throws on empty id", () => {
      expect(() => createTask({ id: "", title: "Test" })).toThrow();
    });

    test("throws on empty title", () => {
      expect(() => createTask({ id: "test-1", title: "" })).toThrow();
    });
  });

  describe("createTasksFile", () => {
    test("creates empty tasks file", () => {
      const file = createTasksFile();
      expect(file.tasks).toEqual([]);
      expect(file.git).toBeUndefined();
    });

    test("creates tasks file with tasks", () => {
      const tasks = [createTask({ id: "t1", title: "Task 1" }), createTask({ id: "t2", title: "Task 2" })];
      const file = createTasksFile(tasks);

      expect(file.tasks).toHaveLength(2);
      expect(file.tasks[0]!.id).toBe("t1");
      expect(file.tasks[1]!.id).toBe("t2");
    });

    test("creates tasks file with git config", () => {
      const gitConfig: Partial<GitConfig> = {
        push_to_remote: true,
        auto_cleanup_merged: true,
      };
      const file = createTasksFile([], gitConfig);

      expect(file.git?.push_to_remote).toBe(true);
      expect(file.git?.auto_cleanup_merged).toBe(true);
    });
  });

  describe("getTaskBranch", () => {
    test("returns branch when set", () => {
      const task = createTask({ id: "t1", title: "Test", branch: "feature/my-feature" });
      expect(getTaskBranch(task)).toBe("feature/my-feature");
    });

    test("returns undefined when no branch", () => {
      const task = createTask({ id: "t1", title: "Test" });
      expect(getTaskBranch(task)).toBeUndefined();
    });
  });

  describe("getTaskMergeTarget", () => {
    test("returns undefined when no branch", () => {
      const task = createTask({ id: "t1", title: "Test", merge_into: "main" });
      expect(getTaskMergeTarget(task)).toBeUndefined();
    });

    test("returns undefined when no merge_into", () => {
      const task = createTask({ id: "t1", title: "Test", branch: "feature/test" });
      expect(getTaskMergeTarget(task)).toBeUndefined();
    });

    test("returns undefined when branch equals merge_into (same branch = no merge needed)", () => {
      const task = createTask({ id: "t1", title: "Test", branch: "main", merge_into: "main" });
      expect(getTaskMergeTarget(task)).toBeUndefined();
    });

    test("returns merge_into when branch differs from merge_into", () => {
      const task = createTask({ id: "t1", title: "Test", branch: "feature/test", merge_into: "main" });
      expect(getTaskMergeTarget(task)).toBe("main");
    });
  });

  describe("sanitizeBranchName", () => {
    test("replaces slashes with hyphens", () => {
      expect(sanitizeBranchName("feature/my-feature")).toBe("feature-my-feature");
    });

    test("handles multiple slashes", () => {
      expect(sanitizeBranchName("feature/sub/deep/branch")).toBe("feature-sub-deep-branch");
    });

    test("returns unchanged string with no slashes", () => {
      expect(sanitizeBranchName("main")).toBe("main");
      expect(sanitizeBranchName("develop")).toBe("develop");
    });

    test("handles empty string", () => {
      expect(sanitizeBranchName("")).toBe("");
    });
  });

  describe("validateTasksFile", () => {
    test("validates empty tasks file", () => {
      const result = validateTasksFile({ tasks: [] });
      expect(result.tasks).toEqual([]);
    });

    test("validates tasks file with valid tasks", () => {
      const data = {
        tasks: [
          { id: "t1", title: "Task 1" },
          { id: "t2", title: "Task 2", depends_on: ["t1"] },
        ],
      };
      const result = validateTasksFile(data);
      expect(result.tasks).toHaveLength(2);
    });

    test("validates tasks with git config", () => {
      const data = {
        git: { push_to_remote: true, auto_cleanup_merged: false },
        tasks: [{ id: "t1", title: "Task 1", repo: "my-repo", branch: "feature/test" }],
      };
      const result = validateTasksFile(data);
      expect(result.git?.push_to_remote).toBe(true);
    });

    test("throws on task with branch but no repo", () => {
      const data = {
        tasks: [{ id: "t1", title: "Task 1", branch: "feature/test" }],
      };
      expect(() => validateTasksFile(data)).toThrow(/no repo specified/);
    });

    test("throws on task with base_branch but no repo", () => {
      const data = {
        tasks: [{ id: "t1", title: "Task 1", base_branch: "main" }],
      };
      expect(() => validateTasksFile(data)).toThrow(/no repo specified/);
    });

    test("throws on task with merge_into but no repo", () => {
      const data = {
        tasks: [{ id: "t1", title: "Task 1", merge_into: "main" }],
      };
      expect(() => validateTasksFile(data)).toThrow(/no repo specified/);
    });

    test("validates nested subtasks with git config", () => {
      const data = {
        tasks: [
          {
            id: "t1",
            title: "Parent",
            subtasks: [{ id: "t1.1", title: "Child with branch", repo: "my-repo", branch: "feature/child" }],
          },
        ],
      };
      const result = validateTasksFile(data);
      expect(result.tasks[0]!.subtasks[0]!.branch).toBe("feature/child");
    });

    test("throws on nested subtask with branch but no repo", () => {
      const data = {
        tasks: [
          {
            id: "t1",
            title: "Parent",
            subtasks: [{ id: "t1.1", title: "Child with branch", branch: "feature/child" }],
          },
        ],
      };
      expect(() => validateTasksFile(data)).toThrow(/no repo specified/);
    });
  });

  describe("safeValidateTasksFile", () => {
    test("returns success: true for valid data", () => {
      const result = safeValidateTasksFile({
        tasks: [{ id: "t1", title: "Task 1" }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tasks).toHaveLength(1);
      }
    });

    test("returns success: false with ZodError for invalid schema", () => {
      const result = safeValidateTasksFile({
        tasks: [{ id: "", title: "Missing ID" }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    test("returns success: false with Error for git config validation failure", () => {
      const result = safeValidateTasksFile({
        tasks: [{ id: "t1", title: "Task 1", branch: "feature/test" }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("no repo specified");
      }
    });
  });

  describe("TaskStatus values", () => {
    test("all valid status values are accepted", () => {
      const statuses: TaskStatus[] = ["todo", "ready_for_agent", "assigned", "in_progress", "done", "blocked"];

      for (const status of statuses) {
        const task = createTask({ id: "t1", title: "Test", status });
        expect(task.status).toBe(status);
      }
    });
  });

  describe("Task schema defaults", () => {
    test("defaults status to 'todo'", () => {
      const result = validateTasksFile({
        tasks: [{ id: "t1", title: "Test" }],
      });
      expect(result.tasks[0]!.status).toBe("todo");
    });

    test("defaults depends_on to empty array", () => {
      const result = validateTasksFile({
        tasks: [{ id: "t1", title: "Test" }],
      });
      expect(result.tasks[0]!.depends_on).toEqual([]);
    });

    test("defaults acceptance_criteria to empty array", () => {
      const result = validateTasksFile({
        tasks: [{ id: "t1", title: "Test" }],
      });
      expect(result.tasks[0]!.acceptance_criteria).toEqual([]);
    });

    test("defaults ai_notes to empty array", () => {
      const result = validateTasksFile({
        tasks: [{ id: "t1", title: "Test" }],
      });
      expect(result.tasks[0]!.ai_notes).toEqual([]);
    });

    test("defaults subtasks to empty array", () => {
      const result = validateTasksFile({
        tasks: [{ id: "t1", title: "Test" }],
      });
      expect(result.tasks[0]!.subtasks).toEqual([]);
    });
  });

  describe("GitConfig schema", () => {
    test("defaults push_to_remote to false", () => {
      const result = validateTasksFile({
        git: {},
        tasks: [],
      });
      expect(result.git?.push_to_remote).toBe(false);
    });

    test("defaults auto_cleanup_merged to false", () => {
      const result = validateTasksFile({
        git: {},
        tasks: [],
      });
      expect(result.git?.auto_cleanup_merged).toBe(false);
    });
  });
});
