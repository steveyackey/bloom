import { type ChildProcess, spawn } from "node:child_process";
import { createLogger } from "../logger";
import type { Agent, AgentRunOptions, AgentRunResult } from "./core";

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
// Provider Options
// =============================================================================

export interface ClaudeProviderOptions {
  interactive?: boolean;
  dangerouslySkipPermissions?: boolean;
  /** Stream output to stdout/stderr while capturing */
  streamOutput?: boolean;
  /** Timeout in ms before considering agent dead (default: 600000 = 10 min) */
  activityTimeoutMs?: number;
  /** Interval for heartbeat output when waiting (default: 10000 = 10s) */
  heartbeatIntervalMs?: number;
  /** Callback for stream events */
  onEvent?: (event: StreamEvent) => void;
  /** Callback for heartbeat */
  onHeartbeat?: (lastActivityMs: number) => void;
  /** Callback for activity timeout (agent presumed dead) */
  onTimeout?: () => void;
}

// =============================================================================
// Running Session (for interjection support)
// =============================================================================

export interface RunningSession {
  sessionId?: string;
  proc: ChildProcess;
  startTime: number;
  lastActivity: number;
  taskId?: string;
  agentName?: string;
  workingDirectory: string;
}

// Track active sessions for interjection
const activeSessions = new Map<string, RunningSession>();

export function getActiveSession(agentName: string): RunningSession | undefined {
  return activeSessions.get(agentName);
}

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
  private interactive: boolean;
  private dangerouslySkipPermissions: boolean;
  private streamOutput: boolean;
  private activityTimeoutMs: number;
  private heartbeatIntervalMs: number;
  private onEvent?: (event: StreamEvent) => void;
  private onHeartbeat?: (lastActivityMs: number) => void;
  private onTimeout?: () => void;

  constructor(options: ClaudeProviderOptions = {}) {
    this.interactive = options.interactive ?? false;
    this.dangerouslySkipPermissions = options.dangerouslySkipPermissions ?? true;
    this.streamOutput = options.streamOutput ?? true;
    this.activityTimeoutMs = options.activityTimeoutMs ?? 600_000; // 10 min
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000; // 10s
    this.onEvent = options.onEvent;
    this.onHeartbeat = options.onHeartbeat;
    this.onTimeout = options.onTimeout;
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    return this.interactive ? this.runInteractive(options) : this.runStreaming(options);
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
      let output = "";
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

          // Stream human-readable output
          if (this.streamOutput) {
            this.renderEvent(event);
          }

          // Capture text output
          if (event.type === "assistant" && event.content) {
            output += event.content;
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
          output,
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
        resolve({
          success: !timedOut && exitCode === 0,
          output,
          error: timedOut ? "Agent timed out due to inactivity" : undefined,
          sessionId,
        });
      });

      // Send prompt via stdin and close
      proc.stdin?.write(options.prompt);
      proc.stdin?.end();
    });
  }

  private renderEvent(event: StreamEvent): void {
    switch (event.type) {
      case "assistant":
        if (event.subtype === "text" && event.content) {
          process.stdout.write(event.content);
        }
        break;

      case "tool_use":
        process.stdout.write(`\n[tool: ${event.tool_name}]\n`);
        break;

      case "tool_result":
        // Tool results can be verbose, just show indicator
        process.stdout.write(`[tool result]\n`);
        break;

      case "result":
        if (event.cost_usd !== undefined) {
          process.stdout.write(`\n[cost: $${event.cost_usd.toFixed(4)}]\n`);
        }
        break;

      case "error":
        process.stdout.write(`\n[error: ${event.content || "unknown"}]\n`);
        break;

      case "system":
        if (event.subtype === "init" && event.session_id) {
          process.stdout.write(`[session: ${event.session_id}]\n`);
        }
        break;
    }
  }

  private buildInteractiveArgs(options: AgentRunOptions): string[] {
    // Interactive mode: no -p flag, Claude runs in REPL mode
    const args: string[] = ["--verbose"];

    if (this.dangerouslySkipPermissions) {
      args.push("--dangerously-skip-permissions");
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

    args.push("--append-system-prompt", options.systemPrompt);
    args.push(options.prompt);

    return args;
  }
}
