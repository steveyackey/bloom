# Adding New Agent Providers

This guide explains how to add a new AI agent provider to Bloom.

## Philosophy

Bloom trusts agents to know their own capabilities. Each agent injects its own system prompt with its features, tools, and limitations. Bloom only needs to know:

1. How to spawn and communicate with the agent CLI
2. How to check if the CLI is installed
3. How to list available models

This keeps Bloom simple and avoids the need to update docs every time an agent adds features.

## Required CLI Commands

For Bloom to fully support an agent CLI, these commands/flags are needed:

### Essential (Required)

| Purpose | Example | Notes |
|---------|---------|-------|
| **Version check** | `myagent --version` | For availability checking |
| **Accept prompt** | `myagent --prompt "..."` or `myagent -p "..."` | How to pass the task |
| **Working directory** | Respects `cwd` when spawned | Agent runs in project directory |
| **Non-interactive mode** | `myagent --print` or `--non-interactive` | For autonomous execution without TTY |
| **Approval bypass** | `myagent --yes` or `--dangerously-skip-permissions` | For headless runs without prompts |

### Recommended (For Full Features)

| Purpose | Example | Notes |
|---------|---------|-------|
| **Model selection** | `myagent --model <name>` | For multi-model support |
| **Session resume** | `myagent --resume <id>` | For session continuity |
| **System prompt** | `myagent --system "..."` | For Bloom context injection |
| **JSON output** | `myagent --output-format json` | For streaming progress |
| **List models** | `myagent models` | For model discovery |

### Optional (Nice to Have)

| Purpose | Example | Notes |
|---------|---------|-------|
| **Timeout** | `myagent --timeout 600` | For long-running tasks |

## Step 1: Create the Provider File

Create a new file in `src/agents/` named after your agent (e.g., `myagent.ts`).

### Required Structure

```typescript
// src/agents/myagent.ts

import { spawn } from "node:child_process";
import type { Agent, AgentRunOptions, AgentRunResult, AgentSession } from "./core";
import { createLogger } from "../logger";

const logger = createLogger("myagent-provider");

// =============================================================================
// Types
// =============================================================================

export interface MyAgentProviderOptions {
  interactive: boolean;
  streamOutput?: boolean;
  model?: string;
}

export interface MyAgentRunningSession extends AgentSession {
  proc: import("node:child_process").ChildProcess;
}

// =============================================================================
// Session Management
// =============================================================================

const activeSessions = new Map<string, MyAgentRunningSession>();

export function getActiveMyAgentSession(agentName: string): MyAgentRunningSession | undefined {
  return activeSessions.get(agentName);
}

export function interjectMyAgentSession(agentName: string): MyAgentRunningSession | undefined {
  const session = activeSessions.get(agentName);
  if (session) {
    try {
      session.proc.kill("SIGINT");
    } catch {}
    activeSessions.delete(agentName);
  }
  return session;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class MyAgentProvider implements Agent {
  private options: MyAgentProviderOptions;

  constructor(options: MyAgentProviderOptions) {
    this.options = options;
  }

  async run(runOptions: AgentRunOptions): Promise<AgentRunResult> {
    const { prompt, startingDirectory, systemPrompt, sessionId, agentName } = runOptions;

    // Build CLI arguments
    const args: string[] = [];
    args.push("--prompt", prompt);

    if (this.options.model) {
      args.push("--model", this.options.model);
    }

    if (sessionId) {
      args.push("--resume", sessionId);
    }

    // Interactive mode: inherit stdio
    if (this.options.interactive) {
      return this.runInteractive(args, startingDirectory, agentName);
    }

    // Streaming mode: capture output
    return this.runStreaming(args, startingDirectory, agentName);
  }

  private async runInteractive(
    args: string[],
    cwd: string,
    agentName: string
  ): Promise<AgentRunResult> {
    return new Promise((resolve) => {
      const proc = spawn("myagent", args, {
        cwd,
        stdio: "inherit",
        env: { ...process.env },
      });

      const session: MyAgentRunningSession = {
        sessionId: `myagent-${Date.now()}`,
        startTime: new Date(),
        agentName,
        proc,
      };
      activeSessions.set(agentName, session);

      proc.on("close", (code) => {
        activeSessions.delete(agentName);
        resolve({
          success: code === 0,
          output: "",
          sessionId: session.sessionId,
        });
      });

      proc.on("error", (error) => {
        activeSessions.delete(agentName);
        resolve({
          success: false,
          output: "",
          error: error.message,
        });
      });
    });
  }

  private async runStreaming(
    args: string[],
    cwd: string,
    agentName: string
  ): Promise<AgentRunResult> {
    args.push("--output-format", "json");

    return new Promise((resolve) => {
      const proc = spawn("myagent", args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      let output = "";
      let sessionId: string | undefined;

      proc.stdout?.on("data", (data) => {
        output += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        logger.error(data.toString());
      });

      proc.on("close", (code) => {
        activeSessions.delete(agentName);
        resolve({
          success: code === 0,
          output,
          sessionId,
        });
      });

      proc.on("error", (error) => {
        activeSessions.delete(agentName);
        resolve({
          success: false,
          output: "",
          error: error.message,
        });
      });
    });
  }

  getActiveSession(): AgentSession | undefined {
    return activeSessions.values().next().value;
  }
}
```

