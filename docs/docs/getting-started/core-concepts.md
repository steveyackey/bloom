---
sidebar_position: 3
title: Core Concepts
---

# Core Concepts

Understanding Bloom's architecture helps you use it effectively. This page covers the key concepts and how they relate—whether you're working solo or as part of a team.

## Workspace

A **workspace** is a git repository initialized with `bloom init`. It's the root of your Bloom setup and contains everything needed for multi-agent development.

```
my-workspace/                # Git repository
├── bloom.config.yaml       # Workspace configuration
├── repos/                  # Cloned repositories
├── template/               # Project templates
└── my-feature/             # A project
```

### Why Workspaces?

- **Centralized configuration** — One place for all settings
- **Shared repositories** — Clone once, use in multiple projects
- **Template consistency** — Standardized project structure
- **Git integration** — The workspace itself is version controlled

## Repository

A **repository** (repo) is a codebase cloned into the workspace with `bloom repo clone`. Repos are stored as bare git repositories with worktrees for parallel work.

```
repos/
├── backend/
│   ├── backend.git/       # Bare repository (git data)
│   ├── main/              # Default branch worktree
│   └── feature-auth/      # Feature branch worktree
└── frontend/
    ├── frontend.git/
    ├── main/
    └── feature-auth/
```

### Git Worktrees

