# Copilot Agent

GitHub Copilot is GitHub's AI coding assistant, offering multi-model support and native GitHub integration through the MCP (Model Context Protocol) server.

## Prerequisites

1. **GitHub Account**: With active Copilot subscription (Individual, Business, or Enterprise)
2. **GitHub CLI**: Install the `gh` command-line tool
3. **Copilot Extension**: Install the Copilot CLI extension

## Installation

See the official [GitHub Copilot CLI documentation](https://docs.github.com/en/copilot/github-copilot-in-the-cli) for installation instructions.

After installation, verify it's working:

```bash
gh copilot --version
```

## Configuration

### Basic Configuration

```yaml
# ~/.bloom/config.yaml
interactiveAgent:
  agent: copilot

nonInteractiveAgent:
  agent: copilot
```

### Model Selection

Copilot supports multiple AI models:

```yaml
interactiveAgent:
  agent: copilot
  model: claude-3.5-sonnet  # Use Claude via Copilot
```

Available models (depending on your subscription):
- `gpt-4o` - OpenAI GPT-4o
- `claude-3.5-sonnet` - Anthropic Claude
- `gemini-1.5-pro` - Google Gemini

## Capabilities

| Capability | Supported | Notes |
|------------|:---------:|-------|
| File Read | Yes | Read files in working directory |
| File Write | Yes | Create and modify files |
| Bash/Terminal | Yes | Execute shell commands |
| Git Operations | Yes | Full git support |
| Web Search | Yes | Search for information |
| Web Fetch | Yes | Fetch web content |
| Session Resume | Yes | Continue previous sessions |
| Human Questions | No | Runs to completion |
| GitHub MCP | Yes | Native GitHub operations |

### Unique Features

#### GitHub MCP Server
Copilot has built-in access to the GitHub MCP server, enabling:
- Issue and PR management
- Repository operations
- GitHub API access without additional setup

#### Multi-Model Support
Choose from multiple AI providers through a single interface:
- OpenAI (GPT-4o)
- Anthropic (Claude)
- Google (Gemini)

#### Fine-Grained Permissions
Control tool access with `--allow-tool` and `--deny-tool` flags for security-sensitive environments.

## Provider-Specific Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | (default) | Model to use (e.g., `claude-3.5-sonnet`) |

## CLI Flags Reference

When Bloom runs Copilot, it uses these patterns:

```bash
# Interactive mode
gh copilot "prompt"

# With model selection
gh copilot --model claude-3.5-sonnet "prompt"

# Resume session
gh copilot --resume <session_id> "prompt"
```

## Troubleshooting

### "gh: command not found"

**Cause**: GitHub CLI not installed

**Solution**: Install GitHub CLI using the [official docs](https://docs.github.com/en/copilot/github-copilot-in-the-cli).

### "Copilot extension not installed"

**Cause**: Missing Copilot CLI extension

**Solution**: Install the extension using the [official docs](https://docs.github.com/en/copilot/github-copilot-in-the-cli).

### "Authentication required"

**Cause**: Not authenticated with GitHub

**Solution**:
```bash
# Check auth status
gh auth status

# Login if needed
gh auth login
```

### "Copilot access denied"

**Cause**: No active Copilot subscription

**Solution**:
- Verify your GitHub account has Copilot access
- Check subscription status at github.com/settings/copilot
- For organization accounts, check with your admin

### "Model not available"

**Cause**: Requested model not in your subscription tier

**Solution**:
- Check available models for your subscription
- Use a different model
- Contact GitHub support for model access

## Best Practices

### For GitHub-Heavy Workflows

1. Use Copilot when working with GitHub issues and PRs
2. Leverage the GitHub MCP for repository operations
3. Use multi-model support to pick the best model for each task

### Model Selection Guidelines

| Task Type | Recommended Model |
|-----------|-------------------|
| Code generation | `gpt-4o` |
| Complex reasoning | `claude-3.5-sonnet` |
| Fast iterations | `gpt-4o-mini` |

### Security Considerations

For sensitive environments:
```bash
# Restrict tool access
gh copilot --deny-tool bash "prompt"
```

## Example Session

```bash
# Start interactive session
bloom enter

# Copilot will:
# 1. Use its multi-model capabilities
# 2. Access GitHub MCP for repo operations
# 3. Execute to completion (no human questions)
```

## Comparison with Claude

| Aspect | Copilot | Claude |
|--------|---------|--------|
| Human Questions | No | Yes |
| GitHub Integration | Native MCP | Via tools |
| Model Choice | Multiple | Anthropic only |
| Progress Tracking | Basic | TodoWrite |

Use Copilot when:
- Working heavily with GitHub repos, issues, and PRs
- Want to use non-Anthropic models
- Need fine-grained permission control

Use Claude when:
- Need human-in-the-loop capabilities
- Want TodoWrite progress tracking
- Prefer Anthropic's models
