import { type ChildProcess, spawn } from "node:child_process";
import chalk from "chalk";
import { createLogger } from "../logger";
import type { Agent, AgentConfig, AgentRunOptions, AgentRunResult, AgentSession } from "./core";

const logger = createLogger("copilot-provider");

// =============================================================================
// Stream JSON Event Types (from copilot streaming JSON output)
// =============================================================================

export interface CopilotStreamEvent {
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
// Provider Options (Copilot-specific)
// =============================================================================
//
// These options extend the generic AgentConfig with Copilot-specific features:
// - allowAllTools: Grant all tool permissions (--allow-all-tools)
// - allowTools/denyTools: Fine-grained tool permission control
// - Model selection: Claude, GPT-5, Gemini via --model flag
//
// =============================================================================

export interface CopilotProviderOptions extends AgentConfig {
  /**
   * @deprecated Use `mode` instead. Will be removed in future version.
   */
  interactive?: boolean;
  /**
   * PROVIDER-SPECIFIC: Allow all tools without permission prompts.
   * Maps to --allow-all-tools flag.
   */
  allowAllTools?: boolean;
  /**
   * PROVIDER-SPECIFIC: List of tools to explicitly allow.
   * Maps to --allow-tool flags.
   */
  allowTools?: string[];
  /**
   * PROVIDER-SPECIFIC: List of tools to explicitly deny.
   * Maps to --deny-tool flags.
   */
  denyTools?: string[];
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
   * Model to use (e.g., 'claude', 'gpt-5', 'gemini').
   * Copilot supports multi-model selection.
   */
  model?: string;
  /**
   * Enable verbose mode for additional event detail.
   */
  verbose?: boolean;
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
export function getCopilotActiveSession(agentName: string): CopilotRunningSession | undefined {
  return activeSessions.get(agentName);
}

/**
 * Interject (kill) an active session by agent name.
 * Returns the session that was interjected, or undefined if not found.
 */
export function interjectCopilotSession(agentName: string): CopilotRunningSession | undefined {
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
// Installation Instructions
// =============================================================================

const INSTALLATION_INSTRUCTIONS = `
GitHub Copilot CLI is not installed or not found in PATH.

To install GitHub Copilot CLI:
1. Ensure you have an active GitHub Copilot subscription
2. Install via npm: npm install -g @githubnext/github-copilot-cli
   Or via Homebrew (macOS): brew install gh && gh extension install github/gh-copilot
3. Authenticate: copilot auth login

For more information, visit: https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line
`;

// =============================================================================
// Copilot Agent Provider
// =============================================================================

export class CopilotAgentProvider implements Agent {
  private mode: "interactive" | "streaming";
  private allowAllTools: boolean;
  private allowTools: string[];
  private denyTools: string[];
  private streamOutput: boolean;
  private activityTimeoutMs: number;
  private heartbeatIntervalMs: number;
  private onEvent?: (event: CopilotStreamEvent) => void;
  private onHeartbeat?: (lastActivityMs: number) => void;
  private onTimeout?: () => void;
  private currentAgentName?: string;
  private model?: string;
  private verbose: boolean;

  constructor(options: CopilotProviderOptions = {}) {
    // Support both new `mode` and deprecated `interactive` option
    if (options.mode !== undefined) {
      this.mode = options.mode;
    } else {
      this.mode = options.interactive ? "interactive" : "streaming";
    }
    this.allowAllTools = options.allowAllTools ?? true;
    this.allowTools = options.allowTools ?? [];
    this.denyTools = options.denyTools ?? [];
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
    return this.mode === "interactive" ? this.runInteractive(options) : this.runStreaming(options);
  }

  private async runInteractive(options: AgentRunOptions): Promise<AgentRunResult> {
    return new Promise((resolve) => {
      const args = this.buildInteractiveArgs(options);

      const proc = spawn("copilot", args, {
        cwd: options.startingDirectory,
        stdio: "inherit",
      });

      proc.on("error", (error) => {
        const errorMessage = this.formatSpawnError(error);
        resolve({
          success: false,
          output: "",
          error: errorMessage,
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

      const proc = spawn("copilot", args, {
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
        const errorMessage = this.formatSpawnError(error);
        resolve({
          success: false,
          output: outputAccumulator.value,
          error: errorMessage,
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

      // Send prompt via stdin and close
      proc.stdin?.write(options.prompt);
      proc.stdin?.end();
    });
  }

  /**
   * Format spawn error with installation instructions when CLI not found.
   */
  private formatSpawnError(error: NodeJS.ErrnoException): string {
    if (error.code === "ENOENT") {
      return `GitHub Copilot CLI not found: ${error.message}${INSTALLATION_INSTRUCTIONS}`;
    }
    return `Failed to spawn copilot: ${error.message}`;
  }

  private renderEvent(event: CopilotStreamEvent, outputAccumulator?: { value: string }): void {
    switch (event.type) {
      case "assistant": {
        // Handle message content as array of content blocks
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

  /**
   * Render system event subtypes
   */
  private renderSystemEvent(event: CopilotStreamEvent): void {
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
  private extractTextFromEvent(event: CopilotStreamEvent, outputAccumulator: { value: string }): void {
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
    // Interactive mode: no -p flag, Copilot runs in REPL mode
    const args: string[] = [];

    // Add tool permissions
    this.addToolPermissionArgs(args);

    // Add model selection
    if (this.model) {
      args.push("--model", this.model);
    }

    // Copilot doesn't support --append-system-prompt, so prepend system prompt to user prompt
    // For interactive mode, we pass the initial prompt with system context
    if (options.prompt) {
      const fullPrompt = options.systemPrompt ? `${options.systemPrompt}\n\n${options.prompt}` : options.prompt;
      args.push(fullPrompt);
    }

    return args;
  }

  private buildStreamingArgs(options: AgentRunOptions): string[] {
    // Streaming/print mode: -p flag for single-shot execution
    // -s flag for streaming JSON output
    const args: string[] = ["-p", "-s"];

    // Add tool permissions
    this.addToolPermissionArgs(args);

    // Add model selection
    if (this.model) {
      args.push("--model", this.model);
    }

    // Resume previous session if sessionId provided
    if (options.sessionId) {
      args.push("--resume", options.sessionId);
    }

    // Copilot doesn't support --append-system-prompt, so prepend system prompt
    const fullPrompt = options.systemPrompt ? `${options.systemPrompt}\n\n${options.prompt}` : options.prompt;
    args.push(fullPrompt);

    return args;
  }

  /**
   * Add tool permission arguments to the args array.
   */
  private addToolPermissionArgs(args: string[]): void {
    if (this.allowAllTools) {
      args.push("--allow-all-tools");
    }

    for (const tool of this.allowTools) {
      args.push("--allow-tool", tool);
    }

    for (const tool of this.denyTools) {
      args.push("--deny-tool", tool);
    }
  }
}
