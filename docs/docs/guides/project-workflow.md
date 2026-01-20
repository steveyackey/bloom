---
sidebar_position: 3
title: Project Workflow
---

# Project Workflow

This guide walks through the complete lifecycle of a Bloom project, from requirements to execution. Bloom supports both team collaboration and solo developer workflows.

## Overview

```
create → refine PRD → plan → refine plan → generate → validate → run
```

Each step builds on the previous, transforming high-level requirements into executable tasks.

## Team Collaboration Model

Bloom provides natural collaboration points for cross-functional teams:

| Stage | Team Roles | Activities |
|-------|-----------|------------|
| **Create & PRD** | PM, Designer | Define requirements, add mockups, link designs |
| **Plan** | Dev, Architect, Tech Lead | Review technical approach, identify risks |
| **Refine Plan** | All stakeholders | Iterate on scope and implementation details |
| **Generate & Validate** | Dev, QA | Review task breakdown, verify completeness |
| **Run & Checkpoints** | QA, Dev | Validate work at phase boundaries |

Solo developers can move through these stages independently, using AI assistance to refine requirements and plans.

## 1. Create a Project

Start a new project in your workspace:

```bash
bloom create user-authentication
cd user-authentication
```

This creates:

```
user-authentication/
├── PRD.md              # Product Requirements Document
├── plan.md             # Implementation plan (empty)
├── CLAUDE.md           # Agent guidelines
└── tasks.yaml          # Tasks (created later)
```

## 2. Define Requirements (PRD)

Edit `PRD.md` to describe what you want to build. This is where product managers and designers shine—add detailed requirements, link to designs, and include mockups.

### Adding Design Assets

Organize design assets in your project folder:

```
user-authentication/
├── PRD.md              # References designs below
├── designs/            # Mockups and design files
│   ├── login-flow.png
│   ├── signup-wireframe.pdf
│   └── figma-link.md   # Link to Figma/Sketch files
├── research/           # User research, competitive analysis
└── ...
```

Reference designs in your PRD to give agents visual context.

### PRD Structure

```markdown
# User Authentication

## Overview
Implement secure JWT-based authentication for the API and frontend.

## Problem Statement
Users currently have no way to authenticate. We need login, registration,
and session management.

## Requirements

### Functional Requirements
- Users can register with email and password
- Users can log in and receive a JWT token
- Tokens expire after 24 hours
- Users can refresh tokens before expiry
- Protected endpoints require valid tokens

### Non-Functional Requirements
- Passwords hashed with bcrypt (cost factor 12)
- Rate limiting: 5 login attempts per minute
- Tokens use RS256 signing

## Technical Constraints
- Backend: Node.js/Express
- Frontend: React
- Database: PostgreSQL

## Success Criteria
- All auth endpoints return proper HTTP status codes
- Integration tests cover happy path and error cases
- Frontend properly handles token refresh

## Out of Scope
- Social login (OAuth)
- Two-factor authentication
- Password reset flow
```

### Interactive Refinement

Use Claude to improve your PRD:

```bash
bloom refine
```

This opens an interactive session where Claude asks clarifying questions and suggests improvements.

## 3. Generate a Plan

Transform the PRD into an implementation plan:

```bash
bloom plan
```

Claude analyzes your PRD and creates `plan.md`:

```markdown
# Implementation Plan

## Phase 1: Database & Models

### 1.1 User Model
- Create users table with id, email, password_hash, created_at
- Add unique constraint on email
- Create indexes for email lookup

### 1.2 Token Model
- Create refresh_tokens table
- Link to users with foreign key
- Add expiry timestamp

## Phase 2: Backend Services

### 2.1 Password Service
- Implement bcrypt hashing
- Create verify function
- Configure cost factor

### 2.2 JWT Service
- Generate access tokens (15 min expiry)
- Generate refresh tokens (7 day expiry)
- Verify and decode tokens

### 2.3 Auth Endpoints
- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout

## Phase 3: Frontend Integration

### 3.1 Auth Context
- Create AuthContext with user state
- Implement login/logout functions
- Handle token storage

### 3.2 Protected Routes
- Create ProtectedRoute component
- Redirect unauthenticated users
- Handle token refresh on 401

## Phase 4: Testing

### 4.1 Backend Tests
- Unit tests for services
- Integration tests for endpoints

### 4.2 Frontend Tests
- Component tests for auth forms
- Integration tests for auth flow
```

### Refine the Plan

Iterate on the plan until all stakeholders are satisfied:

```bash
bloom refine
```

**For teams**: This is a key collaboration point. Share `plan.md` with architects, tech leads, and developers. Gather feedback on:
- Technical approach and architecture decisions
- Risk identification and mitigation strategies
- Security, performance, and scalability considerations
- Dependency ordering and parallelization opportunities

**For solo developers**: Use `bloom refine` to discuss changes with Claude:
- Add missing steps
- Reorder phases
- Adjust scope
- Clarify ambiguities

## 4. Generate Tasks

Convert the plan into executable tasks:

```bash
bloom generate
```

