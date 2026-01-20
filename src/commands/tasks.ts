// =============================================================================
// Task Commands
// =============================================================================

import type { Task, TaskStatus } from "../task-schema";
import {
  findTask,
  formatTask,
  getAllAgents,
  getAvailableTasks,
  getStatusIcon,
  getTasksByAgent,
  getTasksByStatus,
  loadTasks,
  saveTasks,
  updateTaskStatus,
} from "../tasks";
import { getTasksFile } from "./context";

export async function cmdDashboard(): Promise<void> {
  const renderDashboard = async () => {
    const tasksFile = await loadTasks(getTasksFile());
    console.clear();

    const now = new Date().toLocaleTimeString();
    console.log(`Bloom Dashboard (updated ${now}) - Ctrl+C to exit\n`);

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
    const progressBar = "█".repeat(Math.floor(progress / 5)) + "░".repeat(20 - Math.floor(progress / 5));

    console.log(`Progress: [${progressBar}] ${progress}% (${stats.done}/${total} done)`);
    console.log(
      `Status:   ${stats.in_progress} in_progress, ${stats.assigned} assigned, ${stats.ready_for_agent} ready, ${stats.todo} todo, ${stats.blocked} blocked\n`
    );

    const activeAgents = new Map<string, { task: string; worktree?: string }[]>();
    function collectActive(tasks: Task[]) {
      for (const task of tasks) {
        if (task.agent_name && (task.status === "in_progress" || task.status === "assigned")) {
          const existing = activeAgents.get(task.agent_name) || [];
          existing.push({ task: task.id, worktree: task.worktree });
          activeAgents.set(task.agent_name, existing);
        }
        collectActive(task.subtasks);
      }
    }
    collectActive(tasksFile.tasks);

    if (activeAgents.size > 0) {
      console.log("Active Agents:");
      for (const [agent, tasks] of [...activeAgents.entries()].sort()) {
        const taskList = tasks.map((t) => t.task).join(", ");
        const worktree = tasks[0]?.worktree ? ` [${tasks[0].worktree}]` : "";
        console.log(`  ${agent}: ${taskList}${worktree}`);
      }
      console.log();
    }

    console.log("Tasks:");
    const byPhase = Map.groupBy(tasksFile.tasks, (t) => t.phase ?? 0);
    for (const [phase, tasks] of [...byPhase.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`\n  Phase ${phase}:`);
      for (const task of tasks!) {
        const icon = getStatusIcon(task.status);
        const agent = task.agent_name ? ` (${task.agent_name})` : "";
        const worktree = task.worktree ? ` [${task.worktree}]` : "";
        console.log(`    ${icon} ${task.id}: ${task.title}${agent}${worktree}`);

        for (const sub of task.subtasks) {
          const subIcon = getStatusIcon(sub.status);
          const subAgent = sub.agent_name ? ` (${sub.agent_name})` : "";
          console.log(`       ${subIcon} ${sub.id}: ${sub.title}${subAgent}`);
        }
      }
    }

    const blocked = allTasks.filter((t) => t.status === "blocked");
    if (blocked.length > 0) {
      console.log("\n  Blocked Tasks:");
      for (const task of blocked) {
        console.log(`    ${task.id}: ${task.title}`);
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
    console.log(`Tasks with status '${status}':`);
    for (const task of tasks) {
      console.log(formatTask(task, "  "));
    }
    return;
  }

  const byPhase = Map.groupBy(tasksFile.tasks, (t) => t.phase ?? 0);
  for (const [phase, tasks] of [...byPhase.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`Phase ${phase}:`);
    for (const task of tasks!) {
      console.log(`  [${task.status}] ${formatTask(task)}`);
      for (const sub of task.subtasks) {
        console.log(`    [${sub.status}] ${formatTask(sub)}`);
      }
    }
  }
}

export async function cmdShow(taskId: string): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  const task = findTask(tasksFile.tasks, taskId);

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  console.log(`ID:          ${task.id}`);
  console.log(`Title:       ${task.title}`);
  console.log(`Status:      ${task.status}`);
  if (task.phase) console.log(`Phase:       ${task.phase}`);
  if (task.repo) console.log(`Repo:        ${task.repo}`);
  if (task.worktree) console.log(`Worktree:    ${task.worktree}`);
  if (task.agent_name) console.log(`Agent:       ${task.agent_name}`);
  if (task.depends_on.length) console.log(`Depends on:  ${task.depends_on.join(", ")}`);
  if (task.validation_task_id) console.log(`Validation:  ${task.validation_task_id}`);
  if (task.instructions) console.log(`\nInstructions:\n${task.instructions}`);
  if (task.acceptance_criteria.length) {
    console.log(`\nAcceptance Criteria:`);
    for (const c of task.acceptance_criteria) console.log(`  - ${c}`);
  }
  if (task.ai_notes.length) {
    console.log(`\nAI Notes:`);
    for (const n of task.ai_notes) console.log(`  - ${n}`);
  }
  if (task.subtasks.length) {
    console.log(`\nSubtasks:`);
    for (const sub of task.subtasks) console.log(`  [${sub.status}] ${sub.id}: ${sub.title}`);
  }
}

export async function cmdNext(agentName?: string): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  const available = getAvailableTasks(tasksFile.tasks, agentName);

  if (available.length === 0) {
    console.log(agentName ? `No available tasks for agent: ${agentName}` : "No available tasks");
    return;
  }

  console.log(agentName ? `Available tasks for ${agentName}:` : "Available tasks:");
  for (const task of available) {
    console.log(formatTask(task, "  "));
  }
}

