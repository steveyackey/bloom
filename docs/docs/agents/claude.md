# Claude Agent

Claude is Anthropic's AI assistant, available through the Claude Code CLI. It's Bloom's default agent, offering a rich tool ecosystem with web search, session management, and the TodoWrite tool for progress tracking.

## Prerequisites

1. **Anthropic Account**: Create an account at [anthropic.com](https://www.anthropic.com)
2. **API Key**: Generate an API key from the Anthropic Console
3. **Claude Code CLI**: Install the command-line interface

## Installation

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Verify installation
claude --version
```

Add the API key to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.) for persistence:

```bash
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc
```

## Configuration

### Basic Configuration

Claude is the default agent, so no configuration is required for basic usage. To explicitly configure:

```yaml
# ~/.bloom/config.yaml
interactiveAgent:
  agent: claude

nonInteractiveAgent:
  agent: claude
```

### Model Selection

Claude supports model selection via the `model` field:

```yaml
interactiveAgent:
  agent: claude
  model: opus  # Use Claude Opus for interactive work
```

Available models depend on your API access. Common options:
- `sonnet` - Claude Sonnet (default, balanced)
- `opus` - Claude Opus (most capable)
- `haiku` - Claude Haiku (fastest)

## Capabilities

| Capability | Supported | Notes |
|------------|:---------:|-------|
| File Read | Yes | Read any file in the working directory |
| File Write | Yes | Create and modify files |
| Bash/Terminal | Yes | Execute shell commands |
| Git Operations | Yes | Full git support |
| Web Search | Yes | Search the web for information |
| Web Fetch | Yes | Fetch and read web pages |
| Session Resume | Yes | Continue previous sessions with `--resume` |
| Human Questions | Yes | Can pause to ask clarifying questions |
| TodoWrite | Yes | Built-in task tracking tool |

### Unique Features

#### TodoWrite Tool
Claude has a built-in TodoWrite tool for tracking task progress. When working on complex tasks, Claude will:
1. Create a checklist from acceptance criteria
2. Update items as work progresses
3. Provide visibility into completion status

#### Task Subagents
Claude can spawn specialized subagents for complex tasks:
- **Explore agent**: For codebase exploration
- **Plan agent**: For implementation planning
- **Research agent**: For gathering information

#### Web Search & Fetch
Claude can search the web for documentation, examples, and current information. It can also fetch and read specific URLs.

## Provider-Specific Options

The Claude provider supports these additional options (used internally by Bloom):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dangerouslySkipPermissions` | boolean | `true` | Skip permission prompts for autonomous execution |
| `activityTimeoutMs` | number | `600000` | Timeout (10 min) before considering agent stuck |
| `heartbeatIntervalMs` | number | `10000` | Heartbeat interval (10s) in streaming mode |
| `verbose` | boolean | `false` | Show detailed event output |

## CLI Flags Reference

When Bloom runs Claude, it uses these flags:

```bash
# Interactive mode
claude --verbose --dangerously-skip-permissions \
  --append-system-prompt "system prompt" \
  "initial prompt"

# Streaming mode (autonomous)
claude -p --verbose --dangerously-skip-permissions \
  --output-format stream-json \
  --append-system-prompt "system prompt" \
  "task prompt"

# Resume session
claude -p --resume <session_id> ...
```

## Troubleshooting

### "Failed to spawn claude"

**Cause**: Claude CLI not installed or not in PATH

**Solution**:
```bash
# Check if installed
which claude

# If not found, install
npm install -g @anthropic-ai/claude-code

# Verify npm global bin is in PATH
npm config get prefix
# Add <prefix>/bin to your PATH if needed
```

### "Authentication failed" or "Invalid API key"

**Cause**: Missing or invalid `ANTHROPIC_API_KEY`

**Solution**:
```bash
# Check if set
echo $ANTHROPIC_API_KEY

# Set if missing
export ANTHROPIC_API_KEY="sk-ant-..."

# Verify key is valid at console.anthropic.com
```

### "Agent timed out due to inactivity"

**Cause**: Claude didn't produce output for 10 minutes

**Possible causes**:
- Complex operation taking longer than expected
- API rate limiting
- Network issues

**Solution**:
- Check Anthropic API status
- Review task complexity (break into smaller tasks)
- Check network connectivity

### "Rate limit exceeded"

**Cause**: Too many API requests

**Solution**:
- Wait and retry
- Consider upgrading API tier
- Reduce parallel agent count in Bloom

## Best Practices

### For Interactive Sessions

1. Use Claude for exploration and planning
2. Let Claude use web search for documentation
3. Review TodoWrite progress for complex tasks

### For Autonomous Tasks

1. Provide clear, specific acceptance criteria
2. Claude will track progress via TodoWrite
3. Use checkpoints for human review at phase boundaries

### Prompt Tips

Claude responds well to:
- Clear task boundaries
- Specific acceptance criteria
- Context about the codebase
- Examples of expected output

## Example Session

```bash
# Start interactive session with Claude
bloom enter

# Claude will:
# 1. Read the project context (PRD.md, plan.md, etc.)
# 2. Use TodoWrite to track progress
# 3. Search web for documentation as needed
# 4. Ask clarifying questions when unsure
```
