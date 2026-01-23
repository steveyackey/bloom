// =============================================================================
// Tasks Feature - Task management commands
// =============================================================================

import chalk from "chalk";
import type { Clerc } from "clerc";
import { getTasksFile } from "../../core/context";
import { createLogger } from "../../core/logger";
import { askQuestion } from "../../core/questions";
import {
  findTask,
  getAllAgents,
  getAvailableTasks,
  getStatusIcon,
  getTasksByAgent,
  getTasksByStatus,
  loadTasks,
  primeTasks,
  saveTasks,
  type Task,
  type TaskStatus,
  updateTaskStatus,
} from "../../core/tasks";

// =============================================================================
// Status Formatting
// =============================================================================

function colorStatus(status: TaskStatus): string {
  switch (status) {
    case "done":
      return chalk.green(status);
    case "in_progress":
      return chalk.cyan(status);
    case "assigned":
      return chalk.blue(status);
    case "ready_for_agent":
      return chalk.yellow(status);
    case "blocked":
      return chalk.red(status);
    case "todo":
      return chalk.gray(status);
    default:
      return status;
  }
}

function colorStatusIcon(status: TaskStatus): string {
  const icon = getStatusIcon(status);
  switch (status) {
    case "done":
      return chalk.green(icon);
    case "in_progress":
      return chalk.cyan(icon);
    case "assigned":
      return chalk.blue(icon);
    case "ready_for_agent":
      return chalk.yellow(icon);
    case "blocked":
      return chalk.red(icon);
    case "todo":
      return chalk.gray(icon);
    default:
      return icon;
  }
}

// =============================================================================
// Completions
// =============================================================================

function getTaskIdsSync(): string[] {
  const fs = require("node:fs");
  const YAML = require("yaml");

  const tasksFile = getTasksFile();
  if (!fs.existsSync(tasksFile)) return [];

  try {
    const content = fs.readFileSync(tasksFile, "utf-8");
    const parsed = YAML.parse(content);

    const ids: string[] = [];
    function collectIds(tasks: Task[]) {
      for (const task of tasks || []) {
        ids.push(task.id);
        collectIds(task.subtasks);
      }
    }
    collectIds(parsed?.tasks || []);
    return ids;
  } catch {
    return [];
  }
}

function getAgentNamesSync(): string[] {
  const fs = require("node:fs");
  const YAML = require("yaml");

  const tasksFile = getTasksFile();
  if (!fs.existsSync(tasksFile)) return [];

  try {
    const content = fs.readFileSync(tasksFile, "utf-8");
    const parsed = YAML.parse(content);

    const agents = new Set<string>();
    function collect(tasks: Task[]) {
      for (const task of tasks || []) {
        if (task.agent_name) agents.add(task.agent_name);
        collect(task.subtasks);
      }
    }
    collect(parsed?.tasks || []);
    return [...agents];
  } catch {
    return [];
  }
}

const taskIdCompletions = (complete: (value: string, description: string) => void) => {
  for (const id of getTaskIdsSync()) {
    complete(id, "Task ID");
  }
};

const agentCompletions = (complete: (value: string, description: string) => void) => {
  for (const agent of getAgentNamesSync()) {
    complete(agent, "Agent");
  }
};

const statusCompletions = (complete: (value: string, description: string) => void) => {
  const statuses: TaskStatus[] = ["todo", "ready_for_agent", "assigned", "in_progress", "done", "blocked"];
  for (const status of statuses) {
    complete(status, "Task status");
  }
};

// =============================================================================
// Command Implementations
// =============================================================================

async function cmdList(status?: TaskStatus): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());

  if (status) {
    const tasks = getTasksByStatus(tasksFile.tasks, status);
    console.log(`${chalk.bold("Tasks with status")} ${colorStatus(status)}:`);
    for (const task of tasks) {
      console.log(`  ${chalk.yellow(task.id)}: ${task.title}`);
    }
    return;
  }

  const byPhase = Map.groupBy(tasksFile.tasks, (t) => t.phase ?? 0);
  for (const [phase, tasks] of [...byPhase.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(chalk.bold.magenta(`Phase ${phase}:`));
    for (const task of tasks!) {
      console.log(`  [${colorStatus(task.status)}] ${chalk.yellow(task.id)}: ${task.title}`);
      for (const sub of task.subtasks) {
        console.log(`    [${colorStatus(sub.status)}] ${chalk.yellow(sub.id)}: ${sub.title}`);
      }
    }
  }
}