This creates `tasks.yaml`:

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
      Create the users table with the following schema:
      - id: UUID primary key
      - email: VARCHAR(255) unique not null
      - password_hash: VARCHAR(255) not null
      - created_at: TIMESTAMP default now()

      Create a migration file and the corresponding model.
    acceptance_criteria:
      - Migration file exists and is reversible
      - Model includes all fields
      - Email has unique constraint

  - id: create-token-model
    title: Create refresh token model
    status: todo
    phase: 1
    depends_on: [create-user-model]
    repo: ./repos/backend
    worktree: feature/auth
    instructions: |
      Create refresh_tokens table linked to users.
      Fields: id, user_id (FK), token, expires_at, created_at
    acceptance_criteria:
      - Foreign key constraint to users
      - Index on token for lookups

  # Phase 2: Services
  - id: implement-password-service
    title: Implement password hashing service
    status: todo
    phase: 2
    depends_on: [create-user-model]
    repo: ./repos/backend
    worktree: feature/auth
    instructions: |
      Create PasswordService with:
      - hash(password): Promise<string>
      - verify(password, hash): Promise<boolean>
      Use bcrypt with cost factor 12.
    acceptance_criteria:
      - Hashing is async
      - Cost factor is configurable
      - Unit tests pass

  # ... more tasks
```

## 5. Validate Tasks

Check for errors before running:

```bash
bloom validate
```

This checks:
- Task IDs are unique
- Dependencies exist
- Required fields are present
- No circular dependencies

### Common Issues

```
ERROR: Task 'implement-auth' depends on 'setup-db' which doesn't exist
```

Fix by adding the missing task or correcting the dependency.

## 6. Review Task List

See what will be executed:

```bash
bloom list
```

Output:
```
Phase 1: Database
  [todo] create-user-model       Create user database model
  [todo] create-token-model      Create refresh token model (depends: create-user-model)

Phase 2: Services
  [todo] implement-password-service  Implement password hashing service
  [todo] implement-jwt-service       Implement JWT token service
  [todo] implement-auth-endpoints    Create auth API endpoints

Phase 3: Frontend
  [todo] create-auth-context     Setup authentication context
  [todo] create-login-form       Build login form component
  [todo] add-protected-routes    Add route protection
```

## 7. Run Agents

Execute with the orchestrator:

```bash
bloom run
```

The TUI shows:
- Agent panes with live output
- Task status updates
- Human question queue

### During Execution

Monitor in another terminal:

```bash
# Live dashboard
bloom dashboard

# Check specific status
bloom list in_progress
bloom show create-user-model
```

### Handling Questions

Agents may need input:

```bash
# View pending questions
bloom questions

# Answer
bloom answer q-123 "Use UUID v4 for user IDs"
```

### Managing Tasks

Intervene if needed:

```bash
# Mark stuck task blocked
bloom block task-id

# Reset and retry
bloom reset task-id

# Add notes for context
bloom note task-id "Discovered dependency on config service"
```

### Team Validation at Checkpoints

Checkpoints (`[CHECKPOINT]` tasks) pause execution for human review. This is where QA and team members validate work:

```bash
# Review changes before allowing agents to continue
cd repos/backend-feature-auth
git diff main

# If validation passes, mark checkpoint complete
bloom done checkpoint-phase-1

# If issues found, block and add notes
bloom block checkpoint-phase-1
bloom note checkpoint-phase-1 "Auth tokens missing refresh logic"
```

Teams requiring manual validation can add checkpoints at phase boundaries to ensure quality gates are met before agents proceed.

## 8. After Completion

### Review Changes

Each worktree has agent changes:

```bash
cd repos/backend-feature-auth
git log --oneline -10
git diff main
```

### Create Pull Requests

Push and create PRs:

```bash
git push origin feature/auth
# Create PR via GitHub/GitLab
```

### Clean Up

Remove worktrees after merge:

```bash
bloom repo worktree remove backend feature/auth
bloom repo worktree remove frontend feature/auth
```

## Iterative Development

### Adding More Tasks

Edit `tasks.yaml` to add tasks:

```yaml
tasks:
  # ... existing tasks

  - id: add-password-reset
    title: Implement password reset
    status: todo
    phase: 5
    depends_on: [implement-auth-endpoints]
    # ...
```

### Re-running Specific Tasks

Reset and re-run:

```bash
bloom todo implement-auth-endpoints  # Reset to todo
bloom run  # Will pick it up
```

### Continuing Work

If execution was interrupted:

```bash
bloom run  # Continues from where it left off
```

## Best Practices

### 1. Small, Focused Projects

One feature per project. Don't mix unrelated work.

### 2. Detailed PRDs

More detail = better plans = better tasks. Include:
- Technical constraints
- Edge cases
- Examples

### 3. Review Generated Tasks

Always check `tasks.yaml` before running:
- Are dependencies correct?
- Are instructions clear?
- Are acceptance criteria testable?

### 4. Commit Project Files

Version control your project:

```bash
git add user-authentication/
git commit -m "feat: add user authentication project"
```

### 5. Iterate on Plans

Use `bloom refine` liberally. Better plans lead to better results.

## Next Steps

- [Task Management](/guides/task-management) — Detailed task operations
- [Multi-Agent Orchestration](/guides/multi-agent-orchestration) — Parallel execution
- [Writing PRDs](/best-practices/writing-prds) — PRD best practices
