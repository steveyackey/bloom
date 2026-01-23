import { type ChildProcess, spawn } from "node:child_process";
import chalk from "chalk";
import { createLogger } from "../logger";
import type { Agent, AgentConfig, AgentRunOptions, AgentRunResult, AgentSession } from "./core";

const logger = createLogger("codex-provider");

// =============================================================================
// Stream JSON Event Types (from codex --json)
// =============================================================================

export interface CodexStreamEvent {
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
// Provider-Specific Options (Codex)
// =============================================================================
//
// OpenAI Codex CLI supports session forking, structured output via JSON schemas,
// and different sandbox levels for file system access.
// =============================================================================

export interface CodexProviderOptions extends AgentConfig {
  /**
   * @deprecated Use `mode` instead. Will be removed in future version.
   */
  interactive?: boolean;
  /**
   * PROVIDER-SPECIFIC: Full auto-approve mode.
   * Maps to --full-auto flag for autonomous execution.
   */
  fullAuto?: boolean;
  /**
   * PROVIDER-SPECIFIC: Sandbox level for file system access.
   * - "off": No sandbox restrictions
   * - "read": Read-only access
   * - "write": Full file system access
   * Default: "write"
   */
  sandbox?: "off" | "read" | "write";
  /**
   * PROVIDER-SPECIFIC: Output schema for structured output.
   * JSON schema that enforces the output format.
   */
  outputSchema?: object;
  /**
   * PROVIDER-SPECIFIC: Enable web search capability.
   * Maps to --search flag.
   */
  enableSearch?: boolean;
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
  onEvent?: (event: CodexStreamEvent) => void;
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
   * Model to use.
   */
  model?: string;
}

// =============================================================================
// Running Session (for interjection support)
// =============================================================================

export interface CodexRunningSession extends AgentSession {
  /** Codex child process - needed for interjection */
  proc: ChildProcess;
}

// Track active sessions for interjection by agent name
const activeSessions = new Map<string, CodexRunningSession>();

/**
 * Get an active session by agent name.
 * This is a module-level function for cross-instance access.
 */
export function getActiveCodexSession(agentName: string): CodexRunningSession | undefined {
  return activeSessions.get(agentName);
}

/**
 * Interject (kill) an active session by agent name.
 * Returns the session that was interjected, or undefined if not found.
 */
export function interjectCodexSession(agentName: string): CodexRunningSession | undefined {
  const session = activeSessions.get(agentName);
  if (session) {
    logger.info(`Interjecting Codex session for ${agentName}`);
    try {
      session.proc.kill("SIGTERM");
    } catch {}
    activeSessions.delete(agentName);
  }
  return session;
}

// =============================================================================
// Codex Agent Provider
// =============================================================================

export class CodexAgentProvider implements Agent {
  private mode: "interactive" | "streaming";
  private fullAuto: boolean;
  private sandbox: "off" | "read" | "write";
  private outputSchema?: object;
  private enableSearch: boolean;
  private model: string | undefined;
  private streamOutput: boolean;
  private activityTimeoutMs: number;
  private heartbeatIntervalMs: number;
  private onEvent?: (event: CodexStreamEvent) => void;
  private onHeartbeat?: (lastActivityMs: number) => void;
  private onTimeout?: () => void;
  private currentAgentName?: string;

  constructor(options: CodexProviderOptions = {}) {
    // Support both new `mode` and deprecated `interactive` option
    if (options.mode !== undefined) {
      this.mode = options.mode;
    } else {
      this.mode = options.interactive ? "interactive" : "streaming";
    }
    this.fullAuto = options.fullAuto ?? true;
    this.sandbox = options.sandbox ?? "write";
    this.outputSchema = options.outputSchema;
    this.enableSearch = options.enableSearch ?? false;
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
      // Interactive mode: codex "prompt"
      // Note: System prompt must be prepended to user prompt (no separate system prompt support)
      const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`;
      const args: string[] = [fullPrompt];

      // Add model if specified
      if (this.model) {
        args.push("--model", this.model);
      }

      // Add session resume if provided
      if (options.sessionId) {
        args.unshift("resume", "--session", options.sessionId);
      }

      // Add sandbox setting
      args.push("--sandbox", this.sandbox);

      const proc = spawn("codex", args, {
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
      // Streaming: codex --json "prompt"
      const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`;
      const args: string[] = ["--json"];

      // Add model if specified
      if (this.model) {
        args.push("--model", this.model);
      }

      // Add session resume if provided
      if (options.sessionId) {
        args.unshift("resume", "--session", options.sessionId);
      }

      // Add sandbox setting
      args.push("--sandbox", this.sandbox);

      // Add full auto mode
      if (this.fullAuto) {
        args.push("--full-auto");
      }

      // Add web search if enabled
      if (this.enableSearch) {
        args.push("--search");
      }

      // Add output schema if specified
      if (this.outputSchema) {
        args.push("--output-schema", JSON.stringify(this.outputSchema));
      }

      args.push(fullPrompt);

      const proc = spawn("codex", args, {
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
      const session: CodexRunningSession = {
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
          const event: CodexStreamEvent = JSON.parse(line);
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
      return "Codex CLI not found. Install from: https://github.com/openai/codex";
    }
    return `Failed to spawn codex: ${error.message}`;
  }

  /**
   * Render Codex stream event to human-readable output.
   */
  private renderEvent(event: CodexStreamEvent, outputAccumulator?: { value: string }): void {
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

      case "fork": {
        // Codex-specific: Session fork indicator
        const forkId = event.fork_id as string | undefined;
        if (forkId) {
          process.stdout.write(`${chalk.green(`[forked: ${forkId}]`)}\n`);
        }
        break;
      }
    }
  }

  /**
   * Extract text from event without writing to stdout (for non-streaming mode).
   */
  private extractTextFromEvent(event: CodexStreamEvent, outputAccumulator: { value: string }): void {
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

  /**
   * Fork an existing session to explore alternative approaches.
   * This is a Codex-specific capability.
   *
   * @param sessionId - The session ID to fork
   * @param workingDirectory - Directory to run the fork command in
   * @returns The new session ID for the forked session
   */
  async forkSession(
    sessionId: string,
    workingDirectory: string
  ): Promise<{ success: boolean; forkId?: string; error?: string }> {
    return new Promise((resolve) => {
      const args = ["fork", sessionId];

      const proc = spawn("codex", args, {
        cwd: workingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("error", (error) => {
        resolve({
          success: false,
          error: this.formatSpawnError(error),
        });
      });

      proc.on("close", (code) => {
        if (code === 0) {
          // Try to parse the fork ID from output
          const match = stdout.match(/forked.*?([a-f0-9-]+)/i) || stdout.match(/([a-f0-9-]{36})/);
          resolve({
            success: true,
            forkId: match?.[1] || stdout.trim(),
          });
        } else {
          resolve({
            success: false,
            error: stderr || `Fork failed with exit code ${code}`,
          });
        }
      });
    });
  }
}
