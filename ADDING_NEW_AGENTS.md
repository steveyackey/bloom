# Adding New Agent Providers

This guide explains how to add a new AI agent provider to Bloom. Follow these steps to integrate a new agent CLI.

## Overview

Bloom supports multiple AI agent providers through a unified abstraction layer. Each agent provider implements the `Agent` interface and is registered in the factory.

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

export interface MyAgentStreamEvent {
  // Define the JSON structure of streaming output from the CLI
  type: string;
  // ... other fields
}

export interface MyAgentProviderOptions {
  interactive: boolean;
  streamOutput?: boolean;
  model?: string;
  // Add agent-specific options
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

    // Add prompt
    args.push("--prompt", prompt);

    // Add model if specified
    if (this.options.model) {
      args.push("--model", this.options.model);
    }

    // Add session resume if available
    if (sessionId) {
      args.push("--resume", sessionId);
    }

    // Interactive mode: inherit stdio for user interaction
    if (this.options.interactive) {
      return this.runInteractive(args, startingDirectory, agentName);
    }

    // Streaming mode: capture output for processing
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
    // Add streaming output flag
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
        const text = data.toString();
        output += text;

        // Parse streaming JSON events
        try {
          const event: MyAgentStreamEvent = JSON.parse(text);
          // Handle events (log, update progress, etc.)
        } catch {
          // Not JSON, just text output
        }
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

## Step 2: Update the Capabilities Registry

Edit `src/agents/capabilities.ts`:

### How Capabilities Are Used

Capabilities define what features an agent supports. Bloom uses these capabilities in several ways:

1. **Prompt Compilation**: The prompt compiler uses conditional sections based on capabilities. For example:
   ```markdown
   <!-- @if supportsWebSearch -->
   ## Web Search
   You can use web search to find information.
   <!-- @endif -->
   ```
   This section is only included in the prompt if the agent has `supportsWebSearch: true`.

2. **Feature Gating**: Bloom checks capabilities before attempting certain operations:
   - `supportsSessionResume`: Whether to pass a session ID for resuming previous work
   - `supportsSystemPrompt`: Whether the agent accepts system prompts separately
   - `supportsHumanQuestions`: Whether the agent can pause to ask clarifying questions

3. **UI/UX Decisions**: Capabilities inform user-facing behavior:
   - Agents with `supportsWebSearch` may show different help text
   - Agents with `supportsPlanMode` may have additional workflow options

4. **Capability Queries**: Other parts of the codebase can query capabilities:
   ```typescript
   import { getAgentCapabilities, hasCapability } from "./agents/capabilities";

   const caps = getAgentCapabilities("myagent");
   if (hasCapability("myagent", "supportsWebSearch")) {
     // Include web search instructions
   }
   ```

5. **Graceful Degradation**: When a task requires a capability the agent lacks, Bloom gracefully degrades by omitting that section from the prompt rather than failing.

### Capability Reference

| Capability | Description | Effect When True |
|------------|-------------|------------------|
| `supportsFileRead` | Can read files | Include file reading instructions |
| `supportsFileWrite` | Can write/edit files | Include file writing instructions |
| `supportsBash` | Can execute shell commands | Include terminal instructions |
| `supportsGit` | Can perform git operations | Include git workflow instructions |
| `supportsWebSearch` | Can search the web | Include web search instructions |
| `supportsWebFetch` | Can fetch URL content | Include URL fetching instructions |
| `supportsSystemPrompt` | Accepts system prompt separately | Pass system prompt via dedicated flag |
| `supportsAppendSystemPrompt` | Can append to system prompt | Append project context to system prompt |
| `maxPromptLength` | Maximum prompt size | Truncate prompts exceeding limit |
| `supportsSessionResume` | Can resume previous sessions | Pass session ID for continuity |
| `supportsSessionFork` | Can branch sessions | Enable "try alternative" workflows |
| `supportsStructuredOutput` | Returns structured JSON | Parse output as structured data |
| `supportsStreamingJson` | Streams JSON events | Enable real-time progress tracking |
| `supportsHumanQuestions` | Can pause for user input | Enable interactive clarification |
| `supportsPlanMode` | Has explicit planning phase | Enable plan-then-execute workflow |
| `supportsLSP` | Has Language Server Protocol | Include LSP-specific instructions |
| `specialInstructions` | Agent-specific notes | Append to compiled prompts |

### 2.1 Add to AgentName Type

```typescript
export type AgentName = "claude" | "copilot" | "codex" | "goose" | "opencode" | "myagent";
```

### 2.2 Add Capabilities Definition

```typescript
export const agentCapabilities: Record<AgentName, AgentCapabilities> = {
  // ... existing agents ...

  myagent: {
    // Tools
    supportsFileRead: true,
    supportsFileWrite: true,
    supportsBash: true,
    supportsGit: true,
    supportsWebSearch: false,  // Set based on agent features
    supportsWebFetch: false,

    // Prompt features
    supportsSystemPrompt: false,  // Or true if agent supports it
    supportsAppendSystemPrompt: false,
    maxPromptLength: undefined,

    // Session features
    supportsSessionResume: true,  // Set based on agent features
    supportsSessionFork: false,

    // Output features
    supportsStructuredOutput: false,
    supportsStreamingJson: true,

    // Interaction
    supportsHumanQuestions: false,
    supportsPlanMode: false,

    // Code intelligence
    supportsLSP: false,

    // Special instructions
    specialInstructions: [
      "Add any agent-specific instructions here",
    ],
  },
};
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
  myagent: MyAgentProvider,  // Add here
  opencode: OpenCodeAgentProvider,
} as const;
```

### 3.3 Add Switch Cases

In `createAgentByName()`:
```typescript
case "myagent":
  return createMyAgentAgent(isInteractive, model);
```

In `createAgent()`:
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
  const options: MyAgentProviderOptions = {
    interactive,
    streamOutput: true,
    model: model,
  };

