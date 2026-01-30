#!/usr/bin/env bun
/**
 * Test Agent CLI
 *
 * A mock agent CLI for end-to-end testing of Bloom without an LLM.
 * Simulates agent behavior including streaming JSON output, tool calls, and session management.
 *
 * Usage:
 *   bun src/agents/test-agent/cli.ts --version
 *   bun src/agents/test-agent/cli.ts -p "prompt" [options]
 *
 * Options:
 *   --version           Show version
 *   -p, --prompt        The prompt to process
 *   --model             Model to use (ignored, for compatibility)
 *   --delay             Delay between events in ms (default: 100)
 *   --fail              Simulate a failure
 *   --fail-after        Fail after N events
 *   --tools             Comma-separated list of tools to "call"
 *   --output            Custom output text
 *   --session-id        Session ID for resume
 *   --json              Output JSON events (default in non-interactive)
 */

import { parseArgs } from "node:util";

// Parse CLI arguments
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    version: { type: "boolean", short: "v" },
    prompt: { type: "string", short: "p" },
    model: { type: "string", short: "m" },
    delay: { type: "string", default: "100" },
    fail: { type: "boolean" },
    "fail-after": { type: "string" },
    tools: { type: "string" },
    output: { type: "string" },
    "session-id": { type: "string" },
    json: { type: "boolean" },
    yes: { type: "boolean", short: "y" },
    system: { type: "string" },
  },
  allowPositionals: true,
});

// Version command
if (values.version) {
  console.log("test-agent 1.0.0 (bloom mock agent)");
  process.exit(0);
}

// Require prompt
const prompt = values.prompt;
if (!prompt) {
  console.error("Error: --prompt is required");
  process.exit(1);
}

// Configuration
const delay = Number.parseInt(values.delay || "100", 10);
const shouldFail = values.fail;
const failAfter = values["fail-after"] ? Number.parseInt(values["fail-after"], 10) : null;
const tools = values.tools ? values.tools.split(",").map((t) => t.trim()) : [];
const customOutput = values.output;
const sessionId = values["session-id"] || `test-session-${Date.now()}`;

// Helper to emit JSON events
function emit(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ ...event, timestamp: Date.now() }));
}

// Helper to sleep
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Main execution
async function main(): Promise<void> {
  let eventCount = 0;

  // Session start
  emit({
    type: "session",
    session_id: sessionId,
  });
  eventCount++;
  await sleep(delay);

  // Check for early failure
  if (failAfter !== null && eventCount >= failAfter) {
    emit({ type: "error", error: { message: "Simulated failure (fail-after)" } });
    process.exit(1);
  }

  // System info
  emit({
    type: "system",
    subtype: "init",
    session_id: sessionId,
    model: values.model || "test-model",
  });
  eventCount++;
  await sleep(delay);

  // Simulate tool calls if specified
  for (const tool of tools) {
    if (failAfter !== null && eventCount >= failAfter) {
      emit({ type: "error", error: { message: "Simulated failure (fail-after)" } });
      process.exit(1);
    }

    emit({
      type: "tool_use",
      tool_name: tool,
      tool_input: { simulated: true },
    });
    eventCount++;
    await sleep(delay);

    emit({
      type: "tool_result",
      tool_name: tool,
      content: `Result from ${tool}`,
    });
    eventCount++;
    await sleep(delay);
  }

  // Generate response text (prompt is guaranteed non-null due to earlier check)
  const promptText = prompt as string;
  const promptPreview = promptText.substring(0, 50) + (promptText.length > 50 ? "..." : "");
  const responseText =
    customOutput ||
    `I received your prompt: "${promptPreview}"

This is a simulated response from the test agent.
Session ID: ${sessionId}
Tools called: ${tools.length > 0 ? tools.join(", ") : "none"}

The task has been completed successfully.`;

  // Stream response in chunks
  const words = responseText.split(" ");
  for (let i = 0; i < words.length; i++) {
    if (failAfter !== null && eventCount >= failAfter) {
      emit({ type: "error", error: { message: "Simulated failure (fail-after)" } });
      process.exit(1);
    }

    const chunk = i === 0 ? words[i] : ` ${words[i]}`;
    emit({
      type: "assistant",
      content: chunk,
    });
    eventCount++;

    // Small delay between words
    await sleep(Math.min(delay / 2, 50));
  }

  // Newline at end of response
  emit({ type: "assistant", content: "\n" });
  await sleep(delay);

  // Check for failure flag
  if (shouldFail) {
    emit({
      type: "error",
      error: { message: "Simulated failure (--fail flag)" },
    });
    process.exit(1);
  }

  // Completion
  emit({
    type: "done",
    session_id: sessionId,
    cost_usd: 0.0001,
    duration_ms: eventCount * delay,
  });

  process.exit(0);
}

main().catch((error) => {
  emit({ type: "error", error: { message: error.message } });
  process.exit(1);
});
