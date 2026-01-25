# Adding New Agent Providers

This guide explains how to add a new AI agent provider to Bloom.

## Philosophy

Bloom trusts agents to know their own capabilities. Each agent injects its own system prompt with its features, tools, and limitations. Bloom only needs to know:

1. How to spawn and communicate with the agent CLI
2. How to check if the CLI is installed
3. How to list available models

This keeps Bloom simple and avoids the need to update docs every time an agent adds features.

## Two Ways to Add Agents

### Option 1: YAML Schema (Recommended)

For agents with standard CLI patterns, define them via YAML schema. This is the simplest approach and works for most agents.

### Option 2: Custom TypeScript Provider

For agents with unique streaming formats, special session handling, or other complex behavior, create a TypeScript provider class.

---

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

---

## Option 1: YAML Schema Definition

### Agent Definition Schema

```yaml
myagent:
  command: myagent                        # CLI command name
  version: ["--version"]                  # How to check version
  docs: https://myagent.dev/docs          # Official documentation URL
  description: "My custom AI agent"       # Description for help text

  # Common flags
  flags:
    model: ["--model", "-m"]              # Model selection flag(s)
    resume: ["--resume", "-r"]            # Session resume flag(s)
    approval_bypass: ["--yes"]            # Approval bypass for headless runs
    system_prompt: ["--system"]           # System prompt flag(s)

  # Interactive mode configuration
  interactive:
    subcommand: null                      # Optional subcommand (e.g., "session")
    base_args: []                         # Args always added in this mode
    prompt: positional                    # "positional" or {flag: "-p"}
    prepend_system_prompt: true           # Prepend system prompt to user prompt

  # Streaming/non-interactive mode configuration
  streaming:
    subcommand: run                       # Optional subcommand (e.g., "run", "exec")
    base_args: ["--output-format", "json"]
    prompt: {flag: "-p"}
    prepend_system_prompt: true

  # Environment variables
  env:
    inject:                               # Env vars to always set
      MY_CONFIG: '{"auto_approve": true}'
    required:                             # Env vars that must be present
      - MY_API_KEY

  # Output parsing
  output:
    format: stream-json                   # "stream-json", "json", or "text"
    session_id_field: session_id          # JSON field for session ID
    session_id_field_alt: sessionID       # Alternative field name

  # Optional features
  models_command: ["models"]              # Command to list available models
  model_required_for_streaming: false     # Whether model must be specified
```

### Adding a Built-in Agent via Schema

1. **Edit `src/agents/builtin-agents.ts`:**

```typescript
import type { AgentDefinition } from "./schema";

export const myagentAgent: AgentDefinition = {
  command: "myagent",
  version: ["--version"],
  docs: "https://myagent.dev/docs",
  description: "My custom AI agent",

  flags: {
    model: ["--model"],
    resume: ["--resume"],
    approval_bypass: ["--yes"],
    system_prompt: ["--system"],
  },

  interactive: {
    base_args: [],
    prompt: "positional",
    prepend_system_prompt: true,
  },

  streaming: {
    subcommand: "run",
    base_args: ["--output-format", "json"],
    prompt: { flag: "-p" },
    prepend_system_prompt: true,
  },

  env: {
    inject: {},
    required: ["MY_API_KEY"],
  },

  output: {
    format: "stream-json",
    session_id_field: "session_id",
  },

  model_required_for_streaming: false,
};

// Add to BUILTIN_AGENTS
export const BUILTIN_AGENTS: Record<string, AgentDefinition> = {
  // ... existing agents ...
  myagent: myagentAgent,
};
```

2. **Update `src/agents/capabilities.ts`:**

```typescript
export type BuiltinAgentName = "claude" | "copilot" | "codex" | "goose" | "opencode" | "myagent";
export const REGISTERED_AGENTS: BuiltinAgentName[] = [
  "claude", "copilot", "codex", "goose", "myagent", "opencode"
];
```

3. **Add documentation** in `docs/docs/agents/myagent.md`

