---
sidebar_position: 10
title: enter
---

# bloom enter

Enter an open-ended Claude Code session with project context.

## Usage

```bash
bloom enter
```

Run from within a project directory.

## What It Does

Opens an interactive Claude session for general-purpose work:

- Claude starts in your project directory
- Has access to the entire git repository for context
- No specific task or goal — work on whatever you need

## When to Use

Use `bloom enter` for:

- **Exploration** — Understand existing code before planning
- **Debugging** — Investigate issues across repos
- **Quick fixes** — Make small changes outside the task workflow
- **Research** — Ask questions about the codebase

## vs. bloom refine

| Command | Purpose |
|---------|---------|
| `bloom refine` | Focused on improving project documents (PRD, plan, tasks) |
| `bloom enter` | Open-ended session for any work |

Use `refine` when working on project planning. Use `enter` for everything else.

## Example Session

```bash
cd my-feature
bloom enter
```

Output:

```
Entering Claude Code in: /workspace/my-feature

Project files:
  - PRD.md
  - plan.md
  - tasks.yaml
```

Then Claude starts and you can ask anything:

```
You: How does authentication work in the backend repo?

Claude: Let me look at the backend authentication code...
[reads files from repos/backend]

The backend uses JWT tokens stored in...
```

## Project Context

When you run `bloom enter`, Claude knows:

- **Working Directory** — The project directory you're in
- **Git Root** — The workspace root for full repo access
- **Project Files** — Shows which files exist (PRD.md, plan.md, tasks.yaml)

This context helps Claude understand the project structure without you explaining it.

## Tips

- Run from a project directory for best context
- Claude can read and modify files in any repo
- Use for exploration before creating formal tasks
- Great for one-off changes that don't need full orchestration
