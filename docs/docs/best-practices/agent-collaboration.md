---
sidebar_position: 4
title: Agent Collaboration
---

# Agent Collaboration Best Practices

Tips for effective multi-agent execution in Bloom.

## Parallelism Strategies

### Independent Tasks

Design tasks that can run simultaneously:

```yaml
# Good - three agents can work in parallel
tasks:
  - id: implement-user-service
    repo: ./repos/api
    worktree: feature/users

  - id: implement-order-service
    repo: ./repos/api
    worktree: feature/orders

  - id: implement-payment-service
    repo: ./repos/api
    worktree: feature/payments
```

### Dependency Pyramids

Structure for maximum parallelism:

```
        Phase 3
         [D]         # 1 task
        /   \
    Phase 2
   [B]     [C]       # 2 parallel tasks
     \     /
      Phase 1
       [A]           # 1 task
```

```yaml
- id: A
  phase: 1

- id: B
  phase: 2
  depends_on: [A]

- id: C
  phase: 2
  depends_on: [A]

- id: D
  phase: 3
  depends_on: [B, C]
```

### Worktree Isolation

Each agent needs its own worktree:

```yaml
# Parallel-safe - different worktrees
- id: feature-a
  worktree: feature/branch-a

- id: feature-b
  worktree: feature/branch-b

# Conflict risk - same worktree
- id: task-1
  worktree: feature/shared  # Agent 1

- id: task-2
  worktree: feature/shared  # Agent 2 - CONFLICT!
```

## Communication Patterns

### Through Dependencies

Let dependencies communicate state:

```yaml
- id: create-api
  instructions: |
    Create user API endpoints.
    Document the contract in README.

- id: create-frontend
  depends_on: [create-api]
  instructions: |
    Integrate with user API.
    See API documentation in backend README.
```

### Through Notes

Use notes to pass information:

```bash
# Agent adds note during execution
bloom note create-api "Added validation - email must be lowercase"

# Next task sees the note
- id: create-frontend
  depends_on: [create-api]
  # Agent will see notes from create-api
```

### Through Questions

Ask for clarification:

```bash
# Agent asks
bloom ask agent-1 "Backend uses camelCase. Frontend convention?" \
  --task create-frontend \
  --type choice \
  --choices "camelCase,snake_case,match-backend"
```

## Handling Conflicts

### Same Repository

When multiple tasks touch the same repo:

```yaml
# Option 1: Different worktrees (parallel)
- id: auth-feature
  repo: ./repos/api
  worktree: feature/auth

- id: logging-feature
  repo: ./repos/api
  worktree: feature/logging

# Option 2: Dependencies (sequential)
- id: base-changes
  repo: ./repos/api
  worktree: feature/combined

- id: follow-up-changes
  repo: ./repos/api
  worktree: feature/combined
  depends_on: [base-changes]  # Same worktree, sequential
```

### Shared Files

If tasks might edit the same file:

```yaml
# Bad - likely conflict
- id: add-user-endpoint
  instructions: Add user route to src/routes/index.ts

- id: add-order-endpoint
  instructions: Add order route to src/routes/index.ts

# Good - separate files
- id: add-user-endpoint
  instructions: Create src/routes/users.ts with user routes

- id: add-order-endpoint
  instructions: Create src/routes/orders.ts with order routes

- id: register-routes
  depends_on: [add-user-endpoint, add-order-endpoint]
  instructions: Import and register all routes in src/routes/index.ts
```

## Agent Coordination

### Shared Context

Provide consistent context:

```yaml
# In CLAUDE.md
## API Conventions
- Use REST naming: plural nouns
- Return 201 for creates
- Return 204 for deletes
- Use camelCase for JSON

## Error Format
{
  "error": "Human readable message",
  "code": "MACHINE_CODE"
}
```

All agents see this and follow the same patterns.

### Validation Tasks

Use tasks to validate other tasks:

```yaml
- id: implement-feature
  instructions: Build the feature.

- id: validate-feature
  depends_on: [implement-feature]
  validation_task_id: implement-feature
  instructions: |
    Verify the feature works:
    - Run tests
    - Check types
    - Test manually
    Mark implement-feature as blocked if issues found.
```

## Human Oversight

### Strategic Checkpoints

Add human review at key points:

```yaml
- id: complete-phase-1

- id: human-review-phase-1
  depends_on: [complete-phase-1]
  instructions: |
    Ask human to review Phase 1 work before proceeding.

    bloom ask agent-1 "Phase 1 complete. Ready for Phase 2?" \
      --type yes_no \
      --on-yes done \
      --on-no blocked
```

### Question Types

Use appropriate question types:

```yaml
# Binary decisions
bloom ask agent-1 "Use bcrypt or argon2?" \
  --type choice \
  --choices "bcrypt,argon2"

# Need more info
bloom ask agent-1 "What should happen on duplicate email?" \
  --type open

# Completion check
bloom ask agent-1 "Is authentication complete?" \
  --type yes_no \
  --on-yes done
```

## Monitoring Multi-Agent Work

### Live Dashboard

```bash
# Terminal 1: Run agents
bloom run

# Terminal 2: Monitor
bloom dashboard
```

### Progress Tracking

```bash
# Check overall status
bloom list

# See active agents
bloom agents

# Watch specific status
watch -n 5 "bloom list in_progress"
```

### Question Response

Answer questions promptly to unblock agents:

```bash
# Check for questions
bloom questions

# Answer quickly
bloom answer q-123 "Use bcrypt"
```

## Recovery Patterns

### Stuck Agent

```bash
# In TUI: press 'r' to restart
# Or reset task:
bloom reset task-id
```

### Failed Task

```bash
# Check what happened
bloom show task-id

# Fix and retry
bloom todo task-id
bloom run
```

### Conflict Resolution

If agents create conflicting changes:

1. Stop orchestrator (`q` in TUI)
2. Review changes in worktrees
3. Manually resolve conflicts
4. Reset affected tasks
5. Resume with `bloom run`

## Efficiency Tips

### 1. Maximize Parallelism

More parallel tasks = faster completion.

### 2. Keep Tasks Focused

Small tasks complete faster and fail less.

### 3. Answer Questions Fast

Agents wait for answers. Quick responses = faster progress.

### 4. Use Multiple Worktrees

More worktrees = more parallel agents.

### 5. Monitor Actively

Catch problems early by watching the dashboard.

## Anti-Patterns

### Over-Sequential

```yaml
# Bad - no parallelism
- id: step-1
- id: step-2
  depends_on: [step-1]
- id: step-3
  depends_on: [step-2]
```

### Shared Worktree

```yaml
# Bad - conflict risk
- id: task-a
  worktree: main
- id: task-b
  worktree: main  # Same!
```

### Missing Dependencies

```yaml
# Bad - race condition
- id: use-service
  # Missing depends_on for service creation!
```

### Vague Instructions

```yaml
# Bad - agent will ask questions
instructions: Make it work.

# Good - clear direction
instructions: |
  Create UserService with createUser method.
  Validate email format.
  Hash password with bcrypt.
```
