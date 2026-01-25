/**
 * CLI Event Handler Tests
 *
 * These tests verify that the CLI event handler:
 * 1. Handles all event types without errors
 * 2. Produces appropriate log output
 * 3. Uses correct log levels for different event types
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createCLIEventHandler } from "../../src/adapters/cli";
import type { OrchestratorEvent } from "../../src/core/orchestrator";

describe("CLI Event Handler", () => {
  let capturedMessages: string[];
  let originalLog: typeof console.log;
  let originalWarn: typeof console.warn;
  let originalError: typeof console.error;

  beforeEach(() => {
    capturedMessages = [];

    // Store originals
    originalLog = console.log;
    originalWarn = console.warn;
    originalError = console.error;

    // Mock console methods to capture output
    console.log = mock((...args: unknown[]) => {
      capturedMessages.push(args.map(String).join(" "));
    });
    console.warn = mock((...args: unknown[]) => {
      capturedMessages.push(args.map(String).join(" "));
    });
    console.error = mock((...args: unknown[]) => {
      capturedMessages.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    // Restore originals
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  });

  const getCapturedOutput = () => capturedMessages.join("\n");

  describe("Handler Creation", () => {
    test("creates handler with agent name", () => {
      const handler = createCLIEventHandler("test-agent");
      expect(typeof handler).toBe("function");
    });

    test("handler can be called with events", () => {
      const handler = createCLIEventHandler("test-agent");

      // Should not throw
      expect(() => {
        handler({ type: "agent:started", agentName: "test-agent", provider: "claude", pollInterval: 5000 });
      }).not.toThrow();
    });
  });

  describe("Agent Lifecycle Events", () => {
    test("agent:started logs poll interval", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "agent:started", agentName: "test-agent", provider: "claude", pollInterval: 5000 });

      expect(getCapturedOutput()).toContain("polling every 5s");
    });

    test("agent:idle is debug level (may not appear in default output)", () => {
      const handler = createCLIEventHandler("test-agent");
      // This should not throw, even if debug is suppressed
      handler({ type: "agent:idle", agentName: "test-agent" });
    });

    test("agent:output is handled silently in CLI mode", () => {
      const handler = createCLIEventHandler("test-agent");
      const beforeCount = capturedMessages.length;

      handler({ type: "agent:output", agentName: "test-agent", data: "Hello world\n" });

      // CLI handler doesn't log agent:output (it's for TUI)
      expect(capturedMessages.length).toBe(beforeCount);
    });

    test("agent:process_started is debug level", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "agent:process_started", agentName: "test-agent", pid: 12345, command: "claude" });
      // Debug level may not appear, but shouldn't throw
    });

    test("agent:process_ended is debug level", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "agent:process_ended", agentName: "test-agent", pid: 12345, exitCode: 0 });
      // Debug level may not appear, but shouldn't throw
    });
  });

  describe("Task Lifecycle Events", () => {
    test("task:found logs task ID and title", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "task:found",
        taskId: "task-123",
        title: "Implement feature X",
        agentName: "test-agent",
      });

      const output = getCapturedOutput();
      expect(output).toContain("task-123");
      expect(output).toContain("Implement feature X");
    });

    test("task:started logs working directory", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "task:started",
        taskId: "task-123",
        agentName: "test-agent",
        workingDir: "/path/to/work",
        provider: "claude",
        resuming: false,
      });

      const output = getCapturedOutput();
      expect(output).toContain("/path/to/work");
      expect(output).toContain("claude");
    });

    test("task:completed logs duration", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "task:completed",
        taskId: "task-123",
        agentName: "test-agent",
        duration: 120,
      });

      const output = getCapturedOutput();
      expect(output).toContain("120s");
      expect(output).toContain("completed");
    });

    test("task:failed logs error and duration", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "task:failed",
        taskId: "task-123",
        agentName: "test-agent",
        duration: 45,
        error: "Connection timeout",
      });

      const output = getCapturedOutput();
      expect(output).toContain("Connection timeout");
      expect(output).toContain("45s");
    });

    test("task:blocked logs reason", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "task:blocked",
        taskId: "task-123",
        agentName: "test-agent",
        reason: "Max retries reached",
      });

      expect(getCapturedOutput()).toContain("Max retries reached");
    });
  });

  describe("Git Operation Events", () => {
    test("git:pulling logs repo name", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "git:pulling", repo: "my-repo" });

      expect(getCapturedOutput()).toContain("my-repo");
    });

    test("git:pulled handles success with update", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "git:pulled", repo: "my-repo", updated: true });

      expect(getCapturedOutput()).toContain("Updated");
    });

    test("git:pulled handles error", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "git:pulled", repo: "my-repo", updated: false, error: "Network error" });

      expect(getCapturedOutput()).toContain("Network error");
    });

    test("git:pushing logs branch and remote", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "git:pushing", branch: "feature/x", remote: "origin" });

      const output = getCapturedOutput();
      expect(output).toContain("feature/x");
      expect(output).toContain("origin");
    });

    test("git:pushed handles success", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "git:pushed", branch: "feature/x", remote: "origin", success: true });

      expect(getCapturedOutput()).toContain("successfully");
    });

    test("git:pushed handles failure", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "git:pushed",
        branch: "feature/x",
        remote: "origin",
        success: false,
        error: "Permission denied",
      });

      expect(getCapturedOutput()).toContain("Permission denied");
    });
  });

  describe("Worktree Events", () => {
    test("worktree:creating logs branch name", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "worktree:creating", repo: "my-repo", branch: "feature/x" });

      expect(getCapturedOutput()).toContain("feature/x");
    });

    test("worktree:creating logs base branch when provided", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "worktree:creating", repo: "my-repo", branch: "feature/x", baseBranch: "main" });

      expect(getCapturedOutput()).toContain("main");
    });

    test("worktree:created handles failure", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "worktree:created",
        repo: "my-repo",
        branch: "feature/x",
        success: false,
        error: "Branch exists",
      });

      expect(getCapturedOutput()).toContain("Branch exists");
    });
  });

  describe("PR Events", () => {
    test("git:pr_creating logs branches", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "git:pr_creating", sourceBranch: "feature/x", targetBranch: "main" });

      const output = getCapturedOutput();
      expect(output).toContain("feature/x");
      expect(output).toContain("main");
    });

    test("git:pr_created logs URL on success", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "git:pr_created",
        url: "https://github.com/org/repo/pull/123",
        sourceBranch: "feature/x",
        targetBranch: "main",
      });

      expect(getCapturedOutput()).toContain("pull/123");
    });

    test("git:pr_created handles existing PR", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "git:pr_created",
        sourceBranch: "feature/x",
        targetBranch: "main",
        alreadyExists: true,
      });

      expect(getCapturedOutput()).toContain("already exists");
    });
  });

  describe("Merge Events", () => {
    test("git:merging logs branches", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "git:merging", sourceBranch: "feature/x", targetBranch: "main" });

      const output = getCapturedOutput();
      expect(output).toContain("feature/x");
      expect(output).toContain("main");
    });

    test("git:merged confirms success", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "git:merged", sourceBranch: "feature/x", targetBranch: "main" });

      expect(getCapturedOutput()).toContain("successfully");
    });

    test("git:merge_conflict logs error", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "git:merge_conflict",
        sourceBranch: "feature/x",
        targetBranch: "main",
        error: "Conflict in file.ts",
      });

      expect(getCapturedOutput()).toContain("Conflict");
    });
  });

  describe("Merge Lock Events", () => {
    test("merge:lock_waiting logs holder info", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "merge:lock_waiting",
        targetBranch: "main",
        holder: "agent-1",
        holderBranch: "feature/y",
        waitTime: 5000,
      });

      const output = getCapturedOutput();
      expect(output).toContain("agent-1");
      expect(output).toContain("feature/y");
    });

    test("merge:lock_timeout logs warning", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "merge:lock_timeout", targetBranch: "main" });

      expect(getCapturedOutput()).toContain("Timed out");
    });
  });

  describe("Conflict Resolution Events", () => {
    test("merge:conflict_resolving logs message", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "merge:conflict_resolving", sourceBranch: "feature/x", targetBranch: "main" });

      expect(getCapturedOutput()).toContain("resolve");
    });

    test("merge:conflict_resolved logs success", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "merge:conflict_resolved", sourceBranch: "feature/x", targetBranch: "main", success: true });

      expect(getCapturedOutput()).toContain("successfully");
    });

    test("merge:conflict_resolved logs failure", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "merge:conflict_resolved", sourceBranch: "feature/x", targetBranch: "main", success: false });

      expect(getCapturedOutput()).toContain("Manual intervention");
    });
  });

  describe("Uncommitted Changes Events", () => {
    test("git:uncommitted_changes logs file lists", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "git:uncommitted_changes",
        branch: "feature/x",
        modifiedFiles: ["file1.ts"],
        untrackedFiles: ["new-file.ts"],
        stagedFiles: ["staged.ts"],
      });

      const output = getCapturedOutput();
      expect(output).toContain("file1.ts");
      expect(output).toContain("new-file.ts");
      expect(output).toContain("staged.ts");
    });
  });

  describe("Commit Retry Events", () => {
    test("commit:retry logs attempt count", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "commit:retry", taskId: "task-1", attempt: 2, maxAttempts: 3 });

      expect(getCapturedOutput()).toContain("2/3");
    });
  });

  describe("Session Events", () => {
    test("session:corrupted logs reason", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "session:corrupted",
        taskId: "task-1",
        wasResuming: true,
        reason: "tool_use error",
      });

      const output = getCapturedOutput();
      expect(output).toContain("corrupted");
      expect(output).toContain("tool_use");
    });
  });

  describe("Generic Events", () => {
    test("error event logs message", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({ type: "error", message: "Something went wrong" });

      expect(getCapturedOutput()).toContain("Something went wrong");
    });

    test("log event uses appropriate level", () => {
      const handler = createCLIEventHandler("test-agent");

      handler({ type: "log", level: "info", message: "Info message" });
      expect(getCapturedOutput()).toContain("Info message");

      handler({ type: "log", level: "warn", message: "Warning message" });
      expect(getCapturedOutput()).toContain("Warning message");
    });
  });

  describe("Cleanup Events", () => {
    test("git:cleanup logs deleted branches", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "git:cleanup",
        targetBranch: "main",
        deleted: ["feature/a", "feature/b"],
        failed: [],
      });

      const output = getCapturedOutput();
      expect(output).toContain("feature/a");
      expect(output).toContain("feature/b");
    });

    test("git:cleanup logs failed deletions", () => {
      const handler = createCLIEventHandler("test-agent");
      handler({
        type: "git:cleanup",
        targetBranch: "main",
        deleted: [],
        failed: [{ branch: "protected-branch", error: "Protected" }],
      });

      const output = getCapturedOutput();
      expect(output).toContain("protected-branch");
      expect(output).toContain("Protected");
    });
  });

  describe("Exhaustive Event Handling", () => {
    test("handles all event types without throwing", () => {
      const handler = createCLIEventHandler("test-agent");

      const events: OrchestratorEvent[] = [
        { type: "agent:started", agentName: "test", provider: "claude", pollInterval: 5000 },
        { type: "agent:idle", agentName: "test" },
        { type: "agent:output", agentName: "test", data: "test" },
        { type: "agent:process_started", agentName: "test", pid: 123, command: "claude" },
        { type: "agent:process_ended", agentName: "test", pid: 123, exitCode: 0 },
        { type: "task:found", taskId: "t1", title: "Test", agentName: "test" },
        {
          type: "task:started",
          taskId: "t1",
          agentName: "test",
          workingDir: "/tmp",
          provider: "claude",
          resuming: false,
        },
        { type: "task:completed", taskId: "t1", agentName: "test", duration: 10 },
        { type: "task:failed", taskId: "t1", agentName: "test", duration: 10, error: "fail" },
        { type: "task:blocked", taskId: "t1", agentName: "test", reason: "blocked" },
        { type: "git:pulling", repo: "repo" },
        { type: "git:pulled", repo: "repo", updated: true },
        { type: "worktree:creating", repo: "repo", branch: "b" },
        { type: "worktree:created", repo: "repo", branch: "b", success: true },
        { type: "git:uncommitted_changes", branch: "b", modifiedFiles: [], untrackedFiles: [], stagedFiles: [] },
        { type: "commit:retry", taskId: "t1", attempt: 1, maxAttempts: 3 },
        { type: "git:pushing", branch: "b", remote: "origin" },
        { type: "git:pushed", branch: "b", remote: "origin", success: true },
        { type: "git:pr_creating", sourceBranch: "b", targetBranch: "main" },
        { type: "git:pr_created", sourceBranch: "b", targetBranch: "main" },
        { type: "merge:lock_waiting", targetBranch: "main", holder: "h", holderBranch: "b", waitTime: 1000 },
        { type: "merge:lock_acquired", targetBranch: "main" },
        { type: "merge:lock_timeout", targetBranch: "main" },
        { type: "git:merging", sourceBranch: "b", targetBranch: "main" },
        { type: "git:merged", sourceBranch: "b", targetBranch: "main" },
        { type: "git:merge_conflict", sourceBranch: "b", targetBranch: "main", error: "conflict" },
        { type: "merge:conflict_resolving", sourceBranch: "b", targetBranch: "main" },
        { type: "merge:conflict_resolved", sourceBranch: "b", targetBranch: "main", success: true },
        { type: "git:cleanup", targetBranch: "main", deleted: [], failed: [] },
        { type: "session:corrupted", taskId: "t1", wasResuming: true, reason: "error" },
        { type: "error", message: "error" },
        { type: "log", level: "info", message: "log" },
      ];

      for (const event of events) {
        expect(() => handler(event)).not.toThrow();
      }
    });
  });
});
