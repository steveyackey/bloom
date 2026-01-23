// =============================================================================
// Task Commands
// =============================================================================

import chalk from "chalk";
import { createLogger } from "../logger";
import type { Task, TaskStatus } from "../task-schema";
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
  updateTaskStatus,
} from "../tasks";
import { getTasksFile } from "./context";

// Status colors
function colorStatus(status: TaskStatus): string {
  switch (status) {
    case "done":
      return chalk.green(status);
    case "done_pending_merge":
      return chalk.yellow(status);
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
    case "done_pending_merge":
      return chalk.yellow(icon);
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

export async function cmdDashboard(): Promise<void> {
  const renderDashboard = async () => {
    const tasksFile = await loadTasks(getTasksFile());
    console.clear();

    const now = chalk.gray(new Date().toLocaleTimeString());
    console.log(
      `${chalk.bold.cyan("Bloom Dashboard")} ${chalk.dim(`(updated ${now})`)} ${chalk.dim("- Ctrl+C to exit")}\n`
    );

    const stats = {
      todo: 0,
      ready_for_agent: 0,
      assigned: 0,
      in_progress: 0,
      done_pending_merge: 0,
      done: 0,
      blocked: 0,
    };
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
    // Count done_pending_merge as done for progress purposes
    const completedCount = stats.done + stats.done_pending_merge;
    const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    const filledBar = chalk.green("█".repeat(Math.floor(progress / 5)));
    const emptyBar = chalk.gray("░".repeat(20 - Math.floor(progress / 5)));

    const pendingMergeInfo = stats.done_pending_merge > 0 ? `, ${stats.done_pending_merge} pending merge` : "";
    console.log(
      `${chalk.bold("Progress:")} [${filledBar}${emptyBar}] ${chalk.bold.green(`${progress}%`)} ${chalk.dim(`(${completedCount}/${total} done${pendingMergeInfo})`)}`
    );
    console.log(
      `${chalk.bold("Status:")}   ${chalk.cyan(stats.in_progress)} in_progress, ${chalk.blue(stats.assigned)} assigned, ${chalk.yellow(stats.ready_for_agent)} ready, ${chalk.gray(stats.todo)} todo, ${chalk.red(stats.blocked)} blocked\n`
    );

    // Show completion banner when all tasks are done
    if (progress === 100 && total > 0) {
      console.log(chalk.bold.green("═══════════════════════════════════════════════"));
      console.log(chalk.bold.green("   ✓ ALL TASKS COMPLETE! Press q to quit"));
      console.log(chalk.bold.green("═══════════════════════════════════════════════\n"));
    }

    const activeAgents = new Map<string, { task: string; branch?: string }[]>();
    function collectActive(tasks: Task[]) {
      for (const task of tasks) {
        if (task.agent_name && (task.status === "in_progress" || task.status === "assigned")) {
          const existing = activeAgents.get(task.agent_name) || [];
          existing.push({ task: task.id, branch: task.branch });
          activeAgents.set(task.agent_name, existing);
        }
        collectActive(task.subtasks);
      }
    }
    collectActive(tasksFile.tasks);

    if (activeAgents.size > 0) {
      console.log(chalk.bold("Active Agents:"));
      for (const [agent, tasks] of [...activeAgents.entries()].sort()) {
        const taskList = tasks.map((t) => chalk.yellow(t.task)).join(", ");
        const branchInfo = tasks[0]?.branch ? chalk.dim(` [${tasks[0].branch}]`) : "";
        console.log(`  ${chalk.cyan.bold(agent)}: ${taskList}${branchInfo}`);
      }
      console.log();
    }

    console.log(chalk.bold("Tasks:"));
    const byPhase = Map.groupBy(tasksFile.tasks, (t) => t.phase ?? 0);
    for (const [phase, tasks] of [...byPhase.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`\n  ${chalk.bold.magenta(`Phase ${phase}:`)}`);
      for (const task of tasks!) {
        const icon = colorStatusIcon(task.status);
        const agent = task.agent_name ? chalk.dim(` (${task.agent_name})`) : "";
        const branchInfo = task.branch ? chalk.blue(` [${task.branch}]`) : "";
        console.log(`    ${icon} ${chalk.yellow(task.id)}: ${task.title}${agent}${branchInfo}`);

        for (const sub of task.subtasks) {
          const subIcon = colorStatusIcon(sub.status);
          const subAgent = sub.agent_name ? chalk.dim(` (${sub.agent_name})`) : "";
          console.log(`       ${subIcon} ${chalk.yellow(sub.id)}: ${sub.title}${subAgent}`);
        }
      }
    }

    const blocked = allTasks.filter((t) => t.status === "blocked");
    if (blocked.length > 0) {
      console.log(`\n  ${chalk.bold.red("Blocked Tasks:")}`);
      for (const task of blocked) {
        console.log(`    ${chalk.red("✗")} ${chalk.yellow(task.id)}: ${task.title}`);
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

export async function cmdList(status?: TaskStatus): Promise<void> {
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

export async function cmdShow(taskId: string): Promise<void> {
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
  if (task.validation_task_id) console.log(`${chalk.bold("Validation:")}  ${chalk.yellow(task.validation_task_id)}`);
  if (task.checkpoint) console.log(`${chalk.bold("Checkpoint:")}  ${chalk.green("true")}`);
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

export async function cmdNext(agentName?: string): Promise<void> {
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

export async function cmdAgents(): Promise<void> {
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

export async function cmdSetStatus(taskId: string, status: TaskStatus): Promise<void> {
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

  // When a task is marked done, prime any newly-unblocked tasks (including checkpoints)
  if (status === "done") {
    const logger = createLogger("prime");
    await primeTasks(getTasksFile(), tasksFile, logger);
  }
}

export async function cmdAssign(taskId: string, agentName: string): Promise<void> {
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

export async function cmdNote(taskId: string, note: string): Promise<void> {
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

export async function cmdReset(taskIdOrFlag: string): Promise<void> {
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

  if (task.status === "done") {
    console.error(chalk.red(`Cannot reset completed task: ${taskIdOrFlag}`));
    process.exit(1);
  }

  const oldStatus = task.status;
  task.status = "ready_for_agent";
  await saveTasks(getTasksFile(), tasksFile);
  console.log(
    `${chalk.yellow("Reset")} ${chalk.yellow(taskIdOrFlag)}: ${colorStatus(oldStatus)} ${chalk.dim("→")} ${colorStatus("ready_for_agent")}`
  );
}

export async function cmdValidate(): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  let hasErrors = false;

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
      if (task.validation_task_id && !allTaskIds.has(task.validation_task_id)) {
        hasErrors = true;
        console.error(
          chalk.red(`ERROR: Task '${task.id}' has unknown validation_task_id '${task.validation_task_id}'`)
        );
      }
      checkDeps(task.subtasks);
    }
  }
  checkDeps(tasksFile.tasks);

  function hasCycle(taskId: string, visited: Set<string>, stack: Set<string>, tasks: Task[]): boolean {
    const task = findTask(tasks, taskId);
    if (!task) return false;

    visited.add(taskId);
    stack.add(taskId);

    for (const dep of task.depends_on) {
      if (!visited.has(dep)) {
        if (hasCycle(dep, visited, stack, tasks)) return true;
      } else if (stack.has(dep)) {
        return true;
      }
    }

    stack.delete(taskId);
    return false;
  }

  const visited = new Set<string>();
  for (const taskId of allTaskIds) {
    if (!visited.has(taskId)) {
      if (hasCycle(taskId, visited, new Set(), tasksFile.tasks)) {
        hasErrors = true;
        console.error(chalk.red(`ERROR: Circular dependency detected involving task '${taskId}'`));
      }
    }
  }

  if (hasErrors) {
    console.log(`\n${chalk.red.bold("Validation FAILED")}`);
    process.exit(1);
  } else {
    console.log(chalk.green.bold("Validation passed"));

    const stats = {
      todo: 0,
      ready_for_agent: 0,
      assigned: 0,
      in_progress: 0,
      done_pending_merge: 0,
      done: 0,
      blocked: 0,
    };
    let checkpointCount = 0;
    const branchTasks: { taskId: string; repo: string; branch: string; status: TaskStatus }[] = [];

    function countStats(tasks: Task[]) {
      for (const task of tasks) {
        stats[task.status]++;
        if (task.checkpoint === true || task.title.includes("[CHECKPOINT]")) {
          checkpointCount++;
        }
        if (task.branch && task.repo) {
          branchTasks.push({ taskId: task.id, repo: task.repo, branch: task.branch, status: task.status });
        }
        countStats(task.subtasks);
      }
    }
    countStats(tasksFile.tasks);

    console.log(`\n${chalk.bold("Task summary:")}`);
    console.log(
      `  ${chalk.green(stats.done)} done, ${chalk.yellow(stats.done_pending_merge)} pending merge, ${chalk.cyan(stats.in_progress)} in_progress, ${chalk.blue(stats.assigned)} assigned`
    );
    console.log(
      `  ${chalk.yellow(stats.ready_for_agent)} ready, ${chalk.gray(stats.todo)} todo, ${chalk.red(stats.blocked)} blocked`
    );
    console.log(`  ${chalk.magenta(checkpointCount)} checkpoint${checkpointCount !== 1 ? "s" : ""}`);

    // Show branch information with worktree paths
    if (branchTasks.length > 0) {
      console.log(`\n${chalk.bold("Branch locations:")}`);
      // Group by repo for cleaner display
      const byRepo = Map.groupBy(branchTasks, (t) => t.repo);
      for (const [repo, tasks] of [...byRepo.entries()].sort()) {
        console.log(`  ${chalk.blue(repo)}:`);
        // Sort by status: in_progress first, then assigned, then rest
        const sorted = tasks!.sort((a, b) => {
          const order = {
            in_progress: 0,
            assigned: 1,
            ready_for_agent: 2,
            todo: 3,
            done_pending_merge: 4,
            done: 5,
            blocked: 6,
          };
          return order[a.status] - order[b.status];
        });
        for (const { taskId, branch, status } of sorted) {
          // Sanitize branch for filesystem path (slashes -> hyphens)
          const safeBranch = branch.replace(/\//g, "-");
          const worktreePath = `repos/${repo}/${safeBranch}`;
          const statusIndicator = colorStatus(status);
          console.log(`    ${chalk.yellow(taskId)}: ${chalk.cyan(branch)} [${statusIndicator}]`);
          console.log(`      ${chalk.dim("cd")} ${worktreePath}`);
        }
      }
    }
  }
}
