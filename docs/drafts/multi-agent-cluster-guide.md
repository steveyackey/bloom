# Multi-Agent & Cluster Mode

Bloom supports running agents across multiple projects simultaneously, from a single machine to a distributed cluster.

## The Core Idea: Workspace-Level Orchestration

Currently, `bloom run` operates on a single project's `tasks.yaml`. But a workspace can have many projects:

```
my-workspace/
├─ bloom.config.yaml
├─ repos/
├─ projects/
│  ├─ auth-refactor/
│  │  └─ tasks.yaml       # 5 tasks
│  ├─ new-dashboard/
│  │  └─ tasks.yaml       # 8 tasks
│  └─ bug-fixes/
│     └─ tasks.yaml       # 3 tasks
└─ inbox.yaml              # Ad-hoc tasks
```

**The new model**: `bloom run` pulls tasks from ALL **runnable** projects (and inbox) in the workspace.

---

## Quick Reference

| Command | Scope | Use Case |
|---------|-------|----------|
| `bloom run` | Entire workspace | Run all projects + inbox |
| `bloom run --project auth-refactor` | Single project | Focus on one project |
| `bloom run --inbox-only` | Inbox only | Just ad-hoc tasks |
| `bloom run --workers 3` | Workspace, parallel | More compute |
| `bloom cluster start` | Distributed | Multi-machine |

---

## Project Lifecycle & The Registry

Not every project is ready to run. Projects move through a lifecycle:

```
┌─────────┐    ┌──────────┐    ┌─────────┐    ┌────────┐    ┌────────┐
│  draft  │ →  │ planning │ →  │  ready  │ →  │ active │ →  │  done  │
└─────────┘    └──────────┘    └─────────┘    └────────┘    └────────┘
     │                              │              │             │
     └──────────────────────────────┴──────────────┴─────────────┘
                                    ↓
                              ┌──────────┐
                              │ archived │
                              └──────────┘
```

| State | Has tasks.yaml? | Picked up by `bloom run`? | Description |
|-------|-----------------|---------------------------|-------------|
| `draft` | No | No | Just created, has PRD.md only |
| `planning` | No | No | Being refined/planned |
| `ready` | Yes | **No** | Tasks generated, awaiting review |
| `active` | Yes | **Yes** | Approved for execution |
| `paused` | Yes | No | Temporarily stopped |
| `done` | Yes | No | All tasks completed |
| `archived` | Yes | No | Moved to `.archive/` |

### The Project Registry

Instead of scanning hundreds of directories, bloom maintains a lightweight registry:

```
my-workspace/
├─ bloom.config.yaml
├─ .bloom/
│  └─ registry.yaml      # ← Project index
├─ projects/
│  ├─ auth-refactor/
│  ├─ new-dashboard/
│  └─ ...hundreds more...
└─ projects/.archive/
   └─ ...old projects...
```

```yaml
# .bloom/registry.yaml (auto-maintained)
projects:
  auth-refactor:
    state: active
    tasks_file: projects/auth-refactor/tasks.yaml
    task_count: 5
    ready_count: 2
    updated_at: 2025-01-26T10:30:00Z

  new-dashboard:
    state: ready          # Not picked up - needs activation
    tasks_file: projects/new-dashboard/tasks.yaml
    task_count: 8
    ready_count: 8
    updated_at: 2025-01-26T09:15:00Z

  old-feature:
    state: archived
    # No tasks_file - we don't even track the path

  experimental-idea:
    state: draft
    # No tasks yet

inbox:
  state: active
  tasks_file: inbox.yaml
  task_count: 3
  ready_count: 3
```

### How the Registry Works

1. **Creation**: `bloom create` adds project with state `draft`
2. **Planning**: `bloom plan` / `bloom refine` keeps it in `planning`
3. **Generation**: `bloom generate` creates tasks.yaml, sets state to `ready`
4. **Activation**: `bloom activate <project>` sets state to `active`
5. **Completion**: When all tasks done, auto-transitions to `done`
6. **Archive**: `bloom archive <project>` moves to `.archive/` and updates registry

### Activating Projects

After `bloom generate`, tasks exist but aren't run automatically:

