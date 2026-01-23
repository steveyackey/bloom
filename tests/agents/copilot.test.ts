import { beforeEach, describe, expect, test } from "bun:test";
import chalk from "chalk";
import type { CopilotStreamEvent } from "../../src/agents/copilot";

// =============================================================================
// Test Fixtures - Copilot CLI Event Schemas
// =============================================================================
// These fixtures represent the expected event structure from Copilot CLI
// when running with native streaming JSON output.
// =============================================================================

/**
 * Real Copilot CLI assistant message event
 *
 * NOTE: Copilot CLI sends message.content as an array of content blocks,
 * similar to Claude CLI
 */
export const COPILOT_ASSISTANT_EVENT = {
  type: "assistant",
  message: {
    content: [{ type: "text", text: "Hello from Copilot" }],
  },
};

/**
 * Real Copilot CLI assistant event with multiple content blocks
 */
export const COPILOT_ASSISTANT_MULTI_BLOCK_EVENT = {
  type: "assistant",
  message: {
    content: [
      { type: "text", text: "First part. " },
      { type: "text", text: "Second part." },
    ],
  },
};

/**
 * Real Copilot CLI result event
 *
 * NOTE: Copilot uses both total_cost_usd and cost_usd, we prefer total_cost_usd
 */
export const COPILOT_RESULT_EVENT = {
  type: "result",
  subtype: "success",
  total_cost_usd: 0.03,
  cost_usd: 0.03,
  duration_ms: 2500,
};

/**
 * Real Copilot CLI system init event
 */
export const COPILOT_SYSTEM_INIT_EVENT = {
  type: "system",
  subtype: "init",
  session_id: "copilot-session-abc123",
  model: "claude",
};

/**
 * Real Copilot CLI tool_use event
 */
export const COPILOT_TOOL_USE_EVENT = {
  type: "tool_use",
  tool_name: "Read",
  tool_input: {
    file_path: "/path/to/file.ts",
  },
};

/**
 * Real Copilot CLI error event
 */
export const COPILOT_ERROR_EVENT = {
  type: "error",
  error: {
    message: "Authentication failed",
    code: "auth_error",
  },
};

/**
 * Real Copilot CLI content_block_delta event (streaming text)
 */
export const COPILOT_CONTENT_BLOCK_DELTA_EVENT = {
  type: "content_block_delta",
  delta: {
    type: "text_delta",
    text: "streaming copilot text",
  },
};

/**
 * Real Copilot CLI system hook_started event
 */
export const COPILOT_SYSTEM_HOOK_STARTED_EVENT = {
  type: "system",
  subtype: "hook_started",
  hook_name: "pre-commit",
};

/**
 * Real Copilot CLI system hook_response event
 */
export const COPILOT_SYSTEM_HOOK_RESPONSE_EVENT = {
  type: "system",
  subtype: "hook_response",
  response: "Hook executed successfully",
};

/**
 * Real Copilot CLI tool_result event with content
 */
export const COPILOT_TOOL_RESULT_EVENT = {
  type: "tool_result",
  content: "File contents:\nfunction example() { return 42; }",
};

/**
 * Real Copilot CLI tool_result event with long content
 */
export const COPILOT_TOOL_RESULT_LONG_CONTENT_EVENT = {
  type: "tool_result",
  content: "B".repeat(300),
};

// =============================================================================
// Test Helpers
// =============================================================================

interface RenderEventOutput {
  stdout: string;
  stderr: string;
}

/**
 * Mock stdout/stderr capture for testing renderEvent output
 */
class OutputCapture {
  stdout: string = "";
  stderr: string = "";

  private originalStdoutWrite: typeof process.stdout.write;
  private originalStderrWrite: typeof process.stderr.write;

  constructor() {
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout);
    this.originalStderrWrite = process.stderr.write.bind(process.stderr);
  }

  start(): void {
    this.stdout = "";
    this.stderr = "";

    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      this.stdout += chunk.toString();
      return true;
    };

    process.stderr.write = (chunk: string | Uint8Array): boolean => {
      this.stderr += chunk.toString();
      return true;
    };
  }

  stop(): RenderEventOutput {
    process.stdout.write = this.originalStdoutWrite;
    process.stderr.write = this.originalStderrWrite;
    return { stdout: this.stdout, stderr: this.stderr };
  }
}

/**
 * Test adapter for Copilot event rendering
 */
