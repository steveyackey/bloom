import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  addWorktree,
  createRepo,
  getCurrentBranch,
  getWorktreePath,
  getWorktreeStatus,
  listWorktrees,
} from "../src/repos";
import {
  createTask,
  createTasksFile,
  getTaskBranch,
  getTaskMergeTarget,
  sanitizeBranchName,
  validateTasksFile,
} from "../src/task-schema";

const TEST_DIR = join(import.meta.dirname ?? ".", "test-git-workflow");

// =============================================================================
// Schema Tests - Task Git Configuration
// =============================================================================

describe("Task Schema - Git Configuration", () => {
  describe("getTaskBranch", () => {
    it("returns branch when set", () => {
      const task = createTask({
        id: "test",
        title: "Test",
        branch: "feature/my-branch",
        repo: "my-repo",
      });
      expect(getTaskBranch(task)).toBe("feature/my-branch");
    });

    it("returns undefined when no branch set", () => {
      const task = createTask({ id: "test", title: "Test" });
      expect(getTaskBranch(task)).toBeUndefined();
    });
  });

  describe("getTaskMergeTarget", () => {
    it("returns merge target when different from branch", () => {
      const task = createTask({
        id: "test",
        title: "Test",
        branch: "feature/work",
        merge_into: "main",
        repo: "my-repo",
      });
      expect(getTaskMergeTarget(task)).toBe("main");
    });

    it("returns undefined when merge_into equals branch (no merge needed)", () => {
      const task = createTask({
        id: "test",
        title: "Test",
        branch: "main",
        merge_into: "main",
        repo: "my-repo",
      });
      expect(getTaskMergeTarget(task)).toBeUndefined();
    });

    it("returns undefined when no merge_into set", () => {
      const task = createTask({
        id: "test",
        title: "Test",
        branch: "feature/work",
        repo: "my-repo",
      });
      expect(getTaskMergeTarget(task)).toBeUndefined();
    });

    it("returns undefined when no branch set", () => {
      const task = createTask({
        id: "test",
        title: "Test",
        merge_into: "main",
      });
      expect(getTaskMergeTarget(task)).toBeUndefined();
    });
  });

  describe("sanitizeBranchName", () => {
    it("replaces slashes with hyphens", () => {
      expect(sanitizeBranchName("feature/auth")).toBe("feature-auth");
      expect(sanitizeBranchName("claude/fix/bug-123")).toBe("claude-fix-bug-123");
    });

    it("leaves branch names without slashes unchanged", () => {
      expect(sanitizeBranchName("main")).toBe("main");
      expect(sanitizeBranchName("develop")).toBe("develop");
    });
  });
});

describe("Task Schema - Git Config Validation", () => {
  it("accepts tasks with git settings when repo is provided", () => {
    const tasksFile = {
      git: { push_to_remote: true, auto_cleanup_merged: false },
      tasks: [
        {
          id: "test-task",
          title: "Test Task",
          status: "todo",
          repo: "my-repo",
          branch: "feature/work",
          base_branch: "main",
          merge_into: "main",
          depends_on: [],
          acceptance_criteria: [],
          ai_notes: [],
          subtasks: [],
        },
      ],
    };

    expect(() => validateTasksFile(tasksFile)).not.toThrow();
  });

  it("rejects tasks with branch but no repo", () => {
    const tasksFile = {
      tasks: [
        {
          id: "test-task",
          title: "Test Task",
          status: "todo",
          branch: "feature/work", // branch without repo
          depends_on: [],
          acceptance_criteria: [],
          ai_notes: [],
          subtasks: [],
        },
      ],
    };

    expect(() => validateTasksFile(tasksFile)).toThrow(/no repo specified/);
  });

  it("rejects tasks with base_branch but no repo", () => {
    const tasksFile = {
      tasks: [
        {
          id: "test-task",
          title: "Test Task",
          status: "todo",
          base_branch: "main", // base_branch without repo
          depends_on: [],
          acceptance_criteria: [],
          ai_notes: [],
          subtasks: [],
        },
      ],
    };

    expect(() => validateTasksFile(tasksFile)).toThrow(/no repo specified/);
  });

  it("rejects tasks with merge_into but no repo", () => {
    const tasksFile = {
      tasks: [
        {
          id: "test-task",
          title: "Test Task",
          status: "todo",
          merge_into: "main", // merge_into without repo
          depends_on: [],
          acceptance_criteria: [],
          ai_notes: [],
          subtasks: [],
        },
      ],
    };

    expect(() => validateTasksFile(tasksFile)).toThrow(/no repo specified/);
  });

  it("accepts tasks without git settings and no repo", () => {
    const tasksFile = {
      tasks: [
        {
          id: "test-task",
          title: "Test Task",
          status: "todo",
          depends_on: [],
          acceptance_criteria: [],
          ai_notes: [],
          subtasks: [],
        },
      ],
    };

    expect(() => validateTasksFile(tasksFile)).not.toThrow();
  });

  it("validates nested subtasks for git config", () => {
    const tasksFile = {
      tasks: [
        {
          id: "parent",
          title: "Parent",
          status: "todo",
          depends_on: [],
          acceptance_criteria: [],
          ai_notes: [],
          subtasks: [
            {
              id: "child",
              title: "Child",
              status: "todo",
              branch: "feature/child", // branch without repo in subtask
              depends_on: [],
              acceptance_criteria: [],
              ai_notes: [],
              subtasks: [],
            },
          ],
        },
      ],
    };

    expect(() => validateTasksFile(tasksFile)).toThrow(/no repo specified/);
  });
});

