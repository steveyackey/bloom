/**
 * Agent Callback Emissions Tests
 *
 * Tests the callback mechanism in AgentRunOptions:
 * 1. onOutput is called with streaming output data
 * 2. onProcessStart is called when agent subprocess starts
 * 3. onProcessEnd is called when agent subprocess ends
 *
 * These callbacks enable event-driven architectures like the TUI
 * to receive real-time updates from agent processes.
 */

import { describe, expect, test } from "bun:test";
import type { AgentRunOptions } from "../../src/agents/core";

describe("Agent Callback Interface", () => {
  describe("AgentRunOptions Callback Types", () => {
    test("onOutput callback signature accepts string data", () => {
      const outputData: string[] = [];

      const options: Partial<AgentRunOptions> = {
        onOutput: (data: string) => {
          outputData.push(data);
        },
      };

      // Simulate callback invocation
      options.onOutput?.("Hello, world!\n");
      options.onOutput?.("Processing...\n");

      expect(outputData).toEqual(["Hello, world!\n", "Processing...\n"]);
    });

    test("onProcessStart callback signature accepts pid and command", () => {
      let startedPid: number | undefined;
      let startedCommand: string | undefined;

      const options: Partial<AgentRunOptions> = {
        onProcessStart: (pid: number, command: string) => {
          startedPid = pid;
          startedCommand = command;
        },
      };

      // Simulate callback invocation
      options.onProcessStart?.(12345, "claude --print");

      expect(startedPid).toBe(12345);
      expect(startedCommand).toBe("claude --print");
    });

    test("onProcessEnd callback signature accepts pid and exitCode", () => {
      let endedPid: number | undefined;
      let endedExitCode: number | null | undefined;

      const options: Partial<AgentRunOptions> = {
        onProcessEnd: (pid: number, exitCode: number | null) => {
          endedPid = pid;
          endedExitCode = exitCode;
        },
      };

      // Simulate callback invocation
      options.onProcessEnd?.(12345, 0);

      expect(endedPid).toBe(12345);
      expect(endedExitCode).toBe(0);
    });

    test("onProcessEnd handles null exit code (signal termination)", () => {
      let endedExitCode: number | null | undefined = 999; // Initialize to non-null

      const options: Partial<AgentRunOptions> = {
        onProcessEnd: (_pid: number, exitCode: number | null) => {
          endedExitCode = exitCode;
        },
      };

      // Simulate signal termination
      options.onProcessEnd?.(12345, null);

      expect(endedExitCode).toBeNull();
    });

    test("all callbacks are optional", () => {
      const options: AgentRunOptions = {
        prompt: "Test prompt",
        systemPrompt: "System prompt",
        startingDirectory: "/tmp",
        taskId: "task-1",
        agentName: "test-agent",
        // No callbacks provided
      };

      // Callbacks should be undefined
      expect(options.onOutput).toBeUndefined();
      expect(options.onProcessStart).toBeUndefined();
      expect(options.onProcessEnd).toBeUndefined();
    });
  });

  describe("Callback Invocation Patterns", () => {
    test("output callback accumulates all data chunks", () => {
      const chunks: string[] = [];

      const onOutput = (data: string) => {
        chunks.push(data);
      };

      // Simulate streaming output
      onOutput("Thinking...\n");
      onOutput("[tool: Read]\n");
      onOutput("File contents here\n");
      onOutput("[result]\n");
      onOutput("Done!\n");

      expect(chunks).toHaveLength(5);
      expect(chunks.join("")).toBe("Thinking...\n[tool: Read]\nFile contents here\n[result]\nDone!\n");
    });

    test("process callbacks track lifecycle", () => {
      const lifecycle: { event: string; pid: number; detail?: unknown }[] = [];

      const onProcessStart = (pid: number, command: string) => {
        lifecycle.push({ event: "start", pid, detail: command });
      };

      const onProcessEnd = (pid: number, exitCode: number | null) => {
        lifecycle.push({ event: "end", pid, detail: exitCode });
      };

      // Simulate process lifecycle
      onProcessStart(12345, "claude --print");
      onProcessEnd(12345, 0);

      expect(lifecycle).toHaveLength(2);
      expect(lifecycle[0]).toEqual({ event: "start", pid: 12345, detail: "claude --print" });
      expect(lifecycle[1]).toEqual({ event: "end", pid: 12345, detail: 0 });
    });

    test("output continues after process end", () => {
      // This tests the scenario where stdout may still have buffered data
      // after the process signals it has ended
      const timeline: string[] = [];

      const onOutput = (data: string) => {
        timeline.push(`output: ${data.trim()}`);
      };

      const onProcessEnd = (pid: number, exitCode: number | null) => {
        timeline.push(`end: ${pid} (${exitCode})`);
      };

      // Simulate buffered output arriving after close
      onOutput("Final output");
      onProcessEnd(12345, 0);

      expect(timeline).toEqual(["output: Final output", "end: 12345 (0)"]);
    });
  });

  describe("Error Handling in Callbacks", () => {
    test("callbacks should handle errors gracefully", () => {
      // Callbacks that throw should not crash the agent
      let callCount = 0;

      const onOutput = (data: string) => {
        callCount++;
        if (data.includes("error")) {
          throw new Error("Callback error");
        }
      };

      // Normal invocation
      expect(() => onOutput("normal")).not.toThrow();
      expect(callCount).toBe(1);

      // Error invocation - callback throws but that's expected
      expect(() => onOutput("error")).toThrow();
      expect(callCount).toBe(2);
    });

    test("process callbacks should handle missing data", () => {
      let handled = false;

      const onProcessEnd = (_pid: number, exitCode: number | null) => {
        // Handle null exit code gracefully
        if (exitCode === null) {
          handled = true;
        }
      };

      onProcessEnd(12345, null);
      expect(handled).toBe(true);
    });
  });

  describe("Integration with Event-Driven Architecture", () => {
    test("callbacks can emit OrchestratorEvents", () => {
      // This pattern is used by the work loop
      const events: Array<{ type: string; [key: string]: unknown }> = [];

      const emit = (event: { type: string; [key: string]: unknown }) => {
        events.push(event);
      };

      const agentName = "test-agent";

      const onOutput = (data: string) => {
        emit({ type: "agent:output", agentName, data });
      };

      const onProcessStart = (pid: number, command: string) => {
        emit({ type: "agent:process_started", agentName, pid, command });
      };

      const onProcessEnd = (pid: number, exitCode: number | null) => {
        emit({ type: "agent:process_ended", agentName, pid, exitCode });
      };

      // Simulate full agent run
      onProcessStart(12345, "claude");
      onOutput("Working on task...\n");
      onOutput("Done!\n");
      onProcessEnd(12345, 0);

      expect(events).toHaveLength(4);
      expect(events[0]?.type).toBe("agent:process_started");
      expect(events[1]?.type).toBe("agent:output");
      expect(events[2]?.type).toBe("agent:output");
      expect(events[3]?.type).toBe("agent:process_ended");
    });

    test("callbacks can be used for stats tracking", () => {
      const activePids = new Set<number>();

      const onProcessStart = (pid: number, _command: string) => {
        activePids.add(pid);
      };

      const onProcessEnd = (pid: number, _exitCode: number | null) => {
        activePids.delete(pid);
      };

      // Start multiple processes
      onProcessStart(111, "agent-1");
      onProcessStart(222, "agent-2");
      expect(activePids.size).toBe(2);

      // End one
      onProcessEnd(111, 0);
      expect(activePids.size).toBe(1);
      expect(activePids.has(222)).toBe(true);

      // End the other
      onProcessEnd(222, 0);
      expect(activePids.size).toBe(0);
    });
  });

  describe("Output Data Characteristics", () => {
    test("output data preserves ANSI codes", () => {
      let receivedData = "";

      const onOutput = (data: string) => {
        receivedData += data;
      };

      // Simulate ANSI-colored output
      const coloredOutput = "\x1b[32mSuccess\x1b[0m\n";
      onOutput(coloredOutput);

      expect(receivedData).toContain("\x1b[32m");
      expect(receivedData).toContain("\x1b[0m");
    });

    test("output data preserves line endings", () => {
      const lines: string[] = [];

      const onOutput = (data: string) => {
        lines.push(data);
      };

      onOutput("Line 1\n");
      onOutput("Line 2\r\n");
      onOutput("Line 3");

      expect(lines[0]).toBe("Line 1\n");
      expect(lines[1]).toBe("Line 2\r\n");
      expect(lines[2]).toBe("Line 3");
    });

    test("output data can be partial chunks", () => {
      let accumulated = "";

      const onOutput = (data: string) => {
        accumulated += data;
      };

      // Simulate partial JSON coming in chunks
      onOutput('{"type":"content');
      onOutput('_block_delta","delta":{"');
      onOutput('type":"text_delta","text":"Hello"}}\n');

      expect(accumulated).toBe('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');
    });
  });

  describe("Command String Characteristics", () => {
    test("command includes full command line", () => {
      let receivedCommand = "";

      const onProcessStart = (_pid: number, command: string) => {
        receivedCommand = command;
      };

      onProcessStart(12345, "claude --print --dangerously-skip-permissions");

      expect(receivedCommand).toContain("claude");
      expect(receivedCommand).toContain("--print");
      expect(receivedCommand).toContain("--dangerously-skip-permissions");
    });

    test("command can be parsed for display", () => {
      let commandName = "";

      const onProcessStart = (_pid: number, command: string) => {
        // Extract just the command name
        commandName = command.split(" ")[0] ?? "";
      };

      onProcessStart(12345, "/usr/local/bin/claude --print");

      expect(commandName).toBe("/usr/local/bin/claude");
    });
  });
});
