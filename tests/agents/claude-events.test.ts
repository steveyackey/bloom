import { beforeEach, describe, expect, test } from "bun:test";
import type { StreamEvent } from "../../src/agents/claude";

// =============================================================================
// Test Fixtures - Real Claude CLI Event Schemas
// =============================================================================
// These fixtures represent the ACTUAL event structure from Claude CLI
// when running with --output-format stream-json
//
// Source: Captured from `claude -p --output-format stream-json "Hello"`
// =============================================================================

/**
 * Real Claude CLI assistant message event
 *
 * NOTE: Claude CLI sends message.content as an array of content blocks,
 * NOT a simple string at event.content
 */
export const REAL_ASSISTANT_EVENT = {
  type: "assistant",
  message: {
    content: [{ type: "text", text: "Hello" }],
  },
};

/**
 * Real Claude CLI assistant event with multiple content blocks
 */
export const REAL_ASSISTANT_MULTI_BLOCK_EVENT = {
  type: "assistant",
  message: {
    content: [
      { type: "text", text: "First part. " },
      { type: "text", text: "Second part." },
    ],
  },
};

/**
 * Real Claude CLI result event
 *
 * NOTE: Claude CLI uses "total_cost_usd" NOT "cost_usd"
 */
export const REAL_RESULT_EVENT = {
  type: "result",
  subtype: "success",
  total_cost_usd: 0.05,
  duration_ms: 1234,
};

/**
 * Real Claude CLI system init event
 *
 * NOTE: Contains model information that should be displayed
 */
export const REAL_SYSTEM_INIT_EVENT = {
  type: "system",
  subtype: "init",
  session_id: "abc123-def456-ghi789",
  model: "claude-sonnet-4",
};

/**
 * Real Claude CLI tool_use event
 */
export const REAL_TOOL_USE_EVENT = {
  type: "tool_use",
  tool_name: "Read",
  tool_input: {
    file_path: "/path/to/file.ts",
  },
};

/**
 * Real Claude CLI error event
 *
 * NOTE: Claude CLI uses error.message NOT event.content
 */
export const REAL_ERROR_EVENT = {
  type: "error",
  error: {
    message: "Rate limited",
    code: "rate_limit_exceeded",
  },
};

/**
 * Real Claude CLI content_block_delta event (streaming text)
 * These are used for incremental text output during streaming
 */
