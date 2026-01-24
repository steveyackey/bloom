# OpenCode Agent

OpenCode is a multi-provider coding agent with native Language Server Protocol (LSP) support. LSP integration provides accurate code intelligence features like go-to-definition, find references, and hover information.

## Prerequisites

1. **Go**: Version 1.21 or higher (for installation)
2. **API Keys**: For your chosen AI provider (Anthropic, OpenAI, etc.)

## Installation

See the official [OpenCode documentation](https://opencode.ai/) for installation instructions.

After installation, verify it's working:

```bash
opencode --version
```

## Configuration

### Basic Configuration

```yaml
# ~/.bloom/config.yaml
interactiveAgent:
  agent: opencode
  model: anthropic/claude-sonnet-4

nonInteractiveAgent:
  agent: opencode
  model: anthropic/claude-sonnet-4
```

### Model Selection (Required)

OpenCode requires explicit model specification in non-interactive mode. Use the `provider/model` format:

```yaml
nonInteractiveAgent:
  agent: opencode
  model: anthropic/claude-sonnet-4  # REQUIRED
```

#### Available Models

To see available models for your configured providers, run:

```bash
opencode models
```

Models use the `provider/model` format (e.g., `anthropic/claude-sonnet-4`, `openai/gpt-4o`).

## Capabilities

| Capability | Supported | Notes |
|------------|:---------:|-------|
| File Read | Yes | Read files in working directory |
| File Write | Yes | Create and modify files |
| Bash/Terminal | Yes | Execute shell commands |
| Git Operations | Yes | Full git support |
| Web Search | No | Not supported |
| Web Fetch | No | Not supported |
| Session Resume | Yes | Via `-s <session_id>` or `-c` flag |
| LSP Integration | Yes | Native LSP for code intelligence |
| Human Questions | No | Runs to completion |

### Unique Features

#### Native LSP Support

OpenCode has built-in Language Server Protocol support, providing:

- **Go-to-Definition**: Navigate to symbol definitions
- **Find References**: Locate all usages of a symbol
- **Hover Information**: Get type info and documentation
- **Diagnostics**: Real-time error and warning detection
- **Code Actions**: Suggested fixes and refactors

This means OpenCode can:
- Understand code structure more accurately
- Navigate large codebases efficiently
- Provide precise code modifications

#### Multi-Provider Support

Use models from different providers through a unified interface:

```bash
# Anthropic
opencode -m anthropic/claude-sonnet-4 "task"

# OpenAI
opencode -m openai/gpt-4o "task"
```

#### Session Export/Import

Export sessions for debugging or sharing:

```bash
# Export session
opencode session export <session_id> > session.json

# Import session
opencode session import < session.json
```

## Provider-Specific Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoApprove` | boolean | `true` | Auto-approve all tool calls |
| `model` | string | **REQUIRED** | Model in `provider/model` format |

### Auto-Approve Configuration

Bloom sets `autoApprove: true` via the `OPENCODE_CONFIG_CONTENT` environment variable:

```json
{
  "permission": {
    "*": "allow"
  }
}
```

## CLI Flags Reference

When Bloom runs OpenCode:

```bash
# Interactive mode
opencode --prompt "system + user prompt" -m provider/model

# Streaming mode (autonomous)
opencode run --format json -m provider/model "prompt"

# Resume session
opencode run --format json -s <session_id> -m provider/model "prompt"
```

## Troubleshooting

### "opencode: command not found"

**Cause**: OpenCode not installed or not in PATH

**Solution**: Install OpenCode using the [official docs](https://opencode.ai/) and ensure the binary is in your PATH.

### "Model selection is REQUIRED"

**Cause**: No model specified in streaming mode

**Solution**:
OpenCode requires explicit model selection in non-interactive mode:

```yaml
# ~/.bloom/config.yaml
nonInteractiveAgent:
  agent: opencode
  model: anthropic/claude-sonnet-4  # Add this
```

### "Invalid model format"

**Cause**: Model not in `provider/model` format

**Solution**:
Use the correct format:
- ❌ `claude-sonnet-4`
- ✅ `anthropic/claude-sonnet-4`

### "Authentication failed" or "Invalid API key"

**Cause**: Missing or invalid API key for the provider

**Solution**:
```bash
# For Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# For OpenAI
export OPENAI_API_KEY="sk-..."

# Verify the key is set
echo $ANTHROPIC_API_KEY
```

### "Provider not found"

**Cause**: Unknown provider name

**Solution**:
Run `opencode models` to see models for your configured providers.

### LSP Features Not Working

**Cause**: Language server not available for the file type

**Solution**:
- Install the relevant language server
- Ensure it's in PATH
- Check OpenCode logs for LSP errors

## Best Practices

### For Code-Heavy Work

1. Use OpenCode when doing significant refactoring
2. LSP provides accurate code understanding
3. Better for navigating large codebases

### Model Selection

Run `opencode models` to see models for your configured providers. Models are specified in `provider/model` format.

### Session Management

```bash
# Continue most recent session
opencode -c "continue working"

# Resume specific session
opencode -s abc123 "continue"

# Export for debugging
opencode session export <id> > debug.json
```

## Example Session

```bash
# Set up API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Run autonomous task (model required)
bloom run
# OpenCode will:
# 1. Use LSP for code intelligence
# 2. Execute tasks with provider model
# 3. Auto-approve tool calls
# 4. Stream JSON output for monitoring
```

## Comparison with Other Agents

| Aspect | OpenCode | Claude | Goose |
|--------|----------|--------|-------|
| LSP Support | Yes | No | No |
| Web Search | No | Yes | No |
| Human Questions | No | Yes | Yes |
| Multi-Provider | Yes | No | Yes |
| MCP Extensions | No | No | Yes |

Use OpenCode when:
- Need precise code intelligence via LSP
- Doing significant refactoring
- Want multi-provider flexibility
- Working with large codebases

Use Claude when:
- Need web search capabilities
- Want human-in-the-loop features
- Prefer TodoWrite progress tracking

Use Goose when:
- Want extensibility via MCP
- Need scheduled automation
- Prefer open-source, local execution
