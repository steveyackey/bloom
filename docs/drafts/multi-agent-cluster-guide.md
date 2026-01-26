# Multi-Agent & Cluster Mode

Bloom supports running multiple agents concurrently, from a single machine to a distributed cluster of runners. This guide covers the different modes and when to use each.

## Quick Reference

| Mode | Command | Use Case |
|------|---------|----------|
| Single agent | `bloom run` | Simple projects, one task at a time |
| Multi-agent | `bloom run` | Parallel tasks within a project |
| Multi-process | `bloom run --workers 3` | More parallelism on one machine |
| Cluster | `bloom cluster start` | Distributed compute across machines |

---

## Ad-hoc Tasks & The Inbox

Not everything needs a full project. Use the inbox for quick bugs, research, and one-off tasks.

### Adding Tasks to Inbox

```bash
# Quick bug fix
bloom inbox add "Fix the null pointer in auth.ts line 42" --repo my-app

# Research task
bloom inbox add "How does the caching layer work?" --repo my-app

# From a GitHub issue
bloom inbox add --issue my-org/my-app#123

# With priority (urgent tasks get picked up first)
bloom inbox add "Production bug in payments" --repo billing --priority high
```

### Viewing Your Inbox

```bash
bloom inbox
```

```
INBOX (3 tasks)
─────────────────────────────────────────────────────────
 #   Priority   Repo      Title
─────────────────────────────────────────────────────────
 1   high       billing   Production bug in payments
 2   normal     my-app    Fix null pointer in auth.ts
 3   low        my-app    How does the caching layer work?
```

### Running Inbox Tasks

Inbox tasks run alongside project tasks automatically:

```bash
bloom run  # Picks up both project tasks AND inbox
```

Or run inbox only:

```bash
bloom inbox run
```

### Inbox vs Projects

| Inbox | Projects |
|-------|----------|
| Quick, one-off tasks | Planned, multi-task work |
| No PRD or plan needed | Full PRD → Plan → Generate flow |
| Auto-cleanup after merge | Persistent task history |
| Great for bugs & research | Great for features & refactors |

---

## Multi-Agent Mode (Single Process)

By default, `bloom run` extracts agent names from your `tasks.yaml` and runs them concurrently:

```yaml
# tasks.yaml
tasks:
  - id: frontend-work
    agent_name: frontend
    title: "Build login page"

  - id: backend-work
    agent_name: backend
    title: "Add auth endpoints"

  - id: more-frontend
    agent_name: frontend
    title: "Build dashboard"
```

```bash
bloom run
```

This spawns two concurrent work loops:
- `frontend` agent works on frontend-work, then more-frontend
- `backend` agent works on backend-work in parallel

The TUI shows both agents side-by-side:

```
┌─ frontend ──────────────────┬─ backend ───────────────────┐
│ Working on: Build login     │ Working on: Add auth        │
│                             │ endpoints                   │
│ > Creating LoginForm.tsx... │                             │
│ > Adding validation...      │ > Scaffolding routes...     │
│                             │ > Adding JWT middleware...  │
└─────────────────────────────┴─────────────────────────────┘
```

---

## Multi-Process Mode (Same Machine)

Need more parallelism? Run multiple bloom processes:

```bash
# Option 1: Specify worker count
bloom run --workers 3

# Option 2: Run separate processes manually
bloom run &
bloom run &
bloom run &
```

### How It Works

Each process registers with a local coordinator and claims tasks atomically:

```
┌─────────────────────────────────────────┐
│           ~/.bloom/coordinator          │
│  ├─ task-claims.db (SQLite)             │
│  └─ workers.json                        │
└─────────────────────────────────────────┘
        ↑           ↑           ↑
   bloom run   bloom run   bloom run
    (pid 1)     (pid 2)     (pid 3)
```

Tasks are claimed atomically—no duplicates, no races.

### Viewing All Workers

```bash
bloom workers
```

```
ACTIVE WORKERS
──────────────────────────────────────────────────────────
 PID     Status    Current Task         Started
──────────────────────────────────────────────────────────
 12345   working   frontend-work        2 min ago
 12346   working   backend-work         2 min ago
 12347   idle      -                    1 min ago
```

### Stopping Workers

```bash
bloom workers stop          # Graceful shutdown (finish current tasks)
bloom workers stop --force  # Immediate shutdown
```

---

## Cluster Mode (Distributed)

For large projects or teams, run bloom across multiple machines.

### Starting a Cluster

**On the coordinator machine:**

```bash
bloom cluster start --port 9000
```

```
Cluster coordinator started on ws://192.168.1.10:9000
Waiting for workers...

Join command for other machines:
  bloom cluster join ws://192.168.1.10:9000
```

**On worker machines:**

```bash
bloom cluster join ws://192.168.1.10:9000
```

