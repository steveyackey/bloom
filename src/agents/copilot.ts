import { type ChildProcess, spawn } from "node:child_process";
import chalk from "chalk";
import { createLogger } from "../logger";
import type { Agent, AgentConfig, AgentRunOptions, AgentRunResult, AgentSession } from "./core";

const logger = createLogger("copilot-provider");

// =============================================================================
// Stream JSON Event Types (from copilot --output json)
// =============================================================================

export interface CopilotStreamEvent {
  type: string;
  timestamp?: number;
  sessionID?: string;
  content?: string;
  tool_name?: string;
  tool_input?: unknown;
  message?: { content?: Array<{ type: string; text?: string }> };
  error?: { message?: string };
  [key: string]: unknown;
}

// =============================================================================
// Provider-Specific Options (Copilot)
// =============================================================================
//
// GitHub Copilot CLI supports multiple models (Claude, GPT, Gemini) and has
// fine-grained tool permissions via --allow-tool and --deny-tool flags.
// Has native GitHub MCP integration.
// =============================================================================

export interface CopilotProviderOptions extends AgentConfig {
  /**
   * @deprecated Use `mode` instead. Will be removed in future version.
   */
  interactive?: boolean;
  /**
   * PROVIDER-SPECIFIC: Auto-approve all tool calls.
   * Default: true for non-interactive mode.
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
   * Only applies in streaming mode.
   */
  onEvent?: (event: CopilotStreamEvent) => void;
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
   * PROVIDER-SPECIFIC: Tools to explicitly allow.
   * Maps to --allow-tool flags.
   */
  allowedTools?: string[];
  /**
   * PROVIDER-SPECIFIC: Tools to explicitly deny.
   * Maps to --deny-tool flags.
   */
  deniedTools?: string[];
  /**
   * Model to use (supports Claude, GPT, Gemini variants).
   */
  model?: string;
}

// =============================================================================
// Running Session (for interjection support)
// =============================================================================

export interface CopilotRunningSession extends AgentSession {
  /** Copilot child process - needed for interjection */
  proc: ChildProcess;
}

// Track active sessions for interjection by agent name
const activeSessions = new Map<string, CopilotRunningSession>();

/**
 * Get an active session by agent name.
 * This is a module-level function for cross-instance access.
 */
export function getActiveCopilotSession(agentName: string): CopilotRunningSession | undefined {
  return activeSessions.get(agentName);
}

/**
 * Interject (kill) an active session by agent name.
 * Returns the session that was interjected, or undefined if not found.
 */
export function interjectCopilotSession(agentName: string): CopilotRunningSession | undefined {
  const session = activeSessions.get(agentName);
  if (session) {
    logger.info(`Interjecting Copilot session for ${agentName}`);
    try {
      session.proc.kill("SIGTERM");
    } catch {}
    activeSessions.delete(agentName);
  }
  return session;
}

// =============================================================================
// Copilot Agent Provider
// =============================================================================

export class CopilotAgentProvider implements Agent {
  private mode: "interactive" | "streaming";
  private autoApprove: boolean;
  private model: string | undefined;
  private streamOutput: boolean;
  private activityTimeoutMs: number;
  private heartbeatIntervalMs: number;
  private onEvent?: (event: CopilotStreamEvent) => void;
  private onHeartbeat?: (lastActivityMs: number) => void;
  private onTimeout?: () => void;
  private allowedTools?: string[];
  private deniedTools?: string[];
  private currentAgentName?: string;

  constructor(options: CopilotProviderOptions = {}) {
    // Support both new `mode` and deprecated `interactive` option
    if (options.mode !== undefined) {
      this.mode = options.mode;
    } else {
      this.mode = options.interactive ? "interactive" : "streaming";
    }
    this.autoApprove = options.autoApprove ?? true;
    this.model = options.model;
    this.streamOutput = options.streamOutput ?? true;
    this.activityTimeoutMs = options.activityTimeoutMs ?? 600_000; // 10 min
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000; // 10s
    this.onEvent = options.onEvent;
    this.onHeartbeat = options.onHeartbeat;
    this.onTimeout = options.onTimeout;
    this.allowedTools = options.allowedTools;
    this.deniedTools = options.deniedTools;
  }

  /**
   * Get the currently active session for this agent instance.
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
      // Interactive mode: gh copilot chat "prompt"
      // Note: System prompt must be prepended to user prompt (no separate system prompt support)
      const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`;
      const args = ["copilot", "chat", fullPrompt];

      // Add model if specified
      if (this.model) {
        args.push("--model", this.model);
      }

      // Add session resume if provided
      if (options.sessionId) {
        args.push("--resume", options.sessionId);
      }

      const proc = spawn("gh", args, {
        cwd: options.startingDirectory,
        stdio: "inherit",
      });

      proc.on("error", (error) => {
        resolve({
          success: false,
          output: "",
          error: this.formatSpawnError(error),
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
      // Streaming: gh copilot chat --output json "prompt"
      const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`;
      const args: string[] = ["copilot", "chat", "--output", "json"];

      // Add model if specified
      if (this.model) {
        args.push("--model", this.model);
      }

      // Add session resume if provided
      if (options.sessionId) {
        args.push("--resume", options.sessionId);
      }

      // Add tool permissions
      if (this.allowedTools) {
        for (const tool of this.allowedTools) {
          args.push("--allow-tool", tool);
        }
      }
      if (this.deniedTools) {
        for (const tool of this.deniedTools) {
          args.push("--deny-tool", tool);
        }
      }

      args.push(fullPrompt);

      const proc = spawn("gh", args, {
        cwd: options.startingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const now = Date.now();
      let lastActivity = now;
      let sessionId: string | undefined;
      let buffer = "";
      const outputAccumulator = { value: "" };
      let timedOut = false;

      // Track session for interjection support
      const session: CopilotRunningSession = {
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
          const event: CopilotStreamEvent = JSON.parse(line);
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
          error: this.formatSpawnError(error),
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
   * Format spawn error with helpful installation message.
   */
  private formatSpawnError(error: Error): string {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "GitHub CLI (gh) not found. Install from: https://cli.github.com/";
    }
    return `Failed to spawn gh: ${error.message}`;
  }

  /**
   * Render Copilot stream event to human-readable output.
   */
  private renderEvent(event: CopilotStreamEvent, outputAccumulator?: { value: string }): void {
    switch (event.type) {
      case "assistant": {
        const content = event.content as string | undefined;
        if (content) {
          process.stdout.write(content);
          if (outputAccumulator) {
            outputAccumulator.value += content;
          }
        }
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
        process.stdout.write(`\n${chalk.cyan(`[tool: ${event.tool_name || event.name || "unknown"}]`)}\n`);
        break;

      case "tool_result":
      case "tool_response":
        process.stdout.write(`${chalk.dim("[result]")}\n`);
        break;

      case "result":
      case "done": {
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
        const errorObj = event.error as { message?: string } | undefined;
        const errorMessage = errorObj?.message || "unknown error";
        process.stdout.write(`\n${chalk.red(`[ERROR: ${errorMessage}]`)}\n`);
        break;
      }

      case "session": {
        if (event.sessionID) {
          process.stdout.write(`[session: ${event.sessionID}]\n`);
        }
        break;
      }
    }
  }

  /**
   * Extract text from event without writing to stdout (for non-streaming mode).
   */
  private extractTextFromEvent(event: CopilotStreamEvent, outputAccumulator: { value: string }): void {
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
