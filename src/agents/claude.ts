import { type ChildProcess, spawn } from "node:child_process";
import chalk from "chalk";
import { createLogger } from "../logger";
import type { Agent, AgentConfig, AgentRunOptions, AgentRunResult, AgentSession } from "./core";

const logger = createLogger("claude-provider");

// =============================================================================
// Stream JSON Event Types (from claude --output-format stream-json)
// =============================================================================

export interface StreamEvent {
  type: string;
  subtype?: string;
  content?: string;
  tool_name?: string;
  tool_input?: unknown;
  session_id?: string;
  result?: unknown;
  cost_usd?: number;
  duration_ms?: number;
  [key: string]: unknown;
}

// =============================================================================
// Provider Options (Claude-specific)
// =============================================================================
//
// These options extend the generic AgentConfig with Claude-specific features:
// - dangerouslySkipPermissions: Claude's --dangerously-skip-permissions flag
// - activityTimeoutMs/heartbeatIntervalMs: Streaming mode monitoring
// - onEvent/onHeartbeat/onTimeout: Event callbacks for stream processing
//
// Note: Claude doesn't support model selection via CLI flags (uses configured model)
// =============================================================================

export interface ClaudeProviderOptions extends AgentConfig {
  /**
   * @deprecated Use `mode` instead. Will be removed in future version.
   */
  interactive?: boolean;
  /**
   * PROVIDER-SPECIFIC: Skip Claude's permission prompts.
   * Maps to --dangerously-skip-permissions flag.
   */
  dangerouslySkipPermissions?: boolean;
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
  onEvent?: (event: StreamEvent) => void;
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
  /** Model to use (e.g., 'claude-sonnet-4-20250514'). If not specified, uses Claude CLI default. */
  model?: string;
  /**
   * Enable verbose mode for additional event detail.
   * When true, shows hook_response events and detailed tool output.
   */
  verbose?: boolean;
}

// =============================================================================
// Running Session (for interjection support)
// =============================================================================
//
// RunningSession extends AgentSession with Claude-specific process tracking.
// The `proc` field is needed for interjection (killing the Claude process).
// =============================================================================

export interface RunningSession extends AgentSession {
  /** Claude child process - needed for interjection */
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
// Claude Agent Provider
// =============================================================================

export class ClaudeAgentProvider implements Agent {
  private mode: "interactive" | "streaming";
  private dangerouslySkipPermissions: boolean;
  private streamOutput: boolean;
  private activityTimeoutMs: number;
  private heartbeatIntervalMs: number;
  private onEvent?: (event: StreamEvent) => void;
  private onHeartbeat?: (lastActivityMs: number) => void;
  private onTimeout?: () => void;
  private currentAgentName?: string;
  private model?: string;
  private verbose: boolean;