```
Connected to cluster at 192.168.1.10:9000
Registered as worker-3a7f
Waiting for tasks...
```

### Cluster Architecture

```
┌──────────────────────────────────────┐
│         Coordinator (your machine)   │
│  ├─ Task queue & scheduling          │
│  ├─ Git repo sync                    │
│  ├─ Result aggregation               │
│  └─ Web dashboard (:9001)            │
└──────────────────────────────────────┘
           ↓ WebSocket ↓
    ┌──────────┬──────────┬──────────┐
    │ Worker 1 │ Worker 2 │ Worker 3 │
    │ (local)  │ (remote) │ (remote) │
    └──────────┴──────────┴──────────┘
```

### Cluster Dashboard

Access the web dashboard at `http://coordinator:9001`:

```bash
bloom cluster dashboard
# Opens browser to http://localhost:9001
```

The dashboard shows:
- All connected workers and their status
- Task queue and assignments
- Live output from all agents
- Resource usage per worker

### Worker Capabilities

Workers can advertise their capabilities:

```bash
# This worker has GPU, good for heavy tasks
bloom cluster join ws://coord:9000 --capabilities gpu,high-memory

# This worker is limited
bloom cluster join ws://coord:9000 --capabilities basic
```

In your tasks.yaml:

```yaml
tasks:
  - id: heavy-analysis
    title: "Analyze entire codebase"
    requires: [high-memory]  # Only assigned to capable workers
```

### Handling Disconnections

Workers automatically reconnect. If a worker dies mid-task:

1. Coordinator detects missing heartbeat (30s timeout)
2. Task returns to queue with `ready_for_agent` status
3. Another worker picks it up
4. Session ID preserved—work resumes where it left off

### Security

Cluster communication is encrypted. Generate a cluster key:

```bash
bloom cluster init
# Creates ~/.bloom/cluster-key

# Workers need the same key
scp ~/.bloom/cluster-key worker-machine:~/.bloom/
```

Or use environment variable:

```bash
BLOOM_CLUSTER_KEY=xxx bloom cluster join ws://coord:9000
```

---

## Configuration

### bloom.config.yaml

```yaml
# Workspace-level settings
cluster:
  # Max concurrent agents per bloom run process
  max_agents: 4

  # Task claim timeout (seconds)
  claim_timeout: 300

  # Heartbeat interval for cluster mode
  heartbeat_interval: 10

inbox:
  # Auto-create branches for inbox tasks
  auto_branch: true
  branch_prefix: "inbox/"

  # Auto-cleanup merged inbox tasks
  auto_cleanup: true
```

### User Config (~/.bloom/config.yaml)

```yaml
# Default cluster to join
cluster:
  default_coordinator: ws://team-server:9000
  auto_join: false  # Set true to join on `bloom run`

# Worker identity
worker:
  name: "alice-macbook"  # Shows in dashboard
  capabilities: [gpu, high-memory]
```

---

## Common Workflows

### Solo Developer: Local Multi-Process

```bash
# Terminal 1: Run with 2 workers
bloom run --workers 2

# Terminal 2: Watch the dashboard
bloom dashboard
```

### Team: Shared Cluster

```bash
# Team lead starts coordinator (always-on server)
bloom cluster start --port 9000 --daemon

# Team members join
bloom cluster join ws://team-server:9000

# Everyone's bloom run contributes to shared work
bloom run  # Joins cluster automatically if configured
```

### CI/CD: Ephemeral Workers

```yaml
# GitHub Actions
jobs:
  bloom-worker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          bloom cluster join ${{ secrets.BLOOM_COORDINATOR }}
          bloom run --until-idle  # Exit when no tasks left
```

### Quick Bug Fix While Project Runs

```bash
# Project work running in background
bloom run &

# Quick inbox task
bloom inbox add "Fix typo in README" --repo docs --priority high

# It gets picked up automatically by running workers
```

---

## Troubleshooting

### "Task stuck in ready_for_agent"

Check if workers are running:
```bash
bloom workers  # Local mode
bloom cluster status  # Cluster mode
```

### "Multiple workers grabbed same task"

This shouldn't happen with proper locking. Check coordinator logs:
```bash
bloom cluster logs
```

### "Worker can't connect to cluster"

1. Check firewall allows port 9000
2. Verify cluster key matches: `bloom cluster verify-key`
3. Check coordinator is running: `bloom cluster ping ws://coord:9000`

### "Session not resuming after worker switch"

Sessions are agent-provider specific. If workers use different providers:
```bash
# Ensure all workers use same provider
bloom cluster join ws://coord:9000 --agent claude
```

---

## What's Next

- [Inbox Deep Dive](./inbox.md) - Advanced inbox workflows
- [Cluster Security](./cluster-security.md) - Hardening your cluster
- [Custom Schedulers](./custom-schedulers.md) - Priority queues and scheduling policies
