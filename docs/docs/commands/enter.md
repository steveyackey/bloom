---
sidebar_position: 10
title: enter
---

# bloom enter

Enter an open-ended Claude Code session with access to all your repositories.

## Usage

```bash
bloom enter
```

Run from anywhere in your workspace—a project directory, the workspace root, or any folder.

## What It Does

Opens an interactive Claude session for exploration and freeform work:

- Claude has visibility into **all repositories** in your workspace
- Ask questions that span multiple repos (frontend, backend, shared libs)
- No project setup required—create a folder just for exploration if you want
- Work on whatever you need without formal task definitions

## When to Use

Use `bloom enter` for:

- **Cross-repo exploration** — Understand how systems connect across repositories
- **Onboarding** — Learn a new codebase by asking questions
- **Architecture review** — Explore dependencies and data flows
- **Debugging** — Investigate issues that span multiple services
- **Quick fixes** — Make small changes outside the task workflow
- **Research** — Ask questions before starting formal planning

## vs. bloom refine

| Command | Purpose |
|---------|---------|
| `bloom refine` | Focused on improving project documents (PRD, plan, tasks) |
| `bloom enter` | Open-ended session for exploration and any work |

Use `refine` when working on project planning. Use `enter` for exploration and everything else.

## Example: Cross-Repo Exploration

```bash
# From anywhere in your workspace
bloom enter
```

Ask questions that span multiple repositories:

```
You: How does the frontend auth flow connect to the backend JWT service?

Claude: Let me trace the authentication flow across both repos...
[reads files from repos/frontend and repos/backend]

The frontend calls the /api/auth/login endpoint which...

You: What shared types are used between the API and mobile app?

Claude: Looking at the shared-types repo and its consumers...
[reads files from repos/shared-types, repos/api, repos/mobile]

There are 12 shared types defined in...
```

## Exploration Without a Project

You don't need a formal project to use `bloom enter`. Create a folder just for asking questions:

```bash
mkdir exploration && cd exploration
bloom enter

# Now ask anything about your codebase
> "Show me all API endpoints across all services"
> "How is user data validated before storage?"
> "What dependencies do the frontend and backend share?"
```

This is perfect for:
- Onboarding new team members
- Architecture discussions
- Code review preparation
- Understanding unfamiliar parts of the codebase

## Context Awareness

When you run `bloom enter`, Claude knows:

- **Working Directory** — Where you're running from
- **Workspace Root** — Access to all repos in the workspace
- **All Repositories** — Can read and navigate any cloned repo
- **Project Files** — If in a project, shows PRD.md, plan.md, tasks.yaml

## Tips

- Run from anywhere—project directory, workspace root, or a folder you create
- Ask questions that span multiple repositories
- Use for exploration before creating formal tasks
- Great for understanding complex cross-repo interactions
- Perfect for onboarding and architecture review
