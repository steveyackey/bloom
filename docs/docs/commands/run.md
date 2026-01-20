---
sidebar_position: 7
title: run
---

# bloom run

Start the multi-agent orchestrator.

## Usage

```bash
bloom run
```

## Description

Launches the Terminal UI (TUI) and begins executing tasks with Claude Code agents. Multiple agents work in parallel on independent tasks.

## Prerequisites

- Must be in a project directory
- `tasks.yaml` must exist with valid tasks
- Claude Code CLI installed
- `ANTHROPIC_API_KEY` environment variable set

## Terminal UI

```
┌─────────────────────┬─────────────────────┐
│ agent-1             │ agent-2             │
│ [implement-auth]    │ [create-ui]         │
│                     │                     │
│ > Creating JWT      │ > Building login    │
│   service...        │   form...           │
│                     │                     │
├─────────────────────┴─────────────────────┤
│ human                                     │
│ [q-abc123] Should I use bcrypt?          │
└───────────────────────────────────────────┘
```

## TUI Controls

| Key | Action |
|-----|--------|
| `h` | Move focus left |
| `j` | Move focus down |
| `k` | Move focus up |
| `l` | Move focus right |
| `Enter` | Enter focused pane (scroll) |
| `Ctrl+B` | Exit pane focus |
| `r` | Restart selected agent |
| `x` | Kill selected agent |
| `v` | Toggle view (tiled/single) |
| `q` | Quit orchestrator |

## How It Works

1. **Find ready tasks** — Tasks with `ready_for_agent` status
2. **Spawn agents** — Launch Claude Code for each task
3. **Execute in parallel** — Agents work in isolated worktrees
4. **Handle dependencies** — New tasks become ready as others complete
5. **Collect questions** — Human queue for agent questions

## Execution Flow

```
Task: todo
  ↓ (dependencies complete)
Task: ready_for_agent
  ↓ (orchestrator assigns)
Task: in_progress
  ↓ (agent completes)
Task: done
```

## Custom Task File

Run with a different task file:

```bash
bloom -f custom-tasks.yaml run
```

## Monitoring

While running, use another terminal:

```bash
# Live dashboard
bloom dashboard

# Task status
bloom list in_progress

# Agent status
bloom agents

# Specific task
bloom show <task-id>
```

## Handling Questions

Questions appear in the human pane. Answer via CLI:

```bash
bloom questions           # View pending
bloom answer q-id "response"  # Answer
```

## Stopping

- Press `q` in TUI to quit
- Tasks remain in current state
- Run `bloom run` again to continue

## Error Recovery

### Stuck Task

```bash
# In TUI: press 'r' to restart
# Or:
bloom reset <task-id>
```

### Failed Agent

```bash
# Kill agent in TUI: press 'x'
# Reset task:
bloom reset <task-id>
```

### Continue After Crash

```bash
# Just run again - picks up where it left off
bloom run
```

## Examples

### Basic Run

```bash
cd my-project
bloom run
```

### Monitor in Another Terminal

```bash
# Terminal 1
bloom run

# Terminal 2
watch -n 2 bloom list
```

### Answer Questions

```bash
# Terminal 1
bloom run

# Terminal 2
bloom questions-dashboard
```

## Related Commands

- [bloom generate](/commands/generate) — Generate tasks
- [bloom dashboard](/commands/task-management) — Monitor tasks
- [bloom questions](/commands/questions) — Handle questions