async function cmdShow(taskId: string): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  const task = findTask(tasksFile.tasks, taskId);

  if (!task) {
    console.error(chalk.red(`Task not found: ${taskId}`));
    process.exit(1);
  }

  console.log(`${chalk.bold("ID:")}          ${chalk.yellow(task.id)}`);
  console.log(`${chalk.bold("Title:")}       ${task.title}`);
  console.log(`${chalk.bold("Status:")}      ${colorStatus(task.status)}`);
  if (task.phase) console.log(`${chalk.bold("Phase:")}       ${chalk.magenta(task.phase)}`);
  if (task.repo) console.log(`${chalk.bold("Repo:")}        ${chalk.blue(task.repo)}`);
  if (task.branch) console.log(`${chalk.bold("Branch:")}      ${chalk.blue(task.branch)}`);
  if (task.agent_name) console.log(`${chalk.bold("Agent:")}       ${chalk.cyan(task.agent_name)}`);
  if (task.depends_on.length)
    console.log(`${chalk.bold("Depends on:")}  ${task.depends_on.map((d) => chalk.yellow(d)).join(", ")}`);
  if (task.instructions) console.log(`\n${chalk.bold("Instructions:")}\n${chalk.dim(task.instructions)}`);
  if (task.acceptance_criteria.length) {
    console.log(`\n${chalk.bold("Acceptance Criteria:")}`);
    for (const c of task.acceptance_criteria) console.log(`  ${chalk.green("•")} ${c}`);
  }
  if (task.ai_notes.length) {
    console.log(`\n${chalk.bold("AI Notes:")}`);
    for (const n of task.ai_notes) console.log(`  ${chalk.cyan("•")} ${n}`);
  }
  if (task.subtasks.length) {
    console.log(`\n${chalk.bold("Subtasks:")}`);
    for (const sub of task.subtasks)
      console.log(`  [${colorStatus(sub.status)}] ${chalk.yellow(sub.id)}: ${sub.title}`);
  }
}

async function cmdDashboard(): Promise<void> {
  const renderDashboard = async () => {
    const tasksFile = await loadTasks(getTasksFile());
    console.clear();

    const now = chalk.gray(new Date().toLocaleTimeString());
    console.log(
      `${chalk.bold.cyan("Bloom Dashboard")} ${chalk.dim(`(updated ${now})`)} ${chalk.dim("- Ctrl+C to exit")}\n`
    );

    const stats = { todo: 0, ready_for_agent: 0, assigned: 0, in_progress: 0, done: 0, blocked: 0 };
    const allTasks: Task[] = [];
    function collectAll(tasks: Task[]) {
      for (const task of tasks) {
        stats[task.status]++;
        allTasks.push(task);
        collectAll(task.subtasks);
      }
    }
    collectAll(tasksFile.tasks);

    const total = allTasks.length;
    const progress = total > 0 ? Math.round((stats.done / total) * 100) : 0;
    const filledBar = chalk.green("█".repeat(Math.floor(progress / 5)));
    const emptyBar = chalk.gray("░".repeat(20 - Math.floor(progress / 5)));

    console.log(
      `${chalk.bold("Progress:")} [${filledBar}${emptyBar}] ${chalk.bold.green(`${progress}%`)} ${chalk.dim(`(${stats.done}/${total} done)`)}`
    );
    console.log(
      `${chalk.bold("Status:")}   ${chalk.cyan(stats.in_progress)} in_progress, ${chalk.blue(stats.assigned)} assigned, ${chalk.yellow(stats.ready_for_agent)} ready, ${chalk.gray(stats.todo)} todo, ${chalk.red(stats.blocked)} blocked\n`
    );

    if (progress === 100 && total > 0) {
      console.log(chalk.bold.green("═══════════════════════════════════════════════"));
      console.log(chalk.bold.green("   ✓ ALL TASKS COMPLETE!"));
      console.log(chalk.bold.green("═══════════════════════════════════════════════\n"));
    }

    console.log(chalk.bold("Tasks:"));
    const byPhase = Map.groupBy(tasksFile.tasks, (t) => t.phase ?? 0);
    for (const [phase, tasks] of [...byPhase.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`\n  ${chalk.bold.magenta(`Phase ${phase}:`)}`);
      for (const task of tasks!) {
        const icon = colorStatusIcon(task.status);
        const agent = task.agent_name ? chalk.dim(` (${task.agent_name})`) : "";
        console.log(`    ${icon} ${chalk.yellow(task.id)}: ${task.title}${agent}`);
      }
    }
  };

  await renderDashboard();
  setInterval(async () => {
    try {
      await renderDashboard();
    } catch {}
  }, 10000);
}