```bash
bloom generate
# → tasks.yaml created, state = ready

bloom projects
```

```
PROJECTS
──────────────────────────────────────────────────────────
 Name             State     Tasks    Ready
──────────────────────────────────────────────────────────
 auth-refactor    active    5        2        ← Will run
 new-dashboard    ready     8        8        ← Needs activation
 bug-fixes        active    3        1        ← Will run
 old-cleanup      done      10       0        ← Complete
```

```bash
# Review the generated tasks first
bloom show --project new-dashboard

# Then activate when ready
bloom activate new-dashboard
# → state = active, now included in bloom run
```

### Batch Activation

```bash
# Activate multiple
bloom activate new-dashboard experimental-feature

# Activate all ready projects
bloom activate --all-ready

# Activate with auto-run
bloom activate new-dashboard --run
```

### Why Require Activation?

1. **Review gate**: See generated tasks before agents start working
2. **Controlled rollout**: Bring projects online when you're ready
3. **Resource management**: Don't overwhelm workers with 50 projects at once
4. **Safety**: Prevents accidental execution of draft work

### Scale: The Registry is the Index

With hundreds of projects, `bloom run` only:

1. Reads `registry.yaml` (one small file)
2. Filters to `state: active` projects (typically <10)
3. Loads only those `tasks.yaml` files
4. Ignores `.archive/` entirely

```bash
# Even with 500 projects, this is instant:
bloom run

# Because it only loads:
# - registry.yaml (index)
# - 5 active project task files
# - inbox.yaml
```

### Registry Maintenance

The registry is updated automatically, but you can also:

```bash
# Rebuild from filesystem (if registry is corrupted/stale)
bloom registry rebuild

# Show registry stats
bloom registry status
```

```
REGISTRY STATUS
──────────────────────────────────────────────────────────
 Total projects:     247
 Draft:              12
 Planning:           8
 Ready:              5      ← Review these
 Active:             4      ← Running
 Paused:             3
 Done:               89
 Archived:           126    ← Not loaded

 Last updated: 2 minutes ago
```

---

## Workspace Mode (Default)

Running `bloom run` from anywhere in the workspace now discovers and runs all projects:

```bash
bloom run
```

```
WORKSPACE: my-workspace
──────────────────────────────────────────────────────────
 Source              Tasks    Ready    In Progress
──────────────────────────────────────────────────────────
 auth-refactor       5        2        0
 new-dashboard       8        3        1
 bug-fixes           3        1        0
 inbox               2        2        0
──────────────────────────────────────────────────────────
 Total               18       8        1

Starting 4 agents across all sources...
```

### How Tasks Are Scheduled

Tasks from all projects enter a unified queue, ordered by:

1. **Priority** (explicit `priority: high/normal/low`)
2. **Dependencies satisfied** (ready vs blocked)
3. **Project order** (configurable in `bloom.config.yaml`)
4. **FIFO within same priority**

```yaml
# bloom.config.yaml
orchestrator:
  # Control project priority
  project_order:
    - bug-fixes      # Highest priority
    - inbox
    - auth-refactor
    - new-dashboard  # Lowest priority
```

### Project Isolation

Each project's tasks still operate in their own context:
- Own `tasks.yaml` state
- Own branches and worktrees
- Own session IDs
- Own CLAUDE.md context

Projects don't share agents mid-task—an agent finishes its current task before picking up work from another project.

---

## The Inbox

The inbox is a lightweight project for ad-hoc work:

```bash
# Add tasks to inbox
bloom inbox add "Fix null pointer in auth.ts" --repo my-app
bloom inbox add --issue my-org/repo#123
bloom inbox add "Research: how does caching work?" --repo my-app

# View inbox
bloom inbox
```

```
INBOX (3 tasks)
─────────────────────────────────────────────────────────
 ID       Repo      Title                          Status
─────────────────────────────────────────────────────────
 inbox-1  my-app    Fix null pointer in auth.ts    ready
 inbox-2  repo      GitHub issue #123              ready
 inbox-3  my-app    Research: how does caching...  ready
```

Inbox tasks are just tasks—they run alongside project tasks automatically.

### Inbox vs Projects