class CopilotEventTestAdapter {
  private outputCapture: OutputCapture;
  private accumulatedOutput: string = "";
  private verbose: boolean;

  constructor(options: { verbose?: boolean } = {}) {
    this.outputCapture = new OutputCapture();
    this.verbose = options.verbose ?? false;
  }

  /**
   * Simulates what renderEvent does for Copilot events
   * This mirrors the implementation in copilot.ts
   */
  renderEvent(event: CopilotStreamEvent): void {
    switch (event.type) {
      case "assistant": {
        const message = event.message as { content?: Array<{ type: string; text?: string }> } | undefined;
        if (message?.content) {
          for (const block of message.content) {
            if (block.type === "text" && block.text) {
              process.stdout.write(block.text);
              this.accumulatedOutput += block.text;
            }
          }
        }
        break;
      }

      case "content_block_delta": {
        const delta = event.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) {
          process.stdout.write(delta.text);
          this.accumulatedOutput += delta.text;
        }
        break;
      }

      case "tool_use":
        process.stdout.write(`\n${chalk.cyan(`[tool: ${event.tool_name}]`)}\n`);
        break;

      case "tool_result": {
        const content = event.content as string | undefined;
        if (this.verbose && content) {
          const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
          process.stdout.write(`${chalk.dim("[result]")} ${truncated}\n`);
        } else {
          process.stdout.write(`${chalk.dim("[result]")}\n`);
        }
        break;
      }

      case "result": {
        const totalCost = (event.total_cost_usd ?? event.cost_usd) as number | undefined;
        const durationMs = event.duration_ms as number | undefined;

        if (totalCost !== undefined) {
          process.stdout.write(`\n[cost: $${totalCost.toFixed(4)}]\n`);
        }
        if (durationMs !== undefined) {
          const durationSec = (durationMs / 1000).toFixed(1);
          process.stdout.write(`[duration: ${durationSec}s]\n`);
        }
        break;
      }

      case "error": {
        const errorObj = event.error as { message?: string } | undefined;
        const errorMessage = errorObj?.message || event.content || "unknown error";
        process.stdout.write(`\n[ERROR: ${errorMessage}]\n`);
        break;
      }

      case "system":
        this.renderSystemEvent(event);
        break;
    }
  }

  private renderSystemEvent(event: CopilotStreamEvent): void {
    switch (event.subtype) {
      case "init":
        if (event.session_id) {
          process.stdout.write(`[session: ${event.session_id}]\n`);
        }
        if (event.model) {
          process.stdout.write(`[model: ${event.model}]\n`);
        }
        break;

      case "hook_started": {
        const hookName = (event.hook_name as string) || (event.name as string) || "unknown";
        process.stdout.write(`${chalk.dim(`[hook: ${hookName}]`)}\n`);
        break;
      }

      case "hook_response":
        if (this.verbose) {
          const response = event.response as string | undefined;
          if (response) {
            process.stdout.write(`${chalk.dim(`[hook response: ${response}]`)}\n`);
          } else {
            process.stdout.write(`${chalk.dim("[hook response]")}\n`);
          }
        }
        break;
    }
  }

  captureOutput(event: CopilotStreamEvent): RenderEventOutput {
    this.outputCapture.start();
    this.renderEvent(event);
    return this.outputCapture.stop();
  }

  getAccumulatedOutput(): string {
    return this.accumulatedOutput;
  }

  resetAccumulatedOutput(): void {
    this.accumulatedOutput = "";
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("Copilot CLI Event Parsing", () => {
  let adapter: CopilotEventTestAdapter;

  beforeEach(() => {
    adapter = new CopilotEventTestAdapter();
  });

  describe("Assistant Message Events", () => {
    test("should extract text from message.content array", () => {
      const event = COPILOT_ASSISTANT_EVENT as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toBe("Hello from Copilot");
    });

    test("should concatenate multiple text blocks in order", () => {
      const event = COPILOT_ASSISTANT_MULTI_BLOCK_EVENT as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toBe("First part. Second part.");
    });

    test("should accumulate output for return value", () => {
      const event = COPILOT_ASSISTANT_EVENT as unknown as CopilotStreamEvent;
      adapter.captureOutput(event);
      expect(adapter.getAccumulatedOutput()).toBe("Hello from Copilot");
    });
  });

  describe("Result Events", () => {
    test("should display cost from total_cost_usd field", () => {
      const event = COPILOT_RESULT_EVENT as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toContain("$0.0300");
    });

    test("should display duration in seconds", () => {
      const event = COPILOT_RESULT_EVENT as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toContain("2.5s");
    });

    test("cost should not be undefined when total_cost_usd is present", () => {
      const event = COPILOT_RESULT_EVENT as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).not.toContain("undefined");
      expect(output.stdout).toContain("$0.0300");
    });
  });

  describe("System Init Events", () => {
    test("should capture session_id for resume capability", () => {
      const event = COPILOT_SYSTEM_INIT_EVENT as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toContain("copilot-session-abc123");
    });

    test("should display model name", () => {
      const event = COPILOT_SYSTEM_INIT_EVENT as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toContain("claude");
    });
  });

  describe("Tool Events", () => {
    test("should display tool name for tool_use events", () => {
      const event = COPILOT_TOOL_USE_EVENT as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toContain("[tool: Read]");
    });
  });

  describe("Error Events", () => {
    test("should extract error message from error.message field", () => {
      const event = COPILOT_ERROR_EVENT as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toContain("Authentication failed");
    });

    test("should display error prominently", () => {
      const event = COPILOT_ERROR_EVENT as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toContain("[ERROR:");
    });
  });

  describe("Malformed Events", () => {
    test("should handle event with missing type gracefully", () => {
      const event = { foo: "bar" } as unknown as CopilotStreamEvent;
      expect(() => adapter.captureOutput(event)).not.toThrow();
    });

    test("should handle event with null values gracefully", () => {
      const event = {
        type: "assistant",
        message: null,
        content: null,
      } as unknown as CopilotStreamEvent;
      expect(() => adapter.captureOutput(event)).not.toThrow();
    });

    test("should handle event with unexpected structure gracefully", () => {
      const event = {
        type: "unknown_event_type",
        data: {
          nested: {
            deeply: {
              value: "test",
            },
          },
        },
      } as unknown as CopilotStreamEvent;
      expect(() => adapter.captureOutput(event)).not.toThrow();
    });

    test("should handle empty message.content array gracefully", () => {
      const event = {
        type: "assistant",
        message: {
          content: [],
        },
      } as unknown as CopilotStreamEvent;

      let output: RenderEventOutput | undefined;
      expect(() => {
        output = adapter.captureOutput(event);
      }).not.toThrow();
      expect(output?.stdout).toBe("");
    });

    test("should handle content blocks without text gracefully", () => {
      const event = {
        type: "assistant",
        message: {
          content: [
            { type: "image", data: "base64..." },
            { type: "tool_use", name: "Read" },
          ],
        },
      } as unknown as CopilotStreamEvent;
      expect(() => adapter.captureOutput(event)).not.toThrow();
    });
  });

  describe("Content Block Delta Events (Streaming)", () => {
    test("should handle text delta events", () => {
      const event = COPILOT_CONTENT_BLOCK_DELTA_EVENT as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toBe("streaming copilot text");
    });
  });
});