describe("Tasks File - Git Top-Level Config", () => {
  it("creates tasks file with git config", () => {
    const file = createTasksFile([], { push_to_remote: true, auto_cleanup_merged: true });
    expect(file.git?.push_to_remote).toBe(true);
    expect(file.git?.auto_cleanup_merged).toBe(true);
  });

  it("defaults git config values to false", () => {
    const tasksFile = validateTasksFile({ tasks: [], git: {} });
    expect(tasksFile.git?.push_to_remote).toBe(false);
    expect(tasksFile.git?.auto_cleanup_merged).toBe(false);
  });
});

// =============================================================================
// Git Operations Tests
// =============================================================================

describe("Git Operations - Worktree Creation with Base Branch", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, "repos"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("creates worktree from specified base branch", async () => {
    // Create repo with main branch
    const repoResult = await createRepo(TEST_DIR, "test-repo");
    expect(repoResult.success).toBe(true);

    // Add a worktree for a new feature branch from main
    const result = await addWorktree(TEST_DIR, "test-repo", "feature/new-feature", {
      create: true,
      baseBranch: "main",
    });
    expect(result.success).toBe(true);

    // Verify worktree was created
    const worktrees = await listWorktrees(TEST_DIR, "test-repo");
    const featureWorktree = worktrees.find((w) => w.branch === "feature/new-feature");
    expect(featureWorktree).toBeDefined();
  });

  it("falls back to default branch when base branch does not exist", async () => {
    const repoResult = await createRepo(TEST_DIR, "test-repo");
    expect(repoResult.success).toBe(true);

    const result = await addWorktree(TEST_DIR, "test-repo", "feature/work", {
      create: true,
      baseBranch: "nonexistent-branch",
    });

    // Should succeed by falling back to the default branch (main)
    expect(result.success).toBe(true);
    expect(result.path).toContain("feature-work");
  });

  it("creates worktree path with sanitized branch name", async () => {
    const repoResult = await createRepo(TEST_DIR, "test-repo");
    expect(repoResult.success).toBe(true);

    const result = await addWorktree(TEST_DIR, "test-repo", "claude/feature/auth", {
      create: true,
    });
    expect(result.success).toBe(true);

    // Path should have hyphens
    expect(result.path).toContain("claude-feature-auth");
    expect(existsSync(result.path)).toBe(true);

    // But git branch should have slashes
    const worktrees = await listWorktrees(TEST_DIR, "test-repo");
    const found = worktrees.find((w) => w.branch === "claude/feature/auth");
    expect(found).toBeDefined();
  });
});

describe("Git Operations - Worktree Status", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, "repos"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("reports clean status for repo with no changes", async () => {
    const repoResult = await createRepo(TEST_DIR, "test-repo");
    expect(repoResult.success).toBe(true);

    const status = getWorktreeStatus(repoResult.worktreePath);
    expect(status.clean).toBe(true);
    expect(status.hasUncommittedChanges).toBe(false);
    expect(status.hasUntrackedFiles).toBe(false);
  });

  it("detects untracked files", async () => {
    const repoResult = await createRepo(TEST_DIR, "test-repo");
    expect(repoResult.success).toBe(true);

    // Create an untracked file
    writeFileSync(join(repoResult.worktreePath, "new-file.txt"), "hello");

    const status = getWorktreeStatus(repoResult.worktreePath);
    expect(status.clean).toBe(false);
    expect(status.hasUntrackedFiles).toBe(true);
    expect(status.untrackedFiles).toContain("new-file.txt");
  });

  it("detects modified files", async () => {
    const repoResult = await createRepo(TEST_DIR, "test-repo");
    expect(repoResult.success).toBe(true);

    // Modify existing file
    writeFileSync(join(repoResult.worktreePath, "README.md"), "modified content");

    const status = getWorktreeStatus(repoResult.worktreePath);
    expect(status.clean).toBe(false);
    expect(status.hasUncommittedChanges).toBe(true);
    expect(status.modifiedFiles).toContain("README.md");
  });

  it("returns clean for nonexistent path", () => {
    const status = getWorktreeStatus("/nonexistent/path");
    expect(status.clean).toBe(true);
  });
});

