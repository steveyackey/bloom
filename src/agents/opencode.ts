import { spawn } from "node:child_process";
import type { Agent, AgentConfig, AgentRunOptions, AgentRunResult, AgentSession } from "./core";

// =============================================================================
// Provider-Specific Options (OpenCode)
// =============================================================================
//
// These options are specific to OpenCode and don't belong in the generic interface:
// - autoApprove: OpenCode's permission model (--config-content override)
//
// Generic options from AgentConfig are also supported:
// - mode: "interactive" | "streaming"
// - model: OpenCode model identifier
// - streamOutput: Whether to stream output while capturing
// =============================================================================

export interface OpenCodeProviderOptions extends AgentConfig {
  /**
   * @deprecated Use `mode` instead. Will be removed in future version.
   */
  interactive?: boolean;
  /**
   * PROVIDER-SPECIFIC: Auto-approve all tool calls via OPENCODE_CONFIG_CONTENT.
   * This is OpenCode's security model - other providers have different mechanisms.
   */
  autoApprove?: boolean;
}

export class OpenCodeAgentProvider implements Agent {
  private mode: "interactive" | "streaming";
  private autoApprove: boolean;
  private model: string;
  private streamOutput: boolean;
  private currentSession: AgentSession | undefined;

  constructor(options: OpenCodeProviderOptions = {}) {
    // Support both new `mode` and deprecated `interactive` option
    if (options.mode !== undefined) {
      this.mode = options.mode;
    } else {
      this.mode = options.interactive ? "interactive" : "streaming";
    }
    this.autoApprove = options.autoApprove ?? true;
    this.model = options.model ?? "opencode/minimax-m2.1-free";
    this.streamOutput = options.streamOutput ?? true;
  }

  /**
   * Get the currently active session for monitoring/interjection.
   * Note: OpenCode doesn't support session resume, so sessionId is always undefined.
   */
  getActiveSession(): AgentSession | undefined {
    return this.currentSession;
  }

  private getEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    if (this.autoApprove) {
      // Use OPENCODE_CONFIG_CONTENT to set permission: "*": "allow"
      const configOverride = JSON.stringify({
        permission: { "*": "allow" },
      });
      env.OPENCODE_CONFIG_CONTENT = configOverride;
    }

    return env;
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    return this.mode === "interactive" ? this.runInteractive(options) : this.runStreaming(options);
  }

  private async runInteractive(options: AgentRunOptions): Promise<AgentRunResult> {
    const now = Date.now();

    // Track session for monitoring
    this.currentSession = {
      startTime: now,
      lastActivity: now,
      taskId: options.taskId,
      agentName: options.agentName,
      workingDirectory: options.startingDirectory,
    };

    return new Promise((resolve) => {
      // Interactive: opencode --prompt "..." -m model
      const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`;
      const args = ["--prompt", fullPrompt, "-m", this.model];

      const proc = spawn("opencode", args, {
        cwd: options.startingDirectory,
        stdio: "inherit",
        env: this.getEnv(),
      });

      proc.on("error", (error) => {
        this.currentSession = undefined;
        resolve({
          success: false,
          output: "",
          error: `Failed to spawn opencode: ${error.message}`,
        });
      });

      proc.on("close", (code) => {
        this.currentSession = undefined;
        const exitCode = code ?? 0;
        resolve({
          success: exitCode === 0,
          output: "",
        });
      });
    });
  }

  private async runStreaming(options: AgentRunOptions): Promise<AgentRunResult> {
    const now = Date.now();

    // Track session for monitoring
    this.currentSession = {
      startTime: now,
      lastActivity: now,
      taskId: options.taskId,
      agentName: options.agentName,
      workingDirectory: options.startingDirectory,
    };

    return new Promise((resolve) => {
      // Streaming: opencode run "prompt" -m model
      const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`;
      const args = ["run", fullPrompt, "-m", this.model];

      const proc = spawn("opencode", args, {
        cwd: options.startingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
        env: this.getEnv(),
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        if (this.currentSession) {
          this.currentSession.lastActivity = Date.now();
        }
        if (this.streamOutput) {
          process.stdout.write(chunk);
        }
      });

      proc.stderr?.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        if (this.currentSession) {
          this.currentSession.lastActivity = Date.now();
        }
        if (this.streamOutput) {
          process.stderr.write(chunk);
        }
      });

      proc.on("error", (error) => {
        this.currentSession = undefined;
        resolve({
          success: false,
          output: stdout,
          error: `Failed to spawn opencode: ${error.message}`,
        });
      });

      proc.on("close", (code) => {
        this.currentSession = undefined;
        const exitCode = code ?? 0;
        resolve({
          success: exitCode === 0,
          output: stdout,
          error: stderr || undefined,
        });
      });

      proc.stdin?.end();
    });
  }
}
