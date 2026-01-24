# Multi-Agent Support

Bloom supports multiple AI coding agents, enabling you to choose the best tool for each workflow. You can configure different agents for interactive sessions (like `bloom enter` and `bloom refine`) versus autonomous task execution (`bloom run`).

## Philosophy

Bloom trusts each agent to know its own capabilities. Agents inject their own system prompts with their features, tools, and limitations. This means:

- Agents can add features without requiring Bloom updates
- You can customize agents via their own configuration (MCP servers, extensions, etc.)
- Bloom focuses on orchestration, not capability tracking

## Supported Agents

| Agent | CLI Command | Provider | Best For |
|-------|-------------|----------|----------|
| [Claude](./claude.md) | `claude` | Anthropic | General development, web research |
| [Copilot](./copilot.md) | `copilot` | GitHub | GitHub-integrated workflows |
| [Codex](./codex.md) | `codex` | OpenAI | Structured output, exploratory work |
| [Goose](./goose.md) | `goose` | Multi-provider | Extensible automation via MCP |
| [OpenCode](./opencode.md) | `opencode` | Multi-provider | Code intelligence via LSP |

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

Valid agent names: `claude`, `copilot`, `codex`, `goose`, `opencode`

## Choosing an Agent

### For Interactive Development (`bloom enter`, `bloom refine`)

| Use Case | Recommended Agent | Why |
|----------|-------------------|-----|
| General development | Claude | Rich tool ecosystem, web search |
| GitHub-focused work | Copilot | Native GitHub MCP integration |
| Extensible automation | Goose | MCP extensions for custom capabilities |

### For Autonomous Tasks (`bloom run`)

| Use Case | Recommended Agent | Why |
|----------|-------------------|-----|
| Standard task execution | Claude | TodoWrite for progress tracking |
| Code-heavy refactoring | OpenCode | LSP provides accurate code intelligence |
| Exploratory work | Codex | Session forking to try alternatives |

## Installation

Each agent has its own installation process. See their official documentation:

| Agent | Official Docs |
|-------|---------------|
| Claude | [Claude Code Docs](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) |
| Copilot | [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) |
| Codex | [OpenAI Codex CLI](https://github.com/openai/codex) |
| Goose | [Goose Docs](https://block.github.io/goose/) |
| OpenCode | [OpenCode Docs](https://opencode.ai/) |

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
- **Goose**: Run `goose configure` to set up provider
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
│Claude │ │Copilot│ │Codex│ │Goose│ │OpenCode│
└───┬───┘ └───┬───┘ └──┬──┘ └──┬──┘ └───┬────┘
    │         │        │       │        │
    ▼         ▼        ▼       ▼        ▼
  claude    copilot  codex   goose   opencode
   CLI       CLI      CLI     CLI      CLI
```

Each provider implements the `Agent` interface:
- `run(options)`: Execute a prompt and return results
- `getActiveSession()`: Get current session for monitoring

See the source code in `src/agents/` for details on adding new agent providers.
