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
├── core/                         # Business logic
│   ├── orchestrator/             # Agent orchestration system
│   │   ├── index.ts              # Exports and startOrchestrator
│   │   ├── work-loop.ts          # Main agent work loop
│   │   ├── task-prompt.ts        # Task fetching and prompt building
│   │   └── post-task.ts          # Post-task git operations (push, PR, merge)
│   │
│   ├── tui/                      # Multi-pane terminal UI
│   │   ├── index.ts              # OrchestratorTUI class
│   │   ├── types.ts              # Pane, ViewMode, config interfaces
│   │   ├── pane.ts               # Pane lifecycle management
│   │   ├── input.ts              # Input handling and navigation
│   │   ├── render.ts             # Terminal rendering
│   │   └── selectors.ts          # Agent/model selection UI
│   │
│   ├── project.ts                # Project creation and scaffolding
│   ├── planning.ts               # Plan/refine/generate sessions
│   ├── tasks.ts                  # Task file operations
│   ├── questions.ts              # Human question queue
│   └── interjections.ts          # Agent interjection handling
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
│   ├── terminal.ts               # PTY abstraction layer
│   └── output.ts                 # Logging and styled output
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

## Future: Event-Based Architecture for GUI/Web Support

The current architecture has direct console output in the core layer. To support GUI and web interfaces, we plan to migrate to an event-based architecture.

### Goal

Enable multiple interfaces (CLI, TUI, Web) to consume the same core logic without modification.

### Proposed Changes

#### 1. Event Type Definitions

```typescript
// core/orchestrator/events.ts
export type OrchestratorEvent =
  | { type: 'agent:idle'; agentName: string }
  | { type: 'task:found'; taskId: string; title: string; agentName: string }
  | { type: 'task:started'; taskId: string; agentName: string; workingDir: string }
  | { type: 'task:completed'; taskId: string; agentName: string; duration: number }
  | { type: 'task:failed'; taskId: string; agentName: string; error: string }
  | { type: 'git:pushing'; branch: string; remote: string }
  | { type: 'git:pushed'; branch: string; remote: string }
  | { type: 'git:pr_created'; url: string; branch: string }
  | { type: 'git:merging'; source: string; target: string }
  | { type: 'git:merged'; source: string; target: string }
  | { type: 'git:merge_conflict'; source: string; target: string }
  | { type: 'question:asked'; questionId: string; agentName: string; question: string }
  | { type: 'question:answered'; questionId: string; answer: string }
  | { type: 'error'; message: string; context?: Record<string, unknown> }
  | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; message: string };

export type EventHandler = (event: OrchestratorEvent) => void;
```

#### 2. Core Functions Accept Event Handler

```typescript
// core/orchestrator/work-loop.ts
export async function runAgentWorkLoop(
  agentName: string,
  options: WorkLoopOptions,
  onEvent: EventHandler  // Callback instead of direct output
): Promise<void> {
  // ...
  onEvent({ type: 'task:found', taskId: task.id, title: task.title, agentName });
  // ...
}
```

#### 3. Adapters Subscribe to Events

```typescript
// adapters/cli/orchestrator.ts
import { runAgentWorkLoop } from '../../core/orchestrator';
import { out } from '../../infra/output';

export async function runOrchestratorCLI(agentName: string, options: Options) {
  await runAgentWorkLoop(agentName, options, (event) => {
    switch (event.type) {
      case 'task:found':
        out.info(`Found work: ${event.taskId} - ${event.title}`);
        break;
      case 'task:completed':
        out.success(`Completed ${event.taskId} in ${event.duration}ms`);
        break;
      case 'error':
        out.error(event.message);
        break;
    }
  });
}
```

#### 4. Future Web Adapter

```typescript
// adapters/web/orchestrator.ts
import { runAgentWorkLoop } from '../../core/orchestrator';

export function createWebOrchestrator(ws: WebSocket) {
  return (agentName: string, options: Options) => {
    return runAgentWorkLoop(agentName, options, (event) => {
      ws.send(JSON.stringify(event));
    });
  };
}
```

### Proposed Directory Structure (Future)

```
src/
├── core/                    # Pure logic - emits events, no direct I/O
│   ├── orchestrator/
│   │   ├── events.ts        # Event type definitions
│   │   ├── work-loop.ts     # Takes EventHandler callback
│   │   └── ...
│   └── ...
│
├── adapters/                # Interface-specific implementations
│   ├── cli/
│   │   ├── commands/        # CLI command handlers
│   │   └── handlers.ts      # Event → console output
│   ├── tui/
│   │   └── ...              # TUI event handlers
│   └── web/
│       ├── api/             # REST endpoints
│       ├── ws.ts            # WebSocket event streaming
│       └── handlers.ts      # Event → WebSocket
│
├── infra/                   # Shared infrastructure (unchanged)
└── ...
```

### Migration Path

1. **Phase 1 (Current):** File splits and layer separation (Option 4)
2. **Phase 2:** Define event types for orchestrator
3. **Phase 3:** Add EventHandler parameter to work loop
4. **Phase 4:** Create CLI adapter that subscribes to events
5. **Phase 5:** Move TUI to adapters, subscribe to events
6. **Phase 6:** Add web adapter for GUI support

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