| Inbox | Projects |
|-------|----------|
| `bloom inbox add` | `bloom create` → refine → plan → generate |
| No PRD, no plan | Full workflow |
| Auto-cleanup on merge | Persistent history |
| Single tasks | Task trees with dependencies |

---

## Selecting What to Run

### Run Everything (Default)

```bash
bloom run
```

### Run Specific Projects

```bash
# Single project
bloom run --project auth-refactor

# Multiple projects
bloom run --project auth-refactor --project bug-fixes

# Exclude a project
bloom run --exclude new-dashboard
```

### Run Inbox Only

```bash
bloom run --inbox-only
# or
bloom inbox run
```

### Run a Project + Inbox

```bash
bloom run --project auth-refactor --inbox
```

---

## Multi-Worker Mode

Scale up on a single machine:

```bash
bloom run --workers 3
```

This spawns 3 coordinated processes that pull from the unified task queue:

```
┌─────────────────────────────────────────┐
│         Workspace Coordinator           │
│  ├─ Discovers all projects              │
│  ├─ Builds unified task queue           │
│  └─ Coordinates task claims             │
└─────────────────────────────────────────┘
        ↑           ↑           ↑
   Worker 1    Worker 2    Worker 3
   (auth task) (dashboard) (inbox bug)
```

### Task Claiming

Workers claim tasks atomically via SQLite:

```bash
bloom workers
```

```
ACTIVE WORKERS
──────────────────────────────────────────────────────────
 PID     Project          Task                 Duration
──────────────────────────────────────────────────────────
 12345   auth-refactor    Implement JWT        2m 30s
 12346   new-dashboard    Build sidebar        1m 15s
 12347   inbox            Fix null pointer     45s
```

### Worker Affinity (Optional)

Assign workers to specific projects:

```bash
# This worker only handles auth-refactor
bloom run --worker --project auth-refactor

# This worker handles inbox and bug-fixes
bloom run --worker --project inbox --project bug-fixes
```

---

## Cluster Mode

Distribute work across multiple machines.

### Start Coordinator

```bash
bloom cluster start --port 9000
```

The coordinator:
- Discovers all projects in the workspace
- Syncs workspace state to workers
- Schedules tasks across the cluster
- Aggregates results and updates task files

### Join Workers

On other machines:

```bash
bloom cluster join ws://coordinator:9000
```

