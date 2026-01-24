---
sidebar_position: 4
title: Agents
---

# Agent Reference

Bloom supports multiple AI agent providers, each with different capabilities and strengths. This guide explains how agents work, how to configure them, and what each agent provider offers.

## Overview

An **agent** in Bloom is an AI coding assistant that executes tasks. Bloom's orchestrator assigns tasks to agents based on availability and configuration. Agents run autonomously, making code changes, running tests, and managing git operations.

## Supported Agents

Bloom supports five agent providers:

| Agent | CLI Command | Key Strengths | Session Resume | LSP Support |
|-------|------------|---------------|----------------|-------------|
| **Claude** | `claude` | TodoWrite tool, Task subagents, Web search | ✓ | - |
| **Copilot** | `copilot` | Multi-model, GitHub MCP, Fine-grained permissions | ✓ | - |
| **Codex** | `codex` | Session forking, Structured output, JSON schemas | ✓ | - |
| **Cline** | `cline` | Plan/Act modes, Task checkpoints | ✓ | - |
| **OpenCode** | `opencode` | Native LSP, Multi-provider, Session export | ✓ | ✓ |

## Agent Capabilities

Each agent has a specific set of capabilities that determine what it can do and how prompts are compiled for it.

### Core Capabilities

#### Tool Capabilities

- **supportsFileRead**: Can read files from the filesystem (all agents support this)
- **supportsFileWrite**: Can create and modify files (all agents support this)
- **supportsBash**: Can execute terminal/shell commands (all agents support this)
- **supportsGit**: Can perform git operations (all agents support this)
- **supportsWebSearch**: Can search the web for information (Claude, Copilot, Codex)
- **supportsWebFetch**: Can fetch and read web pages directly (Claude, Copilot)

#### Prompt Features

- **supportsSystemPrompt**: Supports a separate system prompt parameter
- **supportsAppendSystemPrompt**: Can append to an existing system prompt (Claude only)
- **maxPromptLength**: Maximum prompt length in characters (optional)

#### Session Features

- **supportsSessionResume**: Can resume a previous session (all agents support this)
- **supportsSessionFork**: Can fork/branch an existing session (Codex only)

#### Output Features

- **supportsStructuredOutput**: Can enforce structured output via JSON schema (Codex only)
- **supportsStreamingJson**: Outputs JSON events in streaming format (all agents support this)

#### Interaction Features

- **supportsHumanQuestions**: Can ask clarifying questions to humans (Claude, Cline)
- **supportsPlanMode**: Supports a plan-then-act workflow (Cline only)
- **supportsLSP**: Native Language Server Protocol support for code intelligence (OpenCode only)

### Agent-Specific Features

Each agent has special instructions that guide its behavior:

**Claude:**
- Use TodoWrite tool to track task progress
- Can use Task tool to spawn subagents for complex tasks
- Use WebFetch for retrieving web page content

**Copilot:**
- Has access to GitHub MCP server by default for GitHub operations
- Supports multi-model selection via --model flag (Claude, GPT, Gemini)
- Use --allow-tool and --deny-tool for fine-grained permission control

**Codex:**
- Supports session forking to explore alternative approaches
- Can enforce output format via --output-schema with JSON schema
- Use --sandbox flag to control file system access level

**Cline:**
- Uses Plan mode by default - creates detailed plan before acting
- Switch to Act mode with --mode act for direct execution
- Requires Cline Core gRPC service running on localhost:50052
- Use cline task commands for checkpoint and restore capabilities

**OpenCode:**
- Has native LSP (Language Server Protocol) support for accurate code intelligence
- Model must be explicitly specified - no default model in non-interactive mode
- Use provider/model format for model selection (e.g., anthropic/claude-sonnet-4)
- Supports session export/import for debugging and sharing

## Configuration

### Default Agent

Set your preferred agent in `~/.bloom/config.yaml`:

```yaml
agent:
  default: claude  # or copilot, codex, cline, opencode
```

### Legacy Configuration

The older configuration format is still supported:

```yaml
interactiveAgent:
  agent: claude
  model: opus

nonInteractiveAgent:
  agent: opencode
  model: anthropic/claude-sonnet-4
```

### Per-Agent Configuration

Configure settings for specific agents:

```yaml
agent:
  default: claude
  
  claude:
    model: sonnet
  
  opencode:
    model: anthropic/claude-sonnet-4  # REQUIRED for OpenCode
  
  cline:
    mode: act  # or 'plan'
    provider: anthropic
```

### Task-Level Override

Override the agent for a specific task in `tasks.yaml`:

```yaml
tasks:
  - id: special-task
    agent: opencode  # Use OpenCode for this task only
    title: Task requiring LSP support
```

## Prompt Compilation

Bloom uses a **Prompt Compiler** to generate agent-specific prompts based on capabilities. The compiler processes conditional sections and variable substitutions.

