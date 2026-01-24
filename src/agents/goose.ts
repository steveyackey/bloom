import { type ChildProcess, spawn } from "node:child_process";
import chalk from "chalk";
import { createLogger } from "../logger";
import type { Agent, AgentConfig, AgentRunOptions, AgentRunResult, AgentSession } from "./core";

const logger = createLogger("goose-provider");

// =============================================================================
// Stream JSON Event Types (from goose run --output-format stream-json)
// =============================================================================

export interface GooseStreamEvent {
  type: string;
  timestamp?: string;
  session_id?: string;
  content?: string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string }>;
  };
  tool_name?: string;
  tool_input?: unknown;
  result?: unknown;
  error?: string;
  [key: string]: unknown;
}

// =============================================================================
// Provider Options (Goose-specific)
// =============================================================================
//
// These options extend the generic AgentConfig with Goose-specific features:
// - sessionName: Named sessions for easier resume
// - systemInstructions: Additional system instructions via --system flag
// - activityTimeoutMs/heartbeatIntervalMs: Streaming mode monitoring
// - onEvent/onHeartbeat/onTimeout: Event callbacks for stream processing
//
// =============================================================================

export interface GooseProviderOptions extends AgentConfig {
  /**
   * @deprecated Use `mode` instead. Will be removed in future version.
   */
  interactive?: boolean;
  /**
   * PROVIDER-SPECIFIC: Session name for easier resume.
   * Maps to -n/--name flag.
   */
  sessionName?: string;
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
   * Only applies in streaming mode.
   */
  onEvent?: (event: GooseStreamEvent) => void;
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
   * Model to use. Goose uses the configured default provider/model if not specified.
   * Run `goose configure` to set up providers.
   */
  model?: string;
}

// =============================================================================
// Running Session (for interjection support)
// =============================================================================
//
// RunningSession extends AgentSession with Goose-specific process tracking.
// The `proc` field is needed for interjection (killing the Goose process).
// =============================================================================

export interface GooseRunningSession extends AgentSession {
  /** Goose child process - needed for interjection */
  proc: ChildProcess;
}

// Track active sessions for interjection by agent name
const activeSessions = new Map<string, GooseRunningSession>();

/**
 * Get an active session by agent name.
 * This is a module-level function for cross-instance access.
 */
export function getActiveGooseSession(agentName: string): GooseRunningSession | undefined {
  return activeSessions.get(agentName);
}

/**
 * Interject (kill) an active session by agent name.
 * Returns the session that was interjected, or undefined if not found.
 * This is a module-level function since it needs to access internal process state.
 */