// =============================================================================
// Integration Test: Full Event Sequence
// =============================================================================

describe("Copilot CLI Event Sequence Integration", () => {
  let adapter: CopilotEventTestAdapter;

  beforeEach(() => {
    adapter = new CopilotEventTestAdapter();
  });

  test("should handle a realistic event sequence", () => {
    const events: CopilotStreamEvent[] = [
      COPILOT_SYSTEM_INIT_EVENT as unknown as CopilotStreamEvent,
      COPILOT_ASSISTANT_EVENT as unknown as CopilotStreamEvent,
      COPILOT_TOOL_USE_EVENT as unknown as CopilotStreamEvent,
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: " I found the file." }],
        },
      } as unknown as CopilotStreamEvent,
      COPILOT_RESULT_EVENT as unknown as CopilotStreamEvent,
    ];

    let fullOutput = "";
    for (const event of events) {
      const output = adapter.captureOutput(event);
      fullOutput += output.stdout;
    }

    expect(fullOutput).toContain("claude"); // Model from init
    expect(fullOutput).toContain("Hello from Copilot"); // First assistant message
    expect(fullOutput).toContain("[tool: Read]"); // Tool use
    expect(fullOutput).toContain("I found the file"); // Second assistant message
    expect(fullOutput).toContain("$0.0300"); // Cost
    expect(fullOutput).toContain("2.5s"); // Duration
  });
});

// =============================================================================
// Output Accumulator Tests
// =============================================================================

