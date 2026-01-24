import { type ChildProcess, spawn } from "node:child_process";
import chalk from "chalk";
import { createLogger } from "../logger";
import type { Agent, AgentConfig, AgentRunOptions, AgentRunResult, AgentSession } from "./core";

const logger = createLogger("cline-provider");

// =============================================================================
// Cline Provider Options
// =============================================================================
//
// Cline-specific options extending AgentConfig:
// - mode: Plan mode (default) creates plan before acting, Act mode executes directly
// - yolo: Skip all approval prompts in Act mode
// - clineMode: Override the Cline mode ("plan" or "act")
//
// Cline has task-based session management instead of session IDs.
// =============================================================================

/**
 * Cline-specific execution mode.
 * - "plan": Creates a detailed plan before acting (default)
 * - "act": Executes directly without planning phase
 */
export type ClineMode = "plan" | "act";

/**
 * Stream event from Cline's JSON output (-F json).
 */
export interface ClineStreamEvent {
  type: string;
  subtype?: string;
  content?: string;
  tool_name?: string;
  tool_input?: unknown;
  task_id?: string;
  message?: { content?: Array<{ type: string; text?: string }> };
  error?: { message?: string };
  status?: string;
  [key: string]: unknown;
}

export interface ClineProviderOptions extends AgentConfig {
  /**
   * @deprecated Use `mode` instead. Will be removed in future version.
   */
  interactive?: boolean;
  /**
   * PROVIDER-SPECIFIC: Cline's plan/act mode.
   * - "plan": Creates plan and waits for approval (default)
   * - "act": Executes directly without planning
   */
  clineMode?: ClineMode;
  /**
   * PROVIDER-SPECIFIC: Skip all approval prompts (--yolo flag).
   * Only applies in Act mode. Default: true for non-interactive.
   */
  yolo?: boolean;
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
  onEvent?: (event: ClineStreamEvent) => void;
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
   * Enable verbose mode for additional event detail.
   */
  verbose?: boolean;
}

// =============================================================================
// Running Session (for interjection support)
// =============================================================================

export interface ClineRunningSession extends AgentSession {
  /** Cline child process - needed for interjection */
  proc: ChildProcess;
  /** Cline task ID for resume support */
  taskId?: string;
}

// Track active sessions for interjection by agent name
const activeSessions = new Map<string, ClineRunningSession>();

/**
 * Get an active session by agent name.
 * This is a module-level function for cross-instance access.
 */
export function getActiveClineSession(agentName: string): ClineRunningSession | undefined {
  return activeSessions.get(agentName);
}

/**
 * Interject (kill) an active session by agent name.
 * Returns the session that was interjected, or undefined if not found.
 */
export function interjectClineSession(agentName: string): ClineRunningSession | undefined {
  const session = activeSessions.get(agentName);
  if (session) {
    logger.info(`Interjecting Cline session for ${agentName}`);
    try {
      session.proc.kill("SIGTERM");
    } catch {}
    activeSessions.delete(agentName);
  }
  return session;
}

// =============================================================================
// Cline Agent Provider
// =============================================================================

export class ClineAgentProvider implements Agent {
  private mode: "interactive" | "streaming";
  private clineMode: ClineMode;
  private yolo: boolean;
  private streamOutput: boolean;
  private activityTimeoutMs: number;
  private heartbeatIntervalMs: number;
  private onEvent?: (event: ClineStreamEvent) => void;
  private onHeartbeat?: (lastActivityMs: number) => void;
  private onTimeout?: () => void;
  private currentAgentName?: string;
  private model?: string;
  private verbose: boolean;

