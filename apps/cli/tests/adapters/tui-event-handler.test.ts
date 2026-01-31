/**
 * TUI Event Handler Tests
 *
 * Tests the EventDrivenTUI's event handling behavior:
 * 1. Pane management (add, get, create on demand)
 * 2. Event-to-pane state mapping
 * 3. Output accumulation and line limits
 * 4. Status transitions
 * 5. Stats tracking via process events
 */

import { beforeEach, describe, expect, test } from "bun:test";
import type { AgentPane, ViewMode } from "../../src/adapters/tui/types";
import type { EventHandler, OrchestratorEvent } from "../../src/core/orchestrator";

/**
 * Minimal test implementation of TUI state management.
 * We test the event handling logic in isolation from terminal rendering.
 */
class TestTUI {
  private panes: Map<string, AgentPane> = new Map();
  private paneOrder: string[] = [];
  private viewMode: ViewMode = "tiled";
  private selectedIndex = 0;
  private maxOutputLines = 2000;

  addPane(agentName: string): void {
    if (this.panes.has(agentName)) return;

    const pane: AgentPane = {
      id: agentName,
      name: agentName,
      paneType: "agent",
      status: "idle",
      outputLines: [],
      scrollOffset: 0,
    };

    this.panes.set(agentName, pane);
    this.paneOrder.push(agentName);
  }

  getPane(agentName: string): AgentPane | undefined {
    return this.panes.get(agentName);
  }

  getPaneOrder(): string[] {
    return [...this.paneOrder];
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  setSelectedIndex(index: number): void {
    this.selectedIndex = index;
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
  }

  private getOrCreatePane(agentName: string): AgentPane {
    let pane = this.panes.get(agentName);
    if (!pane) {
      this.addPane(agentName);
      pane = this.panes.get(agentName)!;
    }
    return pane;
  }

  private appendOutput(pane: AgentPane, text: string): void {
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (line.length > 0) {
        pane.outputLines.push(line);
      }
    }

    // Enforce line limit
    if (pane.outputLines.length > this.maxOutputLines) {
      pane.outputLines = pane.outputLines.slice(-this.maxOutputLines);
    }

    // Reset scroll to bottom
    pane.scrollOffset = 0;
  }

  private broadcastMessage(text: string): void {
    // Add to first running pane, or first pane
    for (const pane of this.panes.values()) {
      if (pane.status === "running") {
        this.appendOutput(pane, text);
        return;
      }
    }
    const firstPane = this.panes.values().next().value;
    if (firstPane) {
      this.appendOutput(firstPane, text);
    }
  }

  getEventHandler(): EventHandler {
    return (event: OrchestratorEvent) => this.handleEvent(event);
  }

  private handleEvent(event: OrchestratorEvent): void {
    switch (event.type) {
      case "agent:started": {
        const pane = this.getOrCreatePane(event.agentName);
        this.appendOutput(pane, `Agent started (${event.provider})`);
        break;
      }

      case "agent:idle": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          pane.status = "idle";
        }
        break;
      }

