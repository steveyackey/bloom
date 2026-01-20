---
sidebar_position: 4
title: Task Management
---

# Task Management

Tasks are the core unit of work in Bloom. This guide covers everything about creating, managing, and monitoring tasks.

## Task Structure

Tasks are defined in `tasks.yaml`:

```yaml
tasks:
  - id: implement-auth
    title: Implement authentication service
    status: todo
    phase: 1
    depends_on: [setup-database]
    repo: ./repos/backend
    worktree: feature/auth
    agent_name: claude-code
    instructions: |
      Create JWT-based authentication with:
      - Login endpoint at POST /auth/login
      - Register endpoint at POST /auth/register
      - Token refresh at POST /auth/refresh
    acceptance_criteria:
      - All endpoints return appropriate status codes
      - Tokens expire after 24 hours
      - Invalid credentials return 401
    ai_notes: []
    validation_task_id: test-auth
    subtasks: []
```

## Task Properties

### Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier (kebab-case) |
| `title` | string | Brief description |
| `status` | enum | Current task state |
| `instructions` | string | Detailed work description |

### Optional Properties

| Property | Type | Description |
|----------|------|-------------|
| `phase` | number | Grouping for organization |
| `depends_on` | string[] | Task IDs that must complete first |
| `repo` | string | Working directory path |
| `worktree` | string | Git branch name |
| `agent_name` | string | Assign to specific agent |
| `acceptance_criteria` | string[] | Definition of done |
| `ai_notes` | string[] | Notes added during execution |
| `validation_task_id` | string | Task that validates this work |
| `subtasks` | Task[] | Nested child tasks |

## Task Status

### Status Values

| Status | Description |
|--------|-------------|
| `todo` | Not started, may have incomplete dependencies |
| `ready_for_agent` | Dependencies complete, ready to execute |
| `assigned` | Assigned to a specific agent |
| `in_progress` | Agent is actively working |
| `done` | Successfully completed |
| `blocked` | Cannot proceed, needs intervention |

### Status Flow

```
todo → ready_for_agent → assigned → in_progress → done
                                  ↘ blocked
```

The orchestrator automatically transitions tasks from `todo` to `ready_for_agent` when dependencies complete.

### Changing Status

```bash
# Mark as ready for work
bloom ready task-id

# Start working (agent does this)
bloom start task-id

# Complete
bloom done task-id

# Block (needs human help)
bloom block task-id

# Reset to todo
bloom todo task-id
```

## Dependencies

### Declaring Dependencies

```yaml
tasks:
  - id: create-models
    title: Create database models
    status: todo

  - id: implement-service
    title: Implement service layer
    depends_on: [create-models]
    status: todo

  - id: create-endpoints
    title: Create API endpoints
    depends_on: [implement-service, create-models]
    status: todo
```

### Dependency Rules

1. A task with dependencies stays `todo` until all dependencies are `done`
2. Circular dependencies are not allowed
3. Missing dependency IDs cause validation errors

### Checking Dependencies

```bash
# Validate task graph
bloom validate

# See what's blocking a task
bloom show task-id
```

## Viewing Tasks

### List All Tasks

```bash
bloom list
```

Output grouped by phase:
```
Phase 1: Setup
  [done]        create-models      Create database models
  [in_progress] implement-service  Implement service layer

Phase 2: API
  [todo]        create-endpoints   Create API endpoints (depends: implement-service)
```

### Filter by Status

```bash
bloom list todo
bloom list in_progress
bloom list done
bloom list blocked
```

### Show Task Details

```bash
bloom show implement-service
```

Output:
```
Task: implement-service
Title: Implement service layer
Status: in_progress
Phase: 1
Agent: claude-code

Dependencies:
  ✓ create-models (done)

Instructions:
  Create the UserService class with methods for:
  - createUser(data)
  - getUserById(id)
  - updateUser(id, data)
  - deleteUser(id)

Acceptance Criteria:
  - All methods are async
  - Proper error handling
  - Unit tests included

Notes:
  - Added validation for email format
```

