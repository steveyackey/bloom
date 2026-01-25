---
sidebar_position: 1
title: Task Schema
---

# Task Schema Reference

Complete reference for the `tasks.yaml` file format.

## File Structure

```yaml
tasks:
  - id: task-id
    title: Task title
    status: todo
    # ... other properties
```

## Task Properties

### Required Properties

#### id

Unique identifier for the task.

```yaml
id: implement-user-auth
```

- **Type:** `string`
- **Format:** kebab-case (lowercase with hyphens)
- **Constraints:** Must be unique within the file

#### title

Short description of the task.

```yaml
title: Implement user authentication
```

- **Type:** `string`
- **Max length:** Recommended under 60 characters

#### status

Current state of the task.

```yaml
status: todo
```

- **Type:** `enum`
- **Values:**
  - `todo` — Not started
  - `ready_for_agent` — Dependencies complete, ready to execute
  - `assigned` — Assigned to specific agent
  - `in_progress` — Agent is working
  - `done` — Completed
  - `blocked` — Needs human intervention

#### instructions

Detailed description of work to be done.

```yaml
instructions: |
  Create the UserService class with:
  - createUser(data): Creates new user
  - getUserById(id): Retrieves user by ID

  Use the DatabaseService for queries.
  Add unit tests in tests/services/.
```

- **Type:** `string`
- **Format:** Multi-line recommended (use `|`)
- **Tips:** Be specific about files, methods, and expectations

### Optional Properties

#### phase

Grouping number for organization.

```yaml
phase: 2
```

- **Type:** `number`
- **Default:** None
- **Purpose:** Visual grouping in `bloom list`

#### depends_on

Array of task IDs that must complete first.

```yaml
depends_on:
  - create-user-model
  - setup-database
```

- **Type:** `string[]`
- **Default:** `[]`
- **Behavior:** Task stays `todo` until all dependencies are `done`

#### repo

Working directory for the task.

```yaml
repo: ./repos/backend
```

- **Type:** `string`
- **Format:** Relative path from workspace root
- **Default:** Current directory

#### worktree

Git branch name for isolation.

```yaml
worktree: feature/user-auth
```

- **Type:** `string`
- **Format:** Branch name (can include `/`)
- **Behavior:** Created automatically if doesn't exist

#### agent_name

Assign task to specific agent.

```yaml
agent_name: claude-code
```

- **Type:** `string`
- **Default:** Any available agent
- **Use case:** When specific agent should handle task

#### acceptance_criteria

Definition of done.

```yaml
acceptance_criteria:
  - All methods are properly typed
  - Unit tests achieve 80% coverage
  - No TypeScript errors
```

- **Type:** `string[]`
- **Purpose:** Helps agent know when task is complete

#### ai_notes

Notes added during execution.

```yaml
ai_notes:
  - "Added validation for email format"
  - "Using bcrypt with cost factor 12"
```

- **Type:** `string[]`
- **Default:** `[]`
- **Added by:** Agents via `bloom note`

#### validation_task_id

Task that validates this work.

```yaml
validation_task_id: test-user-service
```

- **Type:** `string`
- **Purpose:** Links implementation to test task

#### subtasks

Nested child tasks with their own branches and sessions.

```yaml
subtasks:
  - id: create-model
    title: Create user model
    status: todo
    instructions: ...

  - id: create-service
    title: Create user service
    status: todo
    depends_on: [create-model]
    instructions: ...
```

- **Type:** `Task[]`
- **Behavior:** Parent completes when all subtasks complete
- **Use case:** Parallelizable work that doesn't need shared context

#### steps

Lightweight sequential instructions that reuse the same agent session.

```yaml
steps:
  - id: refactor-auth.1
    instruction: |
      Extract JWT validation from auth.ts into jwt-validator.ts
    acceptance_criteria:
      - jwt-validator.ts exists
      - auth.ts imports from new module

  - id: refactor-auth.2
    instruction: |
      Add unit tests for jwt-validator module
    acceptance_criteria:
      - Tests cover valid/invalid tokens

  - id: refactor-auth.3
    instruction: Update API documentation
```

- **Type:** `TaskStep[]`
- **Behavior:** Each step runs in the same session; agent marks step done and exits, Bloom resumes with next step
- **Use case:** Sequential work where later steps benefit from context of earlier steps

**Step Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Step ID (typically `task-id.N`) |
| `instruction` | `string` | Yes | What to do in this step |
| `status` | `enum` | No | `pending`, `in_progress`, `done` |
| `acceptance_criteria` | `string[]` | No | When this step is complete |
| `started_at` | `string` | Auto | ISO timestamp when started |
| `completed_at` | `string` | Auto | ISO timestamp when finished |

