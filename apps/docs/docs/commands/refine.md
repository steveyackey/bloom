---
sidebar_position: 5
title: refine
---

# bloom refine

Interactively refine project documents with Claude's help.

## Usage

```bash
bloom refine
```

Run from within a project directory (created with `bloom create`).

## What It Does

Opens an interactive Claude session focused on improving your project documents:

- **PRD.md** — Product Requirements Document
- **plan.md** — Implementation plan
- **tasks.yaml** — Task definitions
- **CLAUDE.md** — Agent guidelines

Claude can read files from anywhere in the workspace for context but will only edit files in the current project directory.

## When to Use

Use `bloom refine` at different stages of your workflow:

### After Creating a Project

```bash
bloom create my-feature
cd my-feature
bloom refine  # Flesh out PRD.md with requirements
```

### Before Planning

```bash
bloom refine  # Ensure PRD is complete before generating a plan
bloom plan
```

### After Planning

```bash
bloom plan
bloom refine  # Adjust the plan if needed
bloom generate
```

### After Generating Tasks

```bash
bloom generate
bloom refine  # Fine-tune task definitions, dependencies, or assignments
bloom run
```

## Interactive Session

During a refine session, Claude will:

1. Ask clarifying questions about your goals
2. Read existing documents to understand current state
3. Suggest specific improvements with reasoning
4. Make edits when you approve

Example conversation:

```
You: I want to add user authentication

Claude: I'll help you refine the PRD for user authentication. Let me read
the current PRD.md to understand what's there...

I see the PRD is mostly empty. Let me ask a few questions:
1. What authentication methods do you need? (email/password, OAuth, etc.)
2. Do you need role-based access control?
3. Which repos will this touch?

You: Email/password for now, no roles needed, just the backend repo

Claude: Got it. I'll update the PRD with those requirements...
```

## Contextual Next Steps

After the session ends, Bloom suggests the next command based on what files exist:

```bash
# If PRD exists but no plan:
Next: bloom plan      # Create implementation plan from PRD

# If plan exists but no tasks:
Next: bloom generate  # Generate tasks.yaml from plan

# If tasks exist:
Next: bloom run       # Execute tasks
```

## No Project Files

If you run `bloom refine` in a directory without project files, Bloom shows helpful guidance:

```
No project files found in the current directory.

Typical project files:
  PRD.md      - Product Requirements Document
  plan.md     - Implementation plan
  tasks.yaml  - Task definitions
  CLAUDE.md   - Guidelines for Claude

You can:
  - Run 'bloom create <name>' to create a new project with templates
  - Continue anyway to create files from scratch
```

## Tips

- **Start with the PRD** — Get requirements right before planning
- **Iterate freely** — Run refine multiple times at any stage
- **Provide context** — Reference repos and existing code in conversations
- **Review changes** — Claude shows diffs before applying edits
