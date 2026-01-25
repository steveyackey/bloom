# Test Agent

A mock agent CLI for end-to-end testing of Bloom without requiring an LLM or API keys.

## Purpose

The test agent simulates agent behavior including:
- Streaming JSON output events
- Tool call simulation
- Session management
- Configurable success/failure scenarios

This enables:
- CI/CD pipeline testing without API costs
- Development testing without LLM access
- Reproducible test scenarios

## Usage

### Via Bloom

```bash
# Run orchestrator TUI with test agent
bloom run --agent test
```

### Direct CLI Usage

```bash
# Version check
bun src/agents/test-agent/cli.ts --version

# Basic prompt
bun src/agents/test-agent/cli.ts -p "Hello world"

# With simulated tool calls
bun src/agents/test-agent/cli.ts -p "Do something" --tools "read_file,write_file"

# Simulate failure
bun src/agents/test-agent/cli.ts -p "This will fail" --fail

# Fail after N events (for testing error handling)
bun src/agents/test-agent/cli.ts -p "Partial work" --fail-after 5

# Custom output
bun src/agents/test-agent/cli.ts -p "Query" --output "Custom response text"

# Adjust timing (delay between events in ms)
bun src/agents/test-agent/cli.ts -p "Slow response" --delay 500
```

## Options

| Option | Description |
|--------|-------------|
| `--version`, `-v` | Show version |
| `--prompt`, `-p` | The prompt to process (required) |
| `--model`, `-m` | Model name (ignored, for compatibility) |
| `--delay` | Delay between events in ms (default: 100) |
| `--fail` | Simulate a failure at the end |
| `--fail-after` | Fail after N events |
| `--tools` | Comma-separated list of tools to simulate calling |
| `--output` | Custom output text instead of default response |
| `--session-id` | Session ID for resume scenarios |
| `--json` | Output JSON events (default behavior) |
| `--yes`, `-y` | Approval bypass (ignored, for compatibility) |
| `--system` | System prompt (ignored, for compatibility) |

## Output Format

The test agent outputs newline-delimited JSON events:

```json
{"type":"session","session_id":"test-session-123","timestamp":1234567890}
{"type":"system","subtype":"init","session_id":"test-session-123","model":"test-model","timestamp":1234567891}
{"type":"tool_use","tool_name":"read_file","tool_input":{"simulated":true},"timestamp":1234567892}
{"type":"tool_result","tool_name":"read_file","content":"Result from read_file","timestamp":1234567893}
{"type":"assistant","content":"Response ","timestamp":1234567894}
{"type":"assistant","content":"text...","timestamp":1234567895}
{"type":"done","session_id":"test-session-123","cost_usd":0.0001,"duration_ms":500,"timestamp":1234567896}
```

## Testing Scenarios

### Happy Path
```bash
bun src/agents/test-agent/cli.ts -p "Complete a task"
# Outputs: session → init → response chunks → done
```

### Tool Calls
```bash
bun src/agents/test-agent/cli.ts -p "Edit files" --tools "read_file,edit_file,write_file"
# Outputs: session → init → tool_use/result pairs → response → done
```

### Failure Handling
```bash
bun src/agents/test-agent/cli.ts -p "Something" --fail
# Outputs: session → init → response → error (exit 1)
```

### Partial Failure
```bash
bun src/agents/test-agent/cli.ts -p "Start work" --fail-after 3
# Outputs: session → init → error (exit 1)
```