### Available Tasks

See what's ready for work:

```bash
bloom next           # All available tasks
bloom next agent-1   # Tasks for specific agent
```

## Modifying Tasks

### Adding Notes

Document discoveries during execution:

```bash
bloom note task-id "Found edge case with empty strings"
bloom note task-id "Using bcrypt cost factor 12 per discussion"
```

Notes are preserved in `ai_notes` for future reference.

### Assigning Agents

```bash
bloom assign task-id agent-1
```

Assigned tasks only run on the specified agent.

### Resetting Tasks

Reset a stuck or failed task:

```bash
# Reset single task
bloom reset task-id

# Reset all stuck tasks (in_progress for too long)
bloom reset --stuck
```

## Subtasks

Tasks can have nested subtasks:

```yaml
tasks:
  - id: implement-auth
    title: Implement authentication
    status: todo
    subtasks:
      - id: auth-models
        title: Create auth models
        status: todo
        instructions: Create User and Token models

      - id: auth-service
        title: Create auth service
        status: todo
        depends_on: [auth-models]
        instructions: Implement AuthService class

      - id: auth-endpoints
        title: Create auth endpoints
        status: todo
        depends_on: [auth-service]
        instructions: Implement login/register routes
```

Subtasks:
- Have their own status and dependencies
- Can be nested multiple levels
- Complete when all children complete

## Validation Tasks

Link tasks to their validators:

```yaml
tasks:
  - id: implement-auth
    title: Implement authentication
    validation_task_id: test-auth

  - id: test-auth
    title: Test authentication
    depends_on: [implement-auth]
    instructions: |
      Run the auth test suite.
      Mark done only if all tests pass.
```

## Live Monitoring

### Dashboard

Real-time task status:

```bash
bloom dashboard
```

Refreshes every 10 seconds showing:
- Task counts by status
- Currently running tasks
- Recently completed tasks

### Agent View

See what agents are doing:

```bash
bloom agents
```

Output:
```
Agents:
  claude-code-1
    Current: implement-service (in_progress)
    Completed: 3 tasks

  claude-code-2
    Current: create-endpoints (in_progress)
    Completed: 2 tasks
```

## Best Practices

### 1. Write Clear Instructions

```yaml
# Good
instructions: |
  Create a UserService class in src/services/user.ts with:
  - createUser(data: CreateUserDTO): Promise<User>
  - getUserById(id: string): Promise<User | null>
  Use the existing DatabaseService for queries.

# Bad
instructions: Create user service
```

### 2. Define Testable Acceptance Criteria

```yaml
# Good
acceptance_criteria:
  - createUser returns created user with ID
  - getUserById returns null for non-existent ID
  - All methods throw typed errors on failure

# Bad
acceptance_criteria:
  - Service works correctly
```

### 3. Keep Tasks Focused

One task = one clear outcome. Split large tasks:

```yaml
# Good
- id: create-user-model
- id: create-user-service
- id: create-user-endpoints

# Bad
- id: implement-entire-user-feature
```

### 4. Use Meaningful IDs

```yaml
# Good
id: implement-jwt-refresh

# Bad
id: task-23
```

### 5. Set Appropriate Dependencies

Only depend on what you actually need:

```yaml
# Good - specific dependency
depends_on: [create-user-model]

# Bad - over-broad dependencies
depends_on: [setup-database, create-models, configure-orm, seed-data]
```

## Troubleshooting

### Task Stuck in_progress

```bash
# Check agent status
bloom agents

# Reset if agent crashed
bloom reset task-id
```

### Circular Dependencies

```
ERROR: Circular dependency detected: task-a → task-b → task-a
```

Fix by removing one dependency or restructuring tasks.

### Missing Dependencies

```
ERROR: Task 'implement-api' depends on 'setup-db' which doesn't exist
```

Add the missing task or fix the `depends_on` reference.

## Next Steps

- [Multi-Agent Orchestration](/guides/multi-agent-orchestration) — Running parallel agents
- [Task Design Best Practices](/best-practices/task-design) — Writing effective tasks
