# Multi-Agent Support

Bloom supports multiple AI coding agents, enabling you to choose the best tool for each workflow. You can configure different agents for interactive sessions (like `bloom enter` and `bloom refine`) versus autonomous task execution (`bloom run`).

## Supported Agents

| Agent | CLI Command | Provider | Best For |
|-------|-------------|----------|----------|
| [Claude](./claude.md) | `claude` | Anthropic | General development, web research |
| [Copilot](./copilot.md) | `copilot` | GitHub | GitHub-integrated workflows |
| [Codex](./codex.md) | `codex` | OpenAI | Structured output, exploratory work |
| [Cline](./cline.md) | `cline` | Multi-provider | Careful, planned execution |
| [OpenCode](./opencode.md) | `opencode` | Multi-provider | Code intelligence via LSP |

## Capability Comparison

| Feature | Claude | Copilot | Codex | Cline | OpenCode |
|---------|:------:|:-------:|:-----:|:-----:|:--------:|
| File Read/Write | Yes | Yes | Yes | Yes | Yes |
| Bash/Terminal | Yes | Yes | Yes | Yes | Yes |
| Git Operations | Yes | Yes | Yes | Yes | Yes |
| **Web Search** | Yes | Yes | Yes | No | No |
| **Web Fetch** | Yes | Yes | No | No | No |
| **Session Resume** | Yes | Yes | Yes | Yes | Yes |
| **Session Fork** | No | No | Yes | No | No |
| **Structured Output** | No | No | Yes | No | No |
| **Plan Mode** | No | No | No | Yes | No |
| **Human Questions** | Yes | No | No | Yes | No |
| **LSP Integration** | No | No | No | No | Yes |
| Streaming JSON | Yes | Yes | Yes | Yes | Yes |

### Key Differentiators

- **Web Search**: Claude, Copilot, and Codex can search the web for documentation and examples
- **Plan Mode**: Cline creates a detailed plan and waits for approval before executing
- **Session Fork**: Codex can branch sessions to explore alternative approaches
- **LSP Integration**: OpenCode has native Language Server Protocol support for accurate code intelligence
- **Human Questions**: Claude and Cline can pause to ask clarifying questions during execution

## Configuration

Agent configuration is stored in `~/.bloom/config.yaml`:

```yaml
# Git protocol preference (ssh or https)
gitProtocol: ssh

# Agent for interactive commands (bloom enter, bloom refine)
interactiveAgent:
  agent: claude
  model: opus  # Optional: model variant

# Agent for autonomous execution (bloom run)
nonInteractiveAgent:
  agent: opencode
  model: anthropic/claude-sonnet-4
```

### Configuration Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `interactiveAgent.agent` | string | `claude` | Agent for interactive sessions |
| `interactiveAgent.model` | string | (agent default) | Model to use |
| `nonInteractiveAgent.agent` | string | `claude` | Agent for autonomous tasks |
| `nonInteractiveAgent.model` | string | (agent default) | Model to use |

### Agent Names

Valid agent names: `claude`, `copilot`, `codex`, `cline`, `opencode`

## Choosing an Agent

### For Interactive Development (`bloom enter`, `bloom refine`)

| Use Case | Recommended Agent | Why |
|----------|-------------------|-----|
| General development | Claude | Rich tool ecosystem, web search |
| GitHub-focused work | Copilot | Native GitHub MCP integration |
| Careful, planned changes | Cline | Plan mode for review before action |

### For Autonomous Tasks (`bloom run`)

| Use Case | Recommended Agent | Why |
|----------|-------------------|-----|
| Standard task execution | Claude | TodoWrite for progress tracking |
| Code-heavy refactoring | OpenCode | LSP provides accurate code intelligence |
| Exploratory work | Codex | Session forking to try alternatives |
| Risk-averse execution | Cline (Act mode) | Explicit approval gates |

## Installation Quick Reference

```bash
# Claude (Anthropic)
npm install -g @anthropic-ai/claude-code
export ANTHROPIC_API_KEY="your-key"

# Copilot (GitHub)
gh extension install github/gh-copilot
gh auth login

# Codex (OpenAI)
npm install -g @openai/codex
export OPENAI_API_KEY="your-key"

# Cline (requires gRPC service)
npm install -g cline
cline-core start  # Or use VS Code extension

# OpenCode (Go)
go install github.com/sst/opencode@latest
# Configure provider API keys as needed
```

See individual agent pages for detailed setup instructions.

## Troubleshooting

### Agent Not Found

If you get "command not found" errors:

1. Verify the CLI is installed: `which <agent-name>`
2. Check your PATH includes the installation directory
3. For npm packages: ensure global npm bin is in PATH

### Authentication Errors

- **Claude**: Check `ANTHROPIC_API_KEY` environment variable
- **Copilot**: Run `gh auth status` to verify GitHub auth
- **Codex**: Check `OPENAI_API_KEY` environment variable
- **Cline**: Ensure gRPC service is running (`cline-core status`)
- **OpenCode**: Verify provider-specific API keys are set

### Model Not Found

When specifying models:
- **Claude**: Use Anthropic model names (e.g., `opus`, `sonnet`)
- **Copilot**: Use provider-qualified names (e.g., `claude-3.5-sonnet`)
- **Codex**: Use OpenAI model names
- **OpenCode**: Use `provider/model` format (e.g., `anthropic/claude-sonnet-4`)

## Architecture

Bloom uses a provider abstraction layer to support multiple agents:

```
┌─────────────────┐
│   Bloom TUI     │
└────────┬────────┘
         │
┌────────▼────────┐
│  Agent Factory  │  ← Reads ~/.bloom/config.yaml
└────────┬────────┘
         │
    ┌────┴────┬────────┬────────┬─────────┐
    ▼         ▼        ▼        ▼         ▼
┌───────┐ ┌───────┐ ┌─────┐ ┌─────┐ ┌────────┐
│Claude │ │Copilot│ │Codex│ │Cline│ │OpenCode│
└───┬───┘ └───┬───┘ └──┬──┘ └──┬──┘ └───┬────┘
    │         │        │       │        │
    ▼         ▼        ▼       ▼        ▼
  claude    copilot  codex   cline   opencode
   CLI       CLI      CLI     CLI      CLI
```

Each provider implements the `Agent` interface:
- `run(options)`: Execute a prompt and return results
- `getActiveSession()`: Get current session for monitoring

See the source code in `src/agents/` for details on adding new agent providers.
