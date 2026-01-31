---
sidebar_position: 2
title: Repository Management
---

# Repository Management

Bloom uses git worktrees to enable parallel development. This guide covers repository operations and worktree management.

## Cloning Repositories

### Basic Clone

```bash
# Full URL
bloom repo clone https://github.com/myorg/backend.git

# SSH URL
bloom repo clone git@github.com:myorg/backend.git

# Shorthand (uses configured protocol)
bloom repo clone myorg/backend
```

### What Happens

When you clone:

1. A directory is created for the repo: `repos/backend/`
2. Repository is cloned as a bare repo inside: `repos/backend/backend.git/`
3. Default branch worktree is created: `repos/backend/main/`
4. URL is added to `bloom.config.yaml`

```
repos/
└── backend/
    ├── backend.git/  # Bare repository (git data)
    └── main/         # Main branch worktree
```

## Creating Local Repositories

For new projects:

```bash
bloom repo create my-new-service
```

This creates:
- `repos/my-new-service/my-new-service.git/` — Empty bare repo
- `repos/my-new-service/main/` — Initial worktree

## Listing Repositories

```bash
bloom repo list
```

Output:
```
Repositories:
  backend     git@github.com:myorg/backend.git
  frontend    git@github.com:myorg/frontend.git
  shared      git@github.com:myorg/shared.git
```

## Git Worktrees

Worktrees let multiple branches exist as separate directories. This is how Bloom enables parallel agent work.

### Understanding Worktrees

Traditional git:
```
repo/
├── .git/
└── (one branch at a time)
```

With worktrees:
```
repos/
├── backend.git/           # Shared git data
├── backend/               # main branch
├── backend-feature-auth/  # feature/auth branch
└── backend-feature-api/   # feature/api branch
```

Each worktree is a full checkout. Agents can work simultaneously without conflicts.

### Adding Worktrees

```bash
# Create worktree for existing branch
bloom repo worktree add backend feature/existing-branch

# Create worktree with new branch
bloom repo worktree add backend feature/new-branch
```

Directory created: `repos/backend/feature-new-branch/`

### Listing Worktrees

```bash
bloom repo worktree list backend
```

Output:
```
Worktrees for backend:
  main              repos/backend/main
  feature/auth      repos/backend/feature-auth
  feature/api       repos/backend/feature-api
```

### Removing Worktrees

```bash
bloom repo worktree remove backend feature/completed
```

This removes the directory but preserves the branch in git.

## Task Integration

Tasks reference repos and worktrees:

```yaml
tasks:
  - id: implement-auth
    repo: ./repos/backend
    worktree: feature/auth
    instructions: |
      Implement authentication endpoints.
```

When `bloom run` executes:
1. Checks if worktree exists
2. Creates it if needed (from main branch)
3. Agent works in that directory
4. Changes stay isolated until merged

### Automatic Worktree Creation

If a task specifies a worktree that doesn't exist, Bloom creates it automatically during `bloom run`.

## Syncing Repositories

### Sync All

Ensure all configured repos are cloned, fetched, and default branches are up to date:

```bash
bloom repo sync
```

This:
- Clones missing repos from `bloom.config.yaml`
- Fetches updates for existing repos
- Pulls latest changes into default branch worktrees (fast-forward only)

:::tip
Run `bloom repo sync` before starting new work to ensure you have the latest code.
:::

### Manual Fetch

```bash
cd repos/backend
git fetch origin
git fetch --all  # All remotes
```

### Pulling Updates

For feature worktrees (default branches are pulled automatically by `repo sync`):

```bash
cd repos/backend/feature-auth  # feature worktree
git pull origin feature/auth
```

## Removing Repositories

```bash
bloom repo remove backend
```

This removes:
- The entire repo directory (`repos/backend/`) including:
  - The bare repository (`repos/backend/backend.git/`)
  - All worktrees (`repos/backend/main/`, `repos/backend/feature-*/`)
- Entry from `bloom.config.yaml`

:::warning
This permanently deletes local changes. Push important work first.
:::

## Working with Branches

### Creating Feature Branches

From any worktree:

```bash
cd repos/backend
git checkout -b feature/new-feature
git push -u origin feature/new-feature
```

Or create as a worktree:

```bash
bloom repo worktree add backend feature/new-feature
```

### Merging Work

After agents complete:

```bash
cd repos/backend/feature-auth
git push origin feature/auth

# Create PR through GitHub/GitLab
# Or merge locally:
cd repos/backend/main
git merge feature/auth
git push origin main
```

### Cleaning Up

Remove merged feature branches:

```bash
# Remove worktree
bloom repo worktree remove backend feature/auth

# Delete remote branch
git push origin --delete feature/auth

# Delete local branch
git branch -d feature/auth
```

## Multi-Remote Setup

For repos with multiple remotes (e.g., fork workflow):

```bash
cd repos/backend
git remote add upstream https://github.com/original/backend.git
git fetch upstream

# Sync fork
git checkout main
git merge upstream/main
git push origin main
```

## Best Practices

### 1. Name Worktrees Consistently

Use the branch name in the worktree path:

```
repos/backend/feature-auth     # Clear
repos/backend/work-1           # Unclear
```

### 2. Keep Main Worktree Clean

Use `repos/backend/main/` as reference. Create feature worktrees for changes.

### 3. Clean Up Completed Work

Remove worktrees after merging:

```bash
# After PR merged
bloom repo worktree remove backend feature/completed
```

### 4. Don't Edit Bare Repos

Never modify files in `repos/*/*.git/`. These are git internals.

### 5. Commit Before Switching

Ensure worktrees have clean state:

```bash
cd repos/backend/feature-auth
git status
git stash  # if uncommitted changes
```

## Troubleshooting

### "Worktree already exists"

The directory exists:

```bash
ls repos/backend/feature-auth
```

Remove it first:

```bash
bloom repo worktree remove backend feature/auth
```

### "Branch is already checked out"

A branch can only be in one worktree. Check existing worktrees:

```bash
bloom repo worktree list backend
```

### "Not a git repository"

Ensure you're using the correct path:

```bash
# Correct
bloom repo worktree add backend feature/x

# Incorrect (don't include .git or full path)
bloom repo worktree add repos/backend/backend.git feature/x
```

### Detached HEAD

If a worktree has detached HEAD:

```bash
cd repos/backend/feature-auth
git checkout feature/auth
```

## Next Steps

- [Project Workflow](/guides/project-workflow) — Create and manage projects
- [Multi-Agent Orchestration](/guides/multi-agent-orchestration) — Parallel execution
