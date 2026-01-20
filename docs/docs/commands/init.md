---
sidebar_position: 2
title: init
---

# bloom init

Initialize a new Bloom workspace.

## Usage

```bash
bloom init
```

## Description

The `init` command sets up a directory as a Bloom workspace. It creates the necessary configuration files and directory structure.

## What It Creates

```
./
├── .gitignore           # Ignores repos/ folder
├── bloom.config.yaml    # Workspace configuration
├── repos/               # Repository storage directory
└── template/            # Project templates
    ├── PRD.md
    ├── plan.md
    └── CLAUDE.template.md
```

The `.gitignore` file is created (or updated) to exclude the `repos/` folder, preventing cloned repositories from being accidentally committed to the workspace.

## Interactive Prompts

### Git Protocol

```
? How would you like to clone repositories?
❯ SSH (git@github.com:...)
  HTTPS (https://github.com/...)
```

This sets your default protocol for `bloom repo clone` commands.

## Prerequisites

The directory should be a git repository:

```bash
mkdir my-workspace
cd my-workspace
git init
bloom init
```

## Configuration

After initialization, `bloom.config.yaml` is created:

```yaml
repos: []
```

Repositories are added when you use `bloom repo clone`.

## Templates

Templates in `template/` are copied when creating projects with `bloom create`. Customize them for your team's needs.

### PRD.md

Product Requirements Document template.

### plan.md

Implementation plan template.

### CLAUDE.template.md

Guidelines for AI agents. This becomes `CLAUDE.md` in projects.

## Examples

### Basic Initialization

```bash
mkdir my-project
cd my-project
git init
bloom init
```

### After Initialization

```bash
# Clone repositories
bloom repo clone myorg/backend
bloom repo clone myorg/frontend

# Create a project
bloom create feature-auth
```

## Related Commands

- [bloom config](/commands/repo) — View and modify configuration
- [bloom repo clone](/commands/repo) — Clone repositories
- [bloom create](/commands/create) — Create projects