      case "agent:output": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          this.appendOutput(pane, event.data);
        }
        break;
      }

      case "agent:process_started": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          pane.currentPid = event.pid;
          this.appendOutput(pane, `[Process started: PID ${event.pid}]`);
        }
        break;
      }

      case "agent:process_ended": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          pane.currentPid = undefined;
          pane.stats = undefined;
          this.appendOutput(pane, `[Process ended: exit ${event.exitCode}]`);
        }
        break;
      }

      case "task:found": {
        const pane = this.getOrCreatePane(event.agentName);
        pane.status = "running";
        pane.currentTaskId = event.taskId;
        pane.currentTaskTitle = event.title;
        this.appendOutput(pane, `Task: ${event.taskId}`);
        this.appendOutput(pane, event.title);
        if (event.repo) {
          this.appendOutput(pane, `Repo: ${event.repo}`);
        }
        break;
      }

      case "task:started": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          pane.taskStartTime = Date.now();
          this.appendOutput(pane, `Working in: ${event.workingDir}`);
          if (event.resuming) {
            this.appendOutput(pane, "Resuming session...");
          }
        }
        break;
      }

      case "task:completed": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          pane.status = "completed";
          this.appendOutput(pane, `Task completed in ${event.duration}s`);
        }
        break;
      }

      case "task:failed": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          pane.status = "failed";
          this.appendOutput(pane, `Task failed after ${event.duration}s`);
          this.appendOutput(pane, event.error);
        }
        break;
      }

      case "task:blocked": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          pane.status = "blocked";
          this.appendOutput(pane, `Task blocked: ${event.reason}`);
        }
        break;
      }

      case "git:pushing":
        this.broadcastMessage(`Pushing ${event.branch}...`);
        break;

      case "git:pushed":
        if (event.success) {
          this.broadcastMessage(`Pushed ${event.branch}`);
        } else {
          this.broadcastMessage(`Push failed: ${event.error}`);
        }
        break;

      case "git:merging":
        this.broadcastMessage(`Merging ${event.sourceBranch} → ${event.targetBranch}`);
        break;

      case "git:merged":
        this.broadcastMessage(`Merged ${event.sourceBranch}`);
        break;

      case "git:pr_created":
        if (event.url) {
          this.broadcastMessage(`PR created: ${event.url}`);
        } else if (event.alreadyExists) {
          this.broadcastMessage("PR already exists");
        }
        break;

      case "error":
        this.broadcastMessage(`Error: ${event.message}`);
        break;

      case "log":
        if (event.level === "warn" || event.level === "error") {
          this.broadcastMessage(event.message);
        }
        break;
    }
  }
}

