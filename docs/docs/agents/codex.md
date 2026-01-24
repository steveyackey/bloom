# Codex Agent

Codex is OpenAI's coding agent CLI, offering unique features like session forking and resume capabilities. It's ideal for exploratory work where you want to try multiple approaches.

## Prerequisites

1. **OpenAI Account**: Create an account at [openai.com](https://openai.com)
2. **API Key**: Generate an API key from the OpenAI platform
3. **Codex CLI**: Install the command-line tool

## Installation

See the official [OpenAI Codex CLI documentation](https://github.com/openai/codex) for installation instructions.

After installation, verify it's working:

```bash
codex --version
```

## Configuration

### Basic Configuration

```yaml
# ~/.bloom/config.yaml
interactiveAgent:
  agent: codex

nonInteractiveAgent:
  agent: codex
```

### Model Selection

```yaml
nonInteractiveAgent:
  agent: codex
  model: gpt-4o  # Specify OpenAI model
```

## Capabilities

| Capability | Supported | Notes |
|------------|:---------:|-------|
| File Read | Yes | Read files in working directory |
| File Write | Yes | Create and modify files |
| Bash/Terminal | Yes | Execute shell commands (sandboxed) |
| Git Operations | Yes | Full git support |
| Web Search | Yes | Via `--search` flag |
| Web Fetch | No | No direct URL fetching |
| Session Resume | Yes | Via `codex resume` |
| Session Fork | Yes | Via `codex fork` |
| Human Questions | No | Runs to completion |

### Unique Features

#### Session Resume & Fork

Resume or fork previous sessions:

```bash
# Resume with interactive picker
codex resume

# Resume most recent session
codex resume --last

# Fork with interactive picker  
codex fork

# Fork most recent session
codex fork --last
```

Session forking creates a new session with the same context, allowing you to:
- Try different implementations
- Compare approaches
- Recover from mistakes without starting over

#### Web Search

Enable live web search for the model:

```bash
codex --search "find the latest React 19 features"
```

#### Sandbox Control

Control filesystem access levels with `-s/--sandbox`:

```bash
# Read-only access (safest)
codex -s read-only "analyze this code"

# Write to workspace only
codex -s workspace-write "implement this feature"

# Full access (dangerous)
codex -s danger-full-access "system-wide changes"
```

#### Approval Policies

Control when the model requires approval with `-a/--ask-for-approval`:

| Policy | Behavior |
|--------|----------|
| `untrusted` | Only run "trusted" commands without asking |
| `on-failure` | Ask only when a command fails |
| `on-request` | Model decides when to ask |
| `never` | Never ask for approval |

The `--full-auto` flag is a convenience alias for `-a on-request -s workspace-write`.

## Provider-Specific Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | (CLI default) | Model to use (`-m/--model`) |
| `dangerouslyBypassApprovalsAndSandbox` | boolean | `true` | Skip all prompts and sandbox (matches Claude's default) |
| `fullAuto` | boolean | `false` | Use `--full-auto` mode (sandboxed) |
| `approvalPolicy` | string | - | Override approval policy (`-a`) |
| `sandbox` | string | - | Override sandbox mode (`-s`) |
| `enableSearch` | boolean | `false` | Enable web search (`--search`) |

## CLI Flags Reference

When Bloom runs Codex, it uses these patterns:

```bash
# Non-interactive execution (default - matches Claude's behavior)
codex exec --dangerously-bypass-approvals-and-sandbox "prompt"

# Interactive TUI mode
codex --dangerously-bypass-approvals-and-sandbox "prompt"

# With specific model
codex exec -m o3 --dangerously-bypass-approvals-and-sandbox "prompt"

# With search enabled
codex exec --dangerously-bypass-approvals-and-sandbox --search "prompt"

# Sandboxed mode (use fullAuto: true)
codex exec --full-auto "prompt"

# Resume session (interactive picker)
codex resume

# Resume most recent session
codex resume --last

# Fork session
codex fork
```

## Troubleshooting

### "codex: command not found"

**Cause**: Codex CLI not installed

**Solution**: Install Codex using the [official docs](https://github.com/openai/codex) and ensure the binary is in your PATH.

### "Authentication failed"

**Cause**: Missing or invalid `OPENAI_API_KEY`

**Solution**:
```bash
# Check if set
echo $OPENAI_API_KEY

# Set if missing
export OPENAI_API_KEY="sk-..."

# Verify at platform.openai.com
```

### "Rate limit exceeded"

**Cause**: Too many API requests or token usage

**Solution**:
- Wait and retry (rate limits reset over time)
- Check your OpenAI usage and limits
- Consider reducing parallel agents

### "Model not found"

**Cause**: Invalid model name or no access

**Solution**:
- Use valid model names: `gpt-4o`, `gpt-4o-mini`, etc.
- Check model availability in your OpenAI account
- Some models require specific access tiers

### Session Fork Fails

**Cause**: Invalid session ID or session expired

**Solution**:
- Use `codex resume` or `codex fork` without arguments to see available sessions
- Use `--last` flag to quickly access most recent session
- Sessions may expire after some time

## Best Practices

### For Exploratory Work

1. Use session forking to try multiple approaches
2. Fork before risky changes
3. Compare results across forks

### Sandbox Guidelines

| Sandbox Level | Use Case |
|---------------|----------|
| `read-only` | Code analysis, review |
| `workspace-write` | Standard development (default with `--full-auto`) |
| `danger-full-access` | System-wide changes (use with caution) |

### Approval Policy Guidelines

| Policy | Use Case |
|--------|----------|
| `untrusted` | Maximum safety, approve most commands |
| `on-failure` | Trust most operations, escalate on errors |
| `on-request` | Let the model decide (default with `--full-auto`) |
| `never` | Fully autonomous, no interruptions |

## Example Session

```bash
# Start interactive session with full auto
codex --full-auto "implement user authentication"

# Run non-interactively
codex exec --full-auto "add unit tests for auth module"

# Fork most recent session to try alternative approach
codex fork --last

# Resume where you left off
codex resume --last
```

## Comparison with Other Agents

| Aspect | Codex | Claude | OpenCode |
|--------|-------|--------|----------|
| Session Fork | Yes | No | No |
| Session Resume | Yes | Yes | Yes |
| Web Search | Yes | Yes | No |
| Human Questions | No | Yes | No |
| Web Fetch | No | Yes | No |
| LSP Support | No | No | Yes |

Use Codex when:
- Exploring multiple implementation approaches
- Want sandbox control over file access
- Prefer OpenAI models
- Need session forking capabilities

Use Claude when:
- Need human-in-the-loop capabilities
- Want TodoWrite progress tracking
- Need web fetch capabilities

Use OpenCode when:
- Need precise code intelligence via LSP
- Want multi-provider flexibility