4. **Update `docs/sidebars.ts`** and `README.md`

---

## Option 2: Custom TypeScript Provider

For agents with complex behavior that can't be captured in the schema (custom streaming formats, special session handling, etc.):

### Step 1: Create the Provider File

Create `src/agents/myagent.ts`:

```typescript
import { type ChildProcess, spawn } from "node:child_process";
import type { Agent, AgentConfig, AgentRunOptions, AgentRunResult, AgentSession } from "./core";

export interface MyAgentProviderOptions extends AgentConfig {
  customOption?: boolean;
}

export class MyAgentProvider implements Agent {
  private options: MyAgentProviderOptions;

  constructor(options: MyAgentProviderOptions = {}) {
    this.options = options;
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    // Implement agent execution
    // See existing providers for examples
  }

  getActiveSession(): AgentSession | undefined {
    // Return active session if any
  }
}
```

### Step 2: Update the Factory

Edit `src/agents/factory.ts`:

1. Add import for your provider
2. Add switch case in `createAgentByName()`
3. Add factory helper function

### Step 3: Update Exports

Edit `src/agents/index.ts` to export your provider types and class.

---

## User-Defined Custom Agents

Users can define custom agents in `~/.bloom/config.yaml`:

```yaml
customAgents:
  myagent:
    command: myagent
    version: ["--version"]
    docs: https://myagent.dev
    flags:
      model: ["--model"]
      approval_bypass: ["--yes"]
    interactive:
      base_args: []
      prompt: positional
      prepend_system_prompt: true
    streaming:
      subcommand: run
      base_args: ["--json"]
      prompt: {flag: "-p"}
      prepend_system_prompt: true
    env:
      inject: {}
      required: []
    output:
      format: stream-json
      session_id_field: session_id
    model_required_for_streaming: false
```

These are loaded at runtime and merged with built-in agents.

---

## Testing

```bash
# Run validation
bun validate

# Build docs
cd docs && bun install && bun run build
```

---

## Checklist

### For Schema-Based Agents

- [ ] Agent definition added to `src/agents/builtin-agents.ts`
- [ ] Agent name added to `src/agents/capabilities.ts`
- [ ] Documentation page created in `docs/docs/agents/`
- [ ] Sidebar updated in `docs/sidebars.ts`
- [ ] Main README updated
- [ ] `bun validate` passes
- [ ] Docs build successfully

### For Custom Provider Agents

- [ ] Provider file created in `src/agents/`
- [ ] Factory updated in `src/agents/factory.ts`
- [ ] Exports added in `src/agents/index.ts`
- [ ] Agent name added to `src/agents/capabilities.ts`
- [ ] Documentation page created
- [ ] Sidebar and README updated
- [ ] `bun validate` passes
- [ ] Docs build successfully

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Factory                             │
│  createAgentByName() → checks if built-in or custom         │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌─────────────────────┐   ┌─────────────────────┐
│   Built-in Agents   │   │   Custom Agents     │
│  (Optimized TS)     │   │  (GenericProvider)  │
├─────────────────────┤   ├─────────────────────┤
│ ClaudeAgentProvider │   │ Uses AgentDefinition│
│ CopilotAgentProvider│   │ from YAML schema    │
│ CodexAgentProvider  │   │                     │
│ GooseAgentProvider  │   │                     │
│ OpenCodeAgentProvider│  │                     │
└─────────────────────┘   └─────────────────────┘
          │                       │
          └───────────┬───────────┘
                      ▼
              ┌───────────────┐
              │  Agent CLI    │
              │  (subprocess) │
              └───────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/agents/schema.ts` | Zod schema for agent definitions |
| `src/agents/builtin-agents.ts` | Built-in agent definitions |
| `src/agents/generic-provider.ts` | Schema-driven provider for custom agents |
| `src/agents/loader.ts` | Loads and merges built-in + user agents |
| `src/agents/factory.ts` | Creates agent instances |
| `src/agents/capabilities.ts` | Agent type definitions and re-exports |
