// =============================================================================
// Help / Usage Text
// =============================================================================

import chalk from "chalk";

export function printUsage(): void {
  const cmd = (s: string) => chalk.cyan(s);
  const arg = (s: string) => chalk.yellow(s);
  const opt = (s: string) => chalk.dim(s);
  const section = (s: string) => chalk.bold.magenta(s);

  console.log(`${chalk.bold.cyan("Bloom")} - ${chalk.dim("Multi-Agent Task Orchestrator")}

${chalk.bold("Usage:")} bloom ${opt("[options]")} ${arg("<command>")} ${opt("[args]")}

${section("Options:")}
  ${opt("-f, --file")} ${arg("<file>")}         Path to tasks.yaml ${opt("(default: ./tasks.yaml)")}
  ${opt("-l, --log-level")} ${arg("<level>")}   Set log level: debug, info, warn, error ${opt("(default: info)")}
  ${opt("-v, --verbose")}             Enable debug logging
  ${opt("-q, --quiet")}               Only show errors

${section("Workflow:")}
  ${chalk.gray("1.")} mkdir my-workspace && cd my-workspace && git init
  ${chalk.gray("2.")} ${cmd("bloom init")}                 # Create workspace with template/
  ${chalk.gray("3.")} ${cmd("bloom repo clone")} ${arg("<url>")}     # Clone repos to work on
  ${chalk.gray("4.")} ${cmd("bloom create")} ${arg("<name>")}        # Create project from templates
  ${chalk.gray("5.")} ${cmd("bloom refine")}               # Refine PRD, CLAUDE.md, etc.
  ${chalk.gray("6.")} ${cmd("bloom plan")}                 # Create plan.md
  ${chalk.gray("7.")} ${cmd("bloom refine")}               # Refine plan if needed
  ${chalk.gray("8.")} ${cmd("bloom generate")}             # Create tasks.yaml from plan
  ${chalk.gray("9.")} ${cmd("bloom run")}                  # Execute tasks (resumes if interrupted)

${section("Setup Commands:")}
  ${cmd("init")}                      Initialize workspace (creates template/, repos/, config)
  ${cmd("create")} ${arg("<name>")}             Create new project from workspace templates

${section("Repository Commands:")}
  ${cmd("repo clone")} ${arg("<url>")}          Clone a repo (bare + default branch worktree)
  ${cmd("repo list")}                 List all configured repos
  ${cmd("repo sync")}                 Clone/fetch all repos from bloom.repos.yaml
  ${cmd("repo remove")} ${arg("<name>")}        Remove a repo and its worktrees
  ${cmd("repo worktree add")} ${arg("<repo> <branch>")}   Add worktree for branch
  ${cmd("repo worktree remove")} ${arg("<repo> <branch>")} Remove a worktree
  ${cmd("repo worktree list")} ${arg("<repo>")}           List worktrees for repo

${section("Configuration Commands:")}
  ${cmd("config")} ${opt("[show]")}             Show user config (~/.bloom/config.yaml)
  ${cmd("config set-protocol")} ${arg("<ssh|https>")}  Set git URL preference

${section("Orchestrator Commands:")}
  ${cmd("run")}                       Start the orchestrator TUI (resumes where left off)
  ${cmd("setup")}                     Setup repos according to config

${section("Planning Commands:")}
  ${cmd("refine")}                    Refine PRD, plan, tasks.yaml, or other project docs
  ${cmd("plan")}                      Create implementation plan (plan.md) with Claude
  ${cmd("generate")}                  Generate tasks.yaml from plan.md
  ${cmd("enter")}                     Enter Claude Code in project context

${section("Task Commands:")}
  ${cmd("dashboard")}                 Live dashboard view (refreshes every 10s)
  ${cmd("list")} ${opt("[status]")}             List all tasks or filter by status
  ${cmd("show")} ${arg("<taskid>")}             Show task details
  ${cmd("next")} ${opt("[agent]")}              Show next available tasks
  ${cmd("agents")}                    List all agents and their task counts
  ${cmd("validate")}                  Check for errors

${section("Status Commands:")}
  ${cmd("done")} ${arg("<taskid>")}             Mark task as ${chalk.green("done")}
  ${cmd("block")} ${arg("<taskid>")}            Mark task as ${chalk.red("blocked")}
  ${cmd("todo")} ${arg("<taskid>")}             Mark task as ${chalk.gray("todo")}
  ${cmd("ready")} ${arg("<taskid>")}            Mark task as ${chalk.yellow("ready_for_agent")}
  ${cmd("assign")} ${arg("<taskid> <agent>")}   Assign task to agent

${section("Other Commands:")}
  ${cmd("note")} ${arg("<taskid> <note>")}      Add a note to a task
  ${cmd("reset")} ${arg("<taskid>")}            Reset stuck task to ready_for_agent
  ${cmd("reset")} ${opt("--stuck")}             Reset ALL stuck tasks

${section("Human Queue Commands:")}
  ${cmd("questions")} ${opt("[--all]")}         List pending questions (--all for all)
  ${cmd("ask")} ${arg("<agent> <question>")}    Create a question from an agent
    ${chalk.dim("Options:")}
      ${opt("--task")} ${arg("<taskid>")}       Associate with a task
      ${opt("--type")} ${arg("<type>")}         Question type: yes_no, open, choice
      ${opt("--choices")} ${arg("<list>")}      Comma-separated choices
      ${opt("--on-yes")} ${arg("<status>")}     Status to set on yes (for yes_no)
      ${opt("--on-no")} ${arg("<status>")}      Status to set on no (for yes_no)
      ${opt("--add-note")}            Add answer as note to task
  ${cmd("answer")} ${arg("<id> <response>")}    Answer a pending question
  ${cmd("wait-answer")} ${arg("<id>")}          Wait for answer (for agents)
  ${cmd("clear-answered")}            Delete all answered questions

${section("Interjection Commands:")}
  ${cmd("interject list")}            List pending interjections
  ${cmd("interject resume")} ${arg("<id>")}     Resume an interjected session interactively
  ${cmd("interject dismiss")} ${arg("<id>")}    Dismiss an interjection

${section("Other Commands:")}
  ${cmd("update")}                    Update bloom to the latest version
  ${cmd("version")}                   Show bloom version
  ${cmd("help")}                      Show this help message

${section("Examples:")}
  mkdir my-project && cd my-project && git init
  ${cmd("bloom init")}                        Initialize workspace
  ${cmd("bloom repo clone")} ${arg("https://github.com/org/repo")}
  ${cmd("bloom create")} ${arg("my-feature")}           Create new project
  cd my-feature
  ${cmd("bloom refine")}                      Refine PRD and docs
  ${cmd("bloom plan")}                        Create implementation plan
  ${cmd("bloom generate")}                    Generate tasks.yaml from plan
  ${cmd("bloom run")}                         Execute tasks

${section("TUI Controls:")}
  ${chalk.yellow("hjkl/arrows")}   Navigate panes
  ${chalk.yellow("Enter")}         Focus pane
  ${chalk.yellow("Ctrl+B")}        Exit focus
  ${chalk.yellow("r")}             Restart pane
  ${chalk.yellow("q")}             Quit
`);
}
