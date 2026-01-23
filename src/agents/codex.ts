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
  subtype?: string;
  content?: string;
  message?: string;
  tool_name?: string;
  tool_input?: unknown;
  session_id?: string;
  result?: unknown;
  cost_usd?: number;
  duration_ms?: number;
  [key: string]: unknown;
}

// =============================================================================
// Provider Options (Codex-specific)
// =============================================================================
//
// These options extend the generic AgentConfig with Codex-specific features:
// - approvalMode: Codex's --approval-mode flag (suggest, auto-edit, full-auto)
// - sandbox: Codex's sandbox mode configuration
// - search: Enable web search capability
// - outputSchema: JSON schema for structured output enforcement
//
// =============================================================================

export type CodexApprovalMode = "suggest" | "auto-edit" | "full-auto";

export interface CodexProviderOptions extends AgentConfig {
  /**
   * @deprecated Use `mode` instead. Will be removed in future version.
   */
  interactive?: boolean;
  /**
   * PROVIDER-SPECIFIC: Approval mode for Codex.
   * - 'suggest': All actions require approval (default)
   * - 'auto-edit': File writes auto-approved, shell commands need approval
   * - 'full-auto': All actions auto-approved (sandboxed)
   * Maps to --approval-mode flag.
   */
  approvalMode?: CodexApprovalMode;
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
  /** Model to use. If not specified, uses Codex CLI default. */
  model?: string;
  /**
   * PROVIDER-SPECIFIC: Enable web search capability.
   * Maps to --search flag if supported.
   */
  enableSearch?: boolean;
  /**
   * PROVIDER-SPECIFIC: JSON schema for structured output.
   * Codex can enforce output format via --output-schema.
   * Pass a JSON schema object or a path to a schema file.
   */
  outputSchema?: Record<string, unknown> | string;
  /**
   * Enable verbose mode for additional event detail.
   */
  verbose?: boolean;
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
// Session Fork Support (Unique to Codex)
// =============================================================================

export interface ForkResult {
  success: boolean;
  newSessionId?: string;
  error?: string;
}

/**
 * Fork an existing Codex session to create a new branch.
 * This allows exploring alternative approaches from a checkpoint.
 *
 * @param sessionId - The session ID to fork from
 * @param workingDirectory - Working directory for the fork operation
 * @returns Promise with the new session ID or error
 */
export async function forkCodexSession(sessionId: string, workingDirectory: string): Promise<ForkResult> {
  return new Promise((resolve) => {
    // Codex fork command creates a new session branched from an existing one
    // Note: This is a placeholder - actual fork command syntax may vary
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
        error: `Failed to fork session: ${error.message}`,
      });
    });

    proc.on("close", (code) => {
      if (code === 0) {
        // Try to extract new session ID from output
        // Expected format may vary - adjust parsing as needed
        const sessionMatch = stdout.match(/session[_-]?id[:\s]+([a-zA-Z0-9_-]+)/i);
        const newSessionId = sessionMatch?.[1] || `forked-${sessionId}-${Date.now()}`;
        resolve({
          success: true,
          newSessionId,
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

// =============================================================================
// Codex Agent Provider
// =============================================================================

export class CodexAgentProvider implements Agent {
  private mode: "interactive" | "streaming";
  private approvalMode: CodexApprovalMode;
  private streamOutput: boolean;
  private activityTimeoutMs: number;
  private heartbeatIntervalMs: number;
  private onEvent?: (event: CodexStreamEvent) => void;
  private onHeartbeat?: (lastActivityMs: number) => void;
  private onTimeout?: () => void;
  private currentAgentName?: string;
  private model?: string;
  private enableSearch: boolean;
  private outputSchema?: Record<string, unknown> | string;
  private verbose: boolean;

  constructor(options: CodexProviderOptions = {}) {
    // Support both new `mode` and deprecated `interactive` option
    if (options.mode !== undefined) {
      this.mode = options.mode;
    } else {
      this.mode = options.interactive ? "interactive" : "streaming";
    }
    this.approvalMode = options.approvalMode ?? "full-auto";
    this.streamOutput = options.streamOutput ?? true;
    this.activityTimeoutMs = options.activityTimeoutMs ?? 600_000; // 10 min
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000; // 10s
    this.onEvent = options.onEvent;
    this.onHeartbeat = options.onHeartbeat;
    this.onTimeout = options.onTimeout;
    this.model = options.model;
    this.enableSearch = options.enableSearch ?? false;
    this.outputSchema = options.outputSchema;
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

      const proc = spawn("codex", args, {
        cwd: options.startingDirectory,
        stdio: "inherit",
      });

      const now = Date.now();

      // Track session for monitoring (though interactive mode doesn't capture output)
      if (options.agentName) {
        const session: CodexRunningSession = {
          proc,
          startTime: now,
          lastActivity: now,
          taskId: options.taskId,
          agentName: options.agentName,
          workingDirectory: options.startingDirectory,
        };
        activeSessions.set(options.agentName, session);
      }

      proc.on("error", (error) => {
        if (options.agentName) {
          activeSessions.delete(options.agentName);
        }
        resolve({
          success: false,
          output: "",
          error: `Failed to spawn codex: ${error.message}`,
        });
      });

      proc.on("close", (code) => {
        if (options.agentName) {
          activeSessions.delete(options.agentName);
        }
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

      const proc = spawn("codex", args, {
        cwd: options.startingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const now = Date.now();
      let lastActivity = now;
      let sessionId: string | undefined = options.sessionId;
      let buffer = "";
      const outputAccumulator = { value: "" };
      let timedOut = false;

      // Track session for interjection support
      const session: CodexRunningSession = {
        proc,
        sessionId,
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
            this.renderEvent(event, outputAccumulator);
          } else {
            // Even when not streaming, we need to accumulate text from events
            this.extractTextFromEvent(event, outputAccumulator);
          }
        } catch {
          // Not JSON, output raw and accumulate as text
          if (this.streamOutput) {
            process.stdout.write(line);
          }
          outputAccumulator.value += line;
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
          error: `Failed to spawn codex: ${error.message}`,
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
          error: timedOut ? "Agent timed out due to inactivity" : undefined,
          sessionId,
        });
      });

      // Close stdin to signal end of input
      proc.stdin?.end();
    });
  }

  private renderEvent(event: CodexStreamEvent, outputAccumulator?: { value: string }): void {
    switch (event.type) {
      case "message":
      case "assistant": {
        // Handle text content from assistant messages
        const content = event.content || event.message;
        if (typeof content === "string") {
          process.stdout.write(content);
          if (outputAccumulator) {
            outputAccumulator.value += content;
          }
        }
        // Handle structured message content (array of blocks)
        const message = event.message as { content?: Array<{ type: string; text?: string }> } | string | undefined;
        if (message && typeof message === "object" && message.content) {
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
      case "function_call":
        // Format tool name in cyan for visibility
        process.stdout.write(`\n${chalk.cyan(`[tool: ${event.tool_name || event.name}]`)}\n`);
        break;

      case "tool_result":
      case "function_result": {
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

      case "result":
      case "complete": {
        // Show cost and duration if available
        const cost = event.cost_usd ?? event.total_cost_usd;
        const durationMs = event.duration_ms;

        if (typeof cost === "number") {
          process.stdout.write(`\n[cost: $${cost.toFixed(4)}]\n`);
        }
        if (typeof durationMs === "number") {
          const durationSec = (durationMs / 1000).toFixed(1);
          process.stdout.write(`[duration: ${durationSec}s]\n`);
        }
        break;
      }

      case "error": {
        const errorMessage = event.message || event.content || "unknown error";
        process.stdout.write(`\n${chalk.red(`[ERROR: ${errorMessage}]`)}\n`);
        break;
      }

      case "system":
      case "init":
        this.renderSystemEvent(event);
        break;
    }
  }

  /**
   * Render system event subtypes
   */
  private renderSystemEvent(event: CodexStreamEvent): void {
    switch (event.subtype || event.type) {
      case "init":
        // Display session and model info
        if (event.session_id) {
          process.stdout.write(`[session: ${event.session_id}]\n`);
        }
        if (event.model) {
          process.stdout.write(`[model: ${event.model}]\n`);
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
  private extractTextFromEvent(event: CodexStreamEvent, outputAccumulator: { value: string }): void {
    switch (event.type) {
      case "message":
      case "assistant": {
        const content = event.content || event.message;
        if (typeof content === "string") {
          outputAccumulator.value += content;
        }
        const message = event.message as { content?: Array<{ type: string; text?: string }> } | string | undefined;
        if (message && typeof message === "object" && message.content) {
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
    // Interactive mode: codex runs in TUI/REPL mode
    const args: string[] = [];

    // Set approval mode
    if (this.approvalMode) {
      args.push("--approval-mode", this.approvalMode);
    }

    // Set model if specified
    if (this.model) {
      args.push("--model", this.model);
    }

    // Session resume - if sessionId provided, we're resuming
    // Note: Codex may use different syntax for resume
    if (options.sessionId) {
      args.push("--resume", options.sessionId);
    }

    // Prepend system prompt to user prompt since Codex doesn't have --append-system-prompt
    // The prompt is passed as the initial message
    const fullPrompt = options.systemPrompt ? `${options.systemPrompt}\n\n${options.prompt}` : options.prompt;

    if (fullPrompt) {
      args.push(fullPrompt);
    }

    return args;
  }

  private buildStreamingArgs(options: AgentRunOptions): string[] {
    // Streaming/quiet mode: codex -q --json for non-interactive execution
    const args: string[] = ["-q", "--json"];

    // Set approval mode (full-auto for autonomous execution)
    if (this.approvalMode) {
      args.push("--approval-mode", this.approvalMode);
    }

    // Set model if specified
    if (this.model) {
      args.push("--model", this.model);
    }

    // Session resume
    if (options.sessionId) {
      args.push("--resume", options.sessionId);
    }

    // Output schema for structured output enforcement (unique to Codex)
    if (this.outputSchema) {
      if (typeof this.outputSchema === "string") {
        // Path to schema file
        args.push("--output-schema", this.outputSchema);
      } else {
        // Inline JSON schema - write to temp file or pass as JSON string
        // For now, pass as JSON string (CLI may support this)
        args.push("--output-schema", JSON.stringify(this.outputSchema));
      }
    }

    // Prepend system prompt to user prompt
    const fullPrompt = options.systemPrompt ? `${options.systemPrompt}\n\n${options.prompt}` : options.prompt;

    args.push(fullPrompt);

    return args;
  }
}
