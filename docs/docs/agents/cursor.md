# Cursor Agent

Cursor is an AI-powered code editor with a powerful CLI for headless AI agent operations. The Cursor CLI (`agent`) enables autonomous coding tasks with support for multiple models and streaming output.

## Prerequisites

1. **Cursor Account**: Create an account at [cursor.com](https://cursor.com)
2. **Cursor Subscription**: Pro or Business plan for API access
3. **Cursor CLI**: Install the command-line interface

## Installation

Install the Cursor CLI using the official installer:

```bash
curl https://cursor.com/install -fsS | bash
```

The installer places the CLI in `~/.local/bin`. Ensure this directory is in your PATH.

After installation, verify it's working:

```bash
agent --version
```

See the official [Cursor CLI installation docs](https://cursor.com/docs/cli/installation) for platform-specific instructions.

## Authentication

Cursor CLI supports two authentication methods:

### Browser-Based Login (Recommended)

```bash
agent login
```

This opens your browser for Cursor account authentication. Credentials are securely stored locally.

### API Key Authentication

For automation and CI/CD workflows, use an API key:

1. Generate an API key in the Cursor dashboard under **Integrations > User API Keys**
2. Set the environment variable:

```bash
export CURSOR_API_KEY=your_api_key_here
```

Or pass it via command line:

```bash
agent --api-key your_api_key_here "prompt"
```

Check authentication status:

```bash
agent status
```

## Configuration

### Basic Configuration

```yaml
# ~/.bloom/config.yaml
agent:
  defaultInteractive: cursor
  defaultNonInteractive: cursor
```

### Model Selection

Cursor supports multiple models. Configure via the agent section:

```yaml
# ~/.bloom/config.yaml
agent:
  defaultInteractive: cursor
  defaultNonInteractive: cursor

  cursor:
    defaultModel: gpt-4o
    models:
      - gpt-4o
      - claude-3.5-sonnet
      - cursor-fast
```

### Configuration Commands

```bash
# Set cursor as default
bloom config set-interactive cursor
bloom config set-noninteractive cursor

# Set default model
bloom config set-model cursor gpt-4o
```

## Capabilities

| Capability | Supported | Notes |
|------------|:---------:|-------|
| File Read | Yes | Read files in working directory |
| File Write | Yes | Create and modify files |
| Bash/Terminal | Yes | Execute shell commands |
| Git Operations | Yes | Full git support |
| Web Search | No | Not available in headless mode |
| Web Fetch | No | Not available in headless mode |
| Session Resume | Yes | Continue previous sessions with `--resume` |
| Human Questions | No | Runs to completion in headless mode |
| Cloud Agent | Yes | Background execution via `&` prefix |

### Unique Features

#### Headless Mode
Cursor's `-p` (print) flag enables non-interactive scripting mode, perfect for autonomous task execution:
- Clean, final-answer-only responses
- JSON output for structured analysis
- Stream-JSON for real-time progress

#### Cloud Agent
Prepend `&` to any prompt to send tasks to Cloud Agent for background execution on Cursor's infrastructure.

#### Multiple Output Formats
- **text**: Clean final responses (default)
- **json**: Structured analysis output
- **stream-json**: Real-time progress tracking

#### Operating Modes
Switch between modes using the `--mode` flag:
- **Agent mode** (default): Full autonomous capabilities
- **Plan mode**: Architecture and planning focus
- **Ask mode**: Question-answering focus

## Provider-Specific Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | (default) | Model to use |
| `force` | boolean | `true` | Allow file modifications without confirmation |

## CLI Flags Reference

When Bloom runs Cursor, it uses these patterns:

```bash
# Interactive mode
agent -p "prompt"

# Streaming mode (autonomous)
agent -p --force --output-format stream-json "task prompt"

# With model selection
agent -p --model gpt-4o "prompt"

# Resume session
agent --resume <session_id> "prompt"
```

## Troubleshooting

### "agent: command not found"

**Cause**: Cursor CLI not installed or not in PATH

**Solution**:
```bash
# Check if installed
which agent

# Reinstall
curl https://cursor.com/install -fsS | bash

# Add to PATH (bash)
export PATH="$HOME/.local/bin:$PATH"
```

### "Authentication required"

**Cause**: Not authenticated with Cursor

**Solution**:
```bash
# Login via browser
agent login

# Or set API key
export CURSOR_API_KEY=your_api_key_here

# Check status
agent status
```

### "API key invalid"

**Cause**: Invalid or expired API key

**Solution**:
1. Go to Cursor dashboard > Integrations > User API Keys
2. Generate a new API key
3. Update `CURSOR_API_KEY` environment variable

### "Rate limit exceeded"

**Cause**: Too many API requests

**Solution**:
- Wait and retry
- Consider upgrading your subscription
- Reduce parallel agent count in Bloom

### "Model not available"

**Cause**: Requested model not in your subscription

**Solution**:
- Check available models for your subscription
- Use a different model
- Upgrade subscription for additional models

## Best Practices

### For Autonomous Tasks

1. Use `--force` flag for unattended file modifications
2. Use `--output-format stream-json` for progress tracking
3. Provide clear, specific instructions in prompts

### For IDE-Style Workflows

1. Cursor excels at tasks similar to what you'd do in the IDE
2. Include file paths directly in prompts - the agent reads them automatically
3. Use for batch file processing and code reviews

### Prompt Tips

Cursor responds well to:
- Direct file path references in prompts
- Clear task boundaries
- Specific acceptance criteria
- Context about expected changes

## Example Session

```bash
# Start interactive session with Cursor
bloom enter --agent cursor

# Cursor will:
# 1. Read project context (PRD.md, plan.md, etc.)
# 2. Execute tasks autonomously with --force
# 3. Stream progress via JSON output
```

## Comparison with Claude

| Aspect | Cursor | Claude |
|--------|--------|--------|
| Human Questions | No | Yes |
| Web Search | No | Yes |
| Progress Tracking | Stream JSON | TodoWrite |
| Cloud Execution | Yes (& prefix) | No |
| IDE Integration | Native | Standalone |

Use Cursor when:
- You're already using Cursor IDE
- Need cloud-based background execution
- Working on IDE-style code editing tasks
- Want seamless IDE-to-CLI workflow

Use Claude when:
- Need human-in-the-loop capabilities
- Want web search and research
- Prefer TodoWrite progress tracking
- Need Anthropic's advanced reasoning