describe("TUI Event Handler", () => {
  let tui: TestTUI;
  let handler: EventHandler;

  beforeEach(() => {
    tui = new TestTUI();
    handler = tui.getEventHandler();
  });

  describe("Pane Management", () => {
    test("addPane creates pane with default state", () => {
      tui.addPane("agent-1");

      const pane = tui.getPane("agent-1");
      expect(pane).toBeDefined();
      expect(pane?.id).toBe("agent-1");
      expect(pane?.name).toBe("agent-1");
      expect(pane?.status).toBe("idle");
      expect(pane?.outputLines).toEqual([]);
      expect(pane?.scrollOffset).toBe(0);
    });

    test("addPane is idempotent", () => {
      tui.addPane("agent-1");
      tui.addPane("agent-1");

      expect(tui.getPaneOrder()).toEqual(["agent-1"]);
    });

    test("multiple panes maintain order", () => {
      tui.addPane("agent-1");
      tui.addPane("agent-2");
      tui.addPane("agent-3");

      expect(tui.getPaneOrder()).toEqual(["agent-1", "agent-2", "agent-3"]);
    });

    test("agent:started creates pane if not exists", () => {
      handler({
        type: "agent:started",
        agentName: "new-agent",
        provider: "claude",
        pollInterval: 5000,
      });

      const pane = tui.getPane("new-agent");
      expect(pane).toBeDefined();
      expect(pane?.outputLines.length).toBeGreaterThan(0);
    });

    test("task:found creates pane if not exists", () => {
      handler({
        type: "task:found",
        agentName: "new-agent",
        taskId: "task-1",
        title: "Test Task",
      });

      const pane = tui.getPane("new-agent");
      expect(pane).toBeDefined();
      expect(pane?.currentTaskId).toBe("task-1");
    });
  });

  describe("Agent Lifecycle Events", () => {
    beforeEach(() => {
      tui.addPane("agent-1");
    });

    test("agent:started adds provider info to output", () => {
      handler({
        type: "agent:started",
        agentName: "agent-1",
        provider: "claude",
        pollInterval: 5000,
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("claude"))).toBe(true);
    });

    test("agent:idle sets status to idle", () => {
      // First make it running
      handler({
        type: "task:found",
        agentName: "agent-1",
        taskId: "task-1",
        title: "Test",
      });

      expect(tui.getPane("agent-1")?.status).toBe("running");

      // Then make it idle
      handler({ type: "agent:idle", agentName: "agent-1" });

      expect(tui.getPane("agent-1")?.status).toBe("idle");
    });

    test("agent:output appends data to pane", () => {
      handler({
        type: "agent:output",
        agentName: "agent-1",
        data: "Processing task...\n",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines).toContain("Processing task...");
    });

    test("agent:output handles multiline data", () => {
      handler({
        type: "agent:output",
        agentName: "agent-1",
        data: "Line 1\nLine 2\nLine 3",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines).toContain("Line 1");
      expect(pane.outputLines).toContain("Line 2");
      expect(pane.outputLines).toContain("Line 3");
    });

    test("agent:process_started stores PID", () => {
      handler({
        type: "agent:process_started",
        agentName: "agent-1",
        pid: 12345,
        command: "claude --print",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.currentPid).toBe(12345);
      expect(pane.outputLines.some((line) => line.includes("12345"))).toBe(true);
    });

    test("agent:process_ended clears PID and stats", () => {
      // Set up a running process with stats
      const pane = tui.getPane("agent-1")!;
      pane.currentPid = 12345;
      pane.stats = { cpu: 50, memory: 100 };

      handler({
        type: "agent:process_ended",
        agentName: "agent-1",
        pid: 12345,
        exitCode: 0,
      });

      expect(pane.currentPid).toBeUndefined();
      expect(pane.stats).toBeUndefined();
      expect(pane.outputLines.some((line) => line.includes("exit 0"))).toBe(true);
    });

    test("agent:process_ended shows null exit code for signals", () => {
      handler({
        type: "agent:process_ended",
        agentName: "agent-1",
        pid: 12345,
        exitCode: null,
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("exit null"))).toBe(true);
    });
  });

  describe("Task Lifecycle Events", () => {
    beforeEach(() => {
      tui.addPane("agent-1");
    });

    test("task:found sets running status and task info", () => {
      handler({
        type: "task:found",
        agentName: "agent-1",
        taskId: "task-123",
        title: "Implement feature X",
        repo: "my-repo",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.status).toBe("running");
      expect(pane.currentTaskId).toBe("task-123");
      expect(pane.currentTaskTitle).toBe("Implement feature X");
      expect(pane.outputLines.some((line) => line.includes("task-123"))).toBe(true);
      expect(pane.outputLines.some((line) => line.includes("Implement feature X"))).toBe(true);
      expect(pane.outputLines.some((line) => line.includes("my-repo"))).toBe(true);
    });

    test("task:found without repo doesn't add repo line", () => {
      handler({
        type: "task:found",
        agentName: "agent-1",
        taskId: "task-123",
        title: "Implement feature X",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("Repo:"))).toBe(false);
    });

    test("task:started records start time and working dir", () => {
      handler({
        type: "task:started",
        agentName: "agent-1",
        taskId: "task-123",
        workingDir: "/path/to/worktree",
        provider: "claude",
        resuming: false,
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.taskStartTime).toBeDefined();
      expect(pane.outputLines.some((line) => line.includes("/path/to/worktree"))).toBe(true);
    });

    test("task:started shows resuming indicator", () => {
      handler({
        type: "task:started",
        agentName: "agent-1",
        taskId: "task-123",
        workingDir: "/path/to/worktree",
        provider: "claude",
        resuming: true,
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("Resuming"))).toBe(true);
    });

    test("task:completed sets completed status and shows duration", () => {
      handler({
        type: "task:completed",
        agentName: "agent-1",
        taskId: "task-123",
        duration: 120,
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.status).toBe("completed");
      expect(pane.outputLines.some((line) => line.includes("120s"))).toBe(true);
    });

    test("task:failed sets failed status and shows error", () => {
      handler({
        type: "task:failed",
        agentName: "agent-1",
        taskId: "task-123",
        duration: 45,
        error: "Connection timeout",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.status).toBe("failed");
      expect(pane.outputLines.some((line) => line.includes("45s"))).toBe(true);
      expect(pane.outputLines.some((line) => line.includes("Connection timeout"))).toBe(true);
    });

    test("task:blocked sets blocked status and shows reason", () => {
      handler({
        type: "task:blocked",
        agentName: "agent-1",
        taskId: "task-123",
        reason: "Max commit retries reached",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.status).toBe("blocked");
      expect(pane.outputLines.some((line) => line.includes("Max commit retries"))).toBe(true);
    });
  });

  describe("Git Operation Events", () => {
    beforeEach(() => {
      tui.addPane("agent-1");
      // Set agent to running so it receives broadcasts
      handler({
        type: "task:found",
        agentName: "agent-1",
        taskId: "task-1",
        title: "Test",
      });
    });

    test("git:pushing broadcasts message to running pane", () => {
      handler({
        type: "git:pushing",
        branch: "feature/x",
        remote: "origin",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("Pushing") && line.includes("feature/x"))).toBe(true);
    });

    test("git:pushed shows success message", () => {
      handler({
        type: "git:pushed",
        branch: "feature/x",
        remote: "origin",
        success: true,
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("Pushed") && line.includes("feature/x"))).toBe(true);
    });

    test("git:pushed shows failure message", () => {
      handler({
        type: "git:pushed",
        branch: "feature/x",
        remote: "origin",
        success: false,
        error: "Permission denied",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("Push failed") && line.includes("Permission denied"))).toBe(
        true
      );
    });

    test("git:merging shows merge info", () => {
      handler({
        type: "git:merging",
        sourceBranch: "feature/x",
        targetBranch: "main",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("feature/x") && line.includes("main"))).toBe(true);
    });

    test("git:merged confirms successful merge", () => {
      handler({
        type: "git:merged",
        sourceBranch: "feature/x",
        targetBranch: "main",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("Merged") && line.includes("feature/x"))).toBe(true);
    });

    test("git:pr_created shows PR URL", () => {
      handler({
        type: "git:pr_created",
        url: "https://github.com/org/repo/pull/123",
        sourceBranch: "feature/x",
        targetBranch: "main",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("PR created") && line.includes("pull/123"))).toBe(true);
    });

    test("git:pr_created handles already existing PR", () => {
      handler({
        type: "git:pr_created",
        sourceBranch: "feature/x",
        targetBranch: "main",
        alreadyExists: true,
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("already exists"))).toBe(true);
    });
  });

  describe("Generic Events", () => {
    beforeEach(() => {
      tui.addPane("agent-1");
      handler({
        type: "task:found",
        agentName: "agent-1",
        taskId: "task-1",
        title: "Test",
      });
    });

    test("error event broadcasts error message", () => {
      handler({
        type: "error",
        message: "Something went wrong",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("Error:") && line.includes("Something went wrong"))).toBe(
        true
      );
    });

    test("log warn event is shown", () => {
      handler({
        type: "log",
        level: "warn",
        message: "Warning message",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("Warning message"))).toBe(true);
    });

    test("log error event is shown", () => {
      handler({
        type: "log",
        level: "error",
        message: "Error message",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines.some((line) => line.includes("Error message"))).toBe(true);
    });

    test("log info event is not shown in TUI", () => {
      const pane = tui.getPane("agent-1")!;
      const lineCountBefore = pane.outputLines.length;

      handler({
        type: "log",
        level: "info",
        message: "Info message",
      });

      // Should not add new lines
      expect(pane.outputLines.length).toBe(lineCountBefore);
    });

    test("log debug event is not shown in TUI", () => {
      const pane = tui.getPane("agent-1")!;
      const lineCountBefore = pane.outputLines.length;

      handler({
        type: "log",
        level: "debug",
        message: "Debug message",
      });

      // Should not add new lines
      expect(pane.outputLines.length).toBe(lineCountBefore);
    });
  });

  describe("Output Line Management", () => {
    beforeEach(() => {
      tui.addPane("agent-1");
    });

    test("output resets scroll offset to bottom", () => {
      const pane = tui.getPane("agent-1")!;
      pane.scrollOffset = 100; // User scrolled up

      handler({
        type: "agent:output",
        agentName: "agent-1",
        data: "New output",
      });

      expect(pane.scrollOffset).toBe(0);
    });

    test("empty lines are filtered from output", () => {
      handler({
        type: "agent:output",
        agentName: "agent-1",
        data: "Line 1\n\n\nLine 2",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.outputLines).toEqual(["Line 1", "Line 2"]);
    });

    test("ignores output for unknown agents", () => {
      handler({
        type: "agent:output",
        agentName: "unknown-agent",
        data: "Should be ignored",
      });

      expect(tui.getPane("unknown-agent")).toBeUndefined();
    });
  });

  describe("Broadcast Behavior", () => {
    test("broadcast goes to running pane first", () => {
      tui.addPane("agent-1");
      tui.addPane("agent-2");

      // Make agent-2 running
      handler({
        type: "task:found",
        agentName: "agent-2",
        taskId: "task-1",
        title: "Test",
      });

      // Broadcast a message
      handler({
        type: "error",
        message: "Broadcast test",
      });

      // Should go to running pane (agent-2)
      expect(tui.getPane("agent-2")?.outputLines.some((line) => line.includes("Broadcast test"))).toBe(true);
      expect(tui.getPane("agent-1")?.outputLines.some((line) => line.includes("Broadcast test"))).toBe(false);
    });

    test("broadcast goes to first pane when none running", () => {
      tui.addPane("agent-1");
      tui.addPane("agent-2");

      handler({
        type: "error",
        message: "Broadcast test",
      });

      // Should go to first pane (agent-1)
      expect(tui.getPane("agent-1")?.outputLines.some((line) => line.includes("Broadcast test"))).toBe(true);
    });
  });

  describe("View Mode", () => {
    test("default view mode is tiled", () => {
      expect(tui.getViewMode()).toBe("tiled");
    });

    test("view mode can be toggled", () => {
      tui.setViewMode("single");
      expect(tui.getViewMode()).toBe("single");

      tui.setViewMode("tiled");
      expect(tui.getViewMode()).toBe("tiled");
    });
  });

  describe("Pane Selection", () => {
    beforeEach(() => {
      tui.addPane("agent-1");
      tui.addPane("agent-2");
      tui.addPane("agent-3");
    });

    test("default selection is first pane", () => {
      expect(tui.getSelectedIndex()).toBe(0);
    });

    test("selection can be changed", () => {
      tui.setSelectedIndex(1);
      expect(tui.getSelectedIndex()).toBe(1);
    });
  });

  describe("Status Transitions", () => {
    beforeEach(() => {
      tui.addPane("agent-1");
    });

    test("idle -> running -> completed flow", () => {
      const pane = tui.getPane("agent-1")!;
      expect(pane.status).toBe("idle");

      handler({
        type: "task:found",
        agentName: "agent-1",
        taskId: "task-1",
        title: "Test",
      });
      expect(pane.status).toBe("running");

      handler({
        type: "task:completed",
        agentName: "agent-1",
        taskId: "task-1",
        duration: 60,
      });
      expect(pane.status).toBe("completed");
    });

    test("idle -> running -> failed flow", () => {
      const pane = tui.getPane("agent-1")!;

      handler({
        type: "task:found",
        agentName: "agent-1",
        taskId: "task-1",
        title: "Test",
      });
      expect(pane.status).toBe("running");

      handler({
        type: "task:failed",
        agentName: "agent-1",
        taskId: "task-1",
        duration: 30,
        error: "Failed",
      });
      expect(pane.status).toBe("failed");
    });

    test("idle -> running -> blocked flow", () => {
      const pane = tui.getPane("agent-1")!;

      handler({
        type: "task:found",
        agentName: "agent-1",
        taskId: "task-1",
        title: "Test",
      });
      expect(pane.status).toBe("running");

      handler({
        type: "task:blocked",
        agentName: "agent-1",
        taskId: "task-1",
        reason: "Blocked",
      });
      expect(pane.status).toBe("blocked");
    });

    test("running -> idle flow (on agent:idle)", () => {
      const pane = tui.getPane("agent-1")!;

      handler({
        type: "task:found",
        agentName: "agent-1",
        taskId: "task-1",
        title: "Test",
      });
      expect(pane.status).toBe("running");

      handler({ type: "agent:idle", agentName: "agent-1" });
      expect(pane.status).toBe("idle");
    });
  });

  describe("Process Stats Tracking", () => {
    beforeEach(() => {
      tui.addPane("agent-1");
    });

    test("process_started stores PID for stats queries", () => {
      handler({
        type: "agent:process_started",
        agentName: "agent-1",
        pid: 12345,
        command: "claude",
      });

      const pane = tui.getPane("agent-1")!;
      expect(pane.currentPid).toBe(12345);
    });

    test("process_ended clears PID and stats", () => {
      const pane = tui.getPane("agent-1")!;
      pane.currentPid = 12345;
      pane.stats = { cpu: 50, memory: 256 };

      handler({
        type: "agent:process_ended",
        agentName: "agent-1",
        pid: 12345,
        exitCode: 0,
      });

      expect(pane.currentPid).toBeUndefined();
      expect(pane.stats).toBeUndefined();
    });

    test("stats can be set externally for display", () => {
      const pane = tui.getPane("agent-1")!;
      pane.stats = { cpu: 75.5, memory: 512 };

      expect(pane.stats.cpu).toBe(75.5);
      expect(pane.stats.memory).toBe(512);
    });
  });
});
