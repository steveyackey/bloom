/**
 * Orchestrator Events Tests
 *
 * These tests verify the event-driven architecture:
 * 1. Event types have expected structure
 * 2. EventHandler contract is correctly used
 * 3. Events carry required information for adapters
 */

import { describe, expect, test } from "bun:test";
import type {
  AgentIdleEvent,
  AgentOutputEvent,
  AgentProcessEndedEvent,
  AgentProcessStartedEvent,
  AgentStartedEvent,
  AllStepsCompletedEvent,
  CommitRetryEvent,
  ErrorEvent,
  EventHandler,
  GitCleanupEvent,
  GitMergeConflictEvent,
  GitMergedEvent,
  GitMergingEvent,
  GitPRCreatedEvent,
  GitPRCreatingEvent,
  GitPulledEvent,
  GitPullingEvent,
  GitPushedEvent,
  GitPushingEvent,
  LogEvent,
  MergeConflictResolvedEvent,
  MergeConflictResolvingEvent,
  MergeLockAcquiredEvent,
  MergeLockTimeoutEvent,
  MergeLockWaitingEvent,
  OrchestratorEvent,
  SessionCorruptedEvent,
  StepCompletedEvent,
  StepFailedEvent,
  StepStartedEvent,
  TaskBlockedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskFoundEvent,
  TaskStartedEvent,
  UncommittedChangesEvent,
  WorktreeCreatedEvent,
  WorktreeCreatingEvent,
} from "../../src/core/orchestrator";

