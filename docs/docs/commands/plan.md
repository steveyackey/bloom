---
sidebar_position: 5
title: plan
---

# bloom plan

Generate an implementation plan from the PRD.

## Usage

```bash
bloom plan
```

## Description

Opens an interactive Claude session that analyzes your `PRD.md` and creates a detailed implementation plan in `plan.md`.

## Prerequisites

- Must be in a project directory (contains `PRD.md`)
- `PRD.md` should have defined requirements

## What It Does

1. Reads your `PRD.md`
2. Opens interactive session with Claude
3. Claude asks clarifying questions
4. Generates structured `plan.md`

## Output

`plan.md` typically includes:

- **Phases** — Logical groupings of work
- **Steps** — Specific implementation tasks
- **Dependencies** — What must complete first
- **Technical details** — Implementation guidance

### Example Output

```markdown
# Implementation Plan

## Phase 1: Database Setup

### 1.1 Create User Model
- Add users table with id, email, password_hash
- Create migration file
- Add indexes for email lookup

### 1.2 Create Session Model
- Add sessions table linked to users
- Include expiry timestamp

## Phase 2: Authentication Service

### 2.1 Password Hashing
- Implement bcrypt hashing service
- Configure cost factor

### 2.2 JWT Generation
- Create token service
- Configure expiry times

## Phase 3: API Endpoints
...
```

## Interactive Session

During planning, Claude may ask:

- Technical preferences
- Scope clarifications
- Architecture decisions
- Edge case handling

Answer these to get a better plan.

## Related Commands

### bloom refine

Interactively refine any project document:

```bash
bloom refine
```

Use to:
- Improve PRD before planning
- Refine plan before generating tasks
- Update CLAUDE.md with guidelines

## Workflow

```bash
# 1. Create project
bloom create my-feature

# 2. Write/refine PRD
vim PRD.md
bloom refine  # Optional: interactive improvement

# 3. Generate plan
bloom plan

# 4. Review and refine plan
vim plan.md
bloom refine  # Optional: iterate on plan

# 5. Generate tasks
bloom generate
```

## Tips

### Write Detailed PRDs

More detail in `PRD.md` leads to better plans:

```markdown
## Requirements

### User Registration
- Email validation with confirmation
- Password requirements: 8+ chars, 1 number, 1 symbol
- Rate limit: 3 registrations per IP per hour

### Login
- Support email/password
- Lock account after 5 failed attempts
- Return JWT with 24-hour expiry
```

### Review Generated Plans

Always review `plan.md` before generating tasks:

- Are phases in logical order?
- Are dependencies correct?
- Is scope appropriate?

### Iterate

Use `bloom refine` to improve the plan:

```bash
bloom refine
# "Add more detail to the testing phase"
# "Split phase 2 into smaller steps"
```

## Related Commands

- [bloom create](/commands/create) — Create project
- [bloom generate](/commands/generate) — Generate tasks from plan
- [bloom run](/commands/run) — Execute tasks
