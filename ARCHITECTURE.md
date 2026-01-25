# Bloom Architecture

Bloom is a CLI tool for orchestrating AI agents across multiple repositories. This document describes its layered architecture and key design decisions.

## Directory Structure

```
src/
├── cli.ts                        # CLI entry point (Clerc setup)
├── cli/                          # Command definitions (one file per command)
│   ├── index.ts                  # Re-exports all command registrations
│   ├── agent.ts                  # `bloom agent *` commands
│   ├── config.ts                 # `bloom config *` commands
│   ├── create.ts                 # `bloom create` command
│   ├── enter.ts                  # `bloom enter` command
│   ├── generate.ts               # `bloom generate` command
│   ├── init.ts                   # `bloom init` command
│   ├── interject.ts              # `bloom interject *` commands
│   ├── plan.ts                   # `bloom plan` command
│   ├── prompt.ts                 # `bloom prompt *` commands
│   ├── questions.ts              # `bloom questions *`, `bloom ask`, etc.
│   ├── refine.ts                 # `bloom refine` command
│   ├── repo.ts                   # `bloom repo *` commands
│   ├── run.ts                    # `bloom run` command
│   ├── setup.ts                  # `bloom setup` command
│   ├── task.ts                   # Task ops: `bloom list`, `bloom show`, etc.
│   ├── update.ts                 # `bloom update` command
│   └── view.ts                   # `bloom view` command
│
├── core/                         # Business logic (event-driven, no I/O)
│   └── orchestrator/             # Agent orchestration system
│       ├── index.ts              # Public exports
│       ├── events.ts             # Event type definitions
│       ├── work-loop.ts          # Main agent work loop
│       ├── task-prompt.ts        # Task fetching and prompt building
│       └── post-task.ts          # Post-task git operations
│
├── adapters/                     # Interface-specific implementations
│   ├── cli/                      # CLI adapter
│   │   ├── index.ts              # Public exports
│   │   └── event-handler.ts      # Event → console output
│   │
│   └── tui/                      # Terminal UI adapter
│       ├── index.ts              # Public exports
│       ├── tui.ts                # EventDrivenTUI class
│       └── types.ts              # TUI type definitions
│
├── commands/                     # Command implementations
│   ├── orchestrator.ts           # Orchestrator startup
│   ├── tasks.ts                  # Task command handlers
│   └── ...                       # Other command handlers
│
├── infra/                        # Infrastructure adapters
│   ├── git/                      # Git operations
│   │   ├── config.ts             # bloom.config.yaml schema
│   │   ├── clone.ts              # Clone and create operations
│   │   ├── sync.ts               # Pull, sync, remove, list
│   │   ├── worktree.ts           # Worktree management
│   │   ├── status.ts             # Git status, push, merge
│   │   └── merge-lock.ts         # Merge lock system
│   │
│   ├── config/                   # User configuration
│   │   ├── schema.ts             # Zod schemas
│   │   ├── agent-config.ts       # Per-agent configuration
│   │   ├── loader.ts             # Config load/save
│   │   └── git-url.ts            # Git URL utilities
│   │
│   ├── logger.ts                 # Structured logging
│   ├── terminal.ts               # Process stats utilities
│   └── colors.ts                 # Chalk-based styling
│
├── agents/                       # Agent provider system
│   ├── core.ts                   # Agent interfaces
│   ├── factory.ts                # Agent creation factory
│   ├── loader.ts                 # Agent registry
│   ├── capabilities.ts           # Agent capabilities
│   ├── availability.ts           # CLI availability checking
│   ├── schema.ts                 # AgentDefinition schema
│   ├── builtin-agents.ts         # Built-in agent definitions
│   └── generic-provider.ts       # Unified agent provider
│
├── prompts/                      # Prompt system
│   ├── index.ts                  # Prompt loading (always uses embedded)
│   └── compiler.ts               # Template compilation
│
├── view/                         # Web-based task visualization
│   ├── server.ts                 # HTTP server
│   ├── ui.ts                     # HTML/CSS/JS rendering
│   ├── graph.ts                  # Task dependency graph
│   └── prompts.ts                # Prompt UI components
│
├── task-schema.ts                # Task data models (Zod schemas)
└── prompts-embedded.ts           # System prompts and workspace templates (embedded in binary)
```

## Layer Responsibilities

### CLI Layer (`src/cli.ts` and `src/cli/`)

Thin command definitions using the Clerc framework. **Files are organized by top-level CLI command** for easy discoverability:

- `agent.ts` → `bloom agent list`, `bloom agent check`, etc.
- `repo.ts` → `bloom repo clone`, `bloom repo sync`, etc.
- `run.ts` → `bloom run`
- `task.ts` → `bloom list`, `bloom show`, `bloom done`, etc.

**Adding a new command:**
1. Create `src/cli/<command>.ts` named after the top-level command
2. Export a `register<Command>Command(cli: Clerc)` function
3. Add the export to `src/cli/index.ts`
4. Register in `src/cli.ts`

Commands parse arguments and delegate to `src/commands/` handlers. No business logic lives here—commands should be under 50 lines.

### Core Layer (`src/core/`)

Business logic and orchestration, designed to be I/O-free and event-driven:

- **`orchestrator/`** - The agent work loop, task assignment, and post-task git operations. Emits events rather than writing to stdout directly.

### Adapters Layer (`src/adapters/`)

Interface-specific implementations that consume events from the core layer:

- **`cli/`** - Converts orchestrator events to console log output
- **`tui/`** - Renders events in a multi-pane terminal UI with scrollable output

