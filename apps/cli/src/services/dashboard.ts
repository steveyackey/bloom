// =============================================================================
// Dashboard Service
// =============================================================================
// Renders the task dashboard for terminal output.

import { type FSWatcher, watch } from "node:fs";
import chalk from "chalk";
import type { Task, TaskStatus, TasksFile } from "../task-schema";
import { getStatusIcon, loadTasks } from "../tasks";

/**
 * A service that runs in-process and writes to a terminal.
 */
export interface InProcessService {
  /** Start the service, returns a cleanup function */
  start(write: (data: string) => void, scheduleRender: () => void): () => void;
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

/**
 * Render the dashboard to a string (for terminal output).
 * Uses \r\n line endings for proper terminal display.
 */
function renderDashboard(tasksFile: TasksFile): string {
  const lines: string[] = [];

  const now = chalk.gray(new Date().toLocaleTimeString());
  lines.push(`${chalk.bold.cyan("Bloom Dashboard")} ${chalk.dim(`(updated ${now})`)}`);
  lines.push("");

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
  const filledBar = chalk.green("\u2588".repeat(Math.floor(progress / 5)));
  const emptyBar = chalk.gray("\u2591".repeat(20 - Math.floor(progress / 5)));

  const pendingMergeInfo = stats.done_pending_merge > 0 ? `, ${stats.done_pending_merge} pending merge` : "";
  lines.push(
    `${chalk.bold("Progress:")} [${filledBar}${emptyBar}] ${chalk.bold.green(`${progress}%`)} ${chalk.dim(`(${completedCount}/${total} done${pendingMergeInfo})`)}`
  );
  lines.push(
    `${chalk.bold("Status:")}   ${chalk.cyan(stats.in_progress)} in_progress, ${chalk.blue(stats.assigned)} assigned, ${chalk.yellow(stats.ready_for_agent)} ready, ${chalk.gray(stats.todo)} todo, ${chalk.red(stats.blocked)} blocked`
  );
  lines.push("");

  // Show completion banner when all tasks are done
  if (progress === 100 && total > 0) {
    lines.push(chalk.bold.green("\u2550".repeat(47)));
    lines.push(chalk.bold.green("   \u2713 ALL TASKS COMPLETE! Press q to quit"));
    lines.push(chalk.bold.green("\u2550".repeat(47)));
    lines.push("");
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
    lines.push(chalk.bold("Active Agents:"));
    for (const [agent, tasks] of [...activeAgents.entries()].sort()) {
      const taskList = tasks.map((t) => chalk.yellow(t.task)).join(", ");
      const branchInfo = tasks[0]?.branch ? chalk.dim(` [${tasks[0].branch}]`) : "";
      lines.push(`  ${chalk.cyan.bold(agent)}: ${taskList}${branchInfo}`);
    }
    lines.push("");
  }

  lines.push(chalk.bold("Tasks:"));
  const byPhase = Map.groupBy(tasksFile.tasks, (t) => t.phase ?? 0);
  for (const [phase, tasks] of [...byPhase.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push("");
    lines.push(`  ${chalk.bold.magenta(`Phase ${phase}:`)}`);
    for (const task of tasks!) {
      const icon = colorStatusIcon(task.status);
      const agent = task.agent_name ? chalk.dim(` (${task.agent_name})`) : "";
      const branchInfo = task.branch ? chalk.blue(` [${task.branch}]`) : "";
      lines.push(`    ${icon} ${chalk.yellow(task.id)}: ${task.title}${agent}${branchInfo}`);

      for (const sub of task.subtasks) {
        const subIcon = colorStatusIcon(sub.status);
        const subAgent = sub.agent_name ? chalk.dim(` (${sub.agent_name})`) : "";
        lines.push(`       ${subIcon} ${chalk.yellow(sub.id)}: ${sub.title}${subAgent}`);
      }
    }
  }

  const blocked = allTasks.filter((t) => t.status === "blocked");
  if (blocked.length > 0) {
    lines.push("");
    lines.push(`  ${chalk.bold.red("Blocked Tasks:")}`);
    for (const task of blocked) {
      lines.push(`    ${chalk.red("\u2717")} ${chalk.yellow(task.id)}: ${task.title}`);
    }
  }

  return lines.join("\r\n");
}

/**
 * Create a dashboard service that runs in-process.
 * Uses file watching for immediate updates with timer as fallback.
 */
export function createDashboardService(tasksFile: string): InProcessService {
  return {
    start(write, _scheduleRender) {
      let intervalId: ReturnType<typeof setInterval> | null = null;
      let watcher: FSWatcher | null = null;
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      let lastUpdateTime = 0;

      const update = async () => {
        const now = Date.now();
        // Debounce rapid updates (min 500ms between updates)
        if (now - lastUpdateTime < 500) {
          return;
        }
        lastUpdateTime = now;

        try {
          const tasks = await loadTasks(tasksFile);
          // Clear screen and render
          write("\x1b[2J\x1b[H"); // Clear screen and move to home
          write(renderDashboard(tasks));
        } catch (err) {
          write(`\r\n${chalk.red("Error loading tasks:")} ${err}\r\n`);
        }
      };

      const debouncedUpdate = () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(update, 100);
      };

      // Initial render
      update();

      // Watch for file changes (event-based)
      try {
        watcher = watch(tasksFile, (eventType) => {
          if (eventType === "change") {
            debouncedUpdate();
          }
        });
      } catch {
        // File watching might not be available on all systems
        write(chalk.dim("\r\n[File watching unavailable, using timer fallback]\r\n"));
      }

      // Fallback timer (less frequent since we have file watching)
      // Also serves as a heartbeat to show the dashboard is still active
      intervalId = setInterval(update, 30000);

      // Return cleanup function
      return () => {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        if (watcher) {
          watcher.close();
          watcher = null;
        }
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
      };
    },
  };
}
