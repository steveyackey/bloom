---
sidebar_position: 3
title: repo
---

# bloom repo

Manage repositories in your workspace.

## Commands

### clone

Clone a repository into the workspace.

```bash
bloom repo clone <url|org/repo>
```

**Examples:**

```bash
# Full URL
bloom repo clone https://github.com/myorg/backend.git
bloom repo clone git@github.com:myorg/backend.git

# Shorthand (uses configured protocol)
bloom repo clone myorg/backend
bloom repo clone steveyackey/bloom
```

**What happens:**
1. Creates repo directory: `repos/backend/`
2. Creates bare repository: `repos/backend/backend.git/`
3. Creates default worktree: `repos/backend/main/`
4. Adds entry to `bloom.config.yaml`

### create

Create a new local repository.

```bash
bloom repo create <name>
```

**Example:**

```bash
bloom repo create my-new-service
```

Creates:
- `repos/my-new-service/my-new-service.git/` — Empty bare repo
- `repos/my-new-service/main/` — Initial worktree

### list

List all repositories in the workspace.

```bash
bloom repo list
```

**Output:**

```
Repositories:
  backend     git@github.com:myorg/backend.git
  frontend    git@github.com:myorg/frontend.git
  shared      git@github.com:myorg/shared.git
```

### sync

Sync all repositories: fetch updates and pull default branches.

```bash
bloom repo sync
```

This reads `bloom.config.yaml` and:
- Clones any missing repositories
- Fetches updates for existing repositories
- Pulls latest changes into default branch worktrees (fast-forward only)

**Output:**

```
Syncing repositories...

Pulled: backend, frontend
Up to date: shared

Sync complete.
```

:::note
Pull uses `--ff-only` to prevent merge commits. If a default branch has diverged from remote, the sync will report an error and you'll need to resolve it manually.
:::

### remove

Remove a repository and all its worktrees.

```bash
bloom repo remove <name>
```

**Example:**

```bash
bloom repo remove old-service
```

:::warning
This permanently deletes local changes. Push important work first.
:::

## Worktree Commands

### worktree add

Create a new worktree for a branch.

```bash
bloom repo worktree add <repo> <branch>
```

**Examples:**

```bash
# Existing branch
bloom repo worktree add backend feature/existing-branch

# New branch (created from current HEAD)
bloom repo worktree add backend feature/new-feature
```

Creates directory: `repos/backend/feature-new-feature/`

### worktree remove

Remove a worktree.

```bash
bloom repo worktree remove <repo> <branch>
```

**Example:**

```bash
bloom repo worktree remove backend feature/completed
```

This removes the directory but preserves the branch in git.

### worktree list

List all worktrees for a repository.

```bash
bloom repo worktree list <repo>
```

**Output:**

```
Worktrees for backend:
  main              repos/backend
  feature/auth      repos/backend-feature-auth
  feature/api       repos/backend-feature-api
```

## Configuration

Repositories are tracked in `bloom.config.yaml`:

```yaml
repos:
  - url: git@github.com:myorg/backend.git
    name: backend
  - url: git@github.com:myorg/frontend.git
    name: frontend
```

## Related Commands

- [bloom init](/commands/init) — Initialize workspace
- [bloom config](/commands/init) — Configure git protocol