## Step 2: Update the Agent Registry

Edit `src/agents/capabilities.ts`:

```typescript
export type AgentName = "claude" | "copilot" | "codex" | "goose" | "opencode" | "myagent";

export const REGISTERED_AGENTS: AgentName[] = ["claude", "copilot", "codex", "goose", "myagent", "opencode"];
```

## Step 3: Update the Factory

Edit `src/agents/factory.ts`:

### 3.1 Add Import

```typescript
import { MyAgentProvider, type MyAgentProviderOptions } from "./myagent";
```

### 3.2 Add to Registry

```typescript
const agentRegistry = {
  claude: ClaudeAgentProvider,
  codex: CodexAgentProvider,
  copilot: CopilotAgentProvider,
  goose: GooseAgentProvider,
  myagent: MyAgentProvider,
  opencode: OpenCodeAgentProvider,
} as const;
```

### 3.3 Add Switch Cases

In `createAgentByName()` and `createAgent()`:
```typescript
case "myagent":
  return createMyAgentAgent(isInteractive, model, perAgentConfig);
```

### 3.4 Add Factory Helper

```typescript
function createMyAgentAgent(
  interactive: boolean,
  model?: string,
  _perAgentConfig?: PerAgentConfig
): MyAgentProvider {
  return new MyAgentProvider({
    interactive,
    streamOutput: true,
    model,
  });
}
```

## Step 4: Update Availability Checking

Edit `src/agents/availability.ts`:

### 4.1 Add CLI Config

```typescript
const agentCliConfig: Record<string, { command: string; checkArgs: string[] }> = {
  // ... existing agents ...
  myagent: { command: "myagent", checkArgs: ["--version"] },
};
```

### 4.2 Add Model Config

Include how to list available models:

```typescript
const agentModels: Record<string, { models: string[]; default?: string; listCommand?: string }> = {
  // ... existing agents ...
  myagent: {
    models: ["model-a", "model-b"],
    default: "model-a",
    listCommand: "myagent models",  // Command to list available models
  },
};
```

## Step 5: Update User Config

Edit `src/user-config.ts`:

```typescript
export const KNOWN_AGENTS = ["claude", "copilot", "codex", "goose", "myagent", "opencode"] as const;
```

Add a config schema if the agent has specific options:

```typescript
const MyAgentConfigSchema = BaseAgentConfigSchema.extend({
  customOption: z.boolean().optional(),
});
```

## Step 6: Export from Index

Edit `src/agents/index.ts`:

```typescript
export type { MyAgentProviderOptions, MyAgentRunningSession } from "./myagent";
export { MyAgentProvider, getActiveMyAgentSession, interjectMyAgentSession } from "./myagent";
```

## Step 7: Add Documentation

### 7.1 Create Agent Doc Page

Create `docs/docs/agents/myagent.md` with:
- Installation instructions
- Configuration options
- How to list available models

### 7.2 Update Sidebar

Edit `docs/sidebars.ts`:
```typescript
items: [
  'agents/README',
  'agents/claude',
  // ... existing agents ...
  'agents/myagent',
],
```

### 7.3 Update Main README

Add to supported agents table in `README.md`.

## Step 8: Validate and Build

```bash
# Run type checking and linting
bun validate

# Run tests
bun test

# Build docs
cd docs && bun install && bun run build
```

## Checklist

Before submitting a PR for a new agent:

- [ ] Provider file created in `src/agents/`
- [ ] Agent name added to registry in `src/agents/capabilities.ts`
- [ ] Factory updated in `src/agents/factory.ts`
- [ ] Availability config in `src/agents/availability.ts`
- [ ] User config updated in `src/user-config.ts`
- [ ] Exports added in `src/agents/index.ts`
- [ ] Documentation page created
- [ ] Sidebar updated
- [ ] Main README updated
- [ ] `bun validate` passes
- [ ] `bun test` passes
- [ ] Docs build successfully