Bloom uses [git worktrees](https://git-scm.com/docs/git-worktree) to enable parallel development:

- Each worktree is a separate checkout of the same repository
- Agents can work on different branches simultaneously
- No merge conflicts during parallel execution
- Changes are isolated until manually merged

```bash
# Create a worktree for a feature branch
bloom repo worktree add backend feature/auth

# List worktrees
bloom repo worktree list backend

# Remove when done
bloom repo worktree remove backend feature/auth
```

## Project

A **project** is a unit of work created with `bloom create`. It represents a feature, fix, or any body of work across one or more repositories. Projects are where team collaboration happens—from requirements to execution.

```
my-feature/
├── PRD.md           # Product Requirements Document
├── plan.md          # Implementation plan
├── CLAUDE.md        # Guidelines for AI agents
├── tasks.yaml       # Task definitions
├── designs/         # (Optional) Mockups, wireframes, Figma links
└── research/        # (Optional) User research, competitive analysis
```

### Project Files

| File | Purpose | Typical Owner |
|------|---------|---------------|
| `PRD.md` | High-level requirements and success criteria | PM, Designer |
| `plan.md` | Detailed implementation plan with phases | Dev, Architect |
| `CLAUDE.md` | Instructions and context for AI agents | Dev, Tech Lead |
| `tasks.yaml` | Structured task definitions for execution | Generated from plan |
| `designs/` | Mockups, wireframes, design system links | Designer |

### Project Lifecycle

```
create → refine PRD → plan → refine plan → generate tasks → run → validate
```

| Step | Activities | Team Collaboration |
|------|------------|-------------------|
| **Create** | Scaffold project from templates | PM initiates project |
| **Refine PRD** | Define requirements, add designs | PM, Designer contribute assets |
| **Plan** | Break down into phases and steps | Architects review approach |
| **Refine Plan** | Iterate on the approach | Tech leads provide feedback |
| **Generate** | Convert plan to executable tasks | Devs validate task breakdown |
| **Run** | Execute with agents | Monitor progress |
| **Validate** | Review at checkpoints | QA validates work quality |

Solo developers move through these stages independently, using AI to help refine and iterate.

## Task

A **task** is a unit of work in `tasks.yaml`. Tasks have instructions, dependencies, and acceptance criteria.

```yaml
tasks:
  - id: setup-auth
    title: Implement authentication service
    status: todo
    phase: 1
    depends_on: []
    repo: ./repos/backend
    worktree: feature/auth
    agent_name: claude-code
    instructions: |
      Create JWT authentication with login/register endpoints.
      Use bcrypt for password hashing.
    acceptance_criteria:
      - Login returns valid JWT on success
      - Passwords are hashed with bcrypt
      - Invalid credentials return 401
```

### Task Properties

| Property | Required | Description |
|----------|----------|-------------|
| `id` | Yes | Unique identifier (kebab-case) |
| `title` | Yes | Short description |
| `status` | Yes | Current state |
| `phase` | No | Grouping number |
| `depends_on` | No | Task IDs that must complete first |
| `repo` | No | Working directory |
| `worktree` | No | Git branch for isolation |
| `agent_name` | No | Assign to specific agent |
| `checkpoint` | No | If true, requires human approval before downstream tasks |
| `instructions` | Yes | Detailed work description |
| `acceptance_criteria` | No | Definition of done |

### Task Status

```
todo → ready_for_agent → assigned → in_progress → done
                                  ↘ blocked
```

| Status | Meaning |
|--------|---------|
| `todo` | Not started, dependencies incomplete |
| `ready_for_agent` | Dependencies complete, ready to work |
| `assigned` | Assigned to specific agent |
| `in_progress` | Agent is working on it |
| `done` | Completed successfully |
| `blocked` | Cannot proceed, needs human help |

### Dependencies

Tasks can depend on other tasks:

```yaml
- id: create-user-model
  title: Create user database model
  status: todo

- id: implement-auth
  title: Implement authentication
  depends_on: [create-user-model]  # Waits for model
  status: todo
```

The orchestrator automatically manages the `ready_for_agent` transition when dependencies complete.

## Agent

An **agent** is an AI system that executes tasks. Bloom primarily uses Claude Code but supports other providers.

### How Agents Work

1. Agent receives task with instructions and context
2. Agent works in the specified worktree
3. Agent can ask questions via the human queue
4. Agent marks task `done` or `blocked` when finished

### Agent Capabilities

Agents can use Bloom CLI commands:

```bash
# Mark task complete
bloom done task-id

# Mark task blocked
bloom block task-id

# Add notes
bloom note task-id "Discovered edge case, added handling"

# Ask questions
bloom ask agent-1 "Should I use bcrypt or argon2?" --task setup-auth
```

### Human Queue

Agents can ask questions and wait for responses:

```bash
# View pending questions
bloom questions

# Answer a question
bloom answer q-abc123 "Use bcrypt with 12 rounds"
```

Question types:
- **yes_no** — Binary choice, can auto-update task status
- **choice** — Select from options
- **open** — Free-form text response

## Phases

**Phases** group related tasks and help visualize project progress. Tasks in lower phases typically complete before higher phases.

```yaml
tasks:
  # Phase 1: Backend
  - id: setup-models
    phase: 1

  - id: create-api
    phase: 1
    depends_on: [setup-models]

  # Phase 2: Frontend
  - id: build-ui
    phase: 2
    depends_on: [create-api]
```

Phases are for organization only — actual execution order is determined by dependencies.

## Configuration

### Workspace Config

`bloom.config.yaml` stores workspace settings:

```yaml
repos:
  - url: https://github.com/myorg/backend.git
    name: backend
  - url: https://github.com/myorg/frontend.git
    name: frontend
```

### User Config

Global settings in `~/.bloom/config.yaml`:

```yaml
gitProtocol: ssh  # or https

agent:
  defaultInteractive: claude      # For bloom enter, bloom refine
  defaultNonInteractive: claude   # For bloom run (autonomous tasks)

  claude:
    defaultModel: sonnet
    models:
      - sonnet
      - haiku
      - opus
```

Manage with:

```bash
# View configuration
bloom config

# Git protocol
bloom config set-protocol ssh

# Agent defaults
bloom config set-interactive claude
bloom config set-noninteractive opencode

# Model configuration
bloom config set-model claude opus
bloom config models claude --discover --save
```

## Summary

| Concept | Definition |
|---------|------------|
| Workspace | Git repo with Bloom initialization |
| Repository | Codebase cloned with worktree support |
| Project | Unit of work with PRD, plan, and tasks |
| Task | Individual work item with instructions |
| Agent | AI system executing tasks |
| Phase | Logical grouping of tasks |

## Next Steps

- [Workspace Setup](/guides/workspace-setup) — Configure your workspace
- [Task Management](/guides/task-management) — Work with tasks
- [Multi-Agent Orchestration](/guides/multi-agent-orchestration) — Run parallel agents
