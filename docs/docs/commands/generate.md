---
sidebar_position: 6
title: generate
---

# bloom generate

Generate executable tasks from the implementation plan.

## Usage

```bash
bloom generate
```

## Description

Converts `plan.md` into structured tasks in `tasks.yaml`. Claude analyzes the plan and creates tasks with proper dependencies, instructions, and acceptance criteria.

## Prerequisites

- Must be in a project directory
- `plan.md` should exist with an implementation plan

## What It Does

1. Reads `plan.md`
2. Analyzes phases and steps
3. Creates `tasks.yaml` with:
   - Task IDs and titles
   - Dependencies
   - Repository assignments
   - Worktree specifications
   - Detailed instructions
   - Acceptance criteria

## Output

`tasks.yaml` structure:

```yaml
tasks:
  - id: create-user-model
    title: Create user database model
    status: todo
    phase: 1
    depends_on: []
    repo: ./repos/backend
    worktree: feature/auth
    instructions: |
      Create the users table with:
      - id: UUID primary key
      - email: VARCHAR(255) unique
      - password_hash: VARCHAR(255)
      - created_at: TIMESTAMP

      Create migration and model files.
    acceptance_criteria:
      - Migration is reversible
      - Model validates email format
      - Unique constraint on email

  - id: implement-auth-service
    title: Implement authentication service
    status: todo
    phase: 2
    depends_on: [create-user-model]
    repo: ./repos/backend
    worktree: feature/auth
    instructions: |
      Create AuthService with:
      - register(email, password)
      - login(email, password)
      - verifyToken(token)
    acceptance_criteria:
      - Passwords hashed with bcrypt
      - JWT tokens have 24h expiry
      - Invalid credentials return error
```

## After Generation

### Validate

Check for errors:

```bash
bloom validate
```

### Review

List generated tasks:

```bash
bloom list
```

### Modify

Edit `tasks.yaml` directly if needed:

```bash
vim tasks.yaml
```

Common modifications:
- Adjust dependencies
- Add acceptance criteria
- Change worktree names
- Split large tasks

### Run

Execute with agents:

```bash
bloom run
```

## Custom Task File

Use a different file:

```bash
bloom -f custom-tasks.yaml generate
bloom -f custom-tasks.yaml run
```

## Workflow

```bash
# Complete workflow
bloom create my-feature
cd my-feature

# Define requirements
vim PRD.md

# Generate plan
bloom plan

# Review plan
vim plan.md

# Generate tasks
bloom generate

# Validate
bloom validate

# Review tasks
bloom list

# Execute
bloom run
```

## Tips

### Review Before Running

Always check generated tasks:

```bash
bloom list
bloom show <task-id>  # For specific tasks
```

### Adjust Dependencies

If dependencies are wrong:

```yaml
# Before
- id: create-endpoints
  depends_on: [setup-database]  # Too broad

# After
- id: create-endpoints
  depends_on: [create-user-model]  # Specific
```

### Add Missing Criteria

Enhance acceptance criteria:

```yaml
acceptance_criteria:
  - All tests pass
  - No TypeScript errors
  - API documentation updated
```

## Related Commands

- [bloom plan](/commands/plan) — Create implementation plan
- [bloom validate](/commands/task-management) — Validate tasks
- [bloom run](/commands/run) — Execute tasks
