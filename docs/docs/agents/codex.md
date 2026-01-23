# Codex Agent

Codex is OpenAI's coding agent CLI, offering unique features like session forking and structured output enforcement. It's ideal for exploratory work where you want to try multiple approaches.

## Prerequisites

1. **OpenAI Account**: Create an account at [openai.com](https://openai.com)
2. **API Key**: Generate an API key from the OpenAI platform
3. **Codex CLI**: Install the command-line tool

## Installation

```bash
# Install Codex CLI
npm install -g @openai/codex

# Set your API key
export OPENAI_API_KEY="sk-..."

# Verify installation
codex --version
```

Add the API key to your shell profile for persistence:

```bash
echo 'export OPENAI_API_KEY="sk-..."' >> ~/.zshrc
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
| Bash/Terminal | Yes | Execute shell commands |
| Git Operations | Yes | Full git support |
| Web Search | Yes | Via `--search` flag |
| Web Fetch | No | No direct URL fetching |
| Session Resume | Yes | Via `codex resume --session <id>` |
| Session Fork | Yes | Via `codex fork <session_id>` |
| Structured Output | Yes | Via `--output-schema` |
| Human Questions | No | Runs to completion |

### Unique Features

#### Session Forking
Codex can fork an existing session to explore alternative approaches:

```bash
# Fork a session to try a different approach
codex fork <session_id>
```

This creates a new session with the same context, allowing you to:
- Try different implementations
- Compare approaches
- Recover from mistakes without starting over

#### Structured Output
Enforce output format using JSON schemas:

```bash
codex --output-schema '{"type": "object", "properties": {"files": {"type": "array"}}}' "prompt"
```

Useful for:
- Extracting specific data formats
- Ensuring consistent output structure
- Integration with other tools

#### Sandbox Control
Control filesystem access levels:

```bash
codex --sandbox read-only "analyze this code"
codex --sandbox full "implement this feature"
```

## Provider-Specific Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | (default) | OpenAI model to use |

## CLI Flags Reference

When Bloom runs Codex, it uses these patterns:

```bash
# Standard execution
codex --json "prompt"

# With search enabled
codex --search "prompt"

# Resume session
codex resume --session <session_id>

# Fork session
codex fork <session_id>

# Structured output
codex --output-schema <schema.json> "prompt"
```

## Troubleshooting

### "codex: command not found"

**Cause**: Codex CLI not installed

**Solution**:
```bash
# Install Codex
npm install -g @openai/codex

# Verify npm global bin is in PATH
npm config get prefix
# Add <prefix>/bin to PATH if needed
```

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
- Verify session ID is correct
- Sessions may expire after some time
- Start a new session if needed

## Best Practices

### For Exploratory Work

1. Use session forking to try multiple approaches
2. Fork before risky changes
3. Compare results across forks

### For Structured Data

1. Define JSON schemas for expected output
2. Use structured output for data extraction
3. Validate output against schema

### Sandbox Guidelines

| Sandbox Level | Use Case |
|---------------|----------|
| `read-only` | Code analysis, review |
| `minimal` | Limited writes, safer execution |
| `full` | Full implementation work |

## Example Session

```bash
# Start session
codex "implement user authentication"

# Fork to try alternative approach
codex fork abc123

# Continue with structured output
codex --output-schema schema.json "extract API endpoints"
```

## Comparison with Other Agents

| Aspect | Codex | Claude | OpenCode |
|--------|-------|--------|----------|
| Session Fork | Yes | No | No |
| Structured Output | Yes | No | No |
| Human Questions | No | Yes | No |
| Web Fetch | No | Yes | No |
| LSP Support | No | No | Yes |

Use Codex when:
- Exploring multiple implementation approaches
- Need structured/schema-enforced output
- Want sandbox control over file access
- Prefer OpenAI models

Use Claude when:
- Need human-in-the-loop capabilities
- Want TodoWrite progress tracking
- Need web fetch capabilities

Use OpenCode when:
- Need precise code intelligence via LSP
- Want multi-provider flexibility