async function cmdNext(agentName?: string): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  const available = getAvailableTasks(tasksFile.tasks, agentName);

  if (available.length === 0) {
    console.log(chalk.dim(agentName ? `No available tasks for agent: ${agentName}` : "No available tasks"));
    return;
  }

  console.log(chalk.bold(agentName ? `Available tasks for ${chalk.cyan(agentName)}:` : "Available tasks:"));
  for (const task of available) {
    console.log(`  ${chalk.yellow(task.id)}: ${task.title}`);
  }
}

async function cmdSetStatus(taskId: string, status: TaskStatus): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  const task = findTask(tasksFile.tasks, taskId);

  if (!task) {
    console.error(chalk.red(`Task not found: ${taskId}`));
    process.exit(1);
  }

  const oldStatus = task.status;
  updateTaskStatus(tasksFile.tasks, taskId, status);
  await saveTasks(getTasksFile(), tasksFile);
  console.log(`${chalk.yellow(taskId)}: ${colorStatus(oldStatus)} ${chalk.dim("→")} ${colorStatus(status)}`);

  if (status === "done") {
    const logger = createLogger("prime");
    await primeTasks(getTasksFile(), tasksFile, logger, askQuestion);
  }
}

async function cmdAssign(taskId: string, agentName: string): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  const task = findTask(tasksFile.tasks, taskId);

  if (!task) {
    console.error(chalk.red(`Task not found: ${taskId}`));
    process.exit(1);
  }

  updateTaskStatus(tasksFile.tasks, taskId, "assigned", agentName);
  await saveTasks(getTasksFile(), tasksFile);
  console.log(`${chalk.green("Assigned")} ${chalk.yellow(taskId)} to ${chalk.cyan(agentName)}`);
}

async function cmdNote(taskId: string, note: string): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  const task = findTask(tasksFile.tasks, taskId);

  if (!task) {
    console.error(chalk.red(`Task not found: ${taskId}`));
    process.exit(1);
  }

  task.ai_notes.push(note);
  await saveTasks(getTasksFile(), tasksFile);
  console.log(`${chalk.green("Added note to")} ${chalk.yellow(taskId)}`);
}

async function cmdReset(taskIdOrFlag: string): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());

  if (taskIdOrFlag === "--stuck" || taskIdOrFlag === "-s") {
    let resetCount = 0;
    function resetStuckLocal(taskList: Task[]) {
      for (const task of taskList) {
        if (task.status === "in_progress" || task.status === "blocked") {
          task.status = "ready_for_agent";
          resetCount++;
          console.log(`${chalk.yellow("Reset:")} ${chalk.yellow(task.id)}`);
        }
        resetStuckLocal(task.subtasks);
      }
    }
    resetStuckLocal(tasksFile.tasks);

    if (resetCount === 0) {
      console.log(chalk.dim("No stuck tasks found"));
    } else {
      await saveTasks(getTasksFile(), tasksFile);
      console.log(`\n${chalk.green(`Reset ${resetCount} task(s)`)} to ${colorStatus("ready_for_agent")}`);
    }
    return;
  }

  const task = findTask(tasksFile.tasks, taskIdOrFlag);
  if (!task) {
    console.error(chalk.red(`Task not found: ${taskIdOrFlag}`));
    process.exit(1);
  }

  const oldStatus = task.status;
  task.status = "ready_for_agent";
  await saveTasks(getTasksFile(), tasksFile);
  console.log(
    `${chalk.yellow("Reset")} ${chalk.yellow(taskIdOrFlag)}: ${colorStatus(oldStatus)} ${chalk.dim("→")} ${colorStatus("ready_for_agent")}`
  );
}