  constructor(options: ClineProviderOptions = {}) {
    // Support both new `mode` and deprecated `interactive` option
    if (options.mode !== undefined) {
      this.mode = options.mode;
    } else {
      this.mode = options.interactive ? "interactive" : "streaming";
    }
    this.clineMode = options.clineMode ?? "act"; // Default to act for autonomous execution
    this.yolo = options.yolo ?? true;
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
   */
  getActiveSession(): AgentSession | undefined {
    if (this.currentAgentName) {
      return activeSessions.get(this.currentAgentName);
    }
    return undefined;
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    this.currentAgentName = options.agentName;

    // Check if Cline CLI is available
    const clineCheck = await this.checkClineAvailable();
    if (!clineCheck.available) {
      return {
        success: false,
        output: "",
        error: clineCheck.error,
      };
    }

    return this.mode === "interactive" ? this.runInteractive(options) : this.runStreaming(options);
  }

  /**
   * Check if Cline CLI is available and the gRPC service is running.
   */
  private async checkClineAvailable(): Promise<{ available: boolean; error?: string }> {
    return new Promise((resolve) => {
      // First check if cline CLI exists
      const proc = spawn("cline", ["--version"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stderr = "";

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("error", (error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          resolve({
            available: false,
            error: "Cline CLI not found. Install with: npm install -g cline",
          });
        } else {
          resolve({
            available: false,
            error: `Failed to check Cline CLI: ${error.message}`,
          });
        }
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          // Check if the error is about gRPC service not running
          if (stderr.includes("gRPC") || stderr.includes("ECONNREFUSED") || stderr.includes("service")) {
            resolve({
              available: false,
              error:
                "Cline Core gRPC service is not running. Start it with: cline-core start (or ensure the Cline VS Code extension is running)",
            });
          } else {
            resolve({
              available: false,
              error: stderr || `Cline CLI exited with code ${code}`,
            });
          }
        } else {
          resolve({ available: true });
        }
      });
    });
  }

  private async runInteractive(options: AgentRunOptions): Promise<AgentRunResult> {
    return new Promise((resolve) => {
      const args = this.buildInteractiveArgs(options);

      const proc = spawn("cline", args, {
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
      const args = this.buildStreamingArgs(options);

      const proc = spawn("cline", args, {
        cwd: options.startingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const now = Date.now();
      let lastActivity = now;
      let taskId: string | undefined;
      let buffer = "";
      const outputAccumulator = { value: "" };
      let timedOut = false;
      let serviceError = false;
      let errorMessage = "";

      // Track session for interjection support
      const session: ClineRunningSession = {
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
          const event: ClineStreamEvent = JSON.parse(line);
          lastActivity = Date.now();
          session.lastActivity = lastActivity;

          // Capture task ID for resume support
          if (event.task_id) {
            taskId = event.task_id;
            session.taskId = taskId;
          }

          // Check for service errors
          if (event.type === "error") {
            const errorObj = event.error as { message?: string } | undefined;
            const msg = errorObj?.message || (event.content as string) || "unknown error";
            if (msg.includes("gRPC") || msg.includes("ECONNREFUSED") || msg.includes("service")) {
              serviceError = true;
              errorMessage =
                "Cline Core gRPC service is not running. Start it with: cline-core start (or ensure the Cline VS Code extension is running)";
            } else {
              errorMessage = msg;
            }
          }

          // Notify listener
          if (this.onEvent) {
            this.onEvent(event);
          }

          // Stream human-readable output and accumulate text
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
        const chunk = data.toString();

        // Check for service connection errors
        if (chunk.includes("gRPC") || chunk.includes("ECONNREFUSED") || chunk.includes("connect")) {
          serviceError = true;
          errorMessage =
            "Cline Core gRPC service is not running. Start it with: cline-core start (or ensure the Cline VS Code extension is running)";
        }

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
          sessionId: taskId,
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
        const success = !timedOut && !serviceError && exitCode === 0;

        resolve({
          success,
          output: outputAccumulator.value,
          error: timedOut
            ? "Agent timed out due to inactivity"
            : serviceError
              ? errorMessage
              : errorMessage || undefined,
          sessionId: taskId,
        });
      });

      // Close stdin - prompt is passed as CLI argument
      proc.stdin?.end();
    });
  }

  /**
   * Format spawn error with helpful installation message.
   */
  private formatSpawnError(error: Error): string {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "Cline CLI not found. Install with: npm install -g cline";
    }
    return `Failed to spawn cline: ${error.message}`;
  }

  private renderEvent(event: ClineStreamEvent, outputAccumulator?: { value: string }): void {
    switch (event.type) {
      case "assistant": {
        // Handle assistant messages with content array
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
        } else if (event.content) {
          // Fallback to direct content
          process.stdout.write(event.content);
          if (outputAccumulator) {
            outputAccumulator.value += event.content;
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

      case "plan": {
        // Cline-specific: Plan output
        process.stdout.write(`\n${chalk.blue("[PLAN]")}\n`);
        if (event.content) {
          process.stdout.write(event.content);
          process.stdout.write("\n");
          if (outputAccumulator) {
            outputAccumulator.value += event.content;
          }
        }
        break;
      }

      case "plan_approval": {
        // Cline-specific: Waiting for plan approval
        process.stdout.write(`${chalk.yellow("[WAITING FOR APPROVAL]")} Plan requires approval to proceed\n`);
        break;
      }

      case "result": {
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
        const errorObj = event.error as { message?: string } | undefined;
        const errorMessage = errorObj?.message || (event.content as string) || "unknown error";
        process.stdout.write(`\n${chalk.red(`[ERROR: ${errorMessage}]`)}\n`);
        break;
      }

      case "system":
        this.renderSystemEvent(event);
        break;

      case "task_created": {
        // Cline-specific: New task created
        if (event.task_id) {
          process.stdout.write(`${chalk.green(`[task: ${event.task_id}]`)}\n`);
        }
        break;
      }

      case "task_resumed": {
        // Cline-specific: Task resumed
        if (event.task_id) {
          process.stdout.write(`${chalk.green(`[resumed: ${event.task_id}]`)}\n`);
        }
        break;
      }
    }
  }

  private renderSystemEvent(event: ClineStreamEvent): void {
    switch (event.subtype) {
      case "init":
        if (event.task_id) {
          process.stdout.write(`[task: ${event.task_id}]\n`);
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

      default:
        if (this.verbose && event.subtype) {
          logger.debug(`Unhandled system subtype: ${event.subtype}`, event);
        }
        break;
    }
  }

  /**
   * Extract text from event without writing to stdout (for non-streaming mode)
   */
  private extractTextFromEvent(event: ClineStreamEvent, outputAccumulator: { value: string }): void {
    switch (event.type) {
      case "assistant": {
        const message = event.message as { content?: Array<{ type: string; text?: string }> } | undefined;
        if (message?.content) {
          for (const block of message.content) {
            if (block.type === "text" && block.text) {
              outputAccumulator.value += block.text;
            }
          }
        } else if (event.content) {
          outputAccumulator.value += event.content;
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

      case "plan":
        if (event.content) {
          outputAccumulator.value += event.content;
        }
        break;
    }
  }

  private buildInteractiveArgs(options: AgentRunOptions): string[] {
    // Interactive mode: just run cline with the prompt (no --yolo)
    const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`;
    const args: string[] = [fullPrompt];

    return args;
  }

  private buildStreamingArgs(options: AgentRunOptions): string[] {
    // New Cline CLI: cline "prompt" [--yolo]
    const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`;
    const args: string[] = [fullPrompt];

    // Skip approvals with --yolo
    if (this.yolo) {
      args.push("--yolo");
    }

    // JSON output for parsing
    args.push("-F", "json");

    return args;
  }
}