### Conditional Sections

Prompt templates use conditional markers to include/exclude sections:

```markdown
<!-- @if supportsHumanQuestions -->
## Human Questions

You can ask questions to the human operator...
<!-- @endif -->
```

If the agent supports the capability, the section is included. Otherwise, it's removed.

### Variable Substitution

Variables are replaced with actual values:

```markdown
Agent: {{AGENT_NAME}}
Task: {{TASK_ID}}
CLI: {{TASK_CLI}}
```

### Viewing Compiled Prompts

See what prompt an agent receives:

```bash
# Show compiled prompt for an agent
bloom prompt compile claude

# Show with verbose capability info
bloom prompt compile claude --verbose

# Compare two agents
bloom prompt compile claude --diff opencode

# Compile for a specific task
bloom prompt compile claude --task my-task-id
```

## Agent Selection

### Automatic Selection

By default, Bloom uses your configured default agent:

```yaml
agent:
  default: claude
```

All tasks without an explicit `agent` field will use this default.

### Per-Task Selection

Override the agent for specific tasks:

```yaml
tasks:
  - id: needs-lsp
    agent: opencode
    title: Refactor with LSP support
  
  - id: needs-planning
    agent: cline
    title: Complex feature requiring plan approval
  
  - id: standard-task
    # Uses default agent (no override)
    title: Standard implementation
```

### Interactive vs Non-Interactive

Bloom runs agents in two modes:

**Interactive Mode:**
- Used by `bloom enter` command
- Terminal access for human-in-the-loop interaction
- Stdio: inherit (you see and interact with the agent)
- Uses `interactiveAgent` config (legacy) or default agent

**Non-Interactive Mode:**
- Used by `bloom run` orchestrator
- Autonomous execution with captured output
- Stdio: piped (orchestrator monitors output)
- Uses `nonInteractiveAgent` config (legacy) or default agent

## CLI Commands

### Run Orchestrator

Start all agents to work on available tasks:

```bash
bloom run
```

### Run Specific Agent

Run a single agent's work loop:

```bash
bloom agent run agent-name
```

### List Agents

Show all agents defined in tasks.yaml:

```bash
bloom agents
# or
bloom agent list
```

### Interactive Session

Start an interactive agent session:

```bash
bloom enter
```

### Interject Running Agent

Send an interjection signal to pause/stop a running agent:

```bash
bloom agent interject agent-name
bloom agent interject agent-name "reason for stopping"
```

## Best Practices

### Choosing an Agent

**Use Claude when:**
- You need web search capabilities
- TodoWrite tracking is helpful
- You want to spawn subagents for subtasks

**Use Copilot when:**
- You need GitHub operations (MCP built-in)
- You want multi-model flexibility
- Fine-grained tool permissions are important

**Use Codex when:**
- You need to enforce output schemas
- Session forking to explore alternatives is useful
- Structured output is required

**Use Cline when:**
- Explicit planning phase is beneficial
- Task checkpoints and approvals are needed
- You want plan review before execution

**Use OpenCode when:**
- Native LSP support is critical
- Accurate code navigation is required
- You need session export for debugging

### Multi-Agent Workflows

You can use different agents for different tasks:

```yaml
tasks:
  - id: research-phase
    agent: claude
    title: Research and gather requirements
  
  - id: planning-phase
    agent: cline
    depends_on: [research-phase]
    title: Create detailed implementation plan
  
  - id: implementation
    agent: opencode
    depends_on: [planning-phase]
    title: Implement with LSP-guided refactoring
  
  - id: github-pr
    agent: copilot
    depends_on: [implementation]
    title: Create PR and add reviewers
```

### Performance Considerations

- **Session Resume**: All agents support resuming interrupted work
- **Parallel Execution**: Multiple agents can work simultaneously on different tasks
- **Capability-Based Prompts**: Agents only receive relevant instructions
- **Streaming Output**: Real-time monitoring of agent activity

## Troubleshooting

### Agent Not Found

```
Error: Unknown agent 'myagent'
```

Valid agents: claude, copilot, codex, cline, opencode

### OpenCode Requires Model

OpenCode requires explicit model specification:

```yaml
agent:
  opencode:
    model: anthropic/claude-sonnet-4
```

### Cline Requires Service

Cline requires the Cline Core gRPC service:

```bash
# Ensure service is running on localhost:50052
cline service start
```

### Session Resume Issues

If session resume fails:

1. Check that the agent supports session resume (all current agents do)
2. Verify the session ID is valid
3. Check agent logs for errors
4. Try resetting the task: `bloom reset task-id`

## See Also

- [Configuration Reference](/reference/configuration) - Agent configuration details
- [Task Schema](/reference/task-schema) - Task-level agent overrides
- [Agent Collaboration](/best-practices/agent-collaboration) - Multi-agent patterns