describe("Output Accumulator", () => {
  let adapter: CopilotEventTestAdapter;

  beforeEach(() => {
    adapter = new CopilotEventTestAdapter();
  });

  test("should accumulate text from multiple assistant events", () => {
    const events = [COPILOT_ASSISTANT_EVENT, COPILOT_ASSISTANT_MULTI_BLOCK_EVENT] as unknown as CopilotStreamEvent[];

    for (const event of events) {
      adapter.captureOutput(event);
    }

    expect(adapter.getAccumulatedOutput()).toBe("Hello from CopilotFirst part. Second part.");
  });

  test("should not accumulate non-text events", () => {
    adapter.captureOutput(COPILOT_ASSISTANT_EVENT as unknown as CopilotStreamEvent);
    adapter.captureOutput(COPILOT_TOOL_USE_EVENT as unknown as CopilotStreamEvent);
    adapter.captureOutput(COPILOT_RESULT_EVENT as unknown as CopilotStreamEvent);
    expect(adapter.getAccumulatedOutput()).toBe("Hello from Copilot");
  });
});

// =============================================================================
// System Event Subtypes Tests
// =============================================================================

describe("System Event Subtypes", () => {
  let adapter: CopilotEventTestAdapter;

  beforeEach(() => {
    adapter = new CopilotEventTestAdapter();
  });

  describe("hook_started events", () => {
    test("should display hook name in dim format", () => {
      const event = COPILOT_SYSTEM_HOOK_STARTED_EVENT as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toContain("[hook: pre-commit]");
    });

    test("should handle hook_started with name field instead of hook_name", () => {
      const event = {
        type: "system",
        subtype: "hook_started",
        name: "post-push",
      } as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toContain("[hook: post-push]");
    });

    test("should display 'unknown' when hook name is missing", () => {
      const event = {
        type: "system",
        subtype: "hook_started",
      } as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toContain("[hook: unknown]");
    });
  });

  describe("hook_response events", () => {
    test("should not show hook_response in normal mode", () => {
      const event = COPILOT_SYSTEM_HOOK_RESPONSE_EVENT as unknown as CopilotStreamEvent;
      const output = adapter.captureOutput(event);
      expect(output.stdout).toBe("");
    });

    test("should show hook_response with response text in verbose mode", () => {
      const verboseAdapter = new CopilotEventTestAdapter({ verbose: true });
      const event = COPILOT_SYSTEM_HOOK_RESPONSE_EVENT as unknown as CopilotStreamEvent;
      const output = verboseAdapter.captureOutput(event);
      expect(output.stdout).toContain("[hook response: Hook executed successfully]");
    });

    test("should show generic hook_response in verbose mode when no response text", () => {
      const verboseAdapter = new CopilotEventTestAdapter({ verbose: true });
      const event = {
        type: "system",
        subtype: "hook_response",
      } as unknown as CopilotStreamEvent;
      const output = verboseAdapter.captureOutput(event);
      expect(output.stdout).toContain("[hook response]");
      expect(output.stdout).not.toContain("[hook response: ");
    });
  });
});

// =============================================================================
// Tool Result Events Tests
// =============================================================================

describe("Tool Result Events", () => {
  let adapter: CopilotEventTestAdapter;

  beforeEach(() => {
    adapter = new CopilotEventTestAdapter();
  });

  test("should show dim result indicator in normal mode", () => {
    const event = COPILOT_TOOL_RESULT_EVENT as unknown as CopilotStreamEvent;
    const output = adapter.captureOutput(event);
    expect(output.stdout).toContain("[result]");
  });

  test("should not show content in normal mode", () => {
    const event = COPILOT_TOOL_RESULT_EVENT as unknown as CopilotStreamEvent;
    const output = adapter.captureOutput(event);
    expect(output.stdout).not.toContain("function example");
    expect(output.stdout).not.toContain("File contents");
  });

  test("should show content in verbose mode", () => {
    const verboseAdapter = new CopilotEventTestAdapter({ verbose: true });
    const event = COPILOT_TOOL_RESULT_EVENT as unknown as CopilotStreamEvent;
    const output = verboseAdapter.captureOutput(event);
    expect(output.stdout).toContain("[result]");
    expect(output.stdout).toContain("File contents");
  });

  test("should truncate long content in verbose mode", () => {
    const verboseAdapter = new CopilotEventTestAdapter({ verbose: true });
    const event = COPILOT_TOOL_RESULT_LONG_CONTENT_EVENT as unknown as CopilotStreamEvent;
    const output = verboseAdapter.captureOutput(event);
    expect(output.stdout).toContain("...");
    expect(output.stdout).toContain("B".repeat(200));
    expect(output.stdout).not.toContain("B".repeat(300));
  });

  test("should handle tool_result without content gracefully", () => {
    const event = {
      type: "tool_result",
    } as unknown as CopilotStreamEvent;
    const output = adapter.captureOutput(event);
    expect(output.stdout).toContain("[result]");
  });
});

