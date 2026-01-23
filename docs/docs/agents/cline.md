# Cline Agent

Cline is a multi-provider coding agent featuring explicit Plan/Act modes. In Plan mode, Cline creates a detailed implementation plan and waits for approval before executing. This makes it ideal for careful, reviewed execution.

## Prerequisites

1. **Node.js**: Version 18 or higher
2. **Cline CLI**: Install the command-line tool
3. **Cline Core Service**: The gRPC backend service must be running
4. **API Keys**: For your chosen AI provider

## Installation

### Install Cline CLI

```bash
# Install Cline CLI globally
npm install -g cline

# Verify installation
cline --version
```

### Start Cline Core Service

Cline requires the Cline Core gRPC service running on `localhost:50052`. You have two options:

#### Option 1: Use the VS Code Extension (Recommended)

If you use VS Code with the Cline extension installed, the service runs automatically when VS Code is open.

```bash
# Verify VS Code is running with Cline extension
# The service starts automatically
```

#### Option 2: Run Cline Core Manually

```bash
# Start the service
cline-core start

# Check service status
cline-core status

# Stop the service
cline-core stop
```

### Service Management Commands

```bash
# Start service in foreground (for debugging)
cline-core start --foreground

# Start service with specific port
cline-core start --port 50052

# View service logs
cline-core logs

# Restart service
cline-core restart
```

## Configuration

### Basic Configuration

```yaml
# ~/.bloom/config.yaml
interactiveAgent:
  agent: cline

nonInteractiveAgent:
  agent: cline
```

### Model Selection

Cline supports multiple AI providers:

```yaml
nonInteractiveAgent:
  agent: cline
  model: claude-3-5-sonnet  # Or any supported model
```

Configure your API keys according to your chosen provider.

## Capabilities

| Capability | Supported | Notes |
|------------|:---------:|-------|
| File Read | Yes | Read files in working directory |
| File Write | Yes | Create and modify files |
| Bash/Terminal | Yes | Execute shell commands |
| Git Operations | Yes | Full git support |
| Web Search | No | Not supported |
| Web Fetch | No | Not supported |
| Session Resume | Yes | Via task ID |
| Plan Mode | Yes | Explicit plan-then-act workflow |
| Human Questions | Yes | In Plan mode, waits for approval |

### Unique Features

#### Plan/Act Modes

Cline has two execution modes:

**Plan Mode** (default for interactive):
1. Analyzes the task
2. Creates a detailed implementation plan
3. Waits for human approval
4. Executes the approved plan

**Act Mode** (default for autonomous):
1. Executes directly without planning phase
2. Can use `--yolo` flag to skip approval prompts

```bash
# Plan mode (creates plan, waits for approval)
cline --mode plan "implement feature"

# Act mode (executes directly)
cline --mode act "implement feature"

# Act mode with no approvals
cline --mode act --yolo "implement feature"
```

#### Task-Based Session Management

Cline uses tasks instead of sessions:

```bash
# Create new task
cline task new "implement feature"

# List tasks
cline task list

# Resume task
cline task resume <task_id>

# View task status
cline task status <task_id>
```

## Provider-Specific Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clineMode` | `plan` \| `act` | `act` | Execution mode |
| `yolo` | boolean | `true` | Skip approvals in act mode |
| `model` | string | (default) | Model to use |

## Bloom's Cline Configuration

Bloom configures Cline differently based on context:

| Context | Mode | YOLO | Why |
|---------|------|------|-----|
| Interactive (`bloom enter`) | `plan` | No | Review plans before execution |
| Autonomous (`bloom run`) | `act` | Yes | Unattended execution |

## CLI Flags Reference

When Bloom runs Cline:

```bash
# Interactive mode
cline --mode plan "prompt"

# Streaming mode (autonomous)
cline task new --stdin --mode act --yolo -F json

# Resume task
cline task resume <task_id> --mode act --yolo -F json
```

## Troubleshooting

### "Cline CLI not found"

**Cause**: Cline not installed

**Solution**:
```bash
npm install -g cline
```

### "Cline Core gRPC service is not running"

**Cause**: The backend service isn't running

**Solution**:

Option 1 - Start the service manually:
```bash
cline-core start
cline-core status  # Verify it's running
```

Option 2 - Use VS Code:
1. Install the Cline VS Code extension
2. Open VS Code
3. The service starts automatically

Option 3 - Check service logs:
```bash
cline-core logs
# Look for errors and address them
```

### "ECONNREFUSED" or "gRPC connection failed"

**Cause**: Service not reachable on expected port

**Solution**:
```bash
# Check if service is running
cline-core status

# Check if port 50052 is in use
lsof -i :50052

# Restart service
cline-core restart
```

### Plan Mode Hanging

**Cause**: Waiting for approval that won't come (in non-interactive context)

**Solution**:
- Use `--mode act` for autonomous execution
- Add `--yolo` to skip all approvals
- Bloom handles this automatically for `bloom run`

### Task Resume Fails

**Cause**: Invalid task ID or task expired

**Solution**:
```bash
# List available tasks
cline task list

# Use correct task ID
cline task resume <correct_id>
```

## Best Practices

### For Careful Execution

1. Use Plan mode for risky changes
2. Review generated plans before approval
3. Use checkpoints in Bloom for phase reviews

### For Autonomous Tasks

1. Use Act mode with `--yolo` flag
2. Ensure clear, unambiguous task descriptions
3. Rely on Bloom's checkpoint system for human review

### Service Management

1. Keep VS Code running if using the extension
2. Or set up `cline-core` as a system service
3. Monitor service health with `cline-core status`

## Example Session

```bash
# Ensure service is running
cline-core status

# Start interactive session with plan review
bloom enter
# Cline will:
# 1. Analyze the task
# 2. Create detailed plan
# 3. Wait for your approval
# 4. Execute approved steps

# For autonomous tasks
bloom run
# Cline will:
# 1. Execute in Act mode
# 2. Skip approval prompts
# 3. Complete tasks autonomously
```

## Comparison with Other Agents

| Aspect | Cline | Claude | Codex |
|--------|-------|--------|-------|
| Plan Mode | Yes | No | No |
| Human Questions | Yes | Yes | No |
| Web Search | No | Yes | Yes |
| Session Fork | No | No | Yes |

Use Cline when:
- Want explicit plan review before execution
- Need careful, controlled changes
- Prefer multi-provider flexibility

Use Claude when:
- Need web search capabilities
- Want TodoWrite progress tracking
- Prefer simpler execution model

Use Codex when:
- Want to explore multiple approaches via forking
- Need structured output enforcement
