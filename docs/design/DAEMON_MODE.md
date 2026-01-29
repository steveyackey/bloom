# Bloom Daemon Mode - Design Document

## Overview

A machine-wide background daemon (`bloomd`) that manages a global task queue across
multiple bloom workspaces. One daemon per machine. Disabled by default.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Machine (single daemon)                │
│                                                          │
│  ┌─────────────┐      IPC Transport      ┌────────────┐ │
│  │  bloom CLI   │◄──────────────────────►│  bloomd     │ │
│  │  (any cwd)   │  socket / named pipe   │  (daemon)   │ │
│  └─────────────┘                         │             │ │
│                                          │ ┌──────────┐│ │
│  ┌─────────────┐                         │ │  Agent   ││ │
│  │  bloom CLI   │◄──────────────────────►│ │  Pool    ││ │
│  │  (workspace2)│                        │ │  (N slot)││ │
│  └─────────────┘                         │ └──────────┘│ │
│                                          │ ┌──────────┐│ │
│                                          │ │  Task    ││ │
│                                          │ │  Queue   ││ │
│                                          │ └──────────┘│ │
│                                          └─────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Cross-Platform IPC Transport

| Platform | Transport | Path |
|----------|-----------|------|
| Linux | Unix domain socket | `~/.bloom/daemon/daemon.sock` |
| macOS | Unix domain socket | `~/.bloom/daemon/daemon.sock` |
| Windows | Named pipe | `\\.\pipe\bloom-daemon` |

Node's `net` module handles both transparently — `net.createServer().listen(path)` and `net.connect(path)` work with both Unix sockets and Windows named pipes.

All platform-specific code is centralized in `src/daemon/platform.ts`.

## Daemon Process

**Location:** `~/.bloom/daemon/`

| File | Purpose |
|------|---------|
| `daemon.pid` | PID of running daemon (used for liveness checks) |
| `daemon.sock` | Unix domain socket for IPC (Linux/macOS only; Windows uses named pipe) |
| `daemon.log` | Rolling log output |
| `state.json` | Persisted queue state (survives restarts) |

**Lifecycle:**
1. `bloom start` forks daemon to background (or `--foreground` for debugging)
2. Daemon creates PID file, opens socket, loads persisted state
3. Runs until `bloom stop` or SIGTERM (Unix) / SIGHUP (Windows)
4. Graceful shutdown: finishes active tasks (with configurable timeout), persists state
5. No sudo/admin privileges required on any platform

## CLI Commands

### `bloom daemon start`

Starts the daemon process.

```
bloom daemon start                    # Start in background (default)
bloom daemon start --foreground       # Run in foreground (for debugging)
bloom daemon start --max-agents 4     # Override max concurrent agents
```

**Behavior:**
- Checks if daemon already running (PID file + process liveness)
- If already running, prints status and exits
- Forks to background, writes PID file, opens socket
- Prints: "Daemon started (pid: 12345)"

### `bloom daemon stop`

Stops the daemon process.

```
bloom daemon stop                     # Graceful shutdown (wait for active tasks)
bloom daemon stop --force             # Immediate shutdown (SIGKILL)
bloom daemon stop --timeout 60        # Custom grace period (seconds, default: 300)
```

**Behavior:**
- Sends shutdown request via socket
- Daemon stops accepting new tasks
- Waits for active agents to complete (up to timeout)
- Persists queue state, removes PID file and socket
- If `--force`, sends SIGKILL immediately

### `bloom daemon status`

Shows daemon status and activity.

```
bloom daemon status                   # Overview
bloom daemon status --json            # Machine-readable output
bloom daemon status --watch           # Live updating (like htop)
```

**Output:**
```
Daemon: running (pid: 12345, uptime: 2h 14m)
Agents: 2/4 active

Active:
  [1] claude  → workspace:myapp   task:implement-auth   (12m)
  [2] claude  → workspace:backend task:fix-api-routes   (3m)

Queue: 5 pending
  [3] myapp       add-dark-mode           (priority: normal)
  [4] backend     update-deps             (priority: normal)
  [5] inbox       fix login bug in auth   (priority: normal)
  ...

Completed today: 8 tasks
```