async function cmdValidate(): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  let hasErrors = false;

  // Check for branch conflicts
  const branchAgents = new Map<string, { taskId: string; agent: string }[]>();
  function collectBranches(tasks: Task[]) {
    for (const task of tasks) {
      if (task.branch && task.agent_name && (task.status === "in_progress" || task.status === "assigned")) {
        const existing = branchAgents.get(task.branch) || [];
        existing.push({ taskId: task.id, agent: task.agent_name });
        branchAgents.set(task.branch, existing);
      }
      collectBranches(task.subtasks);
    }
  }
  collectBranches(tasksFile.tasks);

  for (const [branch, agents] of branchAgents) {
    const uniqueAgents = new Set(agents.map((a) => a.agent));
    if (uniqueAgents.size > 1) {
      hasErrors = true;
      console.error(chalk.red(`ERROR: Multiple agents on branch '${branch}':`));
      for (const { taskId, agent } of agents) {
        console.error(chalk.red(`  - ${agent} (task: ${taskId})`));
      }
    }
  }

  // Check for invalid dependencies
  const allTaskIds = new Set<string>();
  function collectIds(tasks: Task[]) {
    for (const task of tasks) {
      allTaskIds.add(task.id);
      collectIds(task.subtasks);
    }
  }
  collectIds(tasksFile.tasks);

  function checkDeps(tasks: Task[]) {
    for (const task of tasks) {
      for (const dep of task.depends_on) {
        if (!allTaskIds.has(dep)) {
          hasErrors = true;
          console.error(chalk.red(`ERROR: Task '${task.id}' depends on unknown task '${dep}'`));
        }
      }
      checkDeps(task.subtasks);
    }
  }
  checkDeps(tasksFile.tasks);

  if (hasErrors) {
    console.log(`\n${chalk.red.bold("Validation FAILED")}`);
    process.exit(1);
  } else {
    console.log(chalk.green.bold("Validation passed"));
  }
}

async function cmdAgents(): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  const agents = getAllAgents(tasksFile.tasks);

  if (agents.size === 0) {
    console.log(chalk.dim("No agents assigned"));
    return;
  }

  console.log(chalk.bold("Agents:"));
  for (const agent of [...agents].sort()) {
    const tasks = getTasksByAgent(tasksFile.tasks, agent);
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const assigned = tasks.filter((t) => t.status === "assigned").length;
    const done = tasks.filter((t) => t.status === "done").length;
    console.log(
      `  ${chalk.cyan.bold(agent)}: ${chalk.cyan(inProgress)} in_progress, ${chalk.blue(assigned)} assigned, ${chalk.green(done)} done`
    );
  }
}

// =============================================================================
// CLI Registration
// =============================================================================

