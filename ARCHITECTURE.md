# Bloom Architecture

This document describes the architecture of Bloom, a CLI tool for orchestrating AI agents across multiple repositories.

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
│       ├── work-loop.ts          # Main agent work loop (accepts EventHandler)
│       ├── task-prompt.ts        # Task fetching and prompt building
│       └── post-task.ts          # Post-task git operations (push, PR, merge)
│
├── adapters/                     # Interface-specific implementations
│   └── cli/                      # CLI adapter
│       ├── index.ts              # Public exports
│       └── event-handler.ts      # Event → console output
│
├── commands/                     # Command implementations
│   ├── orchestrator.ts           # Orchestrator startup and TUI
│   ├── tasks.ts                  # Task command handlers
│   └── ...                       # Other command handlers
│
├── infra/                        # Infrastructure adapters
│   ├── git/                      # Git operations
│   │   ├── index.ts              # Re-exports
│   │   ├── config.ts             # bloom.config.yaml schema and paths
│   │   ├── clone.ts              # Clone and create operations
│   │   ├── sync.ts               # Pull, sync, remove, list
│   │   ├── worktree.ts           # Worktree management
│   │   ├── status.ts             # Git status, push, merge
│   │   └── merge-lock.ts         # Merge lock system
│   │
│   ├── config/                   # User configuration
│   │   ├── index.ts              # Re-exports
│   │   ├── schema.ts             # Zod schemas
│   │   ├── agent-config.ts       # Per-agent configuration helpers
│   │   ├── loader.ts             # Config load/save operations
│   │   └── git-url.ts            # Git URL utilities
│   │
│   ├── logger.ts                 # Structured logging
│   └── terminal.ts               # PTY abstraction layer
│
├── agents/                       # Agent provider system
│   ├── index.ts                  # Public exports
│   ├── core.ts                   # Agent interfaces
│   ├── factory.ts                # Agent creation factory
│   ├── loader.ts                 # Agent registry and validation
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
├── completions/                  # CLI argument completions
│   └── providers.ts              # Completion providers
│
├── orchestrator-tui.ts           # Multi-pane terminal UI
├── task-schema.ts                # Task data models (Zod schemas)
└── prompts-embedded.ts           # Embedded prompt templates
```

## Layer Responsibilities

### CLI Layer (`src/cli/`)

Thin command definitions using the Clerc framework. Each file:
- Registers commands with Clerc
- Parses arguments and flags
- Delegates to core layer for business logic
- Handles CLI-specific output formatting

**Rule:** No business logic in CLI layer. Commands should be <50 lines.

### Core Layer (`src/core/`)

Business logic and orchestration. This layer:
- Implements the main workflows (orchestration, planning, project creation)
- Manages task state and transitions
- Coordinates between infrastructure components

**Key modules:**
- `orchestrator/` - The agent work loop, task assignment, and post-task git operations
- `tui/` - Multi-pane terminal UI for monitoring agents
- `project.ts` - Project scaffolding from templates
- `planning.ts` - AI-assisted planning sessions
- `tasks.ts` - Task file CRUD operations
- `questions.ts` - Human-in-the-loop question queue

### Infrastructure Layer (`src/infra/`)

Low-level operations and external integrations:

**`git/`** - All git operations via subprocess:
- Bare repository management
- Worktree creation/cleanup
- Branch operations, push, merge
- Merge lock system for concurrent agents

**`config/`** - Configuration management:
- User config (`~/.bloom/config.yaml`)
- Agent-specific settings
- Git URL normalization

**`terminal.ts`** - PTY abstraction for cross-platform terminal spawning

**`output.ts`** - Unified output system:
- Structured logging with levels
- Chalk-based styled output
- Semantic output helpers (`out.success()`, `out.error()`, etc.)

### Agents Layer (`src/agents/`)

Pluggable AI agent system:
- Generic provider supporting multiple backends (Claude, Copilot, Codex, etc.)
- Agent capability registry
- Session management for resume/interjection

### Prompts Layer (`src/prompts/`)

Prompt template system:
- Loads prompts from markdown files
- Variable substitution for task context
- Embedded prompts for bundled distribution

## Data Flow

```
User Input
    │
    ▼
┌─────────┐
│   CLI   │  Parse args, validate, delegate
└────┬────┘
     │
     ▼
┌─────────┐
│  Core   │  Business logic, orchestration
└────┬────┘
     │
     ├──────────────┬──────────────┐
     ▼              ▼              ▼
