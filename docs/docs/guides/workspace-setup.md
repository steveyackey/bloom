---
sidebar_position: 1
title: Workspace Setup
---

# Workspace Setup

A Bloom workspace is the foundation for multi-agent development. This guide covers advanced configuration and best practices.

## Creating a Workspace

### Basic Setup

```bash
mkdir my-workspace
cd my-workspace
git init
bloom init
```

During initialization, you'll be asked:

1. **Git protocol preference** — SSH or HTTPS for cloning repositories

### Workspace Structure

After initialization:

```
my-workspace/
├── .git/                  # Git repository
├── .gitignore            # Ignores repos/ directory
├── bloom.config.yaml     # Workspace configuration
├── repos/                # Cloned repositories
└── template/             # Project templates
    ├── PRD.md
    ├── plan.md
    └── CLAUDE.template.md
```

## Configuration

### bloom.config.yaml

The workspace config tracks your repositories:

```yaml
repos:
  - url: git@github.com:myorg/backend.git
    name: backend
  - url: git@github.com:myorg/frontend.git
    name: frontend
  - url: git@github.com:myorg/shared-lib.git
    name: shared
```

This file is updated automatically when you use `bloom repo clone`.

### Git Protocol

Set your preferred protocol for repository URLs:

```bash
# View current config
bloom config

# Set protocol
bloom config set-protocol ssh    # git@github.com:...
bloom config set-protocol https  # https://github.com/...
```

User config is stored in `~/.bloom/config.yaml`.

## Templates

Templates in `template/` are copied when you run `bloom create`. Customize them for your team.

### PRD.md Template

```markdown
# [Project Name]

## Overview
[High-level description of the feature or change]

## Problem Statement
[What problem does this solve?]

## Requirements

### Functional Requirements
- [ ] Requirement 1
- [ ] Requirement 2

### Non-Functional Requirements
- [ ] Performance criteria
- [ ] Security considerations

## Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Out of Scope
- Item 1
- Item 2
```

### CLAUDE.template.md

This file provides context to AI agents:

```markdown
# Project Guidelines

## Code Style
- Use TypeScript strict mode
- Follow ESLint rules
- Write tests for new code

## Architecture
- Services in `src/services/`
- API routes in `src/routes/`
- Shared types in `src/types/`

## Testing
- Unit tests with Jest
- Run `npm test` before marking done

## Git
- Commit frequently with clear messages
- Don't push directly to main
```

## Multi-Repository Setup

### Organizing Large Projects

For projects spanning multiple repos:

```bash
# Clone all needed repositories
bloom repo clone myorg/api
bloom repo clone myorg/web-app
bloom repo clone myorg/mobile-app
bloom repo clone myorg/shared-types

# Create a project that spans them
bloom create cross-platform-feature
```

### Worktree Strategy

Plan your worktrees to avoid conflicts:

```yaml
# tasks.yaml
tasks:
  # Backend tasks use backend worktree
  - id: api-endpoints
    repo: ./repos/api
    worktree: feature/new-endpoints

  # Frontend tasks use matching worktree
  - id: web-integration
    repo: ./repos/web-app
    worktree: feature/new-endpoints
    depends_on: [api-endpoints]
```

## Syncing Repositories

### Sync All Repos

If repos are defined in config, sync them all:

```bash
bloom repo sync
```

This clones missing repos and fetches updates for existing ones.

### Manual Updates

```bash
# Update a specific repo
cd repos/backend
git fetch origin
git pull origin main
```

## Workspace Maintenance

### Cleaning Worktrees

Remove stale worktrees after merging:

```bash
# List worktrees for a repo
bloom repo worktree list backend

# Remove completed feature worktree
bloom repo worktree remove backend feature/completed-work
```

### Removing Repositories

```bash
# Remove repo and all its worktrees
bloom repo remove old-service
```

## Best Practices

### 1. One Workspace Per Effort

Keep related work in one workspace. Create new workspaces for unrelated projects.

### 2. Commit Workspace Config

Version control `bloom.config.yaml` and `template/`:

```bash
git add bloom.config.yaml template/
git commit -m "feat: initialize bloom workspace"
```

### 3. Standardize Templates

Create team templates that enforce:
- Code style guidelines
- Testing requirements
- Documentation standards

### 4. Use Descriptive Names

Name projects and repos clearly:

```bash
bloom create user-authentication  # Good
bloom create feature-1            # Bad
```

### 5. Regular Cleanup

Periodically remove completed worktrees:

```bash
# List all worktrees
for repo in repos/*.git; do
  name=$(basename "$repo" .git)
  bloom repo worktree list "$name"
done
```

## Troubleshooting

### "Not a bloom workspace"

Ensure you're in a directory with `bloom.config.yaml`:

```bash
ls bloom.config.yaml
```

If missing, run `bloom init`.

### "Repository already exists"

The repo is already cloned:

```bash
bloom repo list  # Verify it's there
```

### Worktree Conflicts

If git complains about existing worktrees:

```bash
# List actual worktrees
git -C repos/backend.git worktree list

# Prune stale entries
git -C repos/backend.git worktree prune
```

## Next Steps

- [Repository Management](/guides/repository-management) — Advanced repo operations
- [Project Workflow](/guides/project-workflow) — From PRD to execution
