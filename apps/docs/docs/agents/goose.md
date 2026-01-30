# Goose Agent

Goose is Block's open-source AI agent that runs locally and automates engineering tasks. It's highly extensible through MCP (Model Context Protocol) servers and supports multiple LLM providers.

## Prerequisites

1. **LLM Provider**: Access to an LLM provider (Anthropic, OpenAI, etc.)
2. **API Keys**: For your chosen AI provider

## Installation

See the official [Goose documentation](https://block.github.io/goose/) for installation instructions.

After installation, verify it's working and configure your LLM provider:

```bash
goose version
goose configure
```

## Configuration

### Basic Configuration

```yaml
# ~/.bloom/config.yaml
agent:
  defaultInteractive: goose
  defaultNonInteractive: goose
```

### Model Selection

Goose uses the model configured via `goose configure`. You can also specify a default model in your Bloom config:

```yaml
# ~/.bloom/config.yaml
agent:
  defaultInteractive: goose
  defaultNonInteractive: goose

  goose:
    defaultModel: claude-3.5-sonnet  # Optional: override default model
```

### Configuration Commands

```bash
# Set goose as default
bloom config set-interactive goose
bloom config set-noninteractive goose

# Set default model (optional, goose uses its own config by default)
bloom config set-model goose claude-3.5-sonnet
```

## Capabilities

| Capability | Supported | Notes |
|------------|:---------:|-------|
| File Read | Yes | Read files in working directory |
| File Write | Yes | Create and modify files |
| Bash/Terminal | Yes | Execute shell commands |
| Git Operations | Yes | Full git support |
| Web Search | No | Not built-in |
| Web Fetch | Yes | Via Computer Controller extension |
| Session Resume | Yes | Via `--session-id` or `-r` flag |
| MCP Extensions | Yes | Extensible via MCP servers |
| Human Questions | Yes | Interactive session mode |

### Unique Features

#### MCP Extensions

Goose is extensible through MCP (Model Context Protocol) servers. Add extensions via:

```bash
goose configure
```

Popular extensions include:
- **Computer Controller**: Browser automation and file operations
- **GitHub**: GitHub API integration
- **Custom MCP Servers**: Connect any MCP-compatible tool

#### Permission Modes

Goose has four permission modes that control tool approval:

| Mode | Description |
|------|-------------|
| **Auto** (Autonomous) | No approval required - goose can modify files, use extensions freely |
| **Manual** | Requires confirmation before any tool or extension use |
| **Smart** | Risk-based evaluation - auto-approves low-risk, flags high-risk |
| **Chat Only** | Conversation only - no file modifications or extensions |

**Bloom automatically sets `GOOSE_MODE=auto`** for non-interactive execution so tasks run without requiring approval.

To change the mode manually:
- **CLI**: Run `goose configure` → "goose settings" → "goose mode"
- **Mid-session**: Use `/mode auto` command
- **Environment**: Set `GOOSE_MODE=auto|approve|smart|chat`

See [Goose Permissions Guide](https://block.github.io/goose/docs/guides/goose-permissions) for details.

#### Scheduled Automation

Run tasks on a schedule:

```bash
# Add a scheduled job
goose schedule add --schedule-id daily-cleanup --cron "0 9 * * *"

# List scheduled jobs
goose schedule list

# Remove a scheduled job
goose schedule remove --schedule-id daily-cleanup
```

#### Recipes

Create reusable task templates:

```bash
# List available recipes
goose recipe list

# Run a recipe
goose run --recipe my-recipe.yaml

# Validate a recipe
goose recipe validate my-recipe.yaml
```

#### Session Management

```bash
# Start a new session
goose session

# Resume the last session
goose session -r

# Resume a specific session
goose session --session-id abc123

# List all sessions
goose session list

# Export a session
goose session export --session-id abc123 -o session.md
```

## CLI Flags Reference

When Bloom runs Goose:

```bash
# Interactive mode
GOOSE_MODE=auto goose run -s --with-builtin developer -t "prompt"

# Streaming mode (autonomous)
GOOSE_MODE=auto goose run --output-format json --with-builtin developer -t "prompt"

# With system instructions
GOOSE_MODE=auto goose run --with-builtin developer --system "instructions" -t "prompt"

# Resume session
GOOSE_MODE=auto goose run --session-id <session_id> --with-builtin developer -t "prompt"
```

Bloom automatically:
- Sets `GOOSE_MODE=auto` for autonomous execution without approval prompts
- Adds `--with-builtin developer` for development-focused capabilities

### Key Flags

| Flag | Description |
|------|-------------|
| `-t, --text <TEXT>` | Input text directly |
| `-i, --instructions <FILE>` | Path to instruction file |
| `--system <TEXT>` | Additional system instructions |
| `-n, --name <name>` | Name the session |
| `--session-id <id>` | Resume specific session |
| `-r, --resume` | Resume last session |
| `--output-format` | Output format: text, json, stream-json |
| `-q, --quiet` | Suppress non-response output |
| `--no-session` | Run without creating session file |

## Troubleshooting

### "goose: command not found"

**Cause**: Goose not installed or not in PATH

**Solution**: Install Goose using the [official docs](https://block.github.io/goose/) and ensure the binary is in your PATH.

### "No provider configured"

**Cause**: LLM provider not set up

**Solution**:
```bash
goose configure
```

Follow the prompts to select and configure your AI provider.

### "Authentication failed" or "Invalid API key"

**Cause**: Missing or invalid API key

**Solution**:
1. Verify your API key is correct
2. Re-run configuration:
   ```bash
   goose configure
   ```

### Extensions Not Working

**Cause**: Extension not enabled or misconfigured

**Solution**:
```bash
# View current configuration
goose info -v

# Reconfigure extensions
goose configure
```

### Session Resume Issues

**Cause**: Session file corrupted or not found

**Solution**:
```bash
# List available sessions
goose session list

# Start fresh if needed
goose session
```

## Best Practices

### For Automation Tasks

1. Use `goose run` for autonomous execution
2. Enable streaming JSON for monitoring: `--output-format stream-json`
3. Name sessions for easier tracking: `-n task-name`

### For Interactive Development

1. Use `goose session` for exploratory work
2. Resume sessions with `-r` to maintain context
3. Export sessions for documentation: `goose session export`

### For Extensibility

1. Use MCP extensions for specialized capabilities
2. Create recipes for repetitive tasks
3. Use scheduling for automated maintenance

### Model Selection

Configure your preferred model through `goose configure`. Common options:
- **claude-3.5-sonnet**: Good balance of capability and speed
- **gpt-4o**: OpenAI's latest model
- **claude-3-opus**: Maximum capability for complex tasks

## Example Session

```bash
# Initial setup
goose configure  # Set up provider and extensions

# Run autonomous task
bloom run
# Goose will:
# 1. Execute tasks using configured provider
# 2. Use enabled extensions as needed
# 3. Stream JSON output for monitoring
# 4. Maintain session for resume capability
```

## Comparison with Other Agents

| Aspect | Goose | Claude | OpenCode |
|--------|-------|--------|----------|
| MCP Extensions | Yes | No | No |
| Scheduling | Yes | No | No |
| Web Search | No | Yes | No |
| Human Questions | Yes | Yes | No |
| LSP Support | No | No | Yes |
| Open Source | Yes | No | Yes |

Use Goose when:
- Need extensibility via MCP
- Want open-source, local execution
- Require scheduled automation
- Need browser automation capabilities

Use Claude when:
- Need web search capabilities
- Want TodoWrite progress tracking
- Prefer Anthropic's ecosystem

Use OpenCode when:
- Need precise code intelligence via LSP
- Doing significant refactoring
- Want multi-provider flexibility

## Resources

- [Goose Documentation](https://block.github.io/goose/)
- [Goose GitHub Repository](https://github.com/block/goose)
- [MCP Protocol](https://modelcontextprotocol.io/)