┌─────────┐   ┌─────────┐   ┌─────────┐
│  Infra  │   │ Agents  │   │ Prompts │
│  (git)  │   │         │   │         │
└─────────┘   └─────────┘   └─────────┘
```

## Key Design Decisions

### 1. File-Based State

All persistent state is stored in YAML files:
- `tasks.yaml` - Task tree and status
- `bloom.config.yaml` - Workspace repository list
- `~/.bloom/config.yaml` - User preferences
- `.questions/`, `.interjections/` - Human interaction queues

This enables:
- Easy debugging (inspect files directly)
- Git-friendly (can commit task state)
- No database dependency

### 2. Worktree-Based Isolation

Each agent works in its own git worktree:
- Agents can work on different tasks concurrently
- No conflicts between agent changes
- Clean merge workflow back to main branches

### 3. Human-in-the-Loop

File-based queues enable asynchronous human interaction:
- Agents can ask questions and continue other work
- Humans can interject running agents
- State persists across restarts

### 4. Generic Agent Provider

Single provider implementation supports all agent types:
- Schema-driven configuration
- Consistent session management
- Easy to add new agent backends

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

---

## Event-Based Architecture

The orchestrator uses an event-based architecture to decouple core logic from output rendering. This enables multiple interfaces (CLI, TUI, Web) to consume the same core logic.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Core Layer                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              core/orchestrator/                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │  work-loop   │  │ task-prompt  │  │  post-task   │   │   │
│  │  │    .ts       │  │    .ts       │  │    .ts       │   │   │
│  │  └──────┬───────┘  └──────────────┘  └──────────────┘   │   │
│  │         │                                                │   │
│  │         │ emits OrchestratorEvent                        │   │
│  │         ▼                                                │   │
│  │  ┌──────────────┐                                        │   │
│  │  │  events.ts   │  (EventHandler callback)               │   │
│  │  └──────────────┘                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Adapters Layer                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   adapters/cli  │  │  adapters/tui   │  │  adapters/web   │ │
│  │                 │  │   (future)      │  │   (future)      │ │
│  │  event-handler  │  │                 │  │                 │ │
│  │  → console.log  │  │  → TUI render   │  │  → WebSocket    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Event Types

Events are defined in `src/core/orchestrator/events.ts`. Key event categories:

| Category | Events |
|----------|--------|
| **Agent Lifecycle** | `agent:started`, `agent:idle` |
| **Task Lifecycle** | `task:found`, `task:started`, `task:completed`, `task:failed`, `task:blocked` |
| **Git Operations** | `git:pulling`, `git:pulled`, `git:pushing`, `git:pushed`, `git:merging`, `git:merged`, `git:merge_conflict`, `git:cleanup` |
| **Worktree** | `worktree:creating`, `worktree:created` |
| **PR Operations** | `git:pr_creating`, `git:pr_created` |
| **Merge Lock** | `merge:lock_waiting`, `merge:lock_acquired`, `merge:lock_timeout` |
| **Conflict Resolution** | `merge:conflict_resolving`, `merge:conflict_resolved` |
| **Session** | `session:corrupted` |
| **Generic** | `error`, `log` |

### Usage

```typescript
// Core function accepts EventHandler
import { runAgentWorkLoop } from './core/orchestrator';

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

// CLI adapter provides ready-to-use wrapper
import { runAgentWorkLoopCLI } from './adapters/cli';

await runAgentWorkLoopCLI(agentName, options);
```

### Migration Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | File splits and layer separation |
| Phase 2 | ✅ Complete | Define event types for orchestrator |
| Phase 3 | ✅ Complete | Add EventHandler parameter to work loop |
| Phase 4 | ✅ Complete | Create CLI adapter that subscribes to events |
| Phase 5 | 🔲 Future | Move TUI to adapters, subscribe to events |
| Phase 6 | 🔲 Future | Add web adapter for GUI support |

### Benefits

- **Testability:** Mock event handler to verify behavior
- **Flexibility:** Add new interfaces without modifying core
- **Observability:** Events can be logged, streamed, or analyzed
- **Decoupling:** Core logic doesn't know about output format

### SOLID Compliance

| Principle | How It's Achieved |
|-----------|-------------------|
| **Single Responsibility** | Each file/module has one clear purpose |
| **Open/Closed** | Add new event handlers without modifying core |
| **Liskov Substitution** | N/A (no inheritance hierarchies) |
| **Interface Segregation** | EventHandler is a minimal interface |
| **Dependency Inversion** | Core depends on EventHandler abstraction |