export function register(cli: Clerc): Clerc {
  return cli
    .command("list", "List tasks, optionally filtered by status", {
      parameters: [{ key: "[status]", description: "Filter by status", completions: { handler: statusCompletions } }],
      help: { group: "monitor" },
    })
    .on("list", async (ctx) => {
      await cmdList(ctx.parameters.status as TaskStatus | undefined);
    })

    .command("show", "Show task details", {
      parameters: [{ key: "<taskid>", description: "Task ID", completions: { handler: taskIdCompletions } }],
      help: { group: "tasks" },
    })
    .on("show", async (ctx) => {
      await cmdShow(ctx.parameters.taskid as string);
    })

    .command("dashboard", "Live dashboard showing task progress", {
      help: { group: "monitor" },
    })
    .on("dashboard", async () => {
      await cmdDashboard();
    })

    .command("validate", "Validate tasks file for errors", {
      help: { group: "monitor" },
    })
    .on("validate", async () => {
      await cmdValidate();
    })

    .command("next", "Show available tasks (ready to start)", {
      parameters: [{ key: "[agent]", description: "Filter by agent", completions: { handler: agentCompletions } }],
      help: { group: "tasks" },
    })
    .on("next", async (ctx) => {
      await cmdNext(ctx.parameters.agent as string | undefined);
    })

    .command("ready", "Mark task as ready for agent", {
      parameters: [{ key: "<taskid>", description: "Task ID", completions: { handler: taskIdCompletions } }],
      help: { group: "tasks" },
    })
    .on("ready", async (ctx) => {
      await cmdSetStatus(ctx.parameters.taskid as string, "ready_for_agent");
    })

    .command("start", "Mark task as in progress", {
      parameters: [{ key: "<taskid>", description: "Task ID", completions: { handler: taskIdCompletions } }],
      help: { group: "tasks" },
    })
    .on("start", async (ctx) => {
      await cmdSetStatus(ctx.parameters.taskid as string, "in_progress");
    })

    .command("done", "Mark task as done", {
      parameters: [{ key: "<taskid>", description: "Task ID", completions: { handler: taskIdCompletions } }],
      help: { group: "tasks" },
    })
    .on("done", async (ctx) => {
      await cmdSetStatus(ctx.parameters.taskid as string, "done");
    })

    .command("block", "Mark task as blocked", {
      parameters: [{ key: "<taskid>", description: "Task ID", completions: { handler: taskIdCompletions } }],
      help: { group: "tasks" },
    })
    .on("block", async (ctx) => {
      await cmdSetStatus(ctx.parameters.taskid as string, "blocked");
    })

    .command("todo", "Mark task as todo", {
      parameters: [{ key: "<taskid>", description: "Task ID", completions: { handler: taskIdCompletions } }],
      help: { group: "tasks" },
    })
    .on("todo", async (ctx) => {
      await cmdSetStatus(ctx.parameters.taskid as string, "todo");
    })

    .command("assign", "Assign task to an agent", {
      parameters: [
        { key: "<taskid>", description: "Task ID", completions: { handler: taskIdCompletions } },
        { key: "<agent>", description: "Agent name", completions: { handler: agentCompletions } },
      ],
      help: { group: "tasks" },
    })
    .on("assign", async (ctx) => {
      await cmdAssign(ctx.parameters.taskid as string, ctx.parameters.agent as string);
    })

    .command("note", "Add a note to a task", {
      parameters: [
        { key: "<taskid>", description: "Task ID", completions: { handler: taskIdCompletions } },
        { key: "<note...>", description: "Note text" },
      ],
      help: { group: "tasks" },
    })
    .on("note", async (ctx) => {
      const noteText = Array.isArray(ctx.parameters.note)
        ? (ctx.parameters.note as string[]).join(" ")
        : (ctx.parameters.note as string);
      await cmdNote(ctx.parameters.taskid as string, noteText);
    })

    .command("reset", "Reset task to ready_for_agent", {
      parameters: [{ key: "[taskid]", description: "Task ID", completions: { handler: taskIdCompletions } }],
      flags: { stuck: { type: Boolean, short: "s", description: "Reset all stuck tasks" } },
      help: { group: "tasks" },
    })
    .on("reset", async (ctx) => {
      if (ctx.flags.stuck) {
        await cmdReset("--stuck");
      } else if (ctx.parameters.taskid) {
        await cmdReset(ctx.parameters.taskid as string);
      } else {
        console.error("Error: Either provide a task ID or use --stuck flag");
        process.exit(1);
      }
    })

    .command("agent list", "List all agents", { alias: "agents", help: { group: "tasks" } })
    .on("agent list", async () => {
      await cmdAgents();
    });
}