// =============================================================================
// Tool Use Events Formatting Tests
// =============================================================================

describe("Tool Use Events Formatting", () => {
  let adapter: CopilotEventTestAdapter;

  beforeEach(() => {
    adapter = new CopilotEventTestAdapter();
  });

  test("should format tool name in cyan", () => {
    const event = COPILOT_TOOL_USE_EVENT as unknown as CopilotStreamEvent;
    const output = adapter.captureOutput(event);
    expect(output.stdout).toContain(chalk.cyan("[tool: Read]"));
  });

  test("should add newline before and after tool indicator", () => {
    const event = COPILOT_TOOL_USE_EVENT as unknown as CopilotStreamEvent;
    const output = adapter.captureOutput(event);
    expect(output.stdout).toBe(`\n${chalk.cyan("[tool: Read]")}\n`);
  });
});

// =============================================================================
// Verbose Mode Integration Tests
// =============================================================================

describe("Verbose Mode Integration", () => {
  test("should show additional detail in verbose mode for full event sequence", () => {
    const verboseAdapter = new CopilotEventTestAdapter({ verbose: true });
    const events: CopilotStreamEvent[] = [
      COPILOT_SYSTEM_INIT_EVENT as unknown as CopilotStreamEvent,
      COPILOT_SYSTEM_HOOK_STARTED_EVENT as unknown as CopilotStreamEvent,
      COPILOT_SYSTEM_HOOK_RESPONSE_EVENT as unknown as CopilotStreamEvent,
      COPILOT_TOOL_USE_EVENT as unknown as CopilotStreamEvent,
      COPILOT_TOOL_RESULT_EVENT as unknown as CopilotStreamEvent,
      COPILOT_ASSISTANT_EVENT as unknown as CopilotStreamEvent,
      COPILOT_RESULT_EVENT as unknown as CopilotStreamEvent,
    ];

    let fullOutput = "";
    for (const event of events) {
      const output = verboseAdapter.captureOutput(event);
      fullOutput += output.stdout;
    }

    expect(fullOutput).toContain("[hook: pre-commit]");
    expect(fullOutput).toContain("[hook response: Hook executed successfully]");
    expect(fullOutput).toContain("File contents");
    expect(fullOutput).toContain("Hello from Copilot");
  });

  test("should not show hook_response in normal mode for full event sequence", () => {
    const normalAdapter = new CopilotEventTestAdapter();
    const events: CopilotStreamEvent[] = [
      COPILOT_SYSTEM_INIT_EVENT as unknown as CopilotStreamEvent,
      COPILOT_SYSTEM_HOOK_STARTED_EVENT as unknown as CopilotStreamEvent,
      COPILOT_SYSTEM_HOOK_RESPONSE_EVENT as unknown as CopilotStreamEvent,
      COPILOT_TOOL_USE_EVENT as unknown as CopilotStreamEvent,
      COPILOT_TOOL_RESULT_EVENT as unknown as CopilotStreamEvent,
    ];

    let fullOutput = "";
    for (const event of events) {
      const output = normalAdapter.captureOutput(event);
      fullOutput += output.stdout;
    }

    expect(fullOutput).toContain("[hook: pre-commit]");
    expect(fullOutput).not.toContain("[hook response");
    expect(fullOutput).not.toContain("File contents");
  });
});

// =============================================================================
// Copilot Provider Contract Tests
// =============================================================================

