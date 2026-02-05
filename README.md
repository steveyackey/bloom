<p align="center">
  <img src="assets/bloom-header.png" alt="Bloom" width="800">
</p>

<p align="center">
  <a href="https://github.com/steveyackey/bloom/releases/latest"><img src="https://img.shields.io/github/v/release/steveyackey/bloom" alt="Latest Release"></a>
  <img src="https://img.shields.io/badge/built%20with-Bun-f9f1e1?logo=bun" alt="Built with Bun">
</p>

<p align="center">
  <img src="assets/demo.svg" alt="Bloom Demo" width="800">
</p>

# Bloom - Multi-Agent Task Orchestrator

A multi-agent task orchestration system that uses YAML-based task definitions and Claude Code agents to execute work in parallel. Designed for teams and solo developers alike.

**[Website](https://www.use-bloom.dev)** · **[Documentation](https://docs.use-bloom.dev)**

## Built for Teams and Solo Developers

Bloom adapts to how you work:

**For Teams**: Product managers and designers define requirements in PRDs, adding mockups and designs to the project folder. Developers, architects, and technical leads collaborate on implementation plans. QA engineers validate checkpoints throughout the process. Everyone stays aligned from requirements to deployment.

**For Solo Developers**: Move fast with AI-powered planning. Turn your ideas into structured plans and let multiple agents execute in parallel while you focus on what matters.

## Multi-Repository Planning

Unlike other tools, Bloom enables planning across multiple repositories in a single project. Build features that span your backend, frontend, mobile app, and shared libraries—all coordinated through one plan with proper dependency ordering.

```yaml
git:
  push_to_remote: true           # Push branches for pickup on other machines
  auto_cleanup_merged: true      # Clean up branches after merge

tasks:
  # All tasks merge to integration branch, final task opens PR to main
  - id: api-models
    repo: backend
    branch: feature/auth/api-models
    base_branch: main
    merge_into: feature/auth       # Integration branch

  - id: shared-types
    repo: shared-types
    branch: feature/auth/types
    base_branch: feature/auth
    merge_into: feature/auth
    depends_on: [api-models]

  - id: frontend-integration
    repo: frontend
    branch: feature/auth/frontend
    base_branch: feature/auth
    merge_into: feature/auth
    depends_on: [shared-types]

  - id: open-pr
    repo: backend                  # Any repo with the integration branch
    branch: feature/auth
    open_pr: true                  # Opens PR to main
    depends_on: [frontend-integration]
```

## Explore Across Repositories

Use `bloom enter` to start an interactive Claude session with visibility into all your repositories. Ask questions, explore code, or debug issues across your entire codebase—no project setup required.

```bash
# From anywhere in your workspace
bloom enter

# Ask questions spanning multiple repos
> "How does the frontend auth flow connect to the backend JWT service?"
> "What shared types are used between the API and mobile app?"
> "Find all places where user permissions are checked"
```

Create a folder just for exploration if you want—no PRD or plan needed. Perfect for onboarding, architecture review, or understanding complex cross-repo interactions.

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
# 1. Create a new planning workspace
mkdir my-workspace && cd my-workspace
git init
bloom init   # You'll be asked to choose SSH or HTTPS for cloning repos

# 2. Clone repos you'll be working on
bloom repo clone https://github.com/org/backend
bloom repo clone https://github.com/org/frontend

# 3. Create a project (work to be done against those repos)
bloom create my-feature
cd my-feature

# Or, if you've already gathered research in a folder:
# mkdir my-feature && cd my-feature
# (add research notes, context files, etc.)
# bloom create .

# 4. Refine your PRD until you're happy with requirements
bloom refine      # Interactively refine PRD.md, CLAUDE.md, etc.

# 5. Create a plan
bloom plan        # Creates plan.md from your PRD

# 6. Refine the plan (optional - repeat until satisfied)
bloom refine      # Refine plan.md, ask questions, iterate

# 7. Generate tasks and execute
bloom generate    # Converts plan.md into tasks.yaml
bloom run         # Starts agents to execute tasks
```

A **project** is work to be done on one or more repositories. You set up a workspace with repos first, then create projects that plan work against those repos.

## Workspace Structure

A Bloom **workspace** is a git repository that contains your repos and projects:

```
my-workspace/               # Planning workspace (bloom init)
├── bloom.config.yaml       # Workspace config
├── template/               # Templates for new projects
│   ├── PRD.md              # PRD template
│   ├── plan.md             # Plan template
│   └── CLAUDE.template.md  # CLAUDE.md template (renamed when copied)
├── repos/                  # Repos cloned here (shared across projects)
│   ├── backend/
│   └── frontend/
└── my-feature/             # A project (bloom create)
    ├── PRD.md              # Product Requirements Document
    ├── CLAUDE.md           # Project guidelines for Claude
    ├── plan.md             # Implementation plan (bloom plan)
    └── tasks.yaml          # Task definitions (bloom generate)
```

Projects reference repos from the workspace. A single repo can be used by multiple projects, and a single project can work across multiple repos.

### How the repos/ Folder Works

When you run `bloom repo clone <url>`, Bloom clones the repository as a **bare repo** and automatically creates a worktree for the default branch (usually `main` or `master`). This setup enables multiple agents to work on the same repo simultaneously without conflicts.

**Why worktrees?** Each agent needs its own working directory to make changes. With git worktrees, you can have multiple branches checked out at once—each in its own folder. When you run parallel tasks, Bloom creates separate worktrees so agents don't step on each other:

```
repos/
└── backend/
    ├── backend.git/          # Bare repo (shared git data)
    ├── main/                 # Default branch worktree
    ├── feature-auth/         # Worktree for agent 1
    └── feature-api/          # Worktree for agent 2
```

When you run `bloom run`, worktrees are **automatically created** as needed based on task `branch` definitions—you don't need to manage them manually. The manual commands are only needed if you want to work outside of Bloom:

```bash
bloom repo worktree add backend feature/auth
bloom repo worktree add backend feature/api
```

You can organize everything outside `repos/` however you like—create folders for research, designs, meeting notes, or anything else that helps provide context for your project.

## Workflow

```
1. INIT      bloom init                # Initialize workspace (once)
2. CLONE     bloom repo clone <url>    # Add repos to workspace
3. CREATE    bloom create <name>       # Create project against repos
             bloom create .            # Or initialize existing folder as project
4. REFINE    bloom refine              # Refine PRD, ask questions, iterate
5. PLAN      bloom plan                # Create implementation plan (plan.md)
6. REFINE    bloom refine              # Refine plan if needed
7. GENERATE  bloom generate            # Generate tasks.yaml from plan
8. VIEW      bloom view                # (Optional) Inspect DAG in browser
9. RUN       bloom run                 # Start agents (resumes if interrupted)
10. MONITOR  Dashboard shows progress  # Use hjkl to navigate TUI
11. REVIEW   checkpoint tasks          # Human reviews at phase boundaries
```

### Research-First Workflow

For complex projects, gather research before creating the PRD:

```bash
mkdir my-feature && cd my-feature
# Add research notes, API docs, design specs, etc.
bloom create .   # Reads existing files, then creates PRD with context
bloom plan       # Continue with planning...
```

### Team Collaboration Points

- **Steps 3-4 (Create & Refine PRD)**: PMs and designers add requirements, mockups, and design assets to the project folder
- **Steps 5-6 (Plan & Refine)**: Technical leads, architects, and developers review and refine the implementation approach
- **Step 10 (Checkpoints)**: QA and team members validate work at phase boundaries before agents continue

The more context you provide upfront (PRD, architecture notes, existing code, design mockups), the better your task breakdown will be.

## Commands

### Workspace Setup

```bash
bloom init                   # Initialize workspace (prompts for SSH/HTTPS preference)
bloom setup                  # Sync repos according to config
```

### Repository Management

```bash
bloom repo clone <url|org/repo>  # Clone a repo (supports org/repo shorthand)
bloom repo create <name>         # Create a new local repo with worktree setup
bloom repo list                  # List repos in the workspace
bloom repo sync                  # Clone/fetch repos and pull default branches
bloom repo remove <name>         # Remove a repo and its worktrees
```

Examples:
```bash
bloom repo clone steveyackey/bloom           # Shorthand for GitHub
bloom repo clone https://github.com/org/repo # Full HTTPS URL
bloom repo clone git@github.com:org/repo.git # Full SSH URL
bloom repo create my-new-project             # Create new local repo
```

### Project Management

```bash
bloom create <name>          # Create a new project against workspace repos
bloom create .               # Initialize project in current directory (uses existing files as context)
bloom refine                 # Refine PRD, plan, or other project docs
```

**Using `bloom create .`**: When you've already gathered research, notes, or context in a folder, use `bloom create .` to initialize it as a project. Bloom will read existing files first, then help you create a PRD based on that context. This is useful for the workflow: gather research -> create PRD -> plan -> generate -> run.

### Worktree Management

Worktrees are created automatically during `bloom run`. Manual management is only needed for working outside of Bloom:

```bash
bloom repo worktree add <repo> <branch>    # Add worktree for branch
bloom repo worktree remove <repo> <branch> # Remove a worktree
bloom repo worktree list <repo>            # List worktrees for repo
```

### Agent Management

```bash
bloom agent check            # Check which agent CLIs are installed
bloom agent validate [name]  # Validate an agent works with a test prompt
bloom agent validate -s      # Validate in streaming (non-interactive) mode
bloom agents                 # List agents and their assigned tasks
```

### Configuration

```bash
bloom config                              # Show user config
bloom config set-protocol <ssh|https>     # Set git URL preference
bloom config set-interactive <agent>      # Set default interactive agent
bloom config set-noninteractive <agent>   # Set default non-interactive agent
bloom config set-model <agent> <model>    # Set default model for an agent
bloom config models                       # Show configured models
bloom config models <agent> --discover    # Discover models from agent CLI
bloom config models <agent> -d -s         # Discover and save models to config
```

Config file (`~/.bloom/config.yaml`):
```yaml
gitProtocol: ssh
agent:
  defaultInteractive: claude
  defaultNonInteractive: claude
  claude:
    defaultModel: claude-sonnet-4-20250514
    models:
      - claude-sonnet-4-20250514
      - claude-opus-4-20250514
  opencode:
    defaultModel: github-copilot/claude-sonnet-4
    models: [...]  # Populated via --discover --save
```

### Orchestrator

```bash
bloom run                    # Start TUI with all agents
bloom run --agent copilot    # Use a different agent provider
bloom run --agent test       # Use test agent (for development/CI)
```

### Planning

```bash
bloom plan                   # Create implementation plan (plan.md) with Claude
bloom refine                 # Refine PRD, plan, tasks.yaml, or other docs
bloom generate               # Generate tasks.yaml from plan.md
bloom enter                  # Enter Claude Code in project context
```

### Monitoring

```bash
bloom view                   # Visual DAG inspector (opens in browser)
bloom dashboard              # Live task view (refreshes every 10s)
bloom list                   # List all tasks by phase
bloom list in_progress       # Filter by status
bloom show <taskid>          # Show task details
bloom next [agent]           # Show available tasks
bloom agents                 # List agents and their tasks
bloom validate               # Check for errors
```

#### Visual Task Inspector

`bloom view` opens a browser-based visual inspector for your tasks.yaml. Use it to:
- Explore the task DAG without running agents
- View task dependencies, phases, and status at a glance
- Inspect the exact prompts agents will receive (system + user prompts)
- Verify your task graph before executing

```bash
bloom view                   # Open on default port (3000)
bloom view --port 8080       # Custom port
bloom view --no-open         # Don't auto-open browser
bloom view -f project.yaml   # Use custom tasks file
```

The view updates automatically when tasks.yaml changes (file watching enabled).

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
bloom update                 # Update bloom to the latest version
```

### Custom Tasks File

```bash
bloom run -f project.yaml
bloom plan -f project.yaml
```

> **Note:** Global flags must come after the command name, not before.

### Shell Completions

Enable tab completion for bloom commands in your shell.

**Bash** (add to `~/.bashrc`):
```bash
eval "$(bloom completions bash)"
```

**Zsh** (add to `~/.zshrc`):
```bash
eval "$(bloom completions zsh)"
```

**Fish** (run once):
```fish
bloom completions fish > ~/.config/fish/completions/bloom.fish
```

**PowerShell** (add to your profile):
```powershell
bloom completions powershell | Out-String | Invoke-Expression
```

To find your PowerShell profile location, run `echo $PROFILE` in PowerShell.

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
# Top-level git configuration
git:
  push_to_remote: true           # Push branches (enables pickup on other machines)
  auto_cleanup_merged: true      # Clean up branches/worktrees after merge

tasks:
  - id: kebab-case-id
    title: Short description
    status: todo                    # todo|ready_for_agent|assigned|in_progress|done|blocked
    phase: 1                        # Group related tasks
    depends_on: [other-task-id]     # Must complete first
    repo: repo-name                 # Repository name (from bloom repo list)
    branch: feature/proj/task       # Working branch (pattern: feature/<project>/<task>)
    base_branch: feature/proj       # Branch to create from (integration branch)
    merge_into: feature/proj        # Merge into integration branch when done
    open_pr: true                   # Create GitHub PR (only for final PR to main)
    agent_name: backend-agent       # Group tasks by agent (same = sequential, different = parallel)
    checkpoint: true                # Requires human approval before downstream tasks
    instructions: |                 # Detailed instructions
      Multi-line instructions
    acceptance_criteria:            # Definition of done
      - Criterion 1
    ai_notes: []                    # Notes added during execution
    subtasks: []                    # Nested tasks (independent, parallel)
    steps: []                       # Sequential steps (same session, shared context)
```

### Steps vs Subtasks

For sequential work where context matters, use **steps** instead of subtasks:

```yaml
- id: refactor-auth
  title: Refactor authentication
  steps:
    - id: refactor-auth.1
      instruction: Extract JWT validation into separate module
    - id: refactor-auth.2
      instruction: Add unit tests for extracted module
    - id: refactor-auth.3
      instruction: Update API documentation
```

Steps reuse the same agent session, preserving context between steps. Git operations (push/merge/PR) happen only after all steps complete. See [Task Schema Reference](https://docs.use-bloom.dev/reference/task-schema) for full details.

## Git Workflow

Bloom uses an **integration branch workflow** by default. All task branches merge to a project integration branch, which then opens a PR to main.

### Default Workflow

```
main
 └── feature/<project-name>              ← Integration branch
      ├── feature/<project-name>/task-1  ← Task branches merge here
      ├── feature/<project-name>/task-2
      └── ...
```

1. **First task** creates the integration branch from `main`
2. **Each task** branches off integration, pushes to remote, merges back
3. **Branches are cleaned up** after merge (local, remote, and worktrees)
4. **Final task** opens a PR from integration branch to `main`

This workflow allows picking up work on another machine and keeps the repository clean.

### Example

```yaml
git:
  push_to_remote: true
  auto_cleanup_merged: true

tasks:
  - id: setup
    repo: my-app
    branch: feature/my-project/setup
    base_branch: main
    merge_into: feature/my-project     # Creates integration branch

  - id: implement
    repo: my-app
    branch: feature/my-project/implement
    base_branch: feature/my-project
    merge_into: feature/my-project
    depends_on: [setup]

  - id: open-pr
    repo: my-app
    branch: feature/my-project
    open_pr: true                       # PR to main
    depends_on: [implement]
```

### How It Works

1. **Lazy Worktree Creation**: Worktrees are created only when an agent picks up a task
2. **Auto Pull**: Before creating a worktree, Bloom pulls the latest from the base branch
3. **Post-Task Validation**: After task completion, Bloom checks for uncommitted changes
4. **Auto Push**: Branches are pushed to remote (enables pickup on other machines)
5. **Auto Cleanup**: After merge, worktrees, local branches, and remote branches are deleted

### Git Configuration

Set in `tasks.yaml`:
- `push_to_remote: true` - Push branches to remote after each task (default for generated tasks)
- `auto_cleanup_merged: true` - Clean up merged branches, worktrees, and remote branches

## Key Concepts

- **Phases**: Group tasks into numbered phases (1, 2, 3...)
- **Checkpoints**: Tasks with `checkpoint: true` at phase boundaries require human approval
- **Dependencies**: `depends_on` enforces task ordering
- **Branches**: Each task specifies a working branch; worktrees are created automatically
- **Priming**: Tasks auto-change from `todo` to `ready_for_agent` when deps complete

## Multi-Agent Support

Bloom supports multiple AI agents, allowing you to choose the best tool for your workflow. Configure different agents for interactive sessions vs. autonomous task execution.

### Supported Agents

| Agent | CLI | Best For | Unique Features |
|-------|-----|----------|-----------------|
| **Claude** | `claude` | General development | TodoWrite tracking, web search, human questions |
| **Copilot** | `copilot` | GitHub integration | Multi-model support, GitHub MCP server |
| **Codex** | `codex` | Structured output | Session forking, output schema enforcement |
| **Goose** | `goose` | Extensible automation | MCP extensions, browser automation, scheduling |
| **OpenCode** | `opencode` | Code intelligence | Native LSP support, multi-provider |
| **Cursor** | `agent` | IDE-style development | Cloud agent, headless mode, multi-model |

### Agent Capabilities

| Feature | Claude | Copilot | Codex | Goose | OpenCode | Cursor |
|---------|--------|---------|-------|-------|----------|--------|
| Web Search | Yes | Yes | Yes | No | No | No |
| Session Fork | No | No | Yes | No | No | No |
| MCP Extensions | No | No | No | Yes | No | No |
| LSP Integration | No | No | No | No | Yes | No |
| Human Questions | Yes | No | No | Yes | No | No |
| Cloud Execution | No | No | No | No | No | Yes |

### Quick Configuration

Configure agents in `~/.bloom/config.yaml`:

```yaml
gitProtocol: ssh

agent:
  # Default agents for each mode
  defaultInteractive: claude      # For bloom enter, bloom refine
  defaultNonInteractive: claude   # For bloom run (autonomous tasks)

  # Per-agent model configuration
  claude:
    defaultModel: sonnet
    models:
      - sonnet
      - haiku
      - opus

  opencode:
    defaultModel: github-copilot/claude-sonnet-4
    models:
      - github-copilot/claude-sonnet-4
      - openai/gpt-4o
```

**Available agents**: `claude`, `copilot`, `codex`, `goose`, `opencode`, `cursor`

### Agent Configuration Commands

```bash
# View current configuration
bloom config

# Set default agents
bloom config set-interactive claude
bloom config set-noninteractive opencode

# Set model for an agent
bloom config set-model claude opus
bloom config set-model opencode github-copilot/claude-sonnet-4

# View and discover models
bloom config models                       # Show all configured models
bloom config models claude                # Show models for claude
bloom config models copilot --discover    # Discover available models from CLI
bloom config models opencode -d -s        # Discover and save to config
```

### Agent-Specific Setup

Each agent has its own CLI and configuration requirements. See the [Agent Documentation](apps/docs/docs/agents/README.md) for detailed setup instructions, configuration examples, and troubleshooting guides:

- **Claude** - Uses Anthropic API key
- **Copilot** - Uses GitHub authentication
- **Codex** - Uses OpenAI API key
- **Goose** - Extensible via MCP
- **OpenCode** - Multi-provider support
- **Cursor** - Uses Cursor account or API key

## Agent Sandbox

Bloom can run agents inside a security sandbox that isolates them from the rest of your system. The sandbox provides:

- **Filesystem isolation** - Agents can only write to their workspace directory
- **Network filtering** - Agents can only access domains you explicitly allow
- **Process isolation** - Agents cannot see or interact with other processes

### Quick Setup

```bash
# Linux/WSL2: Install dependencies
sudo apt-get install bubblewrap socat  # Ubuntu/Debian
sudo dnf install bubblewrap socat      # Fedora

# Verify sandbox readiness
bloom agent check
```

The `@anthropic-ai/sandbox-runtime` library is included as an optional dependency and is loaded automatically when sandbox is enabled.

### Enable Sandbox

Add to `~/.bloom/config.yaml`:

```yaml
agent:
  claude:
    sandbox:
      enabled: true
      networkPolicy: allow-list
      allowedDomains:
        - github.com
        - api.anthropic.com
        - registry.npmjs.org
```

### Platform Support

| Platform | Status | Technology |
|----------|--------|------------|
| **Linux** | Fully supported | bubblewrap + socat |
| **macOS** | Fully supported | sandbox-exec (built-in) |
| **WSL2** | Fully supported | Same as Linux |
| **Windows** | Via WSL2 only | — |

### Learn More

- **[Sandbox Setup Guide](https://docs.use-bloom.dev/guides/sandbox-setup)** - Platform-specific installation
- **[Policy Configuration](https://docs.use-bloom.dev/reference/sandbox-policy)** - All configuration options
- **[Troubleshooting](https://docs.use-bloom.dev/guides/sandbox-troubleshooting)** - Common issues and solutions

## Development

Bloom uses a Bun workspace monorepo:

```
bloom/
├── apps/
│   ├── cli/          # @bloom/cli - Main CLI application
│   ├── web/          # @bloom/web - Landing page (use-bloom.dev)
│   └── docs/         # @bloom/docs - Docusaurus site (docs.use-bloom.dev)
├── docs/             # Internal documentation
├── scripts/          # Build and development scripts
└── package.json      # Workspace root
```

### Getting Started

```bash
# Install dependencies for all workspaces
bun install

# Run the CLI during development
bun run bloom <command>

# Validate all apps
bun run validate

# Validate individual apps
bun run validate:cli   # CLI (lint, typecheck, test)
bun run validate:web   # Web (lint, build)
bun run validate:docs  # Docs (typecheck, build)
```

### Working on Individual Apps

```bash
# CLI development
cd apps/cli
bun run test           # Run tests
bun run typecheck      # Type checking
bun run fix            # Lint and format

# Web development
cd apps/web
bun run dev            # Start dev server
bun run build          # Production build

# Docs development
cd apps/docs
bun run start          # Start dev server
bun run build          # Production build
```
