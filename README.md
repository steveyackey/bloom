# Bloom - Multi-Agent Task Orchestrator

A multi-agent task orchestration system that uses YAML-based task definitions and Claude Code agents to execute work in parallel.

## Quick Start

```bash
# Install dependencies
bun install

# Plan a new project (interactive Claude session)
bun bloom.ts plan

# Start the orchestrator
bun bloom.ts run
```

## Workflow

```
1. PLAN      bun bloom.ts plan         # Break down your project into tasks
2. VALIDATE  bun bloom.ts validate     # Check for issues
3. RUN       bun bloom.ts run          # Start agents
4. MONITOR   Dashboard shows progress  # Use hjkl to navigate TUI
5. REVIEW    [CHECKPOINT] tasks        # Human reviews at phase boundaries
```

## Commands

### Orchestrator

```bash
bloom run                    # Start TUI with all agents
bloom setup                  # Just setup repos, don't start
```

### Planning & Monitoring

```bash
bloom plan                   # Interactive planning session with Claude
bloom dashboard              # Live task view (refreshes every 10s)
bloom list                   # List all tasks by phase
bloom list in_progress       # Filter by status
bloom show <taskid>          # Show task details
bloom next [agent]           # Show available tasks
bloom agents                 # List agents and their tasks
bloom validate               # Check for errors
```

### Task Status

```bash
bloom done <taskid>          # Mark complete
bloom block <taskid>         # Mark blocked
bloom todo <taskid>          # Mark todo
bloom ready <taskid>         # Mark ready_for_agent
bloom assign <taskid> <agent> # Assign to agent
```

### Other

```bash
bloom note <taskid> <note>   # Add a note
bloom reset <taskid>         # Reset stuck task
bloom reset --stuck          # Reset ALL stuck tasks
```

### Custom Tasks File

```bash
bloom -f project.yaml run
bloom -f project.yaml plan
```

## TUI Controls

| Key | Action |
|-----|--------|
| `h/j/k/l` | Navigate panes |
| `Enter` | Focus pane |
| `Ctrl+B` | Exit focus |
| `r` | Restart pane |
| `x` | Kill pane |
| `v` | Toggle view |
| `q` | Quit |

## Task Schema

```yaml
tasks:
  - id: kebab-case-id
    title: Short description
    status: todo                    # todo|ready_for_agent|assigned|in_progress|done|blocked
    phase: 1                        # Group related tasks
    depends_on: [other-task-id]     # Must complete first
    repo: ./path/to/repo            # Working directory
    worktree: branch-name           # Git worktree for isolation
    agent_name: claude-code         # Assign to specific agent
    instructions: |                 # Detailed instructions
      Multi-line instructions
    acceptance_criteria:            # Definition of done
      - Criterion 1
    ai_notes: []                    # Notes added during execution
    subtasks: []                    # Nested tasks
```

## Key Concepts

- **Phases**: Group tasks into numbered phases (1, 2, 3...)
- **Checkpoints**: `[CHECKPOINT]` tasks at phase boundaries for human review
- **Dependencies**: `depends_on` enforces task ordering
- **Worktrees**: Git worktrees isolate parallel work (one agent per worktree)
- **Priming**: Tasks auto-change from `todo` to `ready_for_agent` when deps complete

## Files

```
bloom/
├── bloom.ts              # Unified CLI
├── task-schema.ts        # Zod schemas
├── plan-session.ts       # Planning with Claude
├── orchestrator-tui.ts   # Multi-pane TUI
├── agent-core.ts         # Agent interfaces
├── agent-provider-claude.ts
├── tasks.yaml            # Your tasks
├── example-tasks.yaml    # Template
└── repos/                # Git repos for work
```