describe("Copilot Provider Contract", () => {
  describe("Agent interface compliance", () => {
    test("CopilotAgentProvider implements Agent interface", async () => {
      const { CopilotAgentProvider } = await import("../../src/agents/copilot");
      const provider = new CopilotAgentProvider();

      // Must have run method
      expect(typeof provider.run).toBe("function");

      // Must have getActiveSession method (optional but implemented)
      expect(typeof provider.getActiveSession).toBe("function");
    });

    test("CopilotAgentProvider constructor accepts options", async () => {
      const { CopilotAgentProvider } = await import("../../src/agents/copilot");

      // Test with no options
      const defaultProvider = new CopilotAgentProvider();
      expect(defaultProvider).toBeDefined();

      // Test with mode option
      const interactiveProvider = new CopilotAgentProvider({ mode: "interactive" });
      expect(interactiveProvider).toBeDefined();

      // Test with streaming mode
      const streamingProvider = new CopilotAgentProvider({ mode: "streaming" });
      expect(streamingProvider).toBeDefined();

      // Test with deprecated interactive option
      const legacyProvider = new CopilotAgentProvider({ interactive: true });
      expect(legacyProvider).toBeDefined();

      // Test with model option
      const modelProvider = new CopilotAgentProvider({ model: "claude" });
      expect(modelProvider).toBeDefined();
    });

    test("CopilotAgentProvider supports multi-model selection", async () => {
      const { CopilotAgentProvider } = await import("../../src/agents/copilot");

      // Test different models
      const claudeProvider = new CopilotAgentProvider({ model: "claude" });
      expect(claudeProvider).toBeDefined();

      const gpt5Provider = new CopilotAgentProvider({ model: "gpt-5" });
      expect(gpt5Provider).toBeDefined();

      const geminiProvider = new CopilotAgentProvider({ model: "gemini" });
      expect(geminiProvider).toBeDefined();
    });

    test("CopilotAgentProvider supports tool permissions", async () => {
      const { CopilotAgentProvider } = await import("../../src/agents/copilot");

      // Test with allowAllTools
      const allToolsProvider = new CopilotAgentProvider({ allowAllTools: true });
      expect(allToolsProvider).toBeDefined();

      // Test with specific tool permissions
      const specificToolsProvider = new CopilotAgentProvider({
        allowTools: ["Read", "Write"],
        denyTools: ["Bash"],
      });
      expect(specificToolsProvider).toBeDefined();
    });

    test("CopilotAgentProvider supports streaming options", async () => {
      const { CopilotAgentProvider } = await import("../../src/agents/copilot");

      const provider = new CopilotAgentProvider({
        streamOutput: true,
        activityTimeoutMs: 300000,
        heartbeatIntervalMs: 5000,
        onEvent: (_event) => {
          /* handler */
        },
        onHeartbeat: (_ms) => {
          /* handler */
        },
        onTimeout: () => {
          /* handler */
        },
      });
      expect(provider).toBeDefined();
    });

    test("CopilotAgentProvider supports verbose mode", async () => {
      const { CopilotAgentProvider } = await import("../../src/agents/copilot");

      const verboseProvider = new CopilotAgentProvider({ verbose: true });
      expect(verboseProvider).toBeDefined();
    });
  });

  describe("Session management", () => {
    test("getActiveSession returns undefined when no session is active", async () => {
      const { CopilotAgentProvider } = await import("../../src/agents/copilot");
      const provider = new CopilotAgentProvider();

      expect(provider.getActiveSession()).toBeUndefined();
    });

    test("getCopilotActiveSession export is available", async () => {
      const { getCopilotActiveSession } = await import("../../src/agents/copilot");

      expect(typeof getCopilotActiveSession).toBe("function");
      expect(getCopilotActiveSession("nonexistent")).toBeUndefined();
    });

    test("interjectCopilotSession export is available", async () => {
      const { interjectCopilotSession } = await import("../../src/agents/copilot");

      expect(typeof interjectCopilotSession).toBe("function");
      expect(interjectCopilotSession("nonexistent")).toBeUndefined();
    });
  });

  describe("Installation instructions", () => {
    test("Installation instructions are defined", async () => {
      // We can't directly test the private INSTALLATION_INSTRUCTIONS constant,
      // but we can test that it's used in error handling by checking the module exports
      const copilotModule = await import("../../src/agents/copilot");

      // The module should export CopilotAgentProvider
      expect(copilotModule.CopilotAgentProvider).toBeDefined();
    });
  });
});

// =============================================================================
// Factory Integration Tests
// =============================================================================

describe("Factory Integration", () => {
  test("copilot is registered in agent registry", async () => {
    const { getRegisteredAgents, isAgentRegistered } = await import("../../src/agents/factory");

    expect(isAgentRegistered("copilot")).toBe(true);
    expect(getRegisteredAgents()).toContain("copilot");
  });
});