  constructor(options: ClaudeProviderOptions = {}) {
    // Support both new `mode` and deprecated `interactive` option
    if (options.mode !== undefined) {
      this.mode = options.mode;
    } else {
      this.mode = options.interactive ? "interactive" : "streaming";
    }
    this.dangerouslySkipPermissions = options.dangerouslySkipPermissions ?? true;
    this.streamOutput = options.streamOutput ?? true;
    this.activityTimeoutMs = options.activityTimeoutMs ?? 600_000; // 10 min
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000; // 10s
    this.onEvent = options.onEvent;
    this.onHeartbeat = options.onHeartbeat;
    this.onTimeout = options.onTimeout;
    this.model = options.model;
    this.verbose = options.verbose ?? false;
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
      const args = this.buildInteractiveArgs(options);

      const proc = spawn("claude", args, {
        cwd: options.startingDirectory,
        stdio: "inherit",
      });

      proc.on("error", (error) => {
        resolve({
          success: false,
          output: "",
          error: `Failed to spawn claude: ${error.message}`,
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
      const args = this.buildStreamingArgs(options);
      args.push("--output-format", "stream-json");

      const proc = spawn("claude", args, {
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
          const event: StreamEvent = JSON.parse(line);
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
              const errorObj = event.error as { message?: string } | undefined;
              errorAccumulator.value = errorObj?.message || "unknown error";
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
          error: `Failed to spawn claude: ${error.message}`,
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
    event: StreamEvent,
    outputAccumulator?: { value: string },
    errorAccumulator?: { value: string }
  ): void {
    switch (event.type) {
      case "assistant": {
        // Claude CLI sends message.content as an array of content blocks
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

      case "tool_use":
        // Format tool name in cyan for visibility
        process.stdout.write(`\n${chalk.cyan(`[tool: ${event.tool_name}]`)}\n`);
        break;

      case "tool_result": {
        // Show result indicator in dim, with optional content in verbose mode
        const content = event.content as string | undefined;
        if (this.verbose && content) {
          // In verbose mode, show truncated content
          const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
          process.stdout.write(`${chalk.dim("[result]")} ${truncated}\n`);
        } else {
          process.stdout.write(`${chalk.dim("[result]")}\n`);
        }
        break;
      }

      case "result": {
        // Claude CLI uses total_cost_usd NOT cost_usd
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
        // Claude CLI uses error.message NOT event.content
        const errorObj = event.error as { message?: string } | undefined;
        const errorMessage = errorObj?.message || "unknown error";
        process.stdout.write(`\n[ERROR: ${errorMessage}]\n`);
        // Capture error for result
        if (errorAccumulator) {
          errorAccumulator.value = errorMessage;
        }
        break;
      }

      case "system":
        this.renderSystemEvent(event);
        break;
    }
  }

  /**
   * Render system event subtypes
   */
  private renderSystemEvent(event: StreamEvent): void {
    switch (event.subtype) {
      case "init":
        // Display session and model info
        if (event.session_id) {
          process.stdout.write(`[session: ${event.session_id}]\n`);
        }
        if (event.model) {
          process.stdout.write(`[model: ${event.model}]\n`);
        }
        break;

      case "hook_started": {
        // Display hook name in dim
        const hookName = (event.hook_name as string) || (event.name as string) || "unknown";
        process.stdout.write(`${chalk.dim(`[hook: ${hookName}]`)}\n`);
        break;
      }

      case "hook_response":
        // Only log in verbose mode
        if (this.verbose) {
          const response = event.response as string | undefined;
          if (response) {
            process.stdout.write(`${chalk.dim(`[hook response: ${response}]`)}\n`);
          } else {
            process.stdout.write(`${chalk.dim("[hook response]")}\n`);
          }
        }
        break;

      default:
        // Log other system subtypes in verbose mode
        if (this.verbose && event.subtype) {
          logger.debug(`Unhandled system subtype: ${event.subtype}`, event);
        }
        break;
    }
  }

  /**
   * Extract text from event without writing to stdout (for non-streaming mode)
   */
  private extractTextFromEvent(event: StreamEvent, outputAccumulator: { value: string }): void {
    switch (event.type) {
      case "assistant": {
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
    }
  }

  private buildInteractiveArgs(options: AgentRunOptions): string[] {
    // Interactive mode: no -p flag, Claude runs in REPL mode
    const args: string[] = ["--verbose"];

    if (this.dangerouslySkipPermissions) {
      args.push("--dangerously-skip-permissions");
    }

    if (this.model) {
      args.push("--model", this.model);
    }

    args.push("--append-system-prompt", options.systemPrompt);

    // Add initial prompt so Claude starts with context instead of blank slate
    if (options.prompt) {
      args.push(options.prompt);
    }

    return args;
  }

  private buildStreamingArgs(options: AgentRunOptions): string[] {
    // Streaming/print mode: -p flag for single-shot execution
    const args: string[] = ["-p", "--verbose"];

    if (this.dangerouslySkipPermissions) {
      args.push("--dangerously-skip-permissions");
    }

    if (this.model) {
      args.push("--model", this.model);
    }

    // Resume previous session if sessionId provided
    if (options.sessionId) {
      args.push("--resume", options.sessionId);
    }

    args.push("--append-system-prompt", options.systemPrompt);
    args.push(options.prompt);

    return args;
  }
}
