/**
 * Generic Agent Provider
 *
 * A schema-driven agent provider that can run any agent defined via AgentDefinition.
 * Handles the common patterns for CLI interaction, output parsing, and session management.
 */

import { type ChildProcess, spawn } from "node:child_process";
import chalk from "chalk";
import { createLogger } from "../infra/logger";
import type { Agent, AgentConfig, AgentRunOptions, AgentRunResult, AgentSession } from "./core";
import type { AgentDefinition, PromptStyle } from "./schema";

const logger = createLogger("generic-provider");

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract tool name from various agent event formats.
 * - Claude/standard: { tool_name: "Read" } or { name: "Read" }
 * - Cursor: { tool_call: { readToolCall: { args: {...} } } } → "read"
 */
function extractToolName(event: Record<string, unknown>): string {
  // Standard fields
  if (event.tool_name) return event.tool_name as string;
  if (event.name) return event.name as string;

  // Cursor nested tool_call object: key is e.g. "readToolCall"
  const toolCall = event.tool_call as Record<string, unknown> | undefined;
  if (toolCall && typeof toolCall === "object") {
    const key = Object.keys(toolCall)[0];
    if (key) {
      return key.replace(/ToolCall$/i, "");
    }
  }

  return "unknown";
}

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

      // Log the command being run for debugging
      const commandString = `${this.definition.command} ${args.join(" ")}`;
      logger.debug(`Running: ${commandString}`);

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

      // Notify process started
      if (proc.pid && options.onProcessStart) {
        options.onProcessStart(proc.pid, commandString);
      }

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

      // Parse output based on format
      // For "json" format (like goose), accumulate and parse at end
      // For "stream-json" format (like claude), parse line by line
      const format = this.definition.output.format;
      const isBatchJson = format === "json";
      let batchJsonBuffer = "";

      const processLine = (line: string) => {
        if (!line.trim()) return;

        if (format === "stream-json") {
          // Stream JSON: each line is a complete JSON event
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

            // Detect API errors in raw output (claude CLI outputs these as plain text)
            if (line.includes("API Error:") || line.includes("invalid_request_error")) {
              errorAccumulator.value = line;
            }
          }
        } else if (isBatchJson) {
          // Batch JSON (goose): accumulate all output, parse at end
          batchJsonBuffer += `${line}\n`;
          lastActivity = Date.now();
          session.lastActivity = lastActivity;
          // Show progress indicator while waiting for batch output
          if (this.streamOutput && line.trim().length > 0) {
            // Only show brief status updates, not raw JSON
            if (line.includes('"role"') && line.includes('"assistant"')) {
              process.stdout.write(chalk.dim("[goose: processing...]\n"));
            }
          }
        } else {
          // Plain text
          if (this.streamOutput) {
            process.stdout.write(line);
          }
          outputAccumulator.value += line;
        }
      };

      // Process batch JSON output at end of process
      const processBatchJsonOutput = () => {
        if (!batchJsonBuffer.trim()) return;

        try {
          const data = JSON.parse(batchJsonBuffer) as Record<string, unknown>;
          lastActivity = Date.now();
          session.lastActivity = lastActivity;

          // Extract session ID
          const sid = this.extractSessionId(data);
          if (sid) {
            sessionId = sid;
            session.sessionId = sessionId;
          }

          this.onEvent?.(data);

          if (this.streamOutput) {
            this.renderBatchOutput(data, outputAccumulator, errorAccumulator);
          } else {
            this.extractBatchText(data, outputAccumulator);
          }
        } catch {
          // Failed to parse as batch JSON, output raw
          if (this.streamOutput) {
            process.stdout.write(batchJsonBuffer);
          }
          outputAccumulator.value += batchJsonBuffer;
        }
      };

      proc.stdout?.on("data", (data) => {
        const text = data.toString();

        // Emit raw output for event-driven consumers
        options.onOutput?.(text);

        buffer += text;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          processLine(line);
        }
      });

      proc.stderr?.on("data", (data) => {
        lastActivity = Date.now();
        const text = data.toString();

        // Emit raw output for event-driven consumers
        options.onOutput?.(text);

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

        // For batch JSON format, parse the complete output now
        if (isBatchJson) {
          processBatchJsonOutput();
        }

        // Notify process ended
        if (proc.pid && options.onProcessEnd) {
          options.onProcessEnd(proc.pid, code);
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

    // Add approval bypass flag
    const approvalBypassFlag = this.definition.flags.approval_bypass?.[0];
    if (approvalBypassFlag) {
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

    // Handle OpenCode's nested part structure
    const part = event.part as Record<string, unknown> | undefined;
    if (part) {
      this.renderOpenCodePart(type, part, outputAccumulator, errorAccumulator);
      return;
    }

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
        // Cursor sends subtype "completed" for tool results
        const subtype = event.subtype as string | undefined;
        if (subtype === "completed") {
          const content = event.content as string | undefined;
          if (content) {
            const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
            process.stdout.write(`${chalk.dim(truncated)}\n`);
          } else {
            process.stdout.write(`${chalk.dim("[result]")}\n`);
          }
          break;
        }
        const toolName = extractToolName(event);
        process.stdout.write(`\n${chalk.cyan(`[tool: ${toolName}]`)}\n`);
        break;
      }

      case "tool_result":
      case "tool_response": {
        const content = event.content as string | undefined;
        if (content) {
          const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
          process.stdout.write(`${chalk.dim(truncated)}\n`);
        } else {
          process.stdout.write(`${chalk.dim("[result]")}\n`);
        }
        break;
      }

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

  /**
   * Render OpenCode's nested part structure.
   * OpenCode events have type at top level (step_finish, step_start, tool_use)
   * and details in the part object.
   */
  private renderOpenCodePart(
    _eventType: string | undefined,
    part: Record<string, unknown>,
    outputAccumulator: { value: string },
    errorAccumulator: { value: string }
  ): void {
    const partType = part.type as string | undefined;

    switch (partType) {
      case "text": {
        // Text content from assistant
        const text = part.text as string | undefined;
        if (text) {
          process.stdout.write(text);
          outputAccumulator.value += text;
        }
        break;
      }

      case "tool": {
        // Tool usage - display tool name and title if available
        const toolName = part.tool as string | undefined;
        const state = part.state as { title?: string; status?: string } | undefined;
        const title = state?.title;
        const displayName = title || toolName || "unknown";
        process.stdout.write(`\n${chalk.cyan(`[tool: ${displayName}]`)}\n`);
        break;
      }

      case "step-start": {
        // Step started - optionally show indicator
        // Keeping quiet to avoid noise
        break;
      }

      case "step-finish": {
        // Step finished - show token/cost info
        const cost = part.cost as number | undefined;
        const tokens = part.tokens as
          | {
              input?: number;
              output?: number;
              reasoning?: number;
              cache?: { read?: number; write?: number };
            }
          | undefined;

        if (tokens) {
          const totalTokens = (tokens.input || 0) + (tokens.output || 0) + (tokens.reasoning || 0);
          if (totalTokens > 0) {
            process.stdout.write(`${chalk.dim(`[tokens: ${totalTokens}]`)} `);
          }
        }
        if (cost !== undefined && cost > 0) {
          process.stdout.write(`[cost: $${cost.toFixed(4)}]\n`);
        }
        break;
      }

      case "error": {
        const errorMessage = (part.error as string) || (part.message as string) || "unknown error";
        process.stdout.write(`\n${chalk.red(`[ERROR: ${errorMessage}]`)}\n`);
        errorAccumulator.value = errorMessage;
        break;
      }

      default: {
        // Handle other part types - check for text content
        if (part.text && typeof part.text === "string") {
          process.stdout.write(part.text);
          outputAccumulator.value += part.text;
        }
      }
    }
  }

  private extractText(event: Record<string, unknown>, outputAccumulator: { value: string }): void {
    const type = event.type as string | undefined;

    // Handle OpenCode's nested part structure
    const part = event.part as Record<string, unknown> | undefined;
    if (part) {
      const partType = part.type as string | undefined;
      if (partType === "text" && typeof part.text === "string") {
        outputAccumulator.value += part.text;
      }
      return;
    }

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

  /**
   * Render batch JSON output (goose format).
   * Goose outputs a single JSON object with messages array at the end.
   */
  private renderBatchOutput(
    data: Record<string, unknown>,
    outputAccumulator: { value: string },
    errorAccumulator: { value: string }
  ): void {
    // Handle goose-style output: { messages: [...], metadata: {...} }
    const messages = data.messages as Array<{
      role?: string;
      content?: Array<Record<string, unknown>> | string;
    }>;

    if (Array.isArray(messages)) {
      for (const msg of messages) {
        if (typeof msg.content === "string") {
          // String content - render directly for assistant messages
          if (msg.role === "assistant") {
            process.stdout.write(msg.content);
            outputAccumulator.value += msg.content;
          }
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            const blockType = block.type as string;

            if (blockType === "text" && block.text) {
              // Text block - render for assistant messages
              if (msg.role === "assistant") {
                const text = block.text as string;
                process.stdout.write(text);
                outputAccumulator.value += text;
              }
            } else if (blockType === "tool_use" || blockType === "tool_call" || blockType === "toolUse") {
              // Tool use block
              const toolName = extractToolName(block as Record<string, unknown>);
              process.stdout.write(`\n${chalk.cyan(`[tool: ${toolName}]`)}\n`);
            } else if (blockType === "tool_result" || blockType === "tool_response" || blockType === "toolResponse") {
              // Tool response block (usually in user role messages)
              process.stdout.write(`${chalk.dim("[result]")}\n`);

              // Extract text from toolResult.value array if present (goose format)
              const toolResult = block.toolResult as { value?: Array<Record<string, unknown>> } | undefined;
              if (toolResult?.value && Array.isArray(toolResult.value)) {
                for (const item of toolResult.value) {
                  if (item.type === "text" && item.text) {
                    const text = item.text as string;
                    process.stdout.write(chalk.dim(text));
                    outputAccumulator.value += text;
                  }
                }
              }
            }
          }
        }
      }
    }

    // Handle metadata
    const metadata = data.metadata as { total_tokens?: number; status?: string } | undefined;
    if (metadata) {
      if (metadata.total_tokens) {
        process.stdout.write(`\n${chalk.dim(`[tokens: ${metadata.total_tokens}]`)}\n`);
      }
      if (metadata.status && metadata.status !== "completed") {
        process.stdout.write(`${chalk.yellow(`[status: ${metadata.status}]`)}\n`);
        if (metadata.status === "error" || metadata.status === "failed") {
          errorAccumulator.value = `Agent ended with status: ${metadata.status}`;
        }
      }
    }

    // Check for error field
    if (data.error) {
      const errorMsg = typeof data.error === "string" ? data.error : JSON.stringify(data.error);
      process.stdout.write(`\n${chalk.red(`[ERROR: ${errorMsg}]`)}\n`);
      errorAccumulator.value = errorMsg;
    }
  }

  /**
   * Extract text from batch JSON output (goose format).
   */
  private extractBatchText(data: Record<string, unknown>, outputAccumulator: { value: string }): void {
    const messages = data.messages as Array<{
      role?: string;
      content?: Array<Record<string, unknown>> | string;
    }>;

    if (Array.isArray(messages)) {
      for (const msg of messages) {
        if (typeof msg.content === "string") {
          // String content - extract from assistant messages
          if (msg.role === "assistant") {
            outputAccumulator.value += msg.content;
          }
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            const blockType = block.type as string;

            if (blockType === "text" && block.text) {
              // Text block - extract from assistant messages
              if (msg.role === "assistant") {
                outputAccumulator.value += block.text as string;
              }
            } else if (blockType === "tool_result" || blockType === "tool_response" || blockType === "toolResponse") {
              // Tool response block - extract text from toolResult.value array
              const toolResult = block.toolResult as { value?: Array<Record<string, unknown>> } | undefined;
              if (toolResult?.value && Array.isArray(toolResult.value)) {
                for (const item of toolResult.value) {
                  if (item.type === "text" && item.text) {
                    outputAccumulator.value += item.text as string;
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
