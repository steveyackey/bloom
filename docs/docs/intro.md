---
slug: /
sidebar_position: 1
title: Introduction
---

# Welcome to Bloom

**Bloom** is a multi-agent task orchestration system that enables AI-powered development through YAML-based task definitions and Claude Code agents working in parallel. Whether you're a solo developer or part of a cross-functional team, Bloom adapts to your workflow.

## What is Bloom?

Bloom bridges the gap between high-level project planning and AI-powered execution. It supports the entire development lifecycle—from requirements gathering to code generation—with built-in collaboration points for teams of any size.

- **Plan across repositories** — Coordinate work spanning backend, frontend, and shared libraries in a single project
- **Plan thoroughly** — Define requirements in PRDs with mockups, designs, and technical constraints
- **Collaborate naturally** — PMs, designers, developers, and QA can each contribute at the right stages
- **Execute in parallel** — Run multiple Claude Code agents simultaneously on different tasks
- **Stay in control** — Human-in-the-loop design with checkpoints, question queues, and task oversight
- **Scale safely** — Git worktrees isolate agent work, preventing conflicts

```
init workspace → clone repos → create project → refine PRD → plan → generate → run
```

## For Teams and Solo Developers

**Teams** benefit from structured collaboration points:
- Product managers and designers own the PRD and add mockups or design links to the project folder
- Developers, architects, and technical leads refine implementation plans together
- QA engineers validate checkpoints at phase boundaries
- DevOps and security teams can review and contribute to planning

**Solo developers** move fast:
- Turn ideas into structured plans with AI assistance
- Let multiple agents execute in parallel
- Focus on reviewing and iterating rather than writing boilerplate

## Key Features

### Multi-Repository Planning
Unlike single-repo tools, Bloom coordinates work across multiple repositories in a single project. Build features spanning your backend, frontend, mobile app, and shared libraries—all with proper cross-repo dependency ordering.

### Multi-Agent Orchestration
Run multiple Claude Code agents in parallel, each working on isolated tasks in their own git worktrees. Automatic dependency resolution ensures tasks complete in the right order.

### Human-in-the-Loop
Agents can ask questions and wait for human responses. You stay in control of critical decisions while AI handles the implementation.

### YAML-Based Tasks
Define tasks with clear instructions, acceptance criteria, and dependencies. The schema is simple yet powerful enough for complex projects.

### Git Worktree Isolation
Each agent works in its own git worktree, preventing merge conflicts and allowing true parallel development across multiple features.

### Rich Terminal UI
Monitor all agents in real-time with a tiled terminal interface. Navigate between panes, restart stuck agents, and manage execution flow.

## Quick Example

```yaml
tasks:
  - id: setup-auth
    title: Implement authentication service
    status: todo
    phase: 1
    repo: ./repos/backend
    worktree: feature/auth
    instructions: |
      Create a JWT-based authentication service with:
      - Login endpoint
      - Token refresh
      - Password hashing with bcrypt
    acceptance_criteria:
      - All auth endpoints return proper status codes
      - Tokens expire after 24 hours
      - Passwords are never stored in plain text
```

## Next Steps

- [Installation](/getting-started/installation) — Install Bloom on your system
- [Quick Start](/getting-started/quick-start) — Create your first multi-agent project
- [Core Concepts](/getting-started/core-concepts) — Understand workspaces, repos, and projects