#### started_at / completed_at

Timing fields for metrics (set automatically).

```yaml
started_at: "2024-01-15T10:30:00.000Z"
completed_at: "2024-01-15T11:45:00.000Z"
```

- **Type:** `string` (ISO 8601)
- **Set by:** Bloom CLI (do not set manually)
- **Purpose:** Duration tracking, performance metrics

## Steps vs Subtasks

Tasks can be broken down in two ways:

| Aspect | Steps | Subtasks |
|--------|-------|----------|
| **Session** | Same session (shared context) | Separate sessions |
| **Branch** | Same branch | Can have own branch |
| **Execution** | Sequential only | Can run in parallel |
| **Context** | Agent remembers previous steps | Fresh start each subtask |
| **Use when** | Work builds on itself | Work is independent |

**Use steps for:**
- Refactoring: extract code → add tests → update docs
- Migrations: update code → update tests → update configs
- Iterative work: implement → test → fix issues

**Use subtasks for:**
- Parallel features: frontend + backend
- Independent modules: auth service + email service
- Different agents: UI work + API work

## Status Transitions

### Automatic Transitions

```
todo → ready_for_agent  (when all depends_on are done)
ready_for_agent → in_progress  (when agent starts)
```

### Manual Transitions

```bash
bloom done <id>    # → done
bloom block <id>   # → blocked
bloom todo <id>    # → todo
bloom ready <id>   # → ready_for_agent
bloom start <id>   # → in_progress
```

## Complete Example

```yaml
tasks:
  # Phase 1: Database
  - id: create-user-model
    title: Create user database model
    status: todo
    phase: 1
    repo: ./repos/backend
    worktree: feature/auth
    instructions: |
      Create User model in src/models/user.ts:
      - id: UUID primary key
      - email: string, unique
      - passwordHash: string
      - createdAt: timestamp

      Create migration in migrations/.
    acceptance_criteria:
      - Model file exists with all fields
      - Migration is reversible
      - Types are exported

  - id: create-session-model
    title: Create session model
    status: todo
    phase: 1
    depends_on: [create-user-model]
    repo: ./repos/backend
    worktree: feature/auth
    instructions: |
      Create Session model linked to User.
      Fields: id, userId, token, expiresAt.
    acceptance_criteria:
      - Foreign key to users table
      - Index on token field

  # Phase 2: Services
  - id: implement-auth-service
    title: Implement authentication service
    status: todo
    phase: 2
    depends_on: [create-user-model, create-session-model]
    repo: ./repos/backend
    worktree: feature/auth
    instructions: |
      Create AuthService in src/services/auth.ts:
      - register(email, password): Create user
      - login(email, password): Return tokens
      - validateToken(token): Check validity

      Use bcrypt for password hashing.
    acceptance_criteria:
      - Passwords are never stored in plain text
      - Tokens use secure random generation
      - All methods have proper error handling
    validation_task_id: test-auth-service

  # Phase 3: Testing
  - id: test-auth-service
    title: Test authentication service
    status: todo
    phase: 3
    depends_on: [implement-auth-service]
    repo: ./repos/backend
    worktree: feature/auth
    instructions: |
      Write tests in tests/services/auth.test.ts:
      - Test successful registration
      - Test duplicate email rejection
      - Test successful login
      - Test invalid credentials
      - Test token validation
    acceptance_criteria:
      - All tests pass
      - Coverage > 80%
```

## Validation

Run `bloom validate` to check:

- Unique task IDs
- Valid dependency references
- Required fields present
- No circular dependencies

## Tips

### Writing Good IDs

```yaml
# Good
id: implement-user-service
id: add-login-endpoint
id: fix-token-expiry

# Bad
id: task1
id: stuff
id: do-thing
```

### Writing Instructions

```yaml
# Good - specific and actionable
instructions: |
  Create UserService in src/services/user.ts.

  Methods:
  - createUser(data: CreateUserDTO): Promise<User>
  - getUserById(id: string): Promise<User | null>

  Use DatabaseService for queries.
  Throw UserNotFoundError for missing users.

# Bad - too vague
instructions: Create the user service.
```

### Setting Dependencies

```yaml
# Good - minimal dependencies
depends_on: [create-user-model]

# Bad - unnecessary dependencies
depends_on: [init-project, setup-database, install-deps, create-model]
```
