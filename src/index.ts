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
  cmdCreate,
  cmdDashboard,
  cmdGenerate,
  cmdInit,
  cmdInterjectDismiss,
  cmdInterjections,
  cmdInterjectResume,
  cmdList,
  cmdNext,
  cmdNote,
  cmdPlan,
  cmdQuestions,
  cmdQuestionsDashboard,
  cmdRefine,
  cmdReset,
  cmdSetStatus,
  cmdShow,
  cmdValidate,
  cmdWaitAnswer,
  runAgentWorkLoop,
  setTasksFile,
  startOrchestrator,
} from "./commands";
import { handleConfigCommand } from "./commands/config-cli";
import { printUsage } from "./commands/help";
import { handleRepoCommand } from "./commands/repos-cli";
import type { QuestionType } from "./human-queue";
import { type LogLevel, setLogLevel } from "./logger";
import { listRepos, syncRepos } from "./repos";
import type { TaskStatus } from "./task-schema";
import { VERSION } from "./version";

// =============================================================================
// CLI Argument Parser
// =============================================================================

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
// Ask Command Handler (inline - small and uses local imports)
// =============================================================================

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
// Main
// =============================================================================

export async function main(): Promise<void> {
  const { tasksFile: tasksFileArg, logLevel, args } = parseArgs(process.argv.slice(2));

  if (logLevel) {
    setLogLevel(logLevel);
  }

  if (tasksFileArg) {
    setTasksFile(resolve(tasksFileArg));
  }

  const cmd = args[0];

  switch (cmd) {
    case "init":
      await cmdInit();
      break;

    case "create":
      await cmdCreate(args[1] || "");
      break;

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
      await cmdPlan();
      break;

    case "refine":
      await cmdRefine();
      break;

    case "generate":
      await cmdGenerate();
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

    case "version":
    case "--version":
    case "-V":
      console.log(`bloom ${VERSION}`);
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
// Library Exports
// =============================================================================

export * from "./commands/context";
export * from "./logger";
export * from "./repos";
export * from "./task-schema";
export * from "./tasks";
export * from "./user-config";
