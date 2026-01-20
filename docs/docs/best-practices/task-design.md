---
sidebar_position: 3
title: Task Design
---

# Task Design Best Practices

Well-designed tasks lead to better AI execution. This guide covers how to write effective tasks.

## Task Anatomy

```yaml
- id: implement-user-service
  title: Implement user service
  status: todo
  phase: 2
  depends_on: [create-user-model]
  repo: ./repos/backend
  worktree: feature/users
  agent_name: claude-code
  instructions: |
    Create UserService in src/services/user.ts with:

    Methods:
    - createUser(data: CreateUserDTO): Promise<User>
    - getUserById(id: string): Promise<User | null>
    - updateUser(id: string, data: UpdateUserDTO): Promise<User>
    - deleteUser(id: string): Promise<void>

    Requirements:
    - Use the existing DatabaseService for queries
    - Validate email format before create/update
    - Throw UserNotFoundError for missing users
    - Add unit tests in tests/services/user.test.ts
  acceptance_criteria:
    - All methods are async and properly typed
    - Email validation rejects invalid formats
    - getUserById returns null (not throws) for missing
    - deleteUser is idempotent
    - Tests cover happy path and error cases
```

## Writing Good IDs

### Naming Convention

Use kebab-case with action-noun pattern:

```yaml
# Good
id: create-user-model
id: implement-auth-service
id: add-rate-limiting
id: fix-token-expiry-bug

# Bad
id: task1
id: userStuff
id: do_the_thing
```

### Unique and Descriptive

```yaml
# Good - unique within project
id: create-user-model
id: create-order-model
id: create-payment-model

# Bad - too generic
id: create-model
id: create-model-2
id: create-model-3
```

## Writing Instructions

### Be Specific

```yaml
# Bad - too vague
instructions: Create the user service.

# Good - detailed and actionable
instructions: |
  Create UserService in src/services/user.ts.

  Implement these methods:
  1. createUser(data)
     - Validate email format
     - Hash password with bcrypt
     - Insert into database
     - Return user without password

  2. getUserById(id)
     - Query by primary key
     - Return null if not found
     - Exclude password from result
```

### Include Context

```yaml
instructions: |
  Create the authentication middleware.

  Context:
  - JWT tokens use RS256 algorithm
  - Public key is in config.jwt.publicKey
  - Tokens have 'sub' claim with user ID

  Implementation:
  - Export authMiddleware function
  - Verify token from Authorization header
  - Attach user to req.user
  - Return 401 for invalid/missing token

  Reference existing middleware in src/middleware/logging.ts
  for error handling pattern.
```

### Specify Location

```yaml
instructions: |
  Create password hashing utilities.

  File: src/utils/password.ts

  Exports:
  - hashPassword(plain: string): Promise<string>
  - verifyPassword(plain: string, hash: string): Promise<boolean>

  Tests: tests/utils/password.test.ts
```

## Acceptance Criteria

### Make Them Testable

```yaml
# Bad - subjective
acceptance_criteria:
  - Code is clean
  - Works correctly

# Good - verifiable
acceptance_criteria:
  - hashPassword returns 60-char bcrypt hash
  - verifyPassword returns true for matching password
  - verifyPassword returns false for wrong password
  - Hashing takes > 100ms (cost factor working)
  - Tests achieve 100% coverage
```

### Cover Edge Cases

```yaml
acceptance_criteria:
  - Returns user for valid ID
  - Returns null for non-existent ID
  - Returns null for malformed ID (not UUID)
  - Throws on database connection error
  - Handles concurrent requests safely
```

### Include Quality Checks

```yaml
acceptance_criteria:
  - No TypeScript errors
  - ESLint passes with no warnings
  - All tests pass
  - No console.log statements
  - Sensitive data not logged
```

## Dependencies

### Minimal Dependencies

Only depend on what you actually need:

