---
sidebar_position: 1
title: Command Overview
---

# Command Overview

Bloom provides commands for workspace setup, repository management, project workflow, task execution, and monitoring.

:::info Command Categories
Bloom has three types of commands:
- **Human Commands** — You run these directly
- **Agent Commands** — AI agents use these during task execution
- **Internal Commands** — Called automatically by other commands or the orchestrator

Most users only need the Human Commands. Agent and Internal commands are documented for completeness.
:::

## Human Commands

These are the commands you'll use regularly.

### Essential Workflow

| Command | Description |
|---------|-------------|
| `bloom init` | Initialize a new workspace |
| `bloom repo clone <url>` | Clone a repository |
| `bloom create <name>` | Create a new project |
| `bloom plan` | Generate implementation plan |
| `bloom generate` | Generate tasks from plan |
| `bloom run` | Start the multi-agent orchestrator |

### Monitoring & Management

| Command | Description |
|---------|-------------|
| `bloom list [status]` | List tasks, optionally filtered |
| `bloom show <taskid>` | Show task details |
| `bloom dashboard` | Live task monitoring |
| `bloom validate` | Validate task configuration |
| `bloom questions` | Show pending questions |
| `bloom answer <qid> <response>` | Answer agent question |

### Repository Operations

| Command | Description |
|---------|-------------|
| `bloom repo list` | List all repositories |
| `bloom repo sync` | Sync all configured repos |
| `bloom repo remove <name>` | Remove a repository |
| `bloom repo worktree add` | Add a git worktree |
| `bloom repo worktree remove` | Remove a git worktree |
| `bloom repo worktree list` | List worktrees |

### Configuration

| Command | Description |
|---------|-------------|
| `bloom config` | View user configuration |
| `bloom config set-protocol` | Set git protocol preference |
| `bloom version` | Show version |
| `bloom help` | Show help |

### Advanced

| Command | Description |
|---------|-------------|
| `bloom refine` | Interactively refine project docs |
| `bloom enter` | Enter Claude Code with project context |
| `bloom reset <taskid>` | Reset stuck task |
| `bloom reset --stuck` | Reset all stuck tasks |
| `bloom interject` | Interrupt running agent sessions |

---

## Agent Commands

These commands are used by AI agents during task execution. You typically don't need to run these manually.

### Task Status (Agent Use)

| Command | Description |
|---------|-------------|
| `bloom done <taskid>` | Mark task complete |
| `bloom block <taskid>` | Mark task blocked (needs help) |
| `bloom note <taskid> <note>` | Add note to task |

### Questions (Agent Use)

| Command | Description |
|---------|-------------|
| `bloom ask <agent> <question>` | Ask human a question |
| `bloom wait-answer <qid>` | Wait for answer (blocks) |

---

## Internal Commands

These are called automatically by other commands or the orchestrator. Listed for completeness.

### Auto-Called by Orchestrator

| Command | Called By | Purpose |
|---------|-----------|---------|
| `bloom ready <taskid>` | `bloom run` | Mark task ready when deps complete |
| `bloom start <taskid>` | `bloom run` | Mark task when agent begins |
| `bloom assign <taskid> <agent>` | `bloom run` | Assign to specific agent |
| `bloom next [agent]` | `bloom run` | Find available tasks |
| `bloom agents` | `bloom run` | Track agent status |

### Auto-Called by Other Commands

| Command | Called By | Purpose |
|---------|-----------|---------|
| `bloom setup` | `bloom init` | Initial repo sync |
| `bloom repo create` | Internal | Create local repos |

### Utility (Rarely Needed)

| Command | Purpose |
|---------|---------|
| `bloom agent run <name>` | Run single agent (debugging) |
| `bloom agent list` | List agent configs |
| `bloom todo <taskid>` | Reset status to todo |
| `bloom clear-answered` | Clean up question queue |
| `bloom questions-dashboard` | Interactive question UI |

---

## Global Options

| Option | Description |
|--------|-------------|
| `-f, --file <path>` | Use custom tasks file |
| `-l, --log-level <level>` | Set log level (debug, info, warn, error) |

## Command Details

See individual command pages for detailed usage:

- [init](/commands/init) — Workspace initialization
- [repo](/commands/repo) — Repository management
- [create](/commands/create) — Project creation
- [plan](/commands/plan) — Plan generation
- [generate](/commands/generate) — Task generation
- [run](/commands/run) — Agent orchestration
- [Task Management](/commands/task-management) — Status and operations
- [Questions](/commands/questions) — Human queue management