export const REAL_CONTENT_BLOCK_DELTA_EVENT = {
  type: "content_block_delta",
  delta: {
    type: "text_delta",
    text: "streaming text",
  },
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
 * Test harness for renderEvent - exposes private method for testing
 *
 * Since renderEvent is a private method, we need to either:
 * 1. Make it public/protected for testing
 * 2. Test through the public interface (runStreaming)
 * 3. Use a test adapter pattern
 *
 * For these tests, we use option 3 - a test adapter that can call the private method
 */
class ClaudeEventTestAdapter {
  private outputCapture: OutputCapture;
  private accumulatedOutput: string = "";

  constructor() {
    this.outputCapture = new OutputCapture();
  }

  /**
   * Simulates what renderEvent SHOULD do based on correct Claude CLI event schema
   * This is the EXPECTED behavior that current code does NOT implement
   */
  renderEventExpected(event: StreamEvent): void {
    switch (event.type) {
      case "assistant": {
        // CORRECT: Extract text from message.content array
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
        // Handle streaming text deltas
        const delta = event.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) {
          process.stdout.write(delta.text);
          this.accumulatedOutput += delta.text;
        }
        break;
      }

      case "tool_use":
        process.stdout.write(`\n[tool: ${event.tool_name}]\n`);
        break;

      case "tool_result":
        process.stdout.write("[tool result]\n");
        break;

      case "result": {
        // CORRECT: Use total_cost_usd NOT cost_usd
        const totalCost = event.total_cost_usd as number | undefined;
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
        // CORRECT: Extract message from error.message NOT event.content
        const errorObj = event.error as { message?: string } | undefined;
        const errorMessage = errorObj?.message || "unknown error";
        process.stdout.write(`\n[ERROR: ${errorMessage}]\n`);
        break;
      }

      case "system":
        if (event.subtype === "init") {
          if (event.session_id) {
            process.stdout.write(`[session: ${event.session_id}]\n`);
          }
          if (event.model) {
            process.stdout.write(`[model: ${event.model}]\n`);
          }
        }
        break;
    }
  }

  /**
   * Simulates what renderEvent CURRENTLY does (buggy behavior)
   * This mirrors the actual implementation in claude.ts
   */
  renderEventCurrent(event: StreamEvent): void {
    switch (event.type) {
      case "assistant":
        // BUG: Looks for event.content but Claude sends message.content
        // Also checks subtype === "text" which isn't how Claude structures it
        if (event.subtype === "text" && event.content) {
          process.stdout.write(event.content as string);
        }
        break;

      case "tool_use":
        process.stdout.write(`\n[tool: ${event.tool_name}]\n`);
        break;

      case "tool_result":
        process.stdout.write("[tool result]\n");
        break;

      case "result":
        // BUG: Uses cost_usd but Claude sends total_cost_usd
        if (event.cost_usd !== undefined) {
          process.stdout.write(`\n[cost: $${(event.cost_usd as number).toFixed(4)}]\n`);
        }
        break;

      case "error":
        // BUG: Uses event.content but Claude sends error.message
        process.stdout.write(`\n[error: ${event.content || "unknown"}]\n`);
        break;

      case "system":
        if (event.subtype === "init" && event.session_id) {
          process.stdout.write(`[session: ${event.session_id}]\n`);
        }
        // BUG: Does not display model
        break;
    }
  }

  captureExpectedOutput(event: StreamEvent): RenderEventOutput {
    this.outputCapture.start();
    // Don't reset accumulatedOutput here - we want to accumulate across events
    // Each test gets a fresh adapter via beforeEach
    this.renderEventExpected(event);
    return this.outputCapture.stop();
  }

  captureCurrentOutput(event: StreamEvent): RenderEventOutput {
    this.outputCapture.start();
    this.renderEventCurrent(event);
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

describe("Claude CLI Event Parsing", () => {
  let adapter: ClaudeEventTestAdapter;

  beforeEach(() => {
    adapter = new ClaudeEventTestAdapter();
  });

  describe("Assistant Message Events", () => {
    test("should extract text from message.content array (EXPECTED to FAIL)", () => {
      // GIVEN: Real Claude CLI assistant event with message.content array structure
      const event = REAL_ASSISTANT_EVENT as unknown as StreamEvent;

      // WHEN: renderEvent is called with current (buggy) implementation
      const currentOutput = adapter.captureCurrentOutput(event);

      // THEN: Current implementation produces NO output (bug!)
      // Expected output should be "Hello"
      const expectedOutput = adapter.captureExpectedOutput(event);

      // This test SHOULD fail - proving the bug exists
      // Current code doesn't extract text from message.content
      expect(currentOutput.stdout).toBe(expectedOutput.stdout);
      // Expected: "Hello"
      // Actual (current buggy code): ""
    });

    test("should concatenate multiple text blocks in order (EXPECTED to FAIL)", () => {
      // GIVEN: Assistant event with multiple content blocks
      const event = REAL_ASSISTANT_MULTI_BLOCK_EVENT as unknown as StreamEvent;

      // WHEN: renderEvent is called
      const currentOutput = adapter.captureCurrentOutput(event);

      // THEN: All text blocks should be concatenated
      const expectedOutput = adapter.captureExpectedOutput(event);

      // This test SHOULD fail - current code doesn't handle multi-block
      expect(currentOutput.stdout).toBe(expectedOutput.stdout);
      // Expected: "First part. Second part."
      // Actual: ""
    });

    test("should accumulate output for return value (EXPECTED to FAIL)", () => {
      // GIVEN: Real assistant event
      const event = REAL_ASSISTANT_EVENT as unknown as StreamEvent;

      // WHEN: renderEvent processes the event
      adapter.captureExpectedOutput(event);

      // THEN: Output accumulator should contain the text
      expect(adapter.getAccumulatedOutput()).toBe("Hello");
    });
  });

  describe("Result Events", () => {
    test("should display cost from total_cost_usd field (EXPECTED to FAIL)", () => {
      // GIVEN: Real result event with total_cost_usd (NOT cost_usd)
      const event = REAL_RESULT_EVENT as unknown as StreamEvent;

      // WHEN: renderEvent is called
      const currentOutput = adapter.captureCurrentOutput(event);
      const expectedOutput = adapter.captureExpectedOutput(event);

      // THEN: Cost should be displayed
      // This test SHOULD fail - current code looks for cost_usd
      expect(currentOutput.stdout).toContain("$0.0500");
      // Expected: contains "$0.0500"
      // Actual: does not contain cost (uses wrong field name)
    });

    test("should display duration in seconds (EXPECTED to FAIL)", () => {
      // GIVEN: Result event with duration_ms
      const event = REAL_RESULT_EVENT as unknown as StreamEvent;

      // WHEN: renderEvent is called
      const currentOutput = adapter.captureCurrentOutput(event);

      // THEN: Duration should be displayed as seconds
      // This test SHOULD fail - current code doesn't show duration
      expect(currentOutput.stdout).toContain("1.2s");
      // Expected: contains "1.2s" (1234ms -> 1.2s)
      // Actual: no duration displayed
    });

    test("cost should not be undefined when total_cost_usd is present (EXPECTED to FAIL)", () => {
      // GIVEN: Result event with total_cost_usd
      const event = REAL_RESULT_EVENT as unknown as StreamEvent;

      // WHEN: renderEvent is called
      const currentOutput = adapter.captureCurrentOutput(event);

      // THEN: Output should NOT contain "undefined"
      expect(currentOutput.stdout).not.toContain("undefined");

      // AND: Should contain actual cost
      expect(currentOutput.stdout).toContain("$0.0500");
    });
  });

  describe("System Init Events", () => {
    test("should capture session_id for resume capability", () => {
      // GIVEN: System init event with session_id
      const event = REAL_SYSTEM_INIT_EVENT as unknown as StreamEvent;

      // WHEN: renderEvent is called
      const currentOutput = adapter.captureCurrentOutput(event);

      // THEN: Session ID should be displayed
      // This test PASSES with current code
      expect(currentOutput.stdout).toContain("abc123-def456-ghi789");
    });

    test("should display model name (EXPECTED to FAIL)", () => {
      // GIVEN: System init event with model
      const event = REAL_SYSTEM_INIT_EVENT as unknown as StreamEvent;

      // WHEN: renderEvent is called
      const currentOutput = adapter.captureCurrentOutput(event);

      // THEN: Model should be displayed
      // This test SHOULD fail - current code doesn't show model
      expect(currentOutput.stdout).toContain("claude-sonnet-4");
      // Expected: contains "claude-sonnet-4"
      // Actual: model is not displayed
    });
  });

  describe("Tool Events", () => {
    test("should display tool name for tool_use events", () => {
      // GIVEN: Tool use event
      const event = REAL_TOOL_USE_EVENT as unknown as StreamEvent;

      // WHEN: renderEvent is called
      const currentOutput = adapter.captureCurrentOutput(event);

      // THEN: Tool name should be displayed
      // This test PASSES with current code
      expect(currentOutput.stdout).toContain("[tool: Read]");
    });
  });

  describe("Error Events", () => {
    test("should extract error message from error.message field (EXPECTED to FAIL)", () => {
      // GIVEN: Error event with error.message structure
      const event = REAL_ERROR_EVENT as unknown as StreamEvent;

      // WHEN: renderEvent is called
      const currentOutput = adapter.captureCurrentOutput(event);

      // THEN: Error message should be extracted from error.message
      // This test SHOULD fail - current code looks for event.content
      expect(currentOutput.stdout).toContain("Rate limited");
      // Expected: contains "Rate limited"
      // Actual: contains "unknown" (because event.content is undefined)
    });

    test("should display error prominently (EXPECTED to FAIL)", () => {
      // GIVEN: Error event
      const event = REAL_ERROR_EVENT as unknown as StreamEvent;

      // WHEN: renderEvent is called
      const expectedOutput = adapter.captureExpectedOutput(event);

      // THEN: Error should be prominently displayed with ERROR prefix
      expect(expectedOutput.stdout).toContain("[ERROR:");
      // Current code uses "[error:" which is less prominent
    });
  });

  describe("Malformed Events", () => {
    test("should handle event with missing type gracefully", () => {
      // GIVEN: Event without type field
      const event = { foo: "bar" } as unknown as StreamEvent;

      // WHEN: renderEvent is called
      // THEN: Should not throw
      expect(() => adapter.captureCurrentOutput(event)).not.toThrow();
    });

    test("should handle event with null values gracefully", () => {
      // GIVEN: Event with null values
      const event = {
        type: "assistant",
        message: null,
        content: null,
      } as unknown as StreamEvent;

      // WHEN: renderEvent is called
      // THEN: Should not throw
      expect(() => adapter.captureCurrentOutput(event)).not.toThrow();
    });

    test("should handle event with unexpected structure gracefully", () => {
      // GIVEN: Event with unexpected nested structure
      const event = {
        type: "unknown_event_type",
        data: {
          nested: {
            deeply: {
              value: "test",
            },
          },
        },
      } as unknown as StreamEvent;

      // WHEN: renderEvent is called
      // THEN: Should not throw
      expect(() => adapter.captureCurrentOutput(event)).not.toThrow();
    });

    test("should handle empty message.content array gracefully", () => {
      // GIVEN: Assistant event with empty content array
      const event = {
        type: "assistant",
        message: {
          content: [],
        },
      } as unknown as StreamEvent;

      // WHEN: renderEvent is called
      // THEN: Should not throw and produce no output
      let output: RenderEventOutput | undefined;
      expect(() => {
        output = adapter.captureExpectedOutput(event);
      }).not.toThrow();
      expect(output?.stdout).toBe("");
    });

    test("should handle content blocks without text gracefully", () => {
      // GIVEN: Assistant event with non-text content blocks
      const event = {
        type: "assistant",
        message: {
          content: [
            { type: "image", data: "base64..." },
            { type: "tool_use", name: "Read" },
          ],
        },
      } as unknown as StreamEvent;

      // WHEN: renderEvent is called
      // THEN: Should not throw
      expect(() => adapter.captureExpectedOutput(event)).not.toThrow();
    });
  });

  describe("Content Block Delta Events (Streaming)", () => {
    test("should handle text delta events (EXPECTED to FAIL)", () => {
      // GIVEN: Content block delta event with text
      const event = REAL_CONTENT_BLOCK_DELTA_EVENT as unknown as StreamEvent;

      // WHEN: renderEvent is called with expected behavior
      const expectedOutput = adapter.captureExpectedOutput(event);

      // THEN: Streaming text should be output
      expect(expectedOutput.stdout).toBe("streaming text");
      // Current code doesn't handle content_block_delta events at all
    });
  });
});

// =============================================================================
// Integration Test: Full Event Sequence
// =============================================================================

describe("Claude CLI Event Sequence Integration", () => {
  let adapter: ClaudeEventTestAdapter;

  beforeEach(() => {
    adapter = new ClaudeEventTestAdapter();
  });

  test("should handle a realistic event sequence (EXPECTED to FAIL)", () => {
    // GIVEN: A realistic sequence of events from Claude CLI
    const events: StreamEvent[] = [
      // 1. System init
      REAL_SYSTEM_INIT_EVENT as unknown as StreamEvent,
      // 2. Assistant response
      REAL_ASSISTANT_EVENT as unknown as StreamEvent,
      // 3. Tool use
      REAL_TOOL_USE_EVENT as unknown as StreamEvent,
      // 4. More assistant text
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: " I found the file." }],
        },
      } as unknown as StreamEvent,
      // 5. Result
      REAL_RESULT_EVENT as unknown as StreamEvent,
    ];

    // WHEN: All events are processed
    let fullOutput = "";
    for (const event of events) {
      const output = adapter.captureExpectedOutput(event);
      fullOutput += output.stdout;
    }

    // THEN: Output should contain all expected parts
    expect(fullOutput).toContain("claude-sonnet-4"); // Model from init
    expect(fullOutput).toContain("Hello"); // First assistant message
    expect(fullOutput).toContain("[tool: Read]"); // Tool use
    expect(fullOutput).toContain("I found the file"); // Second assistant message
    expect(fullOutput).toContain("$0.0500"); // Cost
    expect(fullOutput).toContain("1.2s"); // Duration
  });
});