```yaml
# Good - specific dependency
- id: implement-login
  depends_on: [create-auth-service]  # Actually uses AuthService

# Bad - over-specified
- id: implement-login
  depends_on:
    - create-auth-service
    - setup-database      # Already done by auth-service
    - configure-logging   # Not related
    - install-packages    # Too basic
```

### Parallel Opportunity

Design for parallel execution:

```yaml
# Good - independent tasks can parallelize
- id: create-user-model
  depends_on: []

- id: create-order-model
  depends_on: []

- id: create-payment-model
  depends_on: []

- id: implement-checkout
  depends_on: [create-user-model, create-order-model, create-payment-model]
```

### Avoid Chains

```yaml
# Bad - forced sequential execution
- id: step-1
- id: step-2
  depends_on: [step-1]
- id: step-3
  depends_on: [step-2]
- id: step-4
  depends_on: [step-3]

# Good - parallel where possible
- id: step-1a
- id: step-1b
- id: step-1c
- id: step-2
  depends_on: [step-1a, step-1b, step-1c]
```

## Task Size

### Right-Sized Tasks

A good task is:
- Completable in one session
- Has clear start and end
- Produces testable output

```yaml
# Too small - trivial
- id: create-file
  instructions: Create src/services/user.ts

# Too large - unclear scope
- id: implement-backend
  instructions: Build the entire backend

# Right size
- id: implement-user-service
  instructions: |
    Create UserService with CRUD operations.
    Include unit tests.
```

### Splitting Large Tasks

If a task is too big, split it:

```yaml
# Instead of one large task:
- id: implement-auth-system

# Split into focused tasks:
- id: implement-password-hashing
- id: implement-jwt-service
- id: implement-auth-endpoints
- id: implement-auth-middleware
- id: add-auth-tests
```

## Phases

### Logical Grouping

```yaml
tasks:
  # Phase 1: Data Layer
  - id: create-user-model
    phase: 1
  - id: create-session-model
    phase: 1

  # Phase 2: Business Logic
  - id: implement-auth-service
    phase: 2
    depends_on: [create-user-model, create-session-model]

  # Phase 3: API
  - id: create-auth-endpoints
    phase: 3
    depends_on: [implement-auth-service]

  # Phase 4: Integration
  - id: add-auth-to-frontend
    phase: 4
    depends_on: [create-auth-endpoints]
```

### Phase Guidelines

| Phase | Purpose | Examples |
|-------|---------|----------|
| 1 | Foundation | Models, configs, setup |
| 2 | Core Logic | Services, utilities |
| 3 | Interface | APIs, UI components |
| 4 | Integration | Connecting pieces |
| 5 | Polish | Tests, docs, cleanup |

## Worktrees

### Isolation Strategy

```yaml
# Same feature = same worktree
- id: auth-models
  worktree: feature/auth
- id: auth-service
  worktree: feature/auth
- id: auth-endpoints
  worktree: feature/auth

# Different feature = different worktree
- id: payment-models
  worktree: feature/payments
```

### Cross-Repo Coordination

```yaml
# Matching worktree names across repos
- id: api-auth
  repo: ./repos/api
  worktree: feature/auth

- id: web-auth
  repo: ./repos/web
  worktree: feature/auth
  depends_on: [api-auth]
```

## Common Patterns

### Create + Test Pattern

```yaml
- id: implement-service
  instructions: Create the service with all methods.

- id: test-service
  depends_on: [implement-service]
  instructions: Write comprehensive tests for the service.
  validation_task_id: implement-service
```

### Implement + Document Pattern

```yaml
- id: create-api-endpoints
  instructions: Implement REST endpoints.

- id: document-api
  depends_on: [create-api-endpoints]
  instructions: Update API documentation with new endpoints.
```

### Refactor Pattern

```yaml
- id: add-feature
  instructions: Add new feature to existing code.

- id: refactor-for-feature
  depends_on: [add-feature]
  instructions: Clean up code affected by new feature.
```
