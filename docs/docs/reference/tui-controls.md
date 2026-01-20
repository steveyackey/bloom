---
sidebar_position: 3
title: TUI Controls
---

# TUI Controls Reference

Keyboard controls for the `bloom run` Terminal User Interface.

## Layout

```
┌─────────────────────┬─────────────────────┐
│ agent-1             │ agent-2             │
│ [task-name]         │ [task-name]         │
│                     │                     │
│ Terminal output     │ Terminal output     │
│ from agent...       │ from agent...       │
│                     │                     │
├─────────────────────┴─────────────────────┤
│ human                                     │
│ Questions and status messages             │
└───────────────────────────────────────────┘
```

## Navigation

| Key | Action |
|-----|--------|
| `h` | Move focus left |
| `j` | Move focus down |
| `k` | Move focus up |
| `l` | Move focus right |

Focus is indicated by a highlighted border.

## Pane Interaction

| Key | Action |
|-----|--------|
| `Enter` | Enter focused pane (scroll mode) |
| `Ctrl+B` | Exit pane / return to navigation |

### Scroll Mode

When inside a pane:
- Arrow keys scroll content
- Page Up/Down for faster scrolling
- `Ctrl+B` to exit back to navigation

## Pane Control

| Key | Action |
|-----|--------|
| `r` | Restart selected agent |
| `x` | Kill selected agent |

### Restart (`r`)

- Stops the current agent process
- Resets the task to `ready_for_agent`
- Spawns a new agent for the task

Use when an agent is stuck or needs a fresh start.

### Kill (`x`)

- Terminates the agent process
- Task remains in current status
- Pane becomes inactive

Use to manually stop an agent without resetting.

## View Modes

| Key | Action |
|-----|--------|
| `v` | Toggle view mode |

### Tiled View (Default)

All panes visible in a grid layout.

```
┌─────────┬─────────┐
│ agent-1 │ agent-2 │
├─────────┴─────────┤
│ human             │
└───────────────────┘
```

### Single View

One pane fills the screen. Use navigation keys to switch.

```
┌───────────────────┐
│ agent-1           │
│                   │
│ Full terminal     │
│ output visible    │
│                   │
└───────────────────┘
```

## Session Control

| Key | Action |
|-----|--------|
| `q` | Quit orchestrator |

### Quitting

- Prompts for confirmation (if agents running)
- Agents are terminated
- Tasks remain in current status
- Run `bloom run` to continue later

## Pane Information

Each pane header shows:

```
agent-1 [implement-auth] ●
        └── task name    └── status indicator
```

### Status Indicators

| Symbol | Meaning |
|--------|---------|
| `●` | Active / running |
| `○` | Idle / waiting |
| `✓` | Completed |
| `✗` | Failed / blocked |

## Human Pane

The bottom pane shows:

- Pending questions from agents
- System status messages
- Completion notifications

Questions appear with IDs for answering:

```
[q-abc123] agent-1: Should I use bcrypt or argon2?
```

Answer in another terminal:

```bash
bloom answer q-abc123 "bcrypt"
```

## Tips

### Efficient Monitoring

1. Use tiled view for overview
2. Enter specific pane for details
3. Toggle to single view for debugging

### Handling Problems

1. See stuck agent → Press `r` to restart
2. Need to stop → Press `x` to kill
3. Wrong task → Kill, then `bloom reset <id>`

### Multi-Monitor Setup

```bash
# Terminal 1: TUI
bloom run

# Terminal 2: Questions
bloom questions-dashboard

# Terminal 3: Status
watch -n 5 bloom list
```

## Keyboard Summary

| Key | Action |
|-----|--------|
| `h/j/k/l` | Navigate panes |
| `Enter` | Enter pane |
| `Ctrl+B` | Exit pane |
| `r` | Restart agent |
| `x` | Kill agent |
| `v` | Toggle view |
| `q` | Quit |
