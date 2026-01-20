---
sidebar_position: 5
title: Multi-Agent Orchestration
---

# Multi-Agent Orchestration

Bloom's power comes from running multiple AI agents in parallel. This guide covers the orchestration system.

## How It Works

When you run `bloom run`:

1. **Task Discovery** — Finds tasks that are `ready_for_agent` or `assigned`
2. **Agent Spawning** — Launches Claude Code instances for available tasks
3. **Parallel Execution** — Agents work simultaneously in isolated worktrees
4. **Dependency Management** — New tasks become ready as dependencies complete
5. **Human Queue** — Questions from agents are collected for human response

## Starting the Orchestrator

```bash
bloom run
```

This opens the Terminal UI (TUI) with multiple panes:

```
┌─────────────────────┬─────────────────────┐
│ agent-1             │ agent-2             │
│ [implement-auth]    │ [create-ui]         │
│                     │                     │
│ > Working on JWT    │ > Building login    │
│   service...        │   component...      │
│                     │                     │
├─────────────────────┴─────────────────────┤
│ human                                     │
│ Questions from agents appear here         │
└───────────────────────────────────────────┘
```

## TUI Controls

| Key | Action |
|-----|--------|
| `h` | Move focus left |
| `j` | Move focus down |
| `k` | Move focus up |
| `l` | Move focus right |
| `Enter` | Enter focused pane (scroll mode) |
| `Ctrl+B` | Exit pane focus |
| `r` | Restart selected agent |
| `x` | Kill selected agent |
| `v` | Toggle view mode (tiled/single) |
| `q` | Quit orchestrator |

## Agent Lifecycle

### 1. Task Assignment

When a task becomes `ready_for_agent`:

```yaml
- id: implement-auth
  status: ready_for_agent  # Dependencies satisfied
  repo: ./repos/backend
  worktree: feature/auth
```

The orchestrator:
1. Creates the worktree if needed
2. Spawns a Claude Code agent
3. Updates status to `in_progress`

### 2. Execution

The agent receives:
- Task instructions
- Acceptance criteria
- Previous notes
- CLAUDE.md guidelines

The agent works in the worktree directory, making changes and running commands.

### 3. Completion

The agent marks the task:

```bash
# Success
bloom done task-id

# Needs help
bloom block task-id
```

### 4. Next Task

The orchestrator:
1. Checks for newly `ready_for_agent` tasks
2. Assigns the next task to an available agent
3. Continues until all tasks complete

## Parallel Execution

### Git Worktree Isolation

Each task can specify a worktree:

```yaml
tasks:
  - id: backend-auth
    repo: ./repos/backend
    worktree: feature/auth

  - id: backend-api
    repo: ./repos/backend
    worktree: feature/api

  - id: frontend-auth
    repo: ./repos/frontend
    worktree: feature/auth
```

Three agents can work simultaneously:
- Agent 1 in `repos/backend-feature-auth/`
- Agent 2 in `repos/backend-feature-api/`
- Agent 3 in `repos/frontend-feature-auth/`

No conflicts because each has isolated files.

### Dependency-Based Ordering

Tasks only run when dependencies complete:

```yaml
tasks:
  # Phase 1 - Can run in parallel
  - id: backend-models
    status: ready_for_agent

  - id: frontend-setup
    status: ready_for_agent

  # Phase 2 - Waits for phase 1
  - id: backend-service
    depends_on: [backend-models]
    status: todo  # Becomes ready when backend-models is done

  - id: frontend-auth
    depends_on: [frontend-setup, backend-service]
    status: todo  # Waits for both
```

## Human-in-the-Loop

### Agent Questions

Agents can ask questions during execution:

```bash
bloom ask agent-1 "Should I use bcrypt or argon2 for password hashing?" \
  --task implement-auth \
  --type choice \
  --choices "bcrypt,argon2"
```

Questions appear in the human pane of the TUI.

### Viewing Questions

```bash
# List pending questions
bloom questions

# All questions (including answered)
bloom questions --all
```

Output:
```
Pending Questions:
  [q-abc123] agent-1 (implement-auth)
    ◈ Should I use bcrypt or argon2 for password hashing?
    Choices: bcrypt, argon2

  [q-def456] agent-2 (create-ui)
    ◇ What should the error message say for invalid login?
```