describe("Git Operations - Branch Helpers", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, "repos"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("detects current branch", async () => {
    const repoResult = await createRepo(TEST_DIR, "test-repo");
    expect(repoResult.success).toBe(true);

    const branch = getCurrentBranch(repoResult.worktreePath);
    expect(branch).toBe("main");
  });

  it("getWorktreePath sanitizes branch names", () => {
    const path = getWorktreePath(TEST_DIR, "my-repo", "feature/auth/login");
    expect(path).toBe(join(TEST_DIR, "repos", "my-repo", "feature-auth-login"));
  });
});

// =============================================================================
// Integration Tests - Git Workflow Scenarios
// =============================================================================

describe("Git Workflow - Feature Branch Pattern", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, "repos"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("supports feature branch workflow: create from main, work, prepare for merge", async () => {
    // 1. Create repo (simulates bloom repo clone)
    const repoResult = await createRepo(TEST_DIR, "my-app");
    expect(repoResult.success).toBe(true);

    // 2. Create feature branch from main (simulates task pickup with base_branch: main)
    const worktreeResult = await addWorktree(TEST_DIR, "my-app", "feature/new-feature", {
      create: true,
      baseBranch: "main",
    });
    expect(worktreeResult.success).toBe(true);

    // 3. Verify working on correct branch
    const currentBranch = getCurrentBranch(worktreeResult.path);
    expect(currentBranch).toBe("feature/new-feature");

    // 4. Make changes (simulates agent work)
    writeFileSync(join(worktreeResult.path, "feature.ts"), "// new feature");

    // 5. Check status shows changes
    const status = getWorktreeStatus(worktreeResult.path);
    expect(status.clean).toBe(false);
    expect(status.hasUntrackedFiles).toBe(true);

    // 6. Verify worktrees list shows both main and feature branch
    const worktrees = await listWorktrees(TEST_DIR, "my-app");
    expect(worktrees.length).toBe(2);
    expect(worktrees.some((w) => w.branch === "main")).toBe(true);
    expect(worktrees.some((w) => w.branch === "feature/new-feature")).toBe(true);
  });

  it("supports sequential tasks on same branch pattern", async () => {
    // Create repo
    const repoResult = await createRepo(TEST_DIR, "my-app");
    expect(repoResult.success).toBe(true);

    // Task 1: Create feature branch
    const task1Result = await addWorktree(TEST_DIR, "my-app", "feature/big-feature", {
      create: true,
      baseBranch: "main",
    });
    expect(task1Result.success).toBe(true);

    // Task 2: Reuse same branch (worktree already exists)
    const worktrees = await listWorktrees(TEST_DIR, "my-app");
    const existingWorktree = worktrees.find((w) => w.branch === "feature/big-feature");
    expect(existingWorktree).toBeDefined();

    // Trying to create same worktree again should fail (expected behavior)
    const task2Result = await addWorktree(TEST_DIR, "my-app", "feature/big-feature", {
      create: true,
    });
    expect(task2Result.success).toBe(false);
    expect(task2Result.error).toContain("already exists");
  });
});

describe("Git Workflow - Task Configuration Patterns", () => {
  it("pattern 1: feature branch with merge back", () => {
    const task = createTask({
      id: "implement-feature",
      title: "Implement feature",
      repo: "my-app",
      branch: "feature/new-feature",
      base_branch: "main",
      merge_into: "main",
    });

    expect(getTaskBranch(task)).toBe("feature/new-feature");
    expect(task.base_branch).toBe("main");
    expect(getTaskMergeTarget(task)).toBe("main");
  });

  it("pattern 2: work on existing branch without merge", () => {
    const task = createTask({
      id: "add-component",
      title: "Add component",
      repo: "my-app",
      branch: "develop",
      // No base_branch - branch exists
      // No merge_into - no merge needed
    });

    expect(getTaskBranch(task)).toBe("develop");
    expect(task.base_branch).toBeUndefined();
    expect(getTaskMergeTarget(task)).toBeUndefined();
  });

  it("pattern 3: sequential tasks - intermediate without merge", () => {
    const task1 = createTask({
      id: "task-1",
      title: "First task",
      repo: "my-app",
      branch: "feature/big-feature",
      base_branch: "main",
      // No merge_into - intermediate task
    });

    expect(getTaskBranch(task1)).toBe("feature/big-feature");
    expect(getTaskMergeTarget(task1)).toBeUndefined();
  });

  it("pattern 3: sequential tasks - final with merge", () => {
    const task2 = createTask({
      id: "task-2",
      title: "Final task",
      repo: "my-app",
      branch: "feature/big-feature",
      merge_into: "main", // Only final task merges
    });

    expect(getTaskBranch(task2)).toBe("feature/big-feature");
    expect(getTaskMergeTarget(task2)).toBe("main");
  });
});