### `bloom run` (modified)

When daemon is running, `bloom run` submits workspace tasks to the daemon queue
instead of running a foreground orchestrator.

```
bloom run                      # Submit tasks from current workspace
bloom run --no-daemon          # Force foreground mode (bypass daemon)
bloom run --agent claude       # Agent preference for submitted tasks
```

**Behavior (daemon mode):**
1. Reads `tasks.yaml` from current workspace
2. Validates tasks, primes dependencies
3. Sends `enqueue` request to daemon with workspace path + tasks
4. Daemon adds tasks to global queue, tagged with workspace
5. CLI shows: "Submitted 5 tasks to daemon queue"
6. Optionally tails daemon output for this workspace with `--follow`

**Behavior (no daemon / `--no-daemon`):**
- Works exactly as today: foreground TUI orchestrator

### `bloom inbox`

Quick ad-hoc tasks. No workspace needed.

```
bloom inbox "fix the login bug in the auth service"
bloom inbox "add rate limiting to the /api/users endpoint"
bloom inbox --repo myapp "update the README with new API docs"
bloom inbox --priority high "fix production crash in payment flow"
```

**Behavior:**
1. Creates a lightweight task entry (no tasks.yaml needed)
2. If `--repo` specified, routes to that repo's workspace
3. If no `--repo`, infers from cwd (looks for bloom.config.yaml or git root)
4. Sends to daemon queue with `source: inbox`
5. Agent picks up, works in the repo's worktree
6. Results logged to daemon, printed when done

**Inbox task structure:**
```typescript
interface InboxTask {
  id: string;               // uuid
  instruction: string;      // The user's request
  repo?: string;            // Target repo name
  workspace?: string;       // Resolved workspace path
  workingDir: string;       // Where to execute
  priority: "low" | "normal" | "high";
  agent?: string;           // Preferred agent
  createdAt: string;        // ISO timestamp
  status: "queued" | "active" | "done" | "failed";
  result?: string;          // Agent output summary
}
```

### `bloom research`

Research mode - uses inbox mechanism for investigative tasks. Works from pwd.

```
bloom research "how does the auth middleware chain work?"
bloom research "what dependencies are outdated and what would break?"
bloom research --output report.md "document the API surface area"
```

**Behavior:**
1. Creates an inbox task with `type: research`
2. Uses current working directory as context
3. Agent runs with read-only bias (research prompt template)
4. Output streamed to terminal (or written to `--output` file)
5. Does NOT create branches, PRs, or commits

**Research prompt wrapping:**
```
You are in research mode. Your job is to investigate and report findings.
Do NOT make changes to any files. Do NOT create commits or branches.
Working directory: {cwd}

Research question: {instruction}

Report your findings clearly and concisely.
```

### `bloom queue`

Web dashboard for monitoring daemon task queue status. Uses the same design
aesthetic as `bloom view` (dark industrial palette, Outfit + JetBrains Mono fonts).

```
bloom queue                    # Open queue viewer (port 3100)
bloom queue --port 8080        # Custom port
bloom queue --no-open          # Don't auto-open browser
bloom q                        # Short alias
```

**Features:**
- Overview cards: active agents, queued tasks, completed today, failed count
- Agent pool visualization: slot status (busy/idle), provider, workspace, duration
- Task queue: active, queued, and completed/failed entries with source, priority, workspace
- Details panel: click any entry for full info (instruction, timestamps, workspace, priority)
- Real-time updates: polls daemon every 2 seconds, pushes updates via SSE
- Works even when daemon is offline (shows offline state with start instructions)

**Architecture:**
- HTTP server via `Bun.serve` on port 3100 (default)
- Polls daemon IPC every 2s for status updates
- Single-page inline HTML/CSS/JS (same pattern as `bloom view`)
- SSE for live browser updates

## IPC Protocol

JSON-RPC 2.0 over IPC (Unix domain socket on Linux/macOS, named pipe on Windows).

### Requests