describe("Orchestrator Events", () => {
  describe("Event Type Structure", () => {
    describe("Agent Lifecycle Events", () => {
      test("agent:started event has required fields", () => {
        const event: AgentStartedEvent = {
          type: "agent:started",
          agentName: "test-agent",
          provider: "claude",
          pollInterval: 5000,
        };

        expect(event.type).toBe("agent:started");
        expect(event.agentName).toBe("test-agent");
        expect(event.provider).toBe("claude");
        expect(event.pollInterval).toBe(5000);
      });

      test("agent:idle event has required fields", () => {
        const event: AgentIdleEvent = {
          type: "agent:idle",
          agentName: "test-agent",
        };

        expect(event.type).toBe("agent:idle");
        expect(event.agentName).toBe("test-agent");
      });

      test("agent:output event carries output data", () => {
        const event: AgentOutputEvent = {
          type: "agent:output",
          agentName: "test-agent",
          data: "Processing task...\n",
        };

        expect(event.type).toBe("agent:output");
        expect(event.agentName).toBe("test-agent");
        expect(event.data).toBe("Processing task...\n");
      });

      test("agent:process_started event has PID and command", () => {
        const event: AgentProcessStartedEvent = {
          type: "agent:process_started",
          agentName: "test-agent",
          pid: 12345,
          command: "claude --print",
        };

        expect(event.type).toBe("agent:process_started");
        expect(event.pid).toBe(12345);
        expect(event.command).toBe("claude --print");
      });

      test("agent:process_ended event has PID and exit code", () => {
        const event: AgentProcessEndedEvent = {
          type: "agent:process_ended",
          agentName: "test-agent",
          pid: 12345,
          exitCode: 0,
        };

        expect(event.type).toBe("agent:process_ended");
        expect(event.pid).toBe(12345);
        expect(event.exitCode).toBe(0);
      });

      test("agent:process_ended can have null exit code (signal)", () => {
        const event: AgentProcessEndedEvent = {
          type: "agent:process_ended",
          agentName: "test-agent",
          pid: 12345,
          exitCode: null,
        };

        expect(event.exitCode).toBeNull();
      });
    });

    describe("Task Lifecycle Events", () => {
      test("task:found event has task details", () => {
        const event: TaskFoundEvent = {
          type: "task:found",
          taskId: "task-1",
          title: "Implement feature X",
          agentName: "test-agent",
          repo: "my-repo",
        };

        expect(event.type).toBe("task:found");
        expect(event.taskId).toBe("task-1");
        expect(event.title).toBe("Implement feature X");
        expect(event.repo).toBe("my-repo");
      });

      test("task:found event repo is optional", () => {
        const event: TaskFoundEvent = {
          type: "task:found",
          taskId: "task-1",
          title: "Implement feature X",
          agentName: "test-agent",
        };

        expect(event.repo).toBeUndefined();
      });

      test("task:started event has working directory info", () => {
        const event: TaskStartedEvent = {
          type: "task:started",
          taskId: "task-1",
          agentName: "test-agent",
          workingDir: "/path/to/worktree",
          provider: "claude",
          resuming: false,
        };

        expect(event.type).toBe("task:started");
        expect(event.workingDir).toBe("/path/to/worktree");
        expect(event.provider).toBe("claude");
        expect(event.resuming).toBe(false);
      });

      test("task:started event indicates session resumption", () => {
        const event: TaskStartedEvent = {
          type: "task:started",
          taskId: "task-1",
          agentName: "test-agent",
          workingDir: "/path/to/worktree",
          provider: "claude",
          resuming: true,
        };

        expect(event.resuming).toBe(true);
      });

      test("task:completed event has duration", () => {
        const event: TaskCompletedEvent = {
          type: "task:completed",
          taskId: "task-1",
          agentName: "test-agent",
          duration: 120,
        };

        expect(event.type).toBe("task:completed");
        expect(event.duration).toBe(120);
      });

      test("task:failed event has error details", () => {
        const event: TaskFailedEvent = {
          type: "task:failed",
          taskId: "task-1",
          agentName: "test-agent",
          duration: 45,
          error: "Connection timeout",
        };

        expect(event.type).toBe("task:failed");
        expect(event.error).toBe("Connection timeout");
        expect(event.duration).toBe(45);
      });

      test("task:blocked event has blocking reason", () => {
        const event: TaskBlockedEvent = {
          type: "task:blocked",
          taskId: "task-1",
          agentName: "test-agent",
          reason: "Max commit retries (3) reached",
        };

        expect(event.type).toBe("task:blocked");
        expect(event.reason).toContain("Max commit retries");
      });
    });

    describe("Step Lifecycle Events", () => {
      test("step:started event has step details", () => {
        const event: StepStartedEvent = {
          type: "step:started",
          taskId: "task-1",
          stepId: "step-1",
          stepIndex: 0,
          totalSteps: 3,
          agentName: "test-agent",
          resuming: false,
        };

        expect(event.type).toBe("step:started");
        expect(event.taskId).toBe("task-1");
        expect(event.stepId).toBe("step-1");
        expect(event.stepIndex).toBe(0);
        expect(event.totalSteps).toBe(3);
        expect(event.resuming).toBe(false);
      });

      test("step:started event indicates session resumption", () => {
        const event: StepStartedEvent = {
          type: "step:started",
          taskId: "task-1",
          stepId: "step-2",
          stepIndex: 1,
          totalSteps: 3,
          agentName: "test-agent",
          resuming: true,
        };

        expect(event.resuming).toBe(true);
        expect(event.stepIndex).toBe(1);
      });

      test("step:completed event has duration and more steps flag", () => {
        const event: StepCompletedEvent = {
          type: "step:completed",
          taskId: "task-1",
          stepId: "step-1",
          stepIndex: 0,
          totalSteps: 3,
          duration: 120,
          hasMoreSteps: true,
        };

        expect(event.type).toBe("step:completed");
        expect(event.duration).toBe(120);
        expect(event.hasMoreSteps).toBe(true);
      });

      test("step:completed event indicates final step", () => {
        const event: StepCompletedEvent = {
          type: "step:completed",
          taskId: "task-1",
          stepId: "step-3",
          stepIndex: 2,
          totalSteps: 3,
          duration: 60,
          hasMoreSteps: false,
        };

        expect(event.hasMoreSteps).toBe(false);
        expect(event.stepIndex).toBe(2);
      });

      test("step:failed event has error details", () => {
        const event: StepFailedEvent = {
          type: "step:failed",
          taskId: "task-1",
          stepId: "step-2",
          error: "Build failed with exit code 1",
        };

        expect(event.type).toBe("step:failed");
        expect(event.error).toBe("Build failed with exit code 1");
      });

      test("steps:all_completed event has total duration", () => {
        const event: AllStepsCompletedEvent = {
          type: "steps:all_completed",
          taskId: "task-1",
          totalSteps: 3,
          totalDuration: 300,
        };

        expect(event.type).toBe("steps:all_completed");
        expect(event.totalSteps).toBe(3);
        expect(event.totalDuration).toBe(300);
      });
    });

    describe("Git Operation Events", () => {
      test("git:pulling event has repo name", () => {
        const event: GitPullingEvent = {
          type: "git:pulling",
          repo: "my-repo",
        };

        expect(event.type).toBe("git:pulling");
        expect(event.repo).toBe("my-repo");
      });

      test("git:pulled event indicates update status", () => {
        const event: GitPulledEvent = {
          type: "git:pulled",
          repo: "my-repo",
          updated: true,
        };

        expect(event.updated).toBe(true);
      });

      test("git:pulled event can have error", () => {
        const event: GitPulledEvent = {
          type: "git:pulled",
          repo: "my-repo",
          updated: false,
          error: "Network error",
        };

        expect(event.error).toBe("Network error");
      });

      test("git:pushing event has branch and remote", () => {
        const event: GitPushingEvent = {
          type: "git:pushing",
          branch: "feature/x",
          remote: "origin",
        };

        expect(event.branch).toBe("feature/x");
        expect(event.remote).toBe("origin");
      });

      test("git:pushed event indicates success or failure", () => {
        const successEvent: GitPushedEvent = {
          type: "git:pushed",
          branch: "feature/x",
          remote: "origin",
          success: true,
        };

        const failEvent: GitPushedEvent = {
          type: "git:pushed",
          branch: "feature/x",
          remote: "origin",
          success: false,
          error: "Permission denied",
        };

        expect(successEvent.success).toBe(true);
        expect(failEvent.success).toBe(false);
        expect(failEvent.error).toBe("Permission denied");
      });

      test("git:merging event has source and target branches", () => {
        const event: GitMergingEvent = {
          type: "git:merging",
          sourceBranch: "feature/x",
          targetBranch: "main",
        };

        expect(event.sourceBranch).toBe("feature/x");
        expect(event.targetBranch).toBe("main");
      });

      test("git:merged event confirms successful merge", () => {
        const event: GitMergedEvent = {
          type: "git:merged",
          sourceBranch: "feature/x",
          targetBranch: "main",
        };

        expect(event.type).toBe("git:merged");
      });

      test("git:merge_conflict event has error details", () => {
        const event: GitMergeConflictEvent = {
          type: "git:merge_conflict",
          sourceBranch: "feature/x",
          targetBranch: "main",
          error: "Conflict in file.ts",
        };

        expect(event.error).toBe("Conflict in file.ts");
      });

      test("git:cleanup event lists deleted and failed branches", () => {
        const event: GitCleanupEvent = {
          type: "git:cleanup",
          targetBranch: "main",
          deleted: ["feature/a", "feature/b"],
          failed: [{ branch: "feature/c", error: "Protected branch" }],
          worktreesRemoved: ["feature/a"],
          remotesDeleted: ["feature/a", "feature/b"],
          remotesFailed: [],
        };

        expect(event.deleted).toEqual(["feature/a", "feature/b"]);
        expect(event.failed).toHaveLength(1);
        expect(event.failed[0]?.branch).toBe("feature/c");
        expect(event.worktreesRemoved).toEqual(["feature/a"]);
        expect(event.remotesDeleted).toEqual(["feature/a", "feature/b"]);
      });
    });

    describe("Worktree Events", () => {
      test("worktree:creating event has branch info", () => {
        const event: WorktreeCreatingEvent = {
          type: "worktree:creating",
          repo: "my-repo",
          branch: "feature/x",
          baseBranch: "main",
        };

        expect(event.branch).toBe("feature/x");
        expect(event.baseBranch).toBe("main");
      });

      test("worktree:created event indicates success", () => {
        const event: WorktreeCreatedEvent = {
          type: "worktree:created",
          repo: "my-repo",
          branch: "feature/x",
          success: true,
        };

        expect(event.success).toBe(true);
      });

      test("worktree:created event can have error", () => {
        const event: WorktreeCreatedEvent = {
          type: "worktree:created",
          repo: "my-repo",
          branch: "feature/x",
          success: false,
          error: "Branch already exists",
        };

        expect(event.success).toBe(false);
        expect(event.error).toBe("Branch already exists");
      });
    });

    describe("PR Events", () => {
      test("git:pr_creating event has source and target", () => {
        const event: GitPRCreatingEvent = {
          type: "git:pr_creating",
          sourceBranch: "feature/x",
          targetBranch: "main",
        };

        expect(event.sourceBranch).toBe("feature/x");
        expect(event.targetBranch).toBe("main");
      });

      test("git:pr_created event has URL on success", () => {
        const event: GitPRCreatedEvent = {
          type: "git:pr_created",
          url: "https://github.com/org/repo/pull/123",
          sourceBranch: "feature/x",
          targetBranch: "main",
        };

        expect(event.url).toContain("pull/123");
      });

      test("git:pr_created event indicates existing PR", () => {
        const event: GitPRCreatedEvent = {
          type: "git:pr_created",
          sourceBranch: "feature/x",
          targetBranch: "main",
          alreadyExists: true,
        };

        expect(event.alreadyExists).toBe(true);
      });
    });

    describe("Merge Lock Events", () => {
      test("merge:lock_waiting event shows holder info", () => {
        const event: MergeLockWaitingEvent = {
          type: "merge:lock_waiting",
          targetBranch: "main",
          holder: "agent-1",
          holderBranch: "feature/y",
          waitTime: 5000,
        };

        expect(event.holder).toBe("agent-1");
        expect(event.holderBranch).toBe("feature/y");
        expect(event.waitTime).toBe(5000);
      });

      test("merge:lock_acquired event confirms acquisition", () => {
        const event: MergeLockAcquiredEvent = {
          type: "merge:lock_acquired",
          targetBranch: "main",
        };

        expect(event.type).toBe("merge:lock_acquired");
      });

      test("merge:lock_timeout event indicates failure", () => {
        const event: MergeLockTimeoutEvent = {
          type: "merge:lock_timeout",
          targetBranch: "main",
        };

        expect(event.type).toBe("merge:lock_timeout");
      });
    });

    describe("Conflict Resolution Events", () => {
      test("merge:conflict_resolving event has branches", () => {
        const event: MergeConflictResolvingEvent = {
          type: "merge:conflict_resolving",
          sourceBranch: "feature/x",
          targetBranch: "main",
        };

        expect(event.sourceBranch).toBe("feature/x");
        expect(event.targetBranch).toBe("main");
      });

      test("merge:conflict_resolved event indicates success", () => {
        const event: MergeConflictResolvedEvent = {
          type: "merge:conflict_resolved",
          sourceBranch: "feature/x",
          targetBranch: "main",
          success: true,
        };

        expect(event.success).toBe(true);
      });
    });

    describe("Uncommitted Changes Events", () => {
      test("git:uncommitted_changes event lists files", () => {
        const event: UncommittedChangesEvent = {
          type: "git:uncommitted_changes",
          branch: "feature/x",
          modifiedFiles: ["file1.ts", "file2.ts"],
          untrackedFiles: ["new-file.ts"],
          stagedFiles: [],
        };

        expect(event.modifiedFiles).toHaveLength(2);
        expect(event.untrackedFiles).toHaveLength(1);
        expect(event.stagedFiles).toHaveLength(0);
      });
    });

    describe("Commit Retry Events", () => {
      test("commit:retry event has attempt info", () => {
        const event: CommitRetryEvent = {
          type: "commit:retry",
          taskId: "task-1",
          attempt: 2,
          maxAttempts: 3,
        };

        expect(event.attempt).toBe(2);
        expect(event.maxAttempts).toBe(3);
      });
    });

    describe("Session Events", () => {
      test("session:corrupted event has reason", () => {
        const event: SessionCorruptedEvent = {
          type: "session:corrupted",
          taskId: "task-1",
          wasResuming: true,
          reason: "tool_use error detected",
        };

        expect(event.wasResuming).toBe(true);
        expect(event.reason).toContain("tool_use");
      });
    });

    describe("Generic Events", () => {
      test("error event has message and optional context", () => {
        const event: ErrorEvent = {
          type: "error",
          message: "Something went wrong",
          context: { file: "test.ts", line: 42 },
        };

        expect(event.message).toBe("Something went wrong");
        expect(event.context?.file).toBe("test.ts");
      });

      test("log event has level and message", () => {
        const event: LogEvent = {
          type: "log",
          level: "info",
          message: "Processing task",
          args: ["task-1"],
        };

        expect(event.level).toBe("info");
        expect(event.message).toBe("Processing task");
        expect(event.args).toEqual(["task-1"]);
      });

      test("log event supports all levels", () => {
        const levels: LogEvent["level"][] = ["debug", "info", "warn", "error"];

        for (const level of levels) {
          const event: LogEvent = { type: "log", level, message: "test" };
          expect(event.level).toBe(level);
        }
      });
    });
  });

  describe("EventHandler Contract", () => {
    test("event handler receives events with correct type discrimination", () => {
      const receivedEvents: OrchestratorEvent[] = [];
      const handler: EventHandler = (event) => {
        receivedEvents.push(event);
      };

      // Emit various events
      handler({ type: "agent:started", agentName: "test", provider: "claude", pollInterval: 5000 });
      handler({ type: "task:found", taskId: "t1", title: "Test", agentName: "test" });
      handler({ type: "task:completed", taskId: "t1", agentName: "test", duration: 10 });

      expect(receivedEvents).toHaveLength(3);
      expect(receivedEvents[0]?.type).toBe("agent:started");
      expect(receivedEvents[1]?.type).toBe("task:found");
      expect(receivedEvents[2]?.type).toBe("task:completed");
    });

    test("event handler can discriminate events by type", () => {
      let startedCount = 0;
      let completedCount = 0;

      const handler: EventHandler = (event) => {
        switch (event.type) {
          case "agent:started":
            startedCount++;
            break;
          case "task:completed":
            completedCount++;
            break;
        }
      };

      handler({ type: "agent:started", agentName: "test", provider: "claude", pollInterval: 5000 });
      handler({ type: "task:completed", taskId: "t1", agentName: "test", duration: 10 });
      handler({ type: "task:completed", taskId: "t2", agentName: "test", duration: 20 });

      expect(startedCount).toBe(1);
      expect(completedCount).toBe(2);
    });

    test("event handler can extract typed fields after discrimination", () => {
      let extractedPid: number | undefined;
      let extractedExitCode: number | null | undefined;

      const handler: EventHandler = (event) => {
        if (event.type === "agent:process_started") {
          extractedPid = event.pid;
        }
        if (event.type === "agent:process_ended") {
          extractedExitCode = event.exitCode;
        }
      };

      handler({ type: "agent:process_started", agentName: "test", pid: 12345, command: "claude" });
      handler({ type: "agent:process_ended", agentName: "test", pid: 12345, exitCode: 0 });

      expect(extractedPid).toBe(12345);
      expect(extractedExitCode).toBe(0);
    });
  });

  describe("Event Ordering Expectations", () => {
    test("task lifecycle follows expected order", () => {
      const events: string[] = [];
      const handler: EventHandler = (event) => events.push(event.type);

      // Simulate a successful task execution
      handler({ type: "agent:started", agentName: "test", provider: "claude", pollInterval: 5000 });
      handler({ type: "task:found", taskId: "t1", title: "Test", agentName: "test" });
      handler({
        type: "task:started",
        taskId: "t1",
        agentName: "test",
        workingDir: "/tmp",
        provider: "claude",
        resuming: false,
      });
      handler({ type: "agent:process_started", agentName: "test", pid: 123, command: "claude" });
      handler({ type: "agent:output", agentName: "test", data: "Working...\n" });
      handler({ type: "agent:process_ended", agentName: "test", pid: 123, exitCode: 0 });
      handler({ type: "task:completed", taskId: "t1", agentName: "test", duration: 60 });

      expect(events.indexOf("agent:started")).toBeLessThan(events.indexOf("task:found"));
      expect(events.indexOf("task:found")).toBeLessThan(events.indexOf("task:started"));
      expect(events.indexOf("task:started")).toBeLessThan(events.indexOf("agent:process_started"));
      expect(events.indexOf("agent:process_started")).toBeLessThan(events.indexOf("agent:output"));
      expect(events.indexOf("agent:output")).toBeLessThan(events.indexOf("agent:process_ended"));
      expect(events.indexOf("agent:process_ended")).toBeLessThan(events.indexOf("task:completed"));
    });

    test("git operations follow expected order", () => {
      const events: string[] = [];
      const handler: EventHandler = (event) => events.push(event.type);

      // Simulate git workflow
      handler({ type: "git:pulling", repo: "my-repo" });
      handler({ type: "git:pulled", repo: "my-repo", updated: true });
      handler({ type: "worktree:creating", repo: "my-repo", branch: "feature/x" });
      handler({ type: "worktree:created", repo: "my-repo", branch: "feature/x", success: true });

      expect(events.indexOf("git:pulling")).toBeLessThan(events.indexOf("git:pulled"));
      expect(events.indexOf("worktree:creating")).toBeLessThan(events.indexOf("worktree:created"));
    });

    test("merge workflow follows expected order", () => {
      const events: string[] = [];
      const handler: EventHandler = (event) => events.push(event.type);

      // Simulate merge workflow
      handler({ type: "merge:lock_acquired", targetBranch: "main" });
      handler({ type: "git:merging", sourceBranch: "feature/x", targetBranch: "main" });
      handler({ type: "git:merged", sourceBranch: "feature/x", targetBranch: "main" });
      handler({ type: "git:pushing", branch: "main", remote: "origin" });
      handler({ type: "git:pushed", branch: "main", remote: "origin", success: true });

      expect(events.indexOf("merge:lock_acquired")).toBeLessThan(events.indexOf("git:merging"));
      expect(events.indexOf("git:merging")).toBeLessThan(events.indexOf("git:merged"));
      expect(events.indexOf("git:merged")).toBeLessThan(events.indexOf("git:pushing"));
    });

    test("step workflow follows expected order", () => {
      const events: string[] = [];
      const handler: EventHandler = (event) => events.push(event.type);

      // Simulate a task with 3 steps
      handler({
        type: "task:started",
        taskId: "t1",
        agentName: "test",
        workingDir: "/tmp",
        provider: "claude",
        resuming: false,
      });

      // Step 1
      handler({
        type: "step:started",
        taskId: "t1",
        stepId: "s1",
        stepIndex: 0,
        totalSteps: 3,
        agentName: "test",
        resuming: false,
      });
      handler({ type: "agent:output", agentName: "test", data: "Working on step 1...\n" });
      handler({
        type: "step:completed",
        taskId: "t1",
        stepId: "s1",
        stepIndex: 0,
        totalSteps: 3,
        duration: 60,
        hasMoreSteps: true,
      });

      // Step 2
      handler({
        type: "step:started",
        taskId: "t1",
        stepId: "s2",
        stepIndex: 1,
        totalSteps: 3,
        agentName: "test",
        resuming: true,
      });
      handler({ type: "agent:output", agentName: "test", data: "Working on step 2...\n" });
      handler({
        type: "step:completed",
        taskId: "t1",
        stepId: "s2",
        stepIndex: 1,
        totalSteps: 3,
        duration: 45,
        hasMoreSteps: true,
      });

      // Step 3
      handler({
        type: "step:started",
        taskId: "t1",
        stepId: "s3",
        stepIndex: 2,
        totalSteps: 3,
        agentName: "test",
        resuming: true,
      });
      handler({ type: "agent:output", agentName: "test", data: "Working on step 3...\n" });
      handler({
        type: "step:completed",
        taskId: "t1",
        stepId: "s3",
        stepIndex: 2,
        totalSteps: 3,
        duration: 30,
        hasMoreSteps: false,
      });

      // All steps done
      handler({ type: "steps:all_completed", taskId: "t1", totalSteps: 3, totalDuration: 135 });
      handler({ type: "task:completed", taskId: "t1", agentName: "test", duration: 140 });

      // Verify ordering
      expect(events.indexOf("task:started")).toBeLessThan(events.indexOf("step:started"));
      expect(events.filter((e) => e === "step:started")).toHaveLength(3);
      expect(events.filter((e) => e === "step:completed")).toHaveLength(3);
      expect(events.indexOf("steps:all_completed")).toBeLessThan(events.indexOf("task:completed"));
    });
  });
});
