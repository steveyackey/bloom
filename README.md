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

### New Users: Setting Up Your Planning Repo

```bash
# 1. Create a folder for your project planning and cd into it
mkdir my-project-planning
cd my-project-planning
git init

# 2. Initialize bloom workspace
bloom init

# 3. Clone repos you'll be working on (they go into the repos/ folder)
bloom repo clone https://github.com/org/backend
bloom repo clone https://github.com/org/frontend

# 4. Add your planning documents, notes, designs - organize however you like!
# 5. Create plan and generate tasks
bloom plan
bloom generate
bloom run
```

The `repos/` folder keeps your cloned repositories separate from your planning documents. You can organize the rest of your planning repo however you like—add research notes, design docs, architecture diagrams, or anything else that provides context.

### Creating Brand New Projects

If you're starting a project from scratch (no existing repos):

```bash
# Creates a new folder wherever you are with PRD template and CLAUDE.md
bloom create my-new-app
cd my-new-app

# Claude launches to help you define requirements in PRD.md
# Then continue with planning
bloom plan
bloom generate
bloom run
```

`bloom create` makes a new folder in your current directory with everything you need to get started.

## Project Setup

Bloom works inside a git repository that serves as your **planning repo**. This is where you organize all your project planning, and cloned code repositories live in the `repos/` folder:

```
my-project/                 # Your planning repo (bloom init or bloom create)
├── PRD.md                  # Product Requirements Document
├── CLAUDE.md               # Project guidelines for Claude
├── plan.md                 # Implementation plan (created by bloom plan)
├── tasks.yaml              # Task definitions (created by bloom generate)
├── bloom.config.yaml       # Bloom config (created by bloom init)
├── repos/                  # Cloned code repos live here
│   ├── backend/            # bloom repo clone puts repos here
│   └── frontend/           # Each repo is isolated from planning docs
├── research/               # Your notes, research, context (optional)
└── designs/                # Mockups, architecture diagrams (optional)
```

### How the repos/ Folder Works

When you run `bloom repo clone <url>`, Bloom clones the repository as a **bare repo** and automatically creates a worktree for the default branch (usually `main` or `master`). This setup enables multiple agents to work on the same repo simultaneously without conflicts.

**Why worktrees?** Each agent needs its own working directory to make changes. With git worktrees, you can have multiple branches checked out at once—each in its own folder. When you run parallel tasks, Bloom creates separate worktrees so agents don't step on each other:

```
repos/
├── backend.git/              # Bare repo (shared git data)
├── backend/                  # Default branch worktree (main)
├── backend-feature-auth/     # Worktree for agent 1
└── backend-feature-api/      # Worktree for agent 2
```

Add worktrees for parallel work:
```bash
bloom repo worktree add backend feature-auth
bloom repo worktree add backend feature-api
```

You can organize everything outside `repos/` however you like—create folders for research, designs, meeting notes, or anything else that helps provide context for your project.

### Workflow

1. **Initialize** - `bloom init` (existing repos) or `bloom create` (new project)
2. **Clone repos** - `bloom repo clone <url>` to add code repositories
3. **Add context** - Organize planning docs, notes, designs however you like
4. **Plan** - `bloom plan` creates plan.md from your context
5. **Generate** - `bloom generate` converts plan.md into tasks.yaml
6. **Run** - `bloom run` starts agents to execute tasks

The more context you provide upfront (PRD, architecture notes, existing code), the better your task breakdown will be.

## Workflow

```
1. CREATE    bloom create <name>       # Create project with PRD template
2. PLAN      bloom plan                # Create implementation plan (plan.md)
3. GENERATE  bloom generate            # Generate tasks.yaml from plan
4. VALIDATE  bloom validate            # Check for issues
5. RUN       bloom run                 # Start agents
6. MONITOR   Dashboard shows progress  # Use hjkl to navigate TUI
7. REVIEW    [CHECKPOINT] tasks        # Human reviews at phase boundaries
```

## Commands

### Setup

```bash
bloom create <name>          # Create new project with PRD template and CLAUDE.md
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

### Planning

```bash
bloom plan                   # Create implementation plan (plan.md) with Claude
bloom generate               # Generate tasks.yaml from plan.md
```

### Monitoring

```bash
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
