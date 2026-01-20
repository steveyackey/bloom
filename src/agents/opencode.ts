import { spawn } from "node:child_process";
import type { Agent, AgentRunOptions, AgentRunResult } from "./core";

export interface OpenCodeProviderOptions {
  interactive?: boolean;
  autoApprove?: boolean;
  model?: string;
  /** Stream output to stdout/stderr while capturing */
  streamOutput?: boolean;
}

export class OpenCodeAgentProvider implements Agent {
  private interactive: boolean;
  private autoApprove: boolean;
  private model: string;
  private streamOutput: boolean;

  constructor(options: OpenCodeProviderOptions = {}) {
    this.interactive = options.interactive ?? false;
    this.autoApprove = options.autoApprove ?? true;
    this.model = options.model ?? "opencode/minimax-m2.1-free";
    this.streamOutput = options.streamOutput ?? true;
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
    return this.interactive ? this.runInteractive(options) : this.runNonInteractive(options);
  }

  private async runInteractive(options: AgentRunOptions): Promise<AgentRunResult> {
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
        resolve({
          success: false,
          output: "",
          error: `Failed to spawn opencode: ${error.message}`,
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

  private async runNonInteractive(options: AgentRunOptions): Promise<AgentRunResult> {
    return new Promise((resolve) => {
      // Non-interactive: opencode run "prompt" -m model
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
        if (this.streamOutput) {
          process.stdout.write(chunk);
        }
      });

      proc.stderr?.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        if (this.streamOutput) {
          process.stderr.write(chunk);
        }
      });

      proc.on("error", (error) => {
        resolve({
          success: false,
          output: stdout,
          error: `Failed to spawn opencode: ${error.message}`,
        });
      });

      proc.on("close", (code) => {
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