export async function cmdAgents(): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  const agents = getAllAgents(tasksFile.tasks);

  if (agents.size === 0) {
    console.log("No agents assigned");
    return;
  }

  console.log("Agents:");
  for (const agent of [...agents].sort()) {
    const tasks = getTasksByAgent(tasksFile.tasks, agent);
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const assigned = tasks.filter((t) => t.status === "assigned").length;
    const done = tasks.filter((t) => t.status === "done").length;
    console.log(`  ${agent}: ${inProgress} in_progress, ${assigned} assigned, ${done} done`);
  }
}

export async function cmdSetStatus(taskId: string, status: TaskStatus): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  const task = findTask(tasksFile.tasks, taskId);

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  const oldStatus = task.status;
  updateTaskStatus(tasksFile.tasks, taskId, status);
  await saveTasks(getTasksFile(), tasksFile);
  console.log(`${taskId}: ${oldStatus} → ${status}`);
}

export async function cmdAssign(taskId: string, agentName: string): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  const task = findTask(tasksFile.tasks, taskId);

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  updateTaskStatus(tasksFile.tasks, taskId, "assigned", agentName);
  await saveTasks(getTasksFile(), tasksFile);
  console.log(`Assigned ${taskId} to ${agentName}`);
}

export async function cmdNote(taskId: string, note: string): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  const task = findTask(tasksFile.tasks, taskId);

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  task.ai_notes.push(note);
  await saveTasks(getTasksFile(), tasksFile);
  console.log(`Added note to ${taskId}`);
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
          console.log(`Reset: ${task.id}`);
        }
        resetStuckLocal(task.subtasks);
      }
    }
    resetStuckLocal(tasksFile.tasks);

    if (resetCount === 0) {
      console.log("No stuck tasks found");
    } else {
      await saveTasks(getTasksFile(), tasksFile);
      console.log(`\nReset ${resetCount} task(s) to ready_for_agent`);
    }
    return;
  }

  const task = findTask(tasksFile.tasks, taskIdOrFlag);
  if (!task) {
    console.error(`Task not found: ${taskIdOrFlag}`);
    process.exit(1);
  }

  if (task.status === "done") {
    console.error(`Cannot reset completed task: ${taskIdOrFlag}`);
    process.exit(1);
  }

  const oldStatus = task.status;
  task.status = "ready_for_agent";
  await saveTasks(getTasksFile(), tasksFile);
  console.log(`Reset ${taskIdOrFlag}: ${oldStatus} -> ready_for_agent`);
}

export async function cmdValidate(): Promise<void> {
  const tasksFile = await loadTasks(getTasksFile());
  let hasErrors = false;

  const worktreeAgents = new Map<string, { taskId: string; agent: string }[]>();

  function collectWorktrees(tasks: Task[]) {
    for (const task of tasks) {
      if (task.worktree && task.agent_name && (task.status === "in_progress" || task.status === "assigned")) {
        const existing = worktreeAgents.get(task.worktree) || [];
        existing.push({ taskId: task.id, agent: task.agent_name });
        worktreeAgents.set(task.worktree, existing);
      }
      collectWorktrees(task.subtasks);
    }
  }
  collectWorktrees(tasksFile.tasks);

  for (const [worktree, agents] of worktreeAgents) {
    const uniqueAgents = new Set(agents.map((a) => a.agent));
    if (uniqueAgents.size > 1) {
      hasErrors = true;
      console.error(`ERROR: Multiple agents in worktree '${worktree}':`);
      for (const { taskId, agent } of agents) {
        console.error(`  - ${agent} (task: ${taskId})`);
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
          console.error(`ERROR: Task '${task.id}' depends on unknown task '${dep}'`);
        }
      }
      if (task.validation_task_id && !allTaskIds.has(task.validation_task_id)) {
        hasErrors = true;
        console.error(`ERROR: Task '${task.id}' has unknown validation_task_id '${task.validation_task_id}'`);
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
        console.error(`ERROR: Circular dependency detected involving task '${taskId}'`);
      }
    }
  }

  if (hasErrors) {
    console.log("\nValidation FAILED");
    process.exit(1);
  } else {
    console.log("Validation passed");

    const stats = { todo: 0, ready_for_agent: 0, assigned: 0, in_progress: 0, done: 0, blocked: 0 };
    function countStats(tasks: Task[]) {
      for (const task of tasks) {
        stats[task.status]++;
        countStats(task.subtasks);
      }
    }
    countStats(tasksFile.tasks);

    console.log(`\nTask summary:`);
    console.log(`  ${stats.done} done, ${stats.in_progress} in_progress, ${stats.assigned} assigned`);
    console.log(`  ${stats.ready_for_agent} ready, ${stats.todo} todo, ${stats.blocked} blocked`);
  }
}