  return new MyAgentProvider(options);
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

```typescript
const agentModels: Record<string, { models: string[]; default?: string }> = {
  // ... existing agents ...
  myagent: {
    models: ["model-a", "model-b", "model-c"],
    default: "model-a",
  },
};
```

## Step 5: Update User Config

Edit `src/user-config.ts`:

### 5.1 Add to KNOWN_AGENTS

```typescript
export const KNOWN_AGENTS = ["claude", "copilot", "codex", "goose", "myagent", "opencode"] as const;
```

### 5.2 Add Config Schema (if needed)

```typescript
const MyAgentConfigSchema = BaseAgentConfigSchema.extend({
  // Add any agent-specific config fields
  customOption: z.boolean().optional(),
});
```

### 5.3 Add to AgentSectionSchema

```typescript
const AgentSectionSchema = z.object({
  // ... existing agents ...
  myagent: MyAgentConfigSchema.optional(),
}).passthrough();
```

## Step 6: Export from Index

Edit `src/agents/index.ts`:

```typescript
// MyAgent provider
export type { MyAgentProviderOptions, MyAgentRunningSession, MyAgentStreamEvent } from "./myagent";
export { MyAgentProvider, getActiveMyAgentSession, interjectMyAgentSession } from "./myagent";
```

## Step 7: Add Documentation

### 7.1 Create Agent Doc Page

Create `docs/docs/agents/myagent.md` with:
- Installation instructions
- Configuration options
- Usage examples
- Troubleshooting guide

### 7.2 Update Sidebar

Edit `docs/sidebars.ts` to add the new doc page:
```typescript
items: [
  'agents/README',
  'agents/claude',
  // ... existing agents ...
  'agents/myagent',
],
```

### 7.3 Update Agent Overview

Edit `docs/docs/agents/README.md`:
- Add to supported agents table
- Add to capability comparison
- Add installation instructions

### 7.4 Update Main README

Edit `README.md`:
- Add to supported agents table
- Add to agent capabilities table
- Add installation command

## Step 8: Add Tests

Create test files:

### 8.1 Update Factory Tests

Edit `tests/agents/factory.test.ts` to test the new agent.

### 8.2 Update Integration Tests

Edit `tests/integration/multi-agent-integration.test.ts` to include the new agent.

## Step 9: Validate and Build

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
- [ ] Capabilities defined in `src/agents/capabilities.ts`
- [ ] Factory updated in `src/agents/factory.ts`
- [ ] Availability config in `src/agents/availability.ts`
- [ ] User config updated in `src/user-config.ts`
- [ ] Exports added in `src/agents/index.ts`
- [ ] Documentation page created
- [ ] Sidebar updated
- [ ] Agent overview updated
- [ ] Main README updated
- [ ] Tests added/updated
- [ ] `bun validate` passes
- [ ] `bun test` passes
- [ ] Docs build successfully
