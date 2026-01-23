import { type ChildProcess, spawn } from "node:child_process";
import chalk from "chalk";
import { createLogger } from "../logger";
import type { Agent, AgentConfig, AgentRunOptions, AgentRunResult, AgentSession } from "./core";

const logger = createLogger("opencode-provider");

// =============================================================================
// Stream JSON Event Types (from opencode --format json)
// =============================================================================

export interface OpenCodeStreamEvent {
  type: string;
  timestamp?: number;
  sessionID?: string;
  content?: string;
  error?: {
    name: string;
    data?: {
      message?: string;
      statusCode?: number;
      isRetryable?: boolean;
      [key: string]: unknown;
    };
  };
  [key: string]: unknown;
}

// =============================================================================
// Provider-Specific Options (OpenCode)
// =============================================================================
//
// These options are specific to OpenCode and don't belong in the generic interface:
// - autoApprove: OpenCode's permission model (--config-content override)
// - activityTimeoutMs/heartbeatIntervalMs: Streaming mode monitoring
// - onEvent/onHeartbeat/onTimeout: Event callbacks for stream processing
//
// Generic options from AgentConfig are also supported:
// - mode: "interactive" | "streaming"
// - model: OpenCode model identifier (REQUIRED in streaming mode)
// - streamOutput: Whether to stream output while capturing
// =============================================================================

export interface OpenCodeProviderOptions extends AgentConfig {
  /**
   * @deprecated Use `mode` instead. Will be removed in future version.
   */
  interactive?: boolean;
  /**
   * PROVIDER-SPECIFIC: Auto-approve all tool calls via OPENCODE_CONFIG_CONTENT.
   * This is OpenCode's security model - other providers have different mechanisms.
   */
  autoApprove?: boolean;
  /**
   * PROVIDER-SPECIFIC: Timeout in ms before considering agent dead.
   * Default: 600000 (10 min). Only applies in streaming mode.
   */
  activityTimeoutMs?: number;
  /**
   * PROVIDER-SPECIFIC: Interval for heartbeat output when waiting.
   * Default: 10000 (10s). Only applies in streaming mode.
   */
  heartbeatIntervalMs?: number;
  /**
   * PROVIDER-SPECIFIC: Callback for stream events.
   * Only applies in streaming mode with JSON format.
   */
  onEvent?: (event: OpenCodeStreamEvent) => void;
  /**
   * PROVIDER-SPECIFIC: Callback for heartbeat.
   * Only applies in streaming mode.
   */
  onHeartbeat?: (lastActivityMs: number) => void;
  /**
   * PROVIDER-SPECIFIC: Callback for activity timeout.
   * Only applies in streaming mode.
   */
  onTimeout?: () => void;
  /**
   * Model to use in provider/model format (e.g., 'opencode/grok-code').
   * REQUIRED in streaming mode - no default model is used.
   */
  model?: string;
}

// =============================================================================
// Running Session (for interjection support)
// =============================================================================
//
// RunningSession extends AgentSession with OpenCode-specific process tracking.
// The `proc` field is needed for interjection (killing the OpenCode process).
// =============================================================================

export interface RunningSession extends AgentSession {
  /** OpenCode child process - needed for interjection */
  proc: ChildProcess;
}

// Track active sessions for interjection by agent name
const activeSessions = new Map<string, RunningSession>();

/**
 * Get an active session by agent name.
 * This is a module-level function for cross-instance access.
 */
export function getActiveSession(agentName: string): RunningSession | undefined {
  return activeSessions.get(agentName);
}

/**
 * Interject (kill) an active session by agent name.
 * Returns the session that was interjected, or undefined if not found.
 * This is a module-level function since it needs to access internal process state.
 */
export function interjectSession(agentName: string): RunningSession | undefined {
  const session = activeSessions.get(agentName);
  if (session) {
    logger.info(`Interjecting session for ${agentName}`);
    try {
      session.proc.kill("SIGTERM");
    } catch {}
    activeSessions.delete(agentName);
  }
  return session;
}

// =============================================================================
// OpenCode Agent Provider
// =============================================================================

export class OpenCodeAgentProvider implements Agent {
  private mode: "interactive" | "streaming";
  private autoApprove: boolean;
  private model: string | undefined;
  private streamOutput: boolean;
  private activityTimeoutMs: number;
  private heartbeatIntervalMs: number;
  private onEvent?: (event: OpenCodeStreamEvent) => void;
  private onHeartbeat?: (lastActivityMs: number) => void;
  private onTimeout?: () => void;
  private currentAgentName?: string;

