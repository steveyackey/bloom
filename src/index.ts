#!/usr/bin/env bun
// =============================================================================
// Bloom - Multi-Agent Task Orchestrator
// =============================================================================

import { resolve } from "node:path";

import {
  BLOOM_DIR,
  cmdAgents,
  cmdAnswer,
  cmdAsk,
  cmdAssign,
  cmdClearAnswered,
  cmdDashboard,
  cmdInterjectDismiss,
  cmdInterjections,
  cmdInterjectResume,
  cmdList,
  cmdNext,
  cmdNote,
  cmdQuestions,
  cmdQuestionsDashboard,
  cmdReset,
  cmdSetStatus,
  cmdShow,
  cmdValidate,
  cmdWaitAnswer,
  getTasksFile,
  runAgentWorkLoop,
  setTasksFile,
  startOrchestrator,
} from "./commands";
import type { QuestionType } from "./human-queue";
import { type LogLevel, setLogLevel } from "./logger";
import { runPlanningSession } from "./plan-session";
import { addWorktree, cloneRepo, listRepos, listWorktrees, removeRepo, removeWorktree, syncRepos } from "./repos";
import type { TaskStatus } from "./task-schema";
import { loadUserConfig, setGitProtocol } from "./user-config";

// =============================================================================
// CLI
// =============================================================================

