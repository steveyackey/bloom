---
sidebar_position: 8
title: view
---

# bloom view

Visual DAG inspector for your task graph. Opens a browser-based interface to explore tasks, dependencies, and agent prompts without running agents.

## Usage

```bash
bloom view [options]
```

## Options

| Option | Description |
|--------|-------------|
| `--port <number>` | Port to run the server on (default: 3000) |
| `--open` | Open browser automatically (default: true) |
| `--no-open` | Don't auto-open browser window |
| `-f, --file <path>` | Use custom tasks file |

## Examples

```bash
# Open on default port (3000)
bloom view

# Use custom port
bloom view --port 8080

# Don't auto-open browser
bloom view --no-open

# Use custom tasks file
bloom view -f project.yaml
```

## When to Use

Use `bloom view` after generating tasks and before running agents:

```
bloom generate    # Create tasks.yaml
bloom view        # Inspect the DAG visually
bloom run         # Execute with agents
```

This helps you:
- **Verify task structure** — See the complete DAG layout before execution
- **Check dependencies** — Ensure tasks are properly connected
- **Review phases** — Confirm task grouping and ordering
- **Preview prompts** — See exactly what agents will receive

## Features

### Task Graph Visualization

The view displays your tasks as a horizontal DAG (directed acyclic graph):

- **Nodes** represent individual tasks
- **Edges** show dependencies between tasks
- **Colors** indicate task status:
  - Gray — `todo`
  - Blue — `ready_for_agent`
  - Purple — `assigned`
  - Amber — `in_progress`
  - Light Green — `done_pending_merge`
  - Bright Green — `done`
  - Red — `blocked`

### Task Details Panel

Click on any task to view:
- Task ID and title
- Current status and phase
- Repository and branch information
- Dependencies (upstream and downstream)
- Full instructions and acceptance criteria

### Prompt Preview

Expand the "Prompts" section in the details panel to see:
- **System prompt** — The context and guidelines agents receive
- **User prompt** — The specific task instructions

This shows exactly what an agent will see when picking up the task, helping you verify instructions are clear and complete.

### Live Updates

The view automatically updates when `tasks.yaml` changes:
- File watching enabled by default
- Changes reflected in real-time via Server-Sent Events (SSE)
- Connection status shown in the UI

## Workflow Integration

### Before Running Agents

```bash
# Generate tasks from plan
bloom generate

# Validate task configuration
bloom validate

# Visual inspection
bloom view

# Start execution
bloom run
```

### During Development

Keep the view open while editing `tasks.yaml`:

```bash
# Terminal 1: Open view
bloom view

# Terminal 2: Edit and save tasks.yaml
# Changes appear automatically in the browser
```

### Debugging Task Issues

When tasks aren't executing as expected:

1. Open `bloom view`
2. Check dependency chains — are tasks connected correctly?
3. Look for blocked tasks (red nodes)
4. Review prompts — are instructions clear?

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Click task | Select and show details |
| Scroll | Pan the graph |
| Zoom | Mouse wheel or pinch |

## Related Commands

- [`bloom generate`](/commands/generate) — Create tasks.yaml from plan
- [`bloom run`](/commands/run) — Execute tasks with agents
- [`bloom dashboard`](/commands/task-management) — Text-based live monitoring
- [`bloom list`](/commands/task-management) — List tasks by status