### Infrastructure Layer (`src/infra/`)

Low-level operations and external integrations:

- **`git/`** - All git operations via subprocess (bare repos, worktrees, branches, merge locks)
- **`config/`** - Configuration management (`~/.bloom/config.yaml`, agent settings)
- **`logger.ts`** - Structured logging with levels
- **`terminal.ts`** - Process stats (CPU/memory) for running agents
- **`colors.ts`** - Chalk-based terminal styling

### Agents Layer (`src/agents/`)

Pluggable AI agent system with a generic provider supporting multiple backends (Claude, Copilot, Codex, Goose, OpenCode). Includes session management for resume and interjection.

### Prompts Layer (`src/prompts/`)

Prompt template system with variable substitution for task context. All system prompts and workspace templates (PRD, plan, CLAUDE.template) are embedded in `src/prompts-embedded.ts` for bundled binary distribution. Templates are copied to workspaces during `bloom init`.

## Event-Driven Orchestration

The orchestrator uses an event-based architecture to decouple core logic from output rendering:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Core Layer                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              core/orchestrator/                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │  work-loop   │  │ task-prompt  │  │  post-task   │   │   │
│  │  └──────┬───────┘  └──────────────┘  └──────────────┘   │   │
│  │         │                                                │   │
│  │         │ emits OrchestratorEvent                        │   │
│  │         ▼                                                │   │
│  │  ┌──────────────┐                                        │   │
│  │  │  events.ts   │  ← EventHandler callback               │   │
│  │  └──────────────┘                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────┐
│                   Adapters Layer                  │
│  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │    adapters/cli     │  │    adapters/tui     │ │
│  │   → console.log     │  │   → TUI render      │ │
│  └─────────────────────┘  └─────────────────────┘ │
└───────────────────────────────────────────────────┘
```

### Event Categories

Events are defined in `src/core/orchestrator/events.ts`:

| Category | Events |
|----------|--------|
| **Agent Lifecycle** | `agent:started`, `agent:idle`, `agent:output`, `agent:process_started`, `agent:process_ended` |
| **Task Lifecycle** | `task:found`, `task:started`, `task:completed`, `task:failed`, `task:blocked` |
| **Step Lifecycle** | `step:started`, `step:completed`, `step:failed`, `steps:all_completed` |
| **Git Operations** | `git:pulling`, `git:pulled`, `git:pushing`, `git:pushed`, `git:merging`, `git:merged`, `git:merge_conflict`, `git:cleanup` |
| **Worktree** | `worktree:creating`, `worktree:created` |
| **PR Operations** | `git:pr_creating`, `git:pr_created` |
| **Merge Lock** | `merge:lock_waiting`, `merge:lock_acquired`, `merge:lock_timeout` |
| **Conflict Resolution** | `merge:conflict_resolving`, `merge:conflict_resolved` |
| **Session** | `session:corrupted` |
| **Generic** | `error`, `log` |

### Using the Event System

```typescript
import { runAgentWorkLoop } from './core/orchestrator';

// Subscribe to events with a callback
await runAgentWorkLoop(agentName, options, (event) => {
  switch (event.type) {
    case 'task:found':
      console.log(`Found: ${event.taskId}`);
      break;
    case 'task:completed':
      console.log(`Done: ${event.taskId} (${event.duration}s)`);
      break;
  }
});

// Or use the CLI adapter for standard console output
import { runAgentWorkLoopCLI } from './adapters/cli';
await runAgentWorkLoopCLI(agentName, options);
```

### Why Events?

- **Testability** - Mock the event handler to verify behavior without I/O
- **Flexibility** - Add new interfaces (TUI, web, etc.) without modifying core logic
- **Observability** - Events can be logged, streamed, or analyzed
- **Decoupling** - Core logic doesn't know about output format

## Key Design Decisions

### 1. File-Based State

All persistent state is stored in YAML files:
- `tasks.yaml` - Task tree and status
- `bloom.config.yaml` - Workspace repository list
- `~/.bloom/config.yaml` - User preferences
- `.questions/`, `.interjections/` - Human interaction queues

This enables easy debugging (inspect files directly), git-friendly workflows (commit task state), and no database dependency.

### 2. Worktree-Based Isolation

Each agent works in its own git worktree, enabling concurrent work on different tasks without conflicts. Changes merge back to main branches through the post-task workflow.

### 3. Step-Based Session Reuse

Tasks can define **steps** for sequential work that benefits from shared context. Unlike subtasks (which create separate sessions), steps reuse the same agent session:

1. Agent starts working on step 1 with full task context
2. Agent marks step done via `bloom step done <step-id>` and exits
3. Work loop resumes the **same session** with next step's prompt
4. Agent retains all context from previous steps
5. Git operations (push/merge/PR) happen only after all steps complete

This is ideal for refactoring, migrations, and iterative work where later steps benefit from knowledge gained in earlier steps. The step execution loop is implemented in `work-loop.ts`.

### 4. Human-in-the-Loop

File-based queues enable asynchronous human interaction. Agents can ask questions and continue other work. Humans can interject running agents. State persists across restarts.

### 5. Generic Agent Provider

A single provider implementation supports all agent types through schema-driven configuration. This provides consistent session management and makes it easy to add new agent backends.

## Configuration Hierarchy

```
~/.bloom/config.yaml          # Global user preferences
    │
    ▼
workspace/bloom.config.yaml   # Workspace repo list
    │
    ▼
project/tasks.yaml            # Project tasks
project/PRD.md                # Project requirements
project/plan.md               # Project plan
project/CLAUDE.md             # Agent instructions
```