  constructor(options: OpenCodeProviderOptions = {}) {
    // Support both new `mode` and deprecated `interactive` option
    if (options.mode !== undefined) {
      this.mode = options.mode;
    } else {
      this.mode = options.interactive ? "interactive" : "streaming";
    }
    this.autoApprove = options.autoApprove ?? true;
    // Model is REQUIRED in streaming mode - no silent default
    this.model = options.model;
    this.streamOutput = options.streamOutput ?? true;
    this.activityTimeoutMs = options.activityTimeoutMs ?? 600_000; // 10 min
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000; // 10s
    this.onEvent = options.onEvent;
    this.onHeartbeat = options.onHeartbeat;
    this.onTimeout = options.onTimeout;
  }

  /**
   * Get the currently active session for this agent instance.
   * Returns the session from the global tracking map if we have one.
   */
  getActiveSession(): AgentSession | undefined {
    if (this.currentAgentName) {
      return activeSessions.get(this.currentAgentName);
    }
    return undefined;
  }

  private getEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    if (this.autoApprove) {
      // Use OPENCODE_CONFIG_CONTENT to set permission: "*": "allow"
      const configOverride = JSON.stringify({
        permission: { "*": "allow" },
      });
      env.OPENCODE_CONFIG_CONTENT = configOverride;
    }

