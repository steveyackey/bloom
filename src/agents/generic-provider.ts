/**
 * Generic Agent Provider
 *
 * A schema-driven agent provider that can run any agent defined via AgentDefinition.
 * Handles the common patterns for CLI interaction, output parsing, and session management.
 */

import { type ChildProcess, spawn } from "node:child_process";
import chalk from "chalk";
import { createLogger } from "../logger";
import type { Agent, AgentConfig, AgentRunOptions, AgentRunResult, AgentSession } from "./core";
import type { AgentDefinition, PromptStyle } from "./schema";

const logger = createLogger("generic-provider");

// =============================================================================
// Types
// =============================================================================

export interface GenericProviderOptions extends AgentConfig {
  /** The agent definition to use */
  definition: AgentDefinition;

  /** Activity timeout in ms (default: 600000 = 10 min) */
  activityTimeoutMs?: number;

  /** Heartbeat interval in ms (default: 10000 = 10s) */
  heartbeatIntervalMs?: number;

  /** Callback for stream events */
  onEvent?: (event: Record<string, unknown>) => void;

  /** Callback for heartbeat */
  onHeartbeat?: (lastActivityMs: number) => void;

  /** Callback for activity timeout */
  onTimeout?: () => void;
}

export interface GenericRunningSession extends AgentSession {
  proc: ChildProcess;
}

// =============================================================================
// Session Management
// =============================================================================

const activeSessions = new Map<string, GenericRunningSession>();

export function getActiveGenericSession(agentName: string): GenericRunningSession | undefined {
  return activeSessions.get(agentName);
}