Workers receive:
- Workspace configuration
- Repo access (via coordinator's git credentials)
- Task assignments

### Cluster Dashboard

```bash
bloom cluster dashboard
```

```
CLUSTER: my-workspace @ coordinator:9000
──────────────────────────────────────────────────────────
 Worker          Status    Project          Task
──────────────────────────────────────────────────────────
 alice-mbp       working   auth-refactor    JWT impl
 bob-linux       working   new-dashboard    Sidebar
 ci-runner-1     working   bug-fixes        Fix #123
 ci-runner-2     idle      -                -
──────────────────────────────────────────────────────────
 Projects: 3 active, 18 tasks (8 ready, 3 in-progress)
```

---

## Cross-Project Dependencies

Sometimes tasks in one project depend on another project:

```yaml
# projects/integration-tests/tasks.yaml
tasks:
  - id: run-e2e
    title: "Run E2E test suite"
    depends_on:
      - auth-refactor:deploy-staging    # Task in another project
      - new-dashboard:deploy-staging
```

The orchestrator understands cross-project dependencies and won't start `run-e2e` until both deploy tasks complete.

---

## Managing Project States

See [Project Lifecycle](#project-lifecycle--the-registry) for the full state machine. Common operations:

```bash
# Activate a project (ready → active)
bloom activate new-dashboard

# Pause an active project
bloom pause new-dashboard

# Resume a paused project
bloom resume new-dashboard

# Mark complete (all tasks done → done)
bloom complete auth-refactor

# Archive (any state → archived, moves to .archive/)
bloom archive old-feature

# Reopen archived project
bloom unarchive old-feature
```

```bash
bloom projects
```

```
PROJECTS
──────────────────────────────────────────────────────────
 Name             State     Tasks    Progress
──────────────────────────────────────────────────────────
 auth-refactor    active    5        ████░░░░░░ 40%
 new-dashboard    ready     8        ░░░░░░░░░░ 0%   ← needs activation
 bug-fixes        active    3        ██████████ 100%
 old-cleanup      done      10       ██████████ 100%
```

```bash
# See all states including archived
bloom projects --all
```

---

## Configuration

### bloom.config.yaml

```yaml
orchestrator:
  # Which projects to include by default
  include:
    - "*"           # All projects (default)
  exclude:
    - experiments/* # Skip experimental projects

  # Project priority order
  project_order:
    - bug-fixes
    - inbox
    # Unspecified projects run in alphabetical order

  # Concurrency limits
  max_workers: 4
  max_tasks_per_project: 2  # Don't let one project hog all workers

inbox:
  auto_branch: true
  branch_prefix: "inbox/"
  auto_cleanup: true
  default_priority: normal

cluster:
  port: 9000
  heartbeat_interval: 10
  task_timeout: 3600
```

---

## Workflows

### Solo Dev: Multiple Projects

```bash
# Work on auth while bugs get fixed in parallel
bloom run
```

### Team: Shared Workspace

```bash
# On shared server
bloom cluster start --daemon

# Team members connect
bloom cluster join ws://team-server:9000

# Each person's machine contributes workers
# All projects get worked on in parallel
```

### CI: Per-Project Runners

```yaml
# .github/workflows/bloom.yml
jobs:
  auth-refactor:
    runs-on: ubuntu-latest
    steps:
      - run: bloom run --project auth-refactor --until-idle

  dashboard:
    runs-on: ubuntu-latest
    steps:
      - run: bloom run --project new-dashboard --until-idle
```

### Quick Bug While Features Build

```bash
# Features building in background
bloom run &

# Hot bug comes in
bloom inbox add "URGENT: fix payment flow" --priority high

# Gets picked up immediately by next available worker
```

---

## Mental Model

```
┌─────────────────────────────────────────────────────────────────┐
│                         WORKSPACE                               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    .bloom/registry.yaml                   │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │  │
│  │  │proj-1  │ │proj-2  │ │proj-3  │ │proj-4  │ │inbox   │  │  │
│  │  │active  │ │ready   │ │active  │ │archived│ │active  │  │  │
│  │  └───┬────┘ └────────┘ └───┬────┘ └────────┘ └───┬────┘  │  │
│  └──────┼─────────────────────┼─────────────────────┼───────┘  │
│         │                     │                     │          │
│         ↓ load                ↓ load                ↓ load     │
│  ┌────────────┐        ┌────────────┐        ┌────────────┐   │
│  │ tasks.yaml │        │ tasks.yaml │        │ inbox.yaml │   │
│  │ (5 tasks)  │        │ (3 tasks)  │        │ (2 tasks)  │   │
│  └─────┬──────┘        └─────┬──────┘        └─────┬──────┘   │
│        └─────────────────────┴─────────────────────┘          │
│                              ↓                                 │
│                 ┌─────────────────────┐                       │
│                 │   Unified Queue     │ (10 tasks from        │
│                 │ (priority ordered)  │  3 active sources)    │
│                 └─────────────────────┘                       │
│                              ↓                                 │
│            ┌─────────────────┼─────────────────┐              │
│            ↓                 ↓                 ↓              │
│       ┌─────────┐       ┌─────────┐       ┌─────────┐        │
│       │ Worker1 │       │ Worker2 │       │ Worker3 │        │
│       └─────────┘       └─────────┘       └─────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

Key insights:
- **Registry is the index**: Only `active` projects are loaded
- **Projects are task sources**: Each contributes to unified queue
- **Workers are task consumers**: Pull from queue regardless of project
- **Archived/ready/draft projects are ignored**: Zero overhead

---

## Migration from Single-Project Mode

If you're used to `cd project && bloom run`:

| Old Way | New Way |
|---------|---------|
| `cd project && bloom run` | `bloom run --project name` |
| Run one project at a time | Run all projects with `bloom run` |
| Manual context switching | Automatic task scheduling |

The old way still works—if you run `bloom run` from inside a project directory with no workspace config, it behaves as before.
