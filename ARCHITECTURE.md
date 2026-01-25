# Bloom Architecture

Bloom is a CLI tool for orchestrating AI agents across multiple repositories. This document describes its layered architecture and key design decisions.

## Directory Structure

```
src/
├── cli/                          # Thin CLI layer (command definitions)
│   ├── index.ts                  # Clerc registration and setup
│   ├── tasks.ts                  # task commands
│   ├── repo.ts                   # repo commands
│   ├── agents.ts                 # agent commands
│   ├── planning.ts               # plan/refine/generate commands
│   ├── config.ts                 # config commands
│   ├── questions.ts              # question queue commands
│   ├── interjections.ts          # interjection commands
│   ├── prompt.ts                 # prompt inspection commands
│   ├── view.ts                   # view server commands
│   ├── setup.ts                  # setup commands
│   └── utility.ts                # utility commands
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
│   ├── index.ts                  # Prompt loading
│   └── compiler.ts               # Template compilation
│
├── view/                         # Web-based task visualization
│   ├── server.ts                 # HTTP server
│   ├── ui.ts                     # HTML/CSS/JS rendering
│   ├── graph.ts                  # Task dependency graph
│   └── prompts.ts                # Prompt UI components
│
├── task-schema.ts                # Task data models (Zod schemas)
└── prompts-embedded.ts           # Embedded prompt templates
```

## Layer Responsibilities

### CLI Layer (`src/cli/`)

Thin command definitions using the Clerc framework. Each file registers commands, parses arguments, and delegates to the core layer. No business logic lives here—commands should be under 50 lines.

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

Prompt template system that loads markdown files and performs variable substitution for task context.

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

### 3. Human-in-the-Loop

File-based queues enable asynchronous human interaction. Agents can ask questions and continue other work. Humans can interject running agents. State persists across restarts.

### 4. Generic Agent Provider

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