### Answering Questions

```bash
bloom answer q-abc123 "bcrypt"
bloom answer q-def456 "Invalid email or password. Please try again."
```

### Question Types

| Type | Symbol | Description |
|------|--------|-------------|
| `yes_no` | ◉ | Binary choice, can auto-update task status |
| `choice` | ◈ | Select from predefined options |
| `open` | ◇ | Free-form text response |

### Auto-Status Questions

Yes/no questions can automatically update task status:

```bash
bloom ask agent-1 "Is the implementation complete?" \
  --task implement-auth \
  --type yes_no \
  --on-yes done \
  --on-no blocked
```

Answering "yes" marks the task `done`.

### Questions Dashboard

Interactive question management:

```bash
bloom questions-dashboard
```

## Interjection

Interrupt a running agent to provide guidance:

```bash
# List active sessions
bloom interject list

# Send message to agent
bloom interject agent-1 "Stop and mark task blocked - we need to discuss the approach"

# Resume after interjection
bloom interject resume agent-1
```

## Monitoring

### Live Dashboard

```bash
bloom dashboard
```

Shows:
- Task counts by status
- Active agents
- Recent completions
- Pending questions

### Agent Status

```bash
bloom agents
```

### Task Progress

```bash
# By status
bloom list in_progress
bloom list done

# Specific task
bloom show task-id
```

## Configuration

### Agent Count

The orchestrator runs as many agents as there are available tasks (up to system limits).

### Activity Timeout

Agents have a 2-minute activity timeout. If no output occurs, the orchestrator may mark the task as stuck.

### Custom Task File

Run with a different task file:

```bash
bloom -f custom-tasks.yaml run
```

## Error Handling

### Stuck Tasks

If an agent stops responding:

```bash
# In TUI: press 'r' to restart
# Or from CLI:
bloom reset task-id
```

### Failed Tasks

When an agent marks a task `blocked`:

1. Check the agent output in TUI
2. View task notes: `bloom show task-id`
3. Fix the issue manually or adjust instructions
4. Reset: `bloom todo task-id`
5. Orchestrator will retry

### Crash Recovery

If the orchestrator crashes:

1. Tasks remain in their current status
2. Worktrees retain changes
3. Run `bloom run` to continue

## Best Practices

### 1. Design for Parallelism

Structure tasks to maximize parallel execution:

```yaml
# Good - independent tasks can run in parallel
- id: backend-auth
- id: backend-payments
- id: frontend-auth
- id: frontend-dashboard

# Bad - sequential dependencies slow things down
- id: step-1
- id: step-2
  depends_on: [step-1]
- id: step-3
  depends_on: [step-2]
```

### 2. Use Appropriate Worktrees

Keep unrelated features in separate worktrees:

```yaml
# Good - isolated features
- id: auth-backend
  worktree: feature/auth
- id: payments-backend
  worktree: feature/payments

# Risky - might conflict
- id: auth-backend
  worktree: feature/combined
- id: payments-backend
  worktree: feature/combined  # Same worktree!
```

### 3. Monitor Progress

Keep a terminal open with:

```bash
watch -n 5 bloom list
```

Or use the dashboard:

```bash
bloom dashboard
```

### 4. Handle Questions Promptly

Agents wait for answers. Quick responses keep work flowing.

### 5. Review Before Merging

After completion:

```bash
# Check each worktree
cd repos/backend-feature-auth
git log --oneline
git diff main

# Review changes before creating PRs
```

## Troubleshooting

### "No tasks available"

All tasks are either:
- `done` — Work is complete
- `blocked` — Need intervention
- `todo` with incomplete dependencies

Check:
```bash
bloom list
bloom validate
```

### Agent Not Starting

Verify:
1. Claude Code is installed: `claude --version`
2. API key is set: `echo $ANTHROPIC_API_KEY`
3. Task has `ready_for_agent` status

### Worktree Conflicts

If git complains:

```bash
# Check worktree status
bloom repo worktree list backend

# Clean up stale worktrees
git -C repos/backend.git worktree prune
```

## Next Steps

- [Task Design](/best-practices/task-design) — Write effective tasks
- [Agent Collaboration](/best-practices/agent-collaboration) — Multi-agent patterns
