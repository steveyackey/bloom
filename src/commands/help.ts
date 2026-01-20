// =============================================================================
// Help / Usage Text
// =============================================================================

export function printUsage(): void {
  console.log(`Bloom - Multi-Agent Task Orchestrator

Usage: bloom [options] <command> [args]

Options:
  -f, --file <file>         Path to tasks.yaml (default: ./tasks.yaml)
  -l, --log-level <level>   Set log level: debug, info, warn, error (default: info)
  -v, --verbose             Enable debug logging
  -q, --quiet               Only show errors

Workflow:
  1. mkdir my-workspace && cd my-workspace && git init
  2. bloom init                 # Create workspace with template/
  3. bloom repo clone <url>     # Clone repos to work on
  4. bloom create <name>        # Create project from templates
  5. bloom refine               # Refine PRD, CLAUDE.md, etc.
  6. bloom plan                 # Create plan.md
  7. bloom refine               # Refine plan if needed
  8. bloom generate             # Create tasks.yaml from plan
  9. bloom run                  # Execute tasks (resumes if interrupted)

Setup Commands:
  init                      Initialize workspace (creates template/, repos/, config)
  create <name>             Create new project from workspace templates

Repository Commands:
  repo clone <url>          Clone a repo (bare + default branch worktree)
  repo list                 List all configured repos
  repo sync                 Clone/fetch all repos from bloom.repos.yaml
  repo remove <name>        Remove a repo and its worktrees
  repo worktree add <repo> <branch>   Add worktree for branch
  repo worktree remove <repo> <branch> Remove a worktree
  repo worktree list <repo>           List worktrees for repo

Configuration Commands:
  config [show]             Show user config (~/.bloom/config.yaml)
  config set-protocol <ssh|https>  Set git URL preference

Orchestrator Commands:
  run                       Start the orchestrator TUI (resumes where left off)
  setup                     Setup repos according to config

Planning Commands:
  refine                    Refine PRD, plan, or any project documents
  plan                      Create implementation plan (plan.md) with Claude
  generate                  Generate tasks.yaml from plan.md

Task Commands:
  dashboard                 Live dashboard view (refreshes every 10s)
  list [status]             List all tasks or filter by status
  show <taskid>             Show task details
  next [agent]              Show next available tasks
  agents                    List all agents and their task counts
  validate                  Check for errors

Status Commands:
  done <taskid>             Mark task as done
  block <taskid>            Mark task as blocked
  todo <taskid>             Mark task as todo
  ready <taskid>            Mark task as ready_for_agent
  assign <taskid> <agent>   Assign task to agent

Other Commands:
  note <taskid> <note>      Add a note to a task
  reset <taskid>            Reset stuck task to ready_for_agent
  reset --stuck             Reset ALL stuck tasks

Human Queue Commands:
  questions [--all]         List pending questions (--all for all)
  ask <agent> <question>    Create a question from an agent
    Options:
      --task <taskid>       Associate with a task
      --type <type>         Question type: yes_no, open, choice
      --choices <list>      Comma-separated choices
      --on-yes <status>     Status to set on yes (for yes_no)
      --on-no <status>      Status to set on no (for yes_no)
      --add-note            Add answer as note to task
  answer <id> <response>    Answer a pending question
  wait-answer <id>          Wait for answer (for agents)
  clear-answered            Delete all answered questions

Interjection Commands:
  interject list            List pending interjections
  interject resume <id>     Resume an interjected session interactively
  interject dismiss <id>    Dismiss an interjection

Other Commands:
  version                   Show bloom version
  help                      Show this help message

Examples:
  mkdir my-project && cd my-project && git init
  bloom init                        Initialize workspace
  bloom repo clone https://github.com/org/repo
  bloom create my-feature           Create new project
  cd my-feature
  bloom refine                      Refine PRD and docs
  bloom plan                        Create implementation plan
  bloom generate                    Generate tasks.yaml from plan
  bloom run                         Execute tasks

TUI Controls:
  hjkl/arrows   Navigate panes
  Enter         Focus pane
  Ctrl+B        Exit focus
  r             Restart pane
  q             Quit
`);
}
