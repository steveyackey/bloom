---
sidebar_position: 4
title: create
---

# bloom create

Create a new project in the workspace.

## Usage

```bash
bloom create <name>
```

## Description

Creates a new project directory with template files. A project represents a unit of work (feature, fix, etc.) across one or more repositories.

## Arguments

| Argument | Description |
|----------|-------------|
| `name` | Project name (used as directory name) |

## What It Creates

```
<name>/
├── PRD.md              # Product Requirements Document
├── plan.md             # Implementation plan (initially empty)
├── CLAUDE.md           # Guidelines for AI agents
└── tasks.yaml          # Task definitions (created by bloom generate)
```

## Examples

### Create a Feature Project

```bash
bloom create user-authentication
cd user-authentication
```

### Project Workflow

```bash
# 1. Create project
bloom create api-refactor

# 2. Edit PRD.md with requirements
cd api-refactor
vim PRD.md

# 3. Or use interactive refinement
bloom refine

# 4. Generate plan
bloom plan

# 5. Generate tasks
bloom generate

# 6. Run
bloom run
```

## Templates

Project files are copied from the `template/` directory in your workspace. Customize templates in `template/` to match your team's standards.

### PRD.md Template

```markdown
# [Project Name]

## Overview
[Description]

## Requirements
- [ ] Requirement 1
- [ ] Requirement 2

## Success Criteria
- [ ] Criterion 1
```

### CLAUDE.template.md

This becomes `CLAUDE.md` and provides context to AI agents:

```markdown
# Project Guidelines

## Code Style
[Your standards]

## Architecture
[Project structure]

## Testing
[Test requirements]
```

## Naming Conventions

Use descriptive, kebab-case names:

```bash
# Good
bloom create user-authentication
bloom create api-rate-limiting
bloom create dashboard-redesign

# Bad
bloom create feature1
bloom create stuff
```

## Related Commands

- [bloom refine](/commands/plan) — Refine project documents
- [bloom plan](/commands/plan) — Generate implementation plan
- [bloom generate](/commands/generate) — Generate tasks