function printUsage(): void {
  console.log(`Bloom - Multi-Agent Task Orchestrator

Usage: bloom [options] <command> [args]

Options:
  -f, --file <file>         Path to tasks.yaml (default: ./tasks.yaml)
  -l, --log-level <level>   Set log level: debug, info, warn, error (default: info)
  -v, --verbose             Enable debug logging
  -q, --quiet               Only show errors

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

Examples:
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

function parseArgs(argv: string[]): { tasksFile: string | null; logLevel: LogLevel | null; args: string[] } {
  const result: { tasksFile: string | null; logLevel: LogLevel | null; args: string[] } = {
    tasksFile: null,
    logLevel: null,
    args: [],
  };
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === "-f" || arg === "--file") {
      result.tasksFile = argv[i + 1] ?? null;
      i += 2;
    } else if (arg.startsWith("--file=")) {
      result.tasksFile = arg.slice("--file=".length);
      i += 1;
    } else if (arg.startsWith("-f=")) {
      result.tasksFile = arg.slice("-f=".length);
      i += 1;
    } else if (arg === "-l" || arg === "--log-level") {
      result.logLevel = (argv[i + 1] as LogLevel) ?? null;
      i += 2;
    } else if (arg.startsWith("--log-level=")) {
      result.logLevel = arg.slice("--log-level=".length) as LogLevel;
      i += 1;
    } else if (arg === "-v" || arg === "--verbose") {
      result.logLevel = "debug";
      i += 1;
    } else if (arg === "-q" || arg === "--quiet") {
      result.logLevel = "error";
      i += 1;
    } else {
      result.args.push(arg);
      i += 1;
    }
  }

  return result;
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const { tasksFile: tasksFileArg, logLevel, args } = parseArgs(process.argv.slice(2));

  if (logLevel) {
    setLogLevel(logLevel);
  }

  if (tasksFileArg) {
    setTasksFile(resolve(tasksFileArg));
  }

  const cmd = args[0];

  switch (cmd) {
    case "run":
      await startOrchestrator();
      break;

    case "setup": {
      const repos = await listRepos(BLOOM_DIR);
      if (repos.length === 0) {
        console.error("No repos configured. Use 'bloom repo clone <url>' to add repos first.");
        process.exit(1);
      }
      console.log("Syncing repositories...\n");
      const result = await syncRepos(BLOOM_DIR);
      if (result.cloned.length > 0) {
        console.log(`Cloned: ${result.cloned.join(", ")}`);
      }
      if (result.skipped.length > 0) {
        console.log(`Updated: ${result.skipped.join(", ")}`);
      }
      if (result.failed.length > 0) {
        console.log(`Failed:`);
        for (const f of result.failed) {
          console.log(`  ${f.name}: ${f.error}`);
        }
      }
      console.log("\nSetup complete.");
      break;
    }

    case "repo":
      await handleRepoCommand(args);
      break;

    case "config":
      await handleConfigCommand(args);
      break;

    case "plan":
      await runPlanningSession(getTasksFile());
      break;

    case "dashboard":
      await cmdDashboard();
      break;

    case "list":
      await cmdList(args[1] as TaskStatus | undefined);
      break;

    case "show":
      if (!args[1]) {
        console.error("Usage: bloom show <taskid>");
        process.exit(1);
      }
      await cmdShow(args[1]);
      break;

    case "next":
      await cmdNext(args[1]);
      break;

    case "agents":
      await cmdAgents();
      break;

    case "validate":
      await cmdValidate();
      break;

    case "done":
      if (!args[1]) {
        console.error("Usage: bloom done <taskid>");
        process.exit(1);
      }
      await cmdSetStatus(args[1], "done");
      break;

    case "block":
      if (!args[1]) {
        console.error("Usage: bloom block <taskid>");
        process.exit(1);
      }
      await cmdSetStatus(args[1], "blocked");
      break;

    case "todo":
      if (!args[1]) {
        console.error("Usage: bloom todo <taskid>");
        process.exit(1);
      }
      await cmdSetStatus(args[1], "todo");
      break;

    case "ready":
      if (!args[1]) {
        console.error("Usage: bloom ready <taskid>");
        process.exit(1);
      }
      await cmdSetStatus(args[1], "ready_for_agent");
      break;

    case "start":
      if (!args[1]) {
        console.error("Usage: bloom start <taskid> [agent]");
        process.exit(1);
      }
      await cmdSetStatus(args[1], "in_progress");
      break;

    case "assign":
      if (!args[1] || !args[2]) {
        console.error("Usage: bloom assign <taskid> <agent>");
        process.exit(1);
      }
      await cmdAssign(args[1], args[2]);
      break;

    case "note":
      if (!args[1] || !args[2]) {
        console.error("Usage: bloom note <taskid> <note>");
        process.exit(1);
      }
      await cmdNote(args[1], args.slice(2).join(" "));
      break;

    case "reset":
      if (!args[1]) {
        console.error("Usage: bloom reset <taskid|--stuck>");
        process.exit(1);
      }
      await cmdReset(args[1]);
      break;

    case "agent":
      if (args[1] === "run") {
        if (!args[2]) {
          console.error("Usage: bloom agent run <name>");
          process.exit(1);
        }
        await runAgentWorkLoop(args[2]);
      } else if (args[1] === "list") {
        await cmdAgents();
      } else {
        console.error(`Unknown agent subcommand: ${args[1]}`);
        process.exit(1);
      }
      break;

    case "questions":
      await cmdQuestions(args[1] === "--all" || args[1] === "-a");
      break;

    case "ask":
      await handleAskCommand(args);
      break;

    case "answer":
      if (!args[1] || !args[2]) {
        console.error("Usage: bloom answer <question-id> <response>");
        process.exit(1);
      }
      await cmdAnswer(args[1], args.slice(2).join(" "));
      break;

    case "wait-answer":
      if (!args[1]) {
        console.error("Usage: bloom wait-answer <question-id> [timeout-secs]");
        process.exit(1);
      }
      await cmdWaitAnswer(args[1], args[2] ? parseInt(args[2], 10) : 300);
      break;

    case "clear-answered":
      await cmdClearAnswered();
      break;

    case "questions-dashboard":
      await cmdQuestionsDashboard();
      break;

    case "interject":
      if (args[1] === "list" || !args[1]) {
        await cmdInterjections();
      } else if (args[1] === "resume") {
        if (!args[2]) {
          console.error("Usage: bloom interject resume <id>");
          process.exit(1);
        }
        await cmdInterjectResume(args[2]);
      } else if (args[1] === "dismiss") {
        if (!args[2]) {
          console.error("Usage: bloom interject dismiss <id>");
          process.exit(1);
        }
        await cmdInterjectDismiss(args[2]);
      } else {
        console.error(`Unknown interject subcommand: ${args[1]}`);
        process.exit(1);
      }
      break;

    case "help":
    case "--help":
    case "-h":
    case undefined:
      printUsage();
      break;

    default:
      console.error(`Unknown command: ${cmd}`);
      printUsage();
      process.exit(1);
  }
}

// =============================================================================
// Subcommand Handlers
// =============================================================================

async function handleRepoCommand(args: string[]): Promise<void> {
  const subCmd = args[1];

  if (subCmd === "clone") {
    const url = args[2];
    if (!url) {
      console.error("Usage: bloom repo clone <url> [--name <name>]");
      process.exit(1);
    }
    const nameIdx = args.indexOf("--name");
    const name = nameIdx !== -1 ? args[nameIdx + 1] : undefined;

    const result = await cloneRepo(BLOOM_DIR, url, { name });
    if (result.success) {
      console.log(`\nSuccessfully cloned ${result.repoName}`);
      console.log(`  Bare repo: ${result.bareRepoPath}`);
      console.log(`  Worktree:  ${result.worktreePath} (${result.defaultBranch})`);
    } else {
      console.error(`Failed: ${result.error}`);
      process.exit(1);
    }
  } else if (subCmd === "list") {
    const repos = await listRepos(BLOOM_DIR);
    if (repos.length === 0) {
      console.log("No repos configured. Use 'bloom repo clone <url>' to add one.");
    } else {
      console.log("Configured repositories:\n");
      for (const repo of repos) {
        const status = repo.exists ? "✓" : "✗ (missing)";
        console.log(`${status} ${repo.name}`);
        console.log(`    url: ${repo.url}`);
        console.log(`    default: ${repo.defaultBranch}`);
        if (repo.worktrees.length > 0) {
          console.log(`    worktrees: ${repo.worktrees.join(", ")}`);
        }
      }
    }
  } else if (subCmd === "sync") {
    console.log("Syncing repositories...\n");
    const result = await syncRepos(BLOOM_DIR);
    if (result.cloned.length > 0) {
      console.log(`Cloned: ${result.cloned.join(", ")}`);
    }
    if (result.skipped.length > 0) {
      console.log(`Updated: ${result.skipped.join(", ")}`);
    }
    if (result.failed.length > 0) {
      console.log(`Failed:`);
      for (const f of result.failed) {
        console.log(`  ${f.name}: ${f.error}`);
      }
    }
    console.log("\nSync complete.");
  } else if (subCmd === "remove") {
    const name = args[2];
    if (!name) {
      console.error("Usage: bloom repo remove <name>");
      process.exit(1);
    }
    const result = await removeRepo(BLOOM_DIR, name);
    if (result.success) {
      console.log(`Removed repository: ${name}`);
    } else {
      console.error(`Failed: ${result.error}`);
      process.exit(1);
    }
  } else if (subCmd === "worktree") {
    await handleWorktreeCommand(args);
  } else {
    console.error("Usage: bloom repo <clone|list|sync|remove|worktree> ...");
    process.exit(1);
  }
}

async function handleWorktreeCommand(args: string[]): Promise<void> {
  const wtCmd = args[2];
  const repoName = args[3];

  if (wtCmd === "add") {
    const branch = args[4];
    if (!repoName || !branch) {
      console.error("Usage: bloom repo worktree add <repo> <branch> [--create]");
      process.exit(1);
    }
    const create = args.includes("--create");
    const result = await addWorktree(BLOOM_DIR, repoName, branch, { create });
    if (result.success) {
      console.log(`Created worktree at: ${result.path}`);
    } else {
      console.error(`Failed: ${result.error}`);
      process.exit(1);
    }
  } else if (wtCmd === "remove") {
    const branch = args[4];
    if (!repoName || !branch) {
      console.error("Usage: bloom repo worktree remove <repo> <branch>");
      process.exit(1);
    }
    const result = await removeWorktree(BLOOM_DIR, repoName, branch);
    if (result.success) {
      console.log(`Removed worktree for branch: ${branch}`);
    } else {
      console.error(`Failed: ${result.error}`);
      process.exit(1);
    }
  } else if (wtCmd === "list") {
    if (!repoName) {
      console.error("Usage: bloom repo worktree list <repo>");
      process.exit(1);
    }
    const worktrees = await listWorktrees(BLOOM_DIR, repoName);
    if (worktrees.length === 0) {
      console.log(`No worktrees found for ${repoName}`);
    } else {
      console.log(`Worktrees for ${repoName}:\n`);
      for (const wt of worktrees) {
        console.log(`  ${wt.branch}`);
        console.log(`    path: ${wt.path}`);
        console.log(`    commit: ${wt.commit.slice(0, 8)}`);
      }
    }
  } else {
    console.error("Usage: bloom repo worktree <add|remove|list> ...");
    process.exit(1);
  }
}

async function handleConfigCommand(args: string[]): Promise<void> {
  if (args[1] === "show" || !args[1]) {
    const userConfig = await loadUserConfig();
    console.log("User config (~/.bloom/config.yaml):\n");
    console.log(`  gitProtocol: ${userConfig.gitProtocol}`);
    console.log(`\nProject repos (bloom.repos.yaml):`);
    const repos = await listRepos(BLOOM_DIR);
    if (repos.length === 0) {
      console.log("  (none)");
    } else {
      for (const repo of repos) {
        console.log(`  - ${repo.name}`);
      }
    }
  } else if (args[1] === "set-protocol") {
    const protocol = args[2];
    if (protocol !== "ssh" && protocol !== "https") {
      console.error("Usage: bloom config set-protocol <ssh|https>");
      process.exit(1);
    }
    await setGitProtocol(protocol);
    console.log(`Git protocol set to: ${protocol}`);
  } else {
    console.error("Usage: bloom config [show|set-protocol <ssh|https>]");
    process.exit(1);
  }
}

async function handleAskCommand(args: string[]): Promise<void> {
  if (!args[1] || !args[2]) {
    console.error("Usage: bloom ask <agent> <question> [options]");
    console.error("Options:");
    console.error("  --task <taskid>     Associate with a task");
    console.error("  --type <type>       Question type: yes_no, open, choice");
    console.error("  --choices <list>    Comma-separated choices for choice questions");
    console.error("  --on-yes <status>   Status to set when answered yes (yes_no questions)");
    console.error("  --on-no <status>    Status to set when answered no (yes_no questions)");
    console.error("  --add-note          Add answer as a note to the task");
    process.exit(1);
  }

  const parseOption = (name: string): string | undefined => {
    const idx = args.indexOf(name);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const taskId = parseOption("--task");
  const questionType = parseOption("--type") as QuestionType | undefined;
  const choicesStr = parseOption("--choices");
  const onYes = parseOption("--on-yes");
  const onNo = parseOption("--on-no");
  const addNote = args.includes("--add-note");

  const choices = choicesStr ? choicesStr.split(",").map((s) => s.trim()) : undefined;

  const optionFlags = ["--task", "--type", "--choices", "--on-yes", "--on-no", "--add-note"];
  const questionParts: string[] = [];
  for (let i = 2; i < args.length; i++) {
    if (optionFlags.includes(args[i]!)) {
      if (args[i] !== "--add-note") i++;
      continue;
    }
    questionParts.push(args[i]!);
  }

  await cmdAsk(args[1], questionParts.join(" "), {
    taskId,
    questionType,
    choices,
    onYes,
    onNo,
    addNote,
  });
}

// =============================================================================
// Entry Point
// =============================================================================

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Re-export for library use
export * from "./commands/context";
export * from "./logger";
export * from "./repos";
export * from "./task-schema";
export * from "./tasks";
export * from "./user-config";
