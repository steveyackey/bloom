<p align="center">
  <img src="assets/bloom-header.png" alt="Bloom" width="800">
</p>

# Bloom - Multi-Agent Task Orchestrator

A multi-agent task orchestration system that uses YAML-based task definitions and Claude Code agents to execute work in parallel.

## Install

**Linux / macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/steveyackey/bloom/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
iwr -useb https://raw.githubusercontent.com/steveyackey/bloom/main/install.ps1 | iex
```

## Quick Start

```bash
# Create a new project
mkdir my-project && cd my-project
git init

# Initialize bloom workspace (creates bloom.config.yaml, repos/, tasks.yaml)
bloom init

# Add context to your project (research, designs, notes)
# Then plan your tasks with Claude
bloom plan

# Start the orchestrator
bloom run
```

## Project Setup

Bloom works inside a git repository. Each project gets its own repo with bloom files at the root:

```
my-project/                 # Your git repo
├── bloom.config.yaml       # Created by bloom init (marks this as a bloom project)
├── tasks.yaml              # Created by bloom plan
├── repos/                  # Created by bloom init (cloned repos for tasks)
├── research/               # Your notes, research, context
├── designs/                # Mockups, architecture diagrams
└── reference/              # Example code, docs
```

**Before running `bloom plan`:**

1. Create a git repo for your project (`git init` + set up remote)
2. Run `bloom init` to set up the workspace
3. Add context - research notes, design docs, reference materials
4. Run `bloom plan` so Claude has full context when creating tasks

The more context you provide upfront, the better your task breakdown will be.

## Workflow

```
1. INIT      bloom init                # Create bloom.config.yaml, repos/, tasks.yaml
2. CONTEXT   Add research, designs     # Give Claude context for planning
3. PLAN      bloom plan                # Break down your project into tasks
4. VALIDATE  bloom validate            # Check for issues
5. RUN       bloom run                 # Start agents
6. MONITOR   Dashboard shows progress  # Use hjkl to navigate TUI
7. REVIEW    [CHECKPOINT] tasks        # Human reviews at phase boundaries
```

## Commands

### Setup

```bash
bloom init                   # Initialize workspace (bloom.config.yaml, repos/, tasks.yaml)
bloom setup                  # Sync repos according to config
```

### Repository Management

```bash
bloom repo clone <url>       # Clone a repo (bare + default branch worktree)
bloom repo list              # List all configured repos
bloom repo sync              # Clone/fetch all repos from bloom.repos.yaml
bloom repo remove <name>     # Remove a repo and its worktrees
bloom repo worktree add <repo> <branch>    # Add worktree for branch
bloom repo worktree remove <repo> <branch> # Remove a worktree
bloom repo worktree list <repo>            # List worktrees for repo
```

### Configuration

```bash
bloom config                 # Show user config (~/.bloom/config.yaml)
bloom config set-protocol <ssh|https>  # Set git URL preference
```

### Orchestrator

```bash
bloom run                    # Start TUI with all agents
```

### Planning & Monitoring

```bash
bloom plan                   # Interactive planning session with Claude
bloom dashboard              # Live task view (refreshes every 10s)
bloom list                   # List all tasks by phase
bloom list in_progress       # Filter by status
bloom show <taskid>          # Show task details
bloom next [agent]           # Show available tasks
bloom agents                 # List agents and their tasks
bloom validate               # Check for errors
```

### Task Status

```bash
bloom done <taskid>          # Mark complete
bloom block <taskid>         # Mark blocked
bloom todo <taskid>          # Mark todo
bloom ready <taskid>         # Mark ready_for_agent
bloom assign <taskid> <agent> # Assign to agent
```

### Other

```bash
bloom note <taskid> <note>   # Add a note
bloom reset <taskid>         # Reset stuck task
bloom reset --stuck          # Reset ALL stuck tasks
```

### Custom Tasks File

```bash
bloom -f project.yaml run
bloom -f project.yaml plan
```

## TUI Controls

| Key | Action |
|-----|--------|
| `h/j/k/l` | Navigate panes |
| `Enter` | Focus pane |
| `Ctrl+B` | Exit focus |
| `r` | Restart pane |
| `x` | Kill pane |
| `v` | Toggle view |
| `q` | Quit |

## Task Schema

```yaml
tasks:
  - id: kebab-case-id
    title: Short description
    status: todo                    # todo|ready_for_agent|assigned|in_progress|done|blocked
    phase: 1                        # Group related tasks
    depends_on: [other-task-id]     # Must complete first
    repo: ./path/to/repo            # Working directory
    worktree: branch-name           # Git worktree for isolation
    agent_name: claude-code         # Assign to specific agent
    instructions: |                 # Detailed instructions
      Multi-line instructions
    acceptance_criteria:            # Definition of done
      - Criterion 1
    ai_notes: []                    # Notes added during execution
    subtasks: []                    # Nested tasks
```

## Key Concepts

- **Phases**: Group tasks into numbered phases (1, 2, 3...)
- **Checkpoints**: `[CHECKPOINT]` tasks at phase boundaries for human review
- **Dependencies**: `depends_on` enforces task ordering
- **Worktrees**: Git worktrees isolate parallel work (one agent per worktree)
- **Priming**: Tasks auto-change from `todo` to `ready_for_agent` when deps complete