export function interjectGenericSession(agentName: string): GenericRunningSession | undefined {
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
// Generic Agent Provider
// =============================================================================

export class GenericAgentProvider implements Agent {
  private definition: AgentDefinition;
  private mode: "interactive" | "streaming";
  private streamOutput: boolean;
  private activityTimeoutMs: number;
  private heartbeatIntervalMs: number;
  private onEvent?: (event: Record<string, unknown>) => void;
  private onHeartbeat?: (lastActivityMs: number) => void;
  private onTimeout?: () => void;
  private currentAgentName?: string;
  private model?: string;

  constructor(options: GenericProviderOptions) {
    this.definition = options.definition;
    this.mode = options.mode ?? "streaming";
    this.streamOutput = options.streamOutput ?? true;
    this.activityTimeoutMs = options.activityTimeoutMs ?? 600_000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000;
    this.onEvent = options.onEvent;
    this.onHeartbeat = options.onHeartbeat;
    this.onTimeout = options.onTimeout;
    this.model = options.model;
  }

  getActiveSession(): AgentSession | undefined {
    if (this.currentAgentName) {
      return activeSessions.get(this.currentAgentName);
    }
    return undefined;
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    this.currentAgentName = options.agentName;

    // Validate model requirement
    if (this.mode === "streaming" && this.definition.model_required_for_streaming && !this.model) {
      const modelsCmd = this.definition.models_command
        ? `Run \`${this.definition.command} ${this.definition.models_command.join(" ")}\` to see available options.`
        : "";
      return {
        success: false,
        output: "",
        error: `Model selection is REQUIRED for ${this.definition.command} in streaming mode. ${modelsCmd}`,
      };
    }

    return this.mode === "interactive" ? this.runInteractive(options) : this.runStreaming(options);
  }

  private async runInteractive(options: AgentRunOptions): Promise<AgentRunResult> {
    return new Promise((resolve) => {
      const args = this.buildArgs(options, "interactive");

      const proc = spawn(this.definition.command, args, {
        cwd: options.startingDirectory,
        stdio: "inherit",
        env: this.getEnv(),
      });

      proc.on("error", (error) => {
        resolve({
          success: false,
          output: "",
          error: `Failed to spawn ${this.definition.command}: ${error.message}`,
        });
      });

      proc.on("close", (code) => {
        resolve({
          success: (code ?? 0) === 0,
          output: "",
        });
      });
    });
  }

  private async runStreaming(options: AgentRunOptions): Promise<AgentRunResult> {
    return new Promise((resolve) => {
      const args = this.buildArgs(options, "streaming");

      const proc = spawn(this.definition.command, args, {
        cwd: options.startingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
        env: this.getEnv(),
      });

      const now = Date.now();
      let lastActivity = now;
      let sessionId: string | undefined;
      let buffer = "";
      const outputAccumulator = { value: "" };
      const errorAccumulator = { value: "" };
      let timedOut = false;

      // Track session
      const session: GenericRunningSession = {
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
          this.onTimeout?.();
          if (this.streamOutput) {
            process.stdout.write(`\n[TIMEOUT] No activity for ${Math.round(elapsed / 1000)}s - agent may be stuck\n`);
          }
          clearInterval(heartbeatTimer);
          try {
            proc.kill("SIGTERM");
          } catch {}
        } else if (elapsed >= this.heartbeatIntervalMs) {
          this.onHeartbeat?.(elapsed);
          if (this.streamOutput) {
            process.stdout.write(`[heartbeat ${Math.round(elapsed / 1000)}s] `);
          }
        }
      }, this.heartbeatIntervalMs);

      // Parse output
      const processLine = (line: string) => {
        if (!line.trim()) return;

        const format = this.definition.output.format;
        if (format === "stream-json" || format === "json") {
          try {
            const event = JSON.parse(line) as Record<string, unknown>;
            lastActivity = Date.now();
            session.lastActivity = lastActivity;

            // Extract session ID
            const sid = this.extractSessionId(event);
            if (sid) {
              sessionId = sid;
              session.sessionId = sessionId;
            }

            this.onEvent?.(event);

            if (this.streamOutput) {
              this.renderEvent(event, outputAccumulator, errorAccumulator);
            } else {
              this.extractText(event, outputAccumulator);
            }
          } catch {
            // Not JSON, output raw
            if (this.streamOutput) {
              process.stdout.write(line);
            }
            outputAccumulator.value += line;
          }
        } else {
          // Plain text
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
          error: `Failed to spawn ${this.definition.command}: ${error.message}`,
          sessionId,
        });
      });

      proc.on("close", (code) => {
        clearInterval(heartbeatTimer);
        if (options.agentName) {
          activeSessions.delete(options.agentName);
        }

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

      proc.stdin?.end();
    });
  }

  private buildArgs(options: AgentRunOptions, mode: "interactive" | "streaming"): string[] {
    const modeConfig = mode === "interactive" ? this.definition.interactive : this.definition.streaming;
    const args: string[] = [];

    // Add subcommand if specified
    if (modeConfig.subcommand) {
      args.push(modeConfig.subcommand);
    }

    // Add base args
    args.push(...modeConfig.base_args);

    // Add approval bypass for streaming mode
    const approvalBypassFlag = this.definition.flags.approval_bypass?.[0];
    if (mode === "streaming" && approvalBypassFlag) {
      args.push(approvalBypassFlag);
    }

    // Add model if specified
    const modelFlag = this.definition.flags.model?.[0];
    if (this.model && modelFlag) {
      args.push(modelFlag, this.model);
    }

    // Add session resume if provided
    const resumeFlag = this.definition.flags.resume?.[0];
    if (options.sessionId && resumeFlag) {
      args.push(resumeFlag, options.sessionId);
    }

    // Build the prompt
    const fullPrompt = modeConfig.prepend_system_prompt
      ? `${options.systemPrompt}\n\n${options.prompt}`
      : options.prompt;

    // Add system prompt if not prepended and flag exists
    const systemPromptFlag = this.definition.flags.system_prompt?.[0];
    if (!modeConfig.prepend_system_prompt && systemPromptFlag) {
      args.push(systemPromptFlag, options.systemPrompt);
    }

    // Add prompt based on style
    this.addPromptArg(args, modeConfig.prompt, fullPrompt);

    return args;
  }

  private addPromptArg(args: string[], style: PromptStyle, prompt: string): void {
    if (style === "positional") {
      args.push(prompt);
    } else if (typeof style === "object" && style.flag) {
      args.push(style.flag, prompt);
    }
  }

  private getEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    // Inject configured env vars
    const inject = this.definition.env?.inject ?? {};
    for (const [key, value] of Object.entries(inject)) {
      if (typeof value === "string") {
        env[key] = value;
      }
    }

    return env;
  }

  private extractSessionId(event: Record<string, unknown>): string | undefined {
    const field = this.definition.output.session_id_field;
    const altField = this.definition.output.session_id_field_alt;

    if (field && typeof event[field] === "string") {
      return event[field] as string;
    }
    if (altField && typeof event[altField] === "string") {
      return event[altField] as string;
    }
    return undefined;
  }

  private renderEvent(
    event: Record<string, unknown>,
    outputAccumulator: { value: string },
    errorAccumulator: { value: string }
  ): void {
    const type = event.type as string | undefined;

    switch (type) {
      case "assistant":
      case "message": {
        // Handle text content
        if (typeof event.content === "string") {
          process.stdout.write(event.content);
          outputAccumulator.value += event.content;
        }
        // Handle message.content array
        const message = event.message as { content?: Array<{ type: string; text?: string }> | string } | undefined;
        if (message?.content) {
          if (typeof message.content === "string") {
            process.stdout.write(message.content);
            outputAccumulator.value += message.content;
          } else if (Array.isArray(message.content)) {
            for (const block of message.content) {
              if (block.type === "text" && block.text) {
                process.stdout.write(block.text);
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
          outputAccumulator.value += delta.text;
        }
        break;
      }

      case "text": {
        const text = event.text as string | undefined;
        if (text) {
          process.stdout.write(text);
          outputAccumulator.value += text;
        }
        break;
      }

      case "tool_use":
      case "tool_call": {
        const toolName = (event.tool_name || event.name || "unknown") as string;
        process.stdout.write(`\n${chalk.cyan(`[tool: ${toolName}]`)}\n`);
        break;
      }

      case "tool_result":
      case "tool_response":
        process.stdout.write(`${chalk.dim("[result]")}\n`);
        break;

      case "result":
      case "done":
      case "finish":
      case "complete": {
        const cost = (event.total_cost_usd ?? event.cost_usd) as number | undefined;
        const duration = event.duration_ms as number | undefined;
        if (cost !== undefined) {
          process.stdout.write(`\n[cost: $${cost.toFixed(4)}]\n`);
        }
        if (duration !== undefined) {
          process.stdout.write(`[duration: ${(duration / 1000).toFixed(1)}s]\n`);
        }
        break;
      }

      case "error": {
        const errorObj = event.error as { message?: string } | undefined;
        const errorMessage = errorObj?.message || (event.content as string) || (event.message as string) || "unknown";
        process.stdout.write(`\n${chalk.red(`[ERROR: ${errorMessage}]`)}\n`);
        errorAccumulator.value = errorMessage;
        break;
      }

      case "system": {
        const subtype = event.subtype as string | undefined;
        if (subtype === "init") {
          if (event.session_id) {
            process.stdout.write(`[session: ${event.session_id}]\n`);
          }
          if (event.model) {
            process.stdout.write(`[model: ${event.model}]\n`);
          }
        }
        break;
      }

      case "session": {
        const sid = this.extractSessionId(event);
        if (sid) {
          process.stdout.write(`[session: ${sid}]\n`);
        }
        break;
      }
    }
  }

  private extractText(event: Record<string, unknown>, outputAccumulator: { value: string }): void {
    const type = event.type as string | undefined;

    switch (type) {
      case "assistant":
      case "message": {
        if (typeof event.content === "string") {
          outputAccumulator.value += event.content;
        }
        const message = event.message as { content?: Array<{ type: string; text?: string }> | string } | undefined;
        if (message?.content) {
          if (typeof message.content === "string") {
            outputAccumulator.value += message.content;
          } else if (Array.isArray(message.content)) {
            for (const block of message.content) {
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