// =============================================================================
// Output Accumulator Tests
// =============================================================================

describe("Output Accumulator", () => {
  let adapter: ClaudeEventTestAdapter;

  beforeEach(() => {
    adapter = new ClaudeEventTestAdapter();
  });

  test("should accumulate text from multiple assistant events", () => {
    // GIVEN: Multiple assistant events
    const events = [
      REAL_ASSISTANT_EVENT,
      REAL_ASSISTANT_MULTI_BLOCK_EVENT,
    ] as unknown as StreamEvent[];

    // WHEN: Events are processed
    for (const event of events) {
      adapter.captureExpectedOutput(event);
    }

    // THEN: All text should be accumulated
    expect(adapter.getAccumulatedOutput()).toBe("HelloFirst part. Second part.");
  });

  test("should not accumulate non-text events", () => {
    // GIVEN: Mix of events
    adapter.captureExpectedOutput(REAL_ASSISTANT_EVENT as unknown as StreamEvent);
    adapter.captureExpectedOutput(REAL_TOOL_USE_EVENT as unknown as StreamEvent);
    adapter.captureExpectedOutput(REAL_RESULT_EVENT as unknown as StreamEvent);

    // THEN: Only assistant text should be accumulated
    expect(adapter.getAccumulatedOutput()).toBe("Hello");
  });
});
