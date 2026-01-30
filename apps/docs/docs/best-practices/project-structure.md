---
sidebar_position: 1
title: Project Structure
---

# Project Structure Best Practices

Organizing your Bloom workspace and projects for success.

## Workspace Organization

### Single Purpose Workspaces

Keep workspaces focused on related work:

```
# Good - related repositories
my-company-workspace/
├── repos/
│   ├── api/
│   ├── web-app/
│   ├── mobile-app/
│   └── shared-types/
└── features/
    ├── user-auth/
    └── payment-system/

# Bad - unrelated projects mixed
everything-workspace/
├── repos/
│   ├── company-api/
│   ├── personal-blog/
│   └── random-script/
```

### Project Naming

Use descriptive, consistent names:

```bash
# Good - clear and descriptive
bloom create user-authentication
bloom create payment-processing
bloom create dashboard-redesign

# Bad - vague or inconsistent
bloom create feature1
bloom create stuff
bloom create auth_thing
```

## Project Files

### PRD.md Structure

```markdown
# Feature Name

## Overview
Brief description of what this feature does.

## Problem Statement
What problem does this solve? Why is it needed?

## Requirements

### Functional Requirements
- [ ] Users can do X
- [ ] System responds with Y
- [ ] Data is stored as Z

### Non-Functional Requirements
- [ ] Response time < 200ms
- [ ] Support 1000 concurrent users
- [ ] 99.9% uptime

## Technical Constraints
- Must use existing auth system
- Backend in Node.js
- Database is PostgreSQL

## Success Criteria
- [ ] All tests pass
- [ ] Performance meets targets
- [ ] Security review complete

## Out of Scope
- Feature A (future work)
- Integration with B (separate project)
```

### CLAUDE.md Guidelines

Provide context for AI agents:

```markdown
# Project Guidelines

## Repository Structure
- `src/services/` - Business logic
- `src/routes/` - API endpoints
- `src/models/` - Database models
- `tests/` - Test files

## Code Standards
- TypeScript with strict mode
- ESLint + Prettier formatting
- No `any` types

## Testing Requirements
- Unit tests for services
- Integration tests for endpoints
- Minimum 80% coverage

## Git Practices
- Commit often with clear messages
- Don't push directly to main
- Squash commits before PR

## Security
- Never log sensitive data
- Validate all inputs
- Use parameterized queries
```

## Task Organization

### Phase Strategy

Organize tasks into logical phases:

```yaml
# Phase 1: Foundation
# Database models, basic setup

# Phase 2: Core Logic
# Services, business rules

# Phase 3: API Layer
# Endpoints, validation

# Phase 4: Integration
# Frontend connection, e2e

# Phase 5: Polish
# Error handling, logging, docs
```

### Task Granularity

Right-size your tasks:

```yaml
# Too large - hard to parallelize
- id: implement-entire-auth
  instructions: Build complete auth system

# Too small - overhead exceeds value
- id: create-file
  instructions: Create auth.ts file

# Just right - focused, completable
- id: implement-password-service
  instructions: |
    Create PasswordService with:
    - hash(password): Promise<string>
    - verify(password, hash): Promise<boolean>
    Use bcrypt with cost factor 12.
```

### Dependency Graphs

Design for parallel execution:

```yaml
# Good - enables parallelism
#     ┌─ task-a ─┐
#     │          │
# root┼─ task-b ─┼─ final
#     │          │
#     └─ task-c ─┘

# Bad - forced sequential
# root → task-a → task-b → task-c → final
```

## Repository Layout

### Worktree Strategy

Plan worktrees for isolation:

```yaml
# Feature work in feature branches
- id: auth-backend
  repo: ./repos/api
  worktree: feature/user-auth

- id: auth-frontend
  repo: ./repos/web
  worktree: feature/user-auth

# Shared worktree name for related work
# Makes it easy to track what goes together
```

### Multi-Repo Projects

For projects spanning repositories:

```
project/
├── PRD.md           # Shared requirements
├── plan.md          # Unified plan
├── CLAUDE.md        # Cross-repo guidelines
└── tasks.yaml       # Tasks for all repos
```

```yaml
tasks:
  # Backend tasks
  - id: api-models
    repo: ./repos/api
    worktree: feature/new-feature

  # Frontend tasks
  - id: ui-components
    repo: ./repos/web
    worktree: feature/new-feature
    depends_on: [api-models]  # Cross-repo dependency
```

## Version Control

### Commit Workspace Config

```bash
# Always commit
git add bloom.config.yaml
git add template/

# Commit projects
git add my-feature/PRD.md
git add my-feature/plan.md
git add my-feature/CLAUDE.md
git add my-feature/tasks.yaml

git commit -m "feat: add user authentication project"
```

### Gitignore

The default `.gitignore` excludes `repos/`:

```gitignore
repos/
```

This is intentional - repos are cloned, not stored in the workspace repo.

## Team Practices

Bloom naturally supports cross-functional collaboration. Here's how different roles contribute:

### Role Responsibilities

| Role | Primary Contributions |
|------|----------------------|
| **Product Manager** | PRD.md, requirements, success criteria |
| **Designer** | Mockups, wireframes, design links in `designs/` folder |
| **Developer** | CLAUDE.md, plan refinement, technical constraints |
| **Architect** | Plan review, dependency design, phase strategy |
| **QA Engineer** | Checkpoint validation, acceptance criteria review |
| **DevOps/Security** | Infrastructure requirements, security constraints |

### Shared Templates

Standardize templates for consistency:

```markdown
<!-- template/PRD.md -->
# [Feature Name]

## Overview
<!-- 2-3 sentences describing the feature -->

## Requirements
<!-- Use checkboxes for trackable items -->

## Design References
<!-- Links to Figma, mockups, or local files in designs/ -->

## Technical Approach
<!-- High-level technical decisions -->

## Open Questions
<!-- Things to discuss before implementation -->
```

### Review Process

1. **PRD Review** — PMs and designers finalize before planning
2. **Plan Review** — Architects and tech leads approve approach
3. **Task Review** — Developers validate breakdown before running
4. **Checkpoint Validation** — QA validates at phase boundaries
5. **Code Review** — Standard code review after completion

### Adding Design Assets

Teams should organize supporting materials in the project folder:

```
my-feature/
├── PRD.md
├── designs/
│   ├── mockups/
│   ├── user-flows/
│   └── figma-links.md
├── research/
│   └── competitive-analysis.md
└── ...
```

Agents can reference these files for context when executing tasks.

### Documentation

Keep documentation updated:

- Update README when adding features
- Document architecture decisions
- Add comments for complex logic