export function interjectGooseSession(agentName: string): GooseRunningSession | undefined {
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
// Goose Agent Provider
// =============================================================================

export class GooseAgentProvider implements Agent {
  private mode: "interactive" | "streaming";
  private streamOutput: boolean;
  private activityTimeoutMs: number;
  private heartbeatIntervalMs: number;
  private onEvent?: (event: GooseStreamEvent) => void;
  private onHeartbeat?: (lastActivityMs: number) => void;
  private onTimeout?: () => void;
  private currentAgentName?: string;
  private model?: string;
  private sessionName?: string;

  constructor(options: GooseProviderOptions = {}) {
    // Support both new `mode` and deprecated `interactive` option
    if (options.mode !== undefined) {
      this.mode = options.mode;
    } else {
      this.mode = options.interactive ? "interactive" : "streaming";
    }
    this.streamOutput = options.streamOutput ?? true;
    this.activityTimeoutMs = options.activityTimeoutMs ?? 600_000; // 10 min
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000; // 10s
    this.onEvent = options.onEvent;
    this.onHeartbeat = options.onHeartbeat;
    this.onTimeout = options.onTimeout;
    this.model = options.model;
    this.sessionName = options.sessionName;
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

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    this.currentAgentName = options.agentName;
    return this.mode === "interactive" ? this.runInteractive(options) : this.runStreaming(options);
  }

  private async runInteractive(options: AgentRunOptions): Promise<AgentRunResult> {
    return new Promise((resolve) => {
      // Interactive mode: goose session with initial prompt
      // Goose doesn't have a direct --prompt flag for session, so we use the session command
      // and let the user interact
      const args: string[] = ["session"];

      // Add session name if provided or generate from task ID
      const sessionName = this.sessionName || options.taskId;
      if (sessionName) {
        args.push("-n", sessionName);
      }

      // Resume session if sessionId provided
      if (options.sessionId) {
        args.push("--session-id", options.sessionId);
      }

      const proc = spawn("goose", args, {
        cwd: options.startingDirectory,
        stdio: "inherit",
      });

      proc.on("error", (error) => {
        resolve({
          success: false,
          output: "",
          error: `Failed to spawn goose: ${error.message}`,
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
    return new Promise((resolve) => {
      // Streaming mode: goose run -t "prompt" --output-format stream-json
      const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`;
      const args: string[] = ["run", "-t", fullPrompt, "--output-format", "stream-json"];

      // Add session name if provided or generate from task ID
      const sessionName = this.sessionName || options.taskId;
      if (sessionName) {
        args.push("-n", sessionName);
      }

      // Resume session if sessionId provided
      if (options.sessionId) {
        // For run command, we can use --session-id to continue a session
        // Note: goose run may not support session resume directly, but we include it
        // in case the CLI adds support
        args.push("--session-id", options.sessionId);
      }

      const proc = spawn("goose", args, {
        cwd: options.startingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const now = Date.now();
      let lastActivity = now;
      let sessionId: string | undefined;
      let buffer = "";
      const outputAccumulator = { value: "" };
      const errorAccumulator = { value: "" };
      let timedOut = false;

      // Track session for interjection support
      const session: GooseRunningSession = {
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
          const event: GooseStreamEvent = JSON.parse(line);
          lastActivity = Date.now();
          session.lastActivity = lastActivity;

          // Capture session ID for resume support
          if (event.session_id) {
            sessionId = event.session_id;
            session.sessionId = sessionId;
          }

          // Notify listener
          if (this.onEvent) {
            this.onEvent(event);
          }

          // Stream human-readable output and accumulate text output
          if (this.streamOutput) {
            this.renderEvent(event, outputAccumulator, errorAccumulator);
          } else {
            // Even when not streaming, we need to accumulate text from assistant events
            this.extractTextFromEvent(event, outputAccumulator);
            // Still capture errors even when not streaming
            if (event.type === "error") {
              errorAccumulator.value = event.error || "unknown error";
            }
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
          error: `Failed to spawn goose: ${error.message}`,
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
        const hasError = timedOut || exitCode !== 0 || errorAccumulator.value;
        resolve({
          success: !hasError,
          output: outputAccumulator.value,
          error: timedOut
            ? "Agent timed out due to inactivity"
            : errorAccumulator.value || (exitCode !== 0 ? `Process exited with code ${exitCode}` : undefined),
          sessionId,
        });
      });

      // Close stdin - prompt is passed as CLI argument
      proc.stdin?.end();
    });
  }

  private renderEvent(
    event: GooseStreamEvent,
    outputAccumulator?: { value: string },
    errorAccumulator?: { value: string }
  ): void {
    switch (event.type) {
      case "assistant":
      case "message": {
        // Handle assistant text content
        if (typeof event.content === "string" && event.content) {
          process.stdout.write(event.content);
          if (outputAccumulator) {
            outputAccumulator.value += event.content;
          }
        }
        // Handle message content blocks if present
        if (event.message?.content) {
          if (typeof event.message.content === "string") {
            process.stdout.write(event.message.content);
            if (outputAccumulator) {
              outputAccumulator.value += event.message.content;
            }
          } else if (Array.isArray(event.message.content)) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                process.stdout.write(block.text);
                if (outputAccumulator) {
                  outputAccumulator.value += block.text;
                }
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
      case "done":
      case "finish": {
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
        const errorMessage = event.error || "unknown error";
        process.stdout.write(`\n${chalk.red(`[ERROR: ${errorMessage}]`)}\n`);
        if (errorAccumulator) {
          errorAccumulator.value = errorMessage;
        }
        break;
      }

      case "session": {
        // Session info
        if (event.session_id) {
          process.stdout.write(`[session: ${event.session_id}]\n`);
        }
        break;
      }
    }
  }

  /**
   * Extract text from event without writing to stdout (for non-streaming mode)
   */
  private extractTextFromEvent(event: GooseStreamEvent, outputAccumulator: { value: string }): void {
    switch (event.type) {
      case "assistant":
      case "message": {
        if (typeof event.content === "string" && event.content) {
          outputAccumulator.value += event.content;
        }
        if (event.message?.content) {
          if (typeof event.message.content === "string") {
            outputAccumulator.value += event.message.content;
          } else if (Array.isArray(event.message.content)) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                outputAccumulator.value += block.text;
              }
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