```typescript
// All requests follow JSON-RPC 2.0
interface DaemonRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: Record<string, unknown>;
}

// Methods:
// "enqueue"      - Add tasks to queue
// "dequeue"      - Remove task from queue (cancel)
// "status"       - Get daemon status
// "shutdown"     - Graceful shutdown
// "inbox"        - Submit inbox task
// "research"     - Submit research task
// "subscribe"    - Stream events for a workspace/task
```

### Responses

```typescript
interface DaemonResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
```

### Event Streaming

For `bloom run --follow` and `bloom research`, the daemon streams events
back over the socket using JSON-RPC notifications (no `id`):

```typescript
interface DaemonEvent {
  jsonrpc: "2.0";
  method: "event";
  params: {
    type: string;      // Reuses existing OrchestratorEvent types
    workspace?: string;
    taskId?: string;
    data: unknown;
  };
}
```

## Task Queue

### Global Queue Design

```typescript
interface QueueEntry {
  id: string;                    // Unique entry ID
  source: "workspace" | "inbox" | "research";
  workspace?: string;            // Absolute path to bloom workspace
  workingDir: string;            // Where agent should execute

  // Task details (workspace tasks reference tasks.yaml)
  taskRef?: {
    tasksFile: string;           // Path to tasks.yaml
    taskId: string;              // Task ID within file
  };

  // Inline task (inbox/research)
  inlineTask?: InboxTask;

  priority: number;              // 0 = highest, default = 50
  enqueuedAt: string;            // ISO timestamp
  startedAt?: string;
  completedAt?: string;

  status: "queued" | "active" | "done" | "failed" | "cancelled";
  assignedAgent?: string;        // Agent slot ID
  agentPreference?: string;      // Preferred agent provider
}
```

### Queue Ordering

1. **Priority** (lower number = higher priority)
   - `high` = 10
   - `normal` = 50
   - `low` = 90
2. **Within same priority:** FIFO by `enqueuedAt`
3. **Starvation prevention:** Tasks waiting > 5 minutes get priority boost

### Queue Persistence

Queue state persists to `~/.bloom/daemon/state.json` on every mutation.
On daemon restart, queued/active tasks are recovered:
- `queued` tasks remain queued
- `active` tasks reset to `queued` (agent died with daemon)

## Agent Pool

### Concurrency Model

```typescript
interface AgentPool {
  maxAgents: number;                    // Machine-wide limit (default: 3)
  maxPerWorkspace: number;              // Per-workspace limit (default: 2)

  slots: AgentSlot[];                   // Fixed-size array

  // Auto-selection
  selectAgent(entry: QueueEntry): AgentName;

  // Lifecycle
  acquire(entry: QueueEntry): AgentSlot | null;
  release(slot: AgentSlot): void;
}

interface AgentSlot {
  id: number;                           // Slot index
  status: "idle" | "busy";
  currentEntry?: QueueEntry;
  provider: AgentName;
  pid?: number;                         // Agent subprocess PID
  startedAt?: string;
}
```

### Agent Auto-Selection

When a task doesn't specify a preferred agent, the daemon selects one:

1. **Task-specified agent**: Use `task.agent` if set
2. **Workspace default**: Use workspace's `bloom.config.yaml` default
3. **User config default**: Use `~/.bloom/config.yaml` `defaultNonInteractive`
4. **Load balancing**: If multiple providers available, prefer the one with
   fewer active slots

### Concurrency Controls (User Config)

Added to `~/.bloom/config.yaml`:

```yaml
daemon:
  enabled: false                    # Opt-in (default: disabled)
  maxAgents: 3                      # Max concurrent agent processes
  maxPerWorkspace: 2                # Max agents per workspace
  queueStrategy: fifo               # fifo | priority | round-robin
  gracefulShutdownTimeout: 300      # Seconds to wait on stop
  logRetention: 7                   # Days to keep daemon logs

  # Auto-start on first `bloom run` (if enabled: true)
  autoStart: false
```

## Implementation Plan

### New Files