    return env;
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    this.currentAgentName = options.agentName;
    return this.mode === "interactive" ? this.runInteractive(options) : this.runStreaming(options);
  }

  private async runInteractive(options: AgentRunOptions): Promise<AgentRunResult> {
    return new Promise((resolve) => {
      // Interactive mode: opencode --prompt "..." [-m model]
      const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`;
      const args = ["--prompt", fullPrompt];

      // Add model if specified
      if (this.model) {
        args.push("-m", this.model);
      }

      // Add session resume if provided
      if (options.sessionId) {
        args.push("-s", options.sessionId);
      }

      const proc = spawn("opencode", args, {
        cwd: options.startingDirectory,
        stdio: "inherit",
        env: this.getEnv(),
      });

      proc.on("error", (error) => {
        resolve({
          success: false,
          output: "",
          error: `Failed to spawn opencode: ${error.message}`,
        });
      });

      proc.on("close", (code) => {
        const exitCode = code ?? 0;
        resolve({
          success: exitCode === 0,
          output: "",
        });
      });
    });
  }

  private async runStreaming(options: AgentRunOptions): Promise<AgentRunResult> {
    // Validate model is specified in streaming mode
    if (!this.model) {
      return {
        success: false,
        output: "",
        error:
          "Model selection is REQUIRED for OpenCode in streaming mode. Use provider/model format (e.g., opencode/grok-code).",
      };
    }

    // Store model in local constant for closure access (TypeScript narrowing)
    const model = this.model;

    return new Promise((resolve) => {
      // Streaming: opencode run --format json -m model "prompt"
      const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`;
      const args: string[] = ["run", "--format", "json", "-m", model];

      // Add session resume if provided
      if (options.sessionId) {
        args.push("-s", options.sessionId);
      }

      args.push(fullPrompt);

      const proc = spawn("opencode", args, {
        cwd: options.startingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
        env: this.getEnv(),
      });

      const now = Date.now();
      let lastActivity = now;
      let sessionId: string | undefined;
      let buffer = "";
      const outputAccumulator = { value: "" };
      let timedOut = false;

      // Track session for interjection support
      const session: RunningSession = {
        proc,
        startTime: now,
        lastActivity: now,
        taskId: options.taskId,
        agentName: options.agentName,
        workingDirectory: options.startingDirectory,
      };

      if (options.agentName) {
        activeSessions.set(options.agentName, session);
      }

      // Heartbeat timer
      const heartbeatTimer = setInterval(() => {
        const elapsed = Date.now() - lastActivity;

        if (elapsed >= this.activityTimeoutMs) {
          // Agent presumed dead
          timedOut = true;
          if (this.onTimeout) {
            this.onTimeout();
          }
          if (this.streamOutput) {
            process.stdout.write(`\n[TIMEOUT] No activity for ${Math.round(elapsed / 1000)}s - agent may be stuck\n`);
          }
          clearInterval(heartbeatTimer);
          try {
            proc.kill("SIGTERM");
          } catch {}
        } else if (elapsed >= this.heartbeatIntervalMs) {
          // Heartbeat
          if (this.onHeartbeat) {
            this.onHeartbeat(elapsed);
          }
          if (this.streamOutput) {
            const secs = Math.round(elapsed / 1000);
            process.stdout.write(`[heartbeat ${secs}s] `);
          }
        }
      }, this.heartbeatIntervalMs);

      // Parse streaming JSON
      const processLine = (line: string) => {
        if (!line.trim()) return;

        try {
          const event: OpenCodeStreamEvent = JSON.parse(line);
          lastActivity = Date.now();
          session.lastActivity = lastActivity;

          // Capture session ID for resume support
          if (event.sessionID) {
            sessionId = event.sessionID;
            session.sessionId = sessionId;
          }

          // Notify listener
          if (this.onEvent) {
            this.onEvent(event);
          }

          // Stream human-readable output and accumulate text output
          if (this.streamOutput) {
            this.renderEvent(event, outputAccumulator);
          } else {
            // Even when not streaming, we need to accumulate text from assistant events
            this.extractTextFromEvent(event, outputAccumulator);
          }
        } catch {
          // Not JSON, output raw
          if (this.streamOutput) {
            process.stdout.write(line);
          }
        }
      };

      proc.stdout?.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          processLine(line);
        }
      });

      proc.stderr?.on("data", (data) => {
        lastActivity = Date.now();
        if (this.streamOutput) {
          process.stderr.write(data);
        }
      });

      proc.on("error", (error) => {
        clearInterval(heartbeatTimer);
        if (options.agentName) {
          activeSessions.delete(options.agentName);
        }
        resolve({
          success: false,
          output: outputAccumulator.value,
          error: `Failed to spawn opencode: ${error.message}`,
          sessionId,
        });
      });

      proc.on("close", (code) => {
        clearInterval(heartbeatTimer);
        if (options.agentName) {
          activeSessions.delete(options.agentName);
        }

        // Process remaining buffer
        if (buffer.trim()) {
          processLine(buffer);
        }

        const exitCode = code ?? 0;
        resolve({
          success: !timedOut && exitCode === 0,
          output: outputAccumulator.value,
          error: timedOut ? "Agent execution timed out" : undefined,
          sessionId,
        });
      });

      proc.stdin?.end();
    });
  }

  /**
   * Render OpenCode stream event to human-readable output
   */
  private renderEvent(event: OpenCodeStreamEvent, outputAccumulator?: { value: string }): void {
    switch (event.type) {
      case "assistant": {
        // Handle assistant text content
        const content = event.content as string | undefined;
        if (content) {
          process.stdout.write(content);
          if (outputAccumulator) {
            outputAccumulator.value += content;
          }
        }
        // Handle message content blocks if present
        const message = event.message as { content?: Array<{ type: string; text?: string }> } | undefined;
        if (message?.content) {
          for (const block of message.content) {
            if (block.type === "text" && block.text) {
              process.stdout.write(block.text);
              if (outputAccumulator) {
                outputAccumulator.value += block.text;
              }
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
          if (outputAccumulator) {
            outputAccumulator.value += delta.text;
          }
        }
        break;
      }

      case "text": {
        // Direct text output
        const text = event.text as string | undefined;
        if (text) {
          process.stdout.write(text);
          if (outputAccumulator) {
            outputAccumulator.value += text;
          }
        }
        break;
      }

      case "tool_use":
      case "tool_call":
        // Format tool name in cyan for visibility
        process.stdout.write(`\n${chalk.cyan(`[tool: ${event.tool_name || event.name || "unknown"}]`)}\n`);
        break;

      case "tool_result":
      case "tool_response": {
        // Show result indicator in dim
        process.stdout.write(`${chalk.dim("[result]")}\n`);
        break;
      }

      case "result":
      case "done": {
        // Session completed - show stats if available
        const cost = event.cost_usd as number | undefined;
        const duration = event.duration_ms as number | undefined;

        if (cost !== undefined) {
          process.stdout.write(`\n[cost: $${cost.toFixed(4)}]\n`);
        }
        if (duration !== undefined) {
          const durationSec = (duration / 1000).toFixed(1);
          process.stdout.write(`[duration: ${durationSec}s]\n`);
        }
        break;
      }

      case "error": {
        // Error handling
        const errorMessage = event.error?.data?.message || event.error?.name || "unknown error";
        process.stdout.write(`\n${chalk.red(`[ERROR: ${errorMessage}]`)}\n`);
        break;
      }

      case "session": {
        // Session info
        if (event.sessionID) {
          process.stdout.write(`[session: ${event.sessionID}]\n`);
        }
        break;
      }
    }
  }

  /**
   * Extract text from event without writing to stdout (for non-streaming mode)
   */
  private extractTextFromEvent(event: OpenCodeStreamEvent, outputAccumulator: { value: string }): void {
    switch (event.type) {
      case "assistant": {
        const content = event.content as string | undefined;
        if (content) {
          outputAccumulator.value += content;
        }
        const message = event.message as { content?: Array<{ type: string; text?: string }> } | undefined;
        if (message?.content) {
          for (const block of message.content) {
            if (block.type === "text" && block.text) {
              outputAccumulator.value += block.text;
            }
          }
        }
        break;
      }

      case "content_block_delta": {
        const delta = event.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) {
          outputAccumulator.value += delta.text;
        }
        break;
      }

      case "text": {
        const text = event.text as string | undefined;
        if (text) {
          outputAccumulator.value += text;
        }
        break;
      }
    }
  }
}
