---
sidebar_position: 2
title: Quick Start
---

# Quick Start

Get up and running with Bloom in 5 minutes. This guide walks you through creating a workspace, adding repositories, and running your first multi-agent task.

## 1. Initialize a Workspace

Create a new directory and initialize it as a Bloom workspace:

```bash
mkdir my-project
cd my-project
git init
bloom init
```

You'll be prompted to choose your Git protocol preference:

```
? How would you like to clone repositories?
❯ SSH (recommended)
  HTTPS
```

This creates:
- `.gitignore` — Excludes `repos/` from version control
- `bloom.config.yaml` — Workspace configuration
- `repos/` — Directory for cloned repositories
- `template/` — Templates for new projects

## 2. Clone Repositories

Add the repositories you want to work with:

```bash
# Using org/repo shorthand
bloom repo clone myorg/backend
bloom repo clone myorg/frontend

# Or full URLs
bloom repo clone https://github.com/myorg/api.git
```

View your repos:

```bash
bloom repo list
```

## 3. Create a Project

A project is a unit of work across one or more repositories:

```bash
bloom create add-user-auth
cd add-user-auth
```

This creates:
- `PRD.md` — Product Requirements Document
- `plan.md` — Implementation plan (empty initially)
- `CLAUDE.md` — Guidelines for AI agents
- `tasks.yaml` — Task definitions (generated later)

## 4. Define Requirements

Edit `PRD.md` to describe what you want to build:

```markdown
# User Authentication

## Overview
Implement JWT-based authentication across the backend API and frontend application.

## Requirements
- Users can register with email and password
- Users can log in and receive a JWT token
- Protected routes require valid tokens
- Frontend stores token and includes in requests

## Success Criteria
- All auth endpoints have proper error handling
- Tokens expire after 24 hours
- Frontend redirects to login when token expires
```

Or use the interactive refiner:

```bash
bloom refine
```

## 5. Generate a Plan

Let Claude create an implementation plan:

```bash
bloom plan
```

This opens an interactive session where Claude analyzes your PRD and creates a detailed `plan.md` with phases, tasks, and dependencies.

## 6. Generate Tasks

Convert the plan into executable tasks:

```bash
bloom generate
```

This creates `tasks.yaml` with structured tasks ready for execution.

## 7. Review Tasks

Check what was generated:

```bash
bloom list
```

Output:
```
Phase 1: Backend Auth
  [todo] setup-auth-models      Setup user model and database schema
  [todo] implement-jwt-service  Create JWT token service
  [todo] create-auth-endpoints  Implement login/register endpoints

Phase 2: Frontend Auth
  [todo] create-auth-context    Setup authentication context
  [todo] build-login-form       Create login form component
  [todo] add-route-protection   Add protected route wrapper
```

Validate the task graph:

```bash
bloom validate
```

## 8. Run Agents

Start the multi-agent orchestrator:

```bash
bloom run
```

This opens the Terminal UI with:
- Multiple agent panes executing tasks in parallel
- A human pane for answering agent questions
- Real-time task status updates

### TUI Controls

| Key | Action |
|-----|--------|
| `h/j/k/l` | Navigate panes |
| `Enter` | Focus pane |
| `Ctrl+B` | Exit focus |
| `r` | Restart agent |
| `x` | Kill agent |
| `q` | Quit |

## 9. Monitor Progress

In another terminal, watch task progress:

```bash
# Live dashboard
bloom dashboard

# List by status
bloom list in_progress
bloom list done
```

## 10. Handle Questions

Agents may ask questions that need human input:

```bash
# View pending questions
bloom questions

# Answer a question
bloom answer q-123 "Yes, use bcrypt with 12 rounds"

# Interactive questions view
bloom questions-dashboard
```

## Complete Workflow

```bash
# Setup
mkdir my-feature && cd my-feature
git init
bloom init
bloom repo clone myorg/backend
bloom repo clone myorg/frontend

# Planning
bloom create auth-feature
cd auth-feature
# Edit PRD.md with requirements
bloom plan
bloom generate
bloom validate

# Execution
bloom run
```

## Next Steps

- [Core Concepts](/getting-started/core-concepts) — Understand the architecture
- [Workspace Setup](/guides/workspace-setup) — Advanced workspace configuration
- [Task Design](/best-practices/task-design) — Write effective tasks
