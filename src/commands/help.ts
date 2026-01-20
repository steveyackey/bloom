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

Setup Commands:
  init                      Initialize workspace (creates repos/, config files)

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
  run                       Start the orchestrator TUI
  setup                     Setup repos according to config

Task Commands:
  plan                      Interactive planning session with Claude
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
  bloom init                        Initialize a new workspace
  bloom repo clone https://github.com/org/repo   Clone a repository
  bloom repo list                   List configured repos
  bloom repo sync                   Clone/update all repos
  bloom plan                        Create task breakdown with Claude
  bloom run                         Start TUI with all agents
  bloom -f project.yaml run         Use custom tasks file
  bloom list in_progress            Show in-progress tasks
  bloom done my-task-id             Mark task complete

TUI Controls:
  hjkl/arrows   Navigate panes
  Enter         Focus pane
  Ctrl+B        Exit focus
  r             Restart pane
  q             Quit
`);
}