```
src/
├── daemon/
│   ├── platform.ts            # Cross-platform abstractions (IPC, signals, process liveness)
│   ├── server.ts              # Daemon process entry point + socket server
│   ├── client.ts              # IPC client (used by CLI commands)
│   ├── queue.ts               # Task queue with persistence
│   ├── pool.ts                # Agent pool / concurrency manager
│   ├── protocol.ts            # JSON-RPC types and serialization
│   ├── state.ts               # State persistence (load/save)
│   ├── scheduler.ts           # Queue → Pool assignment logic
│   ├── entry.ts               # Background process entry point
│   ├── index.ts               # Module exports
│   └── dashboard/
│       ├── server.ts          # Dashboard HTTP server (Bun.serve)
│       └── ui.ts              # Inline HTML/CSS/JS dashboard UI
├── cli/
│   ├── daemon.ts              # bloom start / stop / status commands
│   ├── dashboard.ts           # bloom queue command (web UI for queue)
│   ├── inbox.ts               # bloom inbox command
│   └── research.ts            # bloom research command
```

### Modified Files

| File | Changes |
|------|---------|
| `src/cli.ts` | Register daemon, inbox, research commands |
| `src/cli/index.ts` | Export new command registrations |
| `src/cli/run.ts` | Check daemon, optionally submit to queue |
| `src/infra/config.ts` | Add `DaemonConfigSchema` to user config |
| `src/commands/context.ts` | Expose workspace info for daemon tagging |

### Phase 1: Core Daemon
1. `protocol.ts` - IPC message types
2. `state.ts` - Queue persistence
3. `queue.ts` - Priority queue
4. `pool.ts` - Agent slot management
5. `scheduler.ts` - Queue→pool dispatch loop
6. `server.ts` - Socket server + daemon lifecycle
7. `client.ts` - Socket client for CLI

### Phase 2: CLI Commands
1. `cli/daemon.ts` - start/stop/status
2. Modify `cli/run.ts` - daemon-aware submission
3. `cli/inbox.ts` - quick task submission
4. `cli/research.ts` - research mode

### Phase 3: Integration
1. Config schema updates
2. Existing work-loop reuse (daemon uses same `runAgentWorkLoop`)
3. Event forwarding (daemon events → socket → CLI)

## Key Design Decisions

### Why IPC (Unix Socket / Named Pipe) instead of HTTP/REST?
- No port conflicts, no auth needed, no privileged ports
- Natural per-machine scope (socket file / named pipe = single daemon)
- Lower overhead than HTTP for local IPC
- File permissions provide access control (Unix); named pipes are user-scoped (Windows)
- Node's `net` module transparently supports both transports

### Why JSON-RPC 2.0?
- Simple, well-specified protocol
- Supports request/response and notifications (events)
- Easy to debug (just JSON over a socket)
- No dependency on HTTP infrastructure

### Why not SQLite for state?
- Queue is small (dozens to hundreds of entries)
- JSON file is simpler, easier to inspect/debug
- Atomic writes via temp file + rename
- Can upgrade to SQLite later if needed

### Why one daemon per machine (not per workspace)?
- Cross-workspace concurrency control (machine has finite resources)
- Single agent pool prevents over-subscription
- Inbox tasks don't belong to any workspace
- Simpler to manage (one thing to start/stop)

### How does the daemon run agent work loops?
- Reuses the existing `runAgentWorkLoop` from `src/core/orchestrator/work-loop.ts`
- Each agent slot spawns a work loop iteration for its assigned task
- The daemon's scheduler replaces the polling loop - it pushes tasks to slots
- EventHandler callbacks forward events to subscribed CLI clients via socket

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Daemon crashes | PID file becomes stale; next `bloom start` cleans up |
| Agent crashes | Slot released, task reset to `queued`, retry with backoff |
| Socket connection lost | CLI reconnects (3 retries, then falls back to foreground) |
| Workspace deleted | Tasks for that workspace marked `cancelled` |
| Disk full | Daemon logs error, stops accepting new tasks |

## Future Considerations

- **Remote daemon**: Replace Unix socket with TCP for remote machine orchestration
- **Task dependencies across workspaces**: Global dependency graph
- **Resource monitoring**: CPU/memory-aware scheduling
- **Notification hooks**: Slack/Discord/email on task completion
