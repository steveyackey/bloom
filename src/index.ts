#!/usr/bin/env bun
// =============================================================================
// Bloom - Multi-Agent Task Orchestrator
// =============================================================================

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";

import { ClaudeAgentProvider, getActiveSession } from "./agents";
import {
  loadTasks,
  saveTasks,
  findTask,
  updateTaskStatus,
  getAllAgents,
  getAvailableTasks,
  getTasksByStatus,
  getTasksByAgent,
  formatTask,
  getStatusIcon,
  primeTasks,
  resetStuckTasks,
} from "./tasks";
import { type Task, type TasksFile, type TaskStatus } from "./task-schema";
import { OrchestratorTUI } from "./orchestrator-tui";
import { runPlanningSession } from "./plan-session";
import { logger, createLogger, setLogLevel, type LogLevel } from "./logger";
import {
  askQuestion,
  answerQuestion,
  getQuestion,
  listQuestions,
  waitForAnswer,
  clearAnsweredQuestions,
  watchQueue,
  createInterjection,
  getInterjection,
  listInterjections,
  markInterjectionResumed,
  dismissInterjection,
  getActionResult,
  markActionExecuted,
  type Question,
  type QuestionType,
  type QuestionAction,
} from "./human-queue";
import { ansi, semantic } from "./colors";
import { loadAgentPrompt } from "./prompts";
import { setupRepos, worktreeExists, createWorktree, getWorktreePath } from "./git";
import { getRepos, loadConfig, initConfig, getConfigTemplate, getConfigPath } from "./config";

// =============================================================================
// Constants
// =============================================================================

const BLOOM_DIR = resolve(import.meta.dirname ?? ".", "..");
const REPOS_DIR = join(BLOOM_DIR, "repos");
const DEFAULT_TASKS_FILE = join(BLOOM_DIR, "tasks.yaml");
const POLL_INTERVAL_MS = 10_000;
const FLOATING_AGENT = "floating";

let TASKS_FILE = DEFAULT_TASKS_FILE;

// =============================================================================
// Agent Work Loop
// =============================================================================

interface TaskGetResult {
  available: boolean;
  taskId?: string;
  title?: string;
  repo?: string | null;
  worktree?: string | null;
  prompt?: string;
  taskCli?: string;
}

async function getTaskForAgent(agentName: string): Promise<TaskGetResult> {
  const tasksFile = await loadTasks(TASKS_FILE);
  const available = getAvailableTasks(tasksFile.tasks, agentName);

  if (available.length === 0) {
    return { available: false };
  }

  const task = available[0];
  updateTaskStatus(tasksFile.tasks, task.id, "in_progress", agentName);
  await saveTasks(TASKS_FILE, tasksFile);

  const taskCli = `bun ${resolve(BLOOM_DIR, "src/index.ts")}` + (TASKS_FILE !== DEFAULT_TASKS_FILE ? ` -f "${TASKS_FILE}"` : "");

  let prompt = `# Task: ${task.title}\n\n## Task ID: ${task.id}\n\n`;

  if (task.instructions) {
    prompt += `## Instructions\n${task.instructions}\n\n`;
  }

  if (task.acceptance_criteria.length > 0) {
    prompt += `## Acceptance Criteria\n${task.acceptance_criteria.map(c => `- ${c}`).join("\n")}\n\n`;
  }

  if (task.depends_on.length > 0) {
    prompt += `## Dependencies (completed)\n${task.depends_on.map(d => `- ${d}`).join("\n")}\n\n`;
  }

  if (task.ai_notes.length > 0) {
    prompt += `## Previous Notes\n${task.ai_notes.map(n => `- ${n}`).join("\n")}\n\n`;
  }

  prompt += `## Your Mission
Complete this task according to the instructions and acceptance criteria above.
When finished, mark the task as done using:
  ${taskCli} done ${task.id}

If you encounter blockers, mark it as blocked:
  ${taskCli} block ${task.id}

Begin working on the task now.`;

  return {
    available: true,
    taskId: task.id,
    title: task.title,
    repo: task.repo || null,
    worktree: task.worktree || null,
    prompt,
    taskCli,
  };
}

async function runAgentWorkLoop(agentName: string): Promise<void> {
  const agentLog = logger.agent(agentName);
  agentLog.info(`Starting work loop (polling every ${POLL_INTERVAL_MS / 1000}s)...`);

  const agent = new ClaudeAgentProvider({
    interactive: false,
    dangerouslySkipPermissions: true,
    streamOutput: true,
  });

  while (true) {
    try {
      const taskResult = await getTaskForAgent(agentName);

      if (!taskResult.available) {
        agentLog.debug("No work available. Sleeping...");
        await Bun.sleep(POLL_INTERVAL_MS);
        continue;
      }

      agentLog.info(`Found work: ${taskResult.taskId} - ${taskResult.title}`);

      let workingDir = BLOOM_DIR;

      if (taskResult.repo) {
        let repoPath: string;
        if (taskResult.repo.startsWith("./") || taskResult.repo.startsWith("/")) {
          repoPath = resolve(BLOOM_DIR, taskResult.repo);
        } else {
          repoPath = join(REPOS_DIR, taskResult.repo);
        }

        if (taskResult.worktree) {
          if (!worktreeExists(repoPath, taskResult.worktree)) {
            agentLog.info(`Creating worktree: ${taskResult.worktree}`);
            createWorktree(repoPath, taskResult.worktree);
          }
          workingDir = getWorktreePath(repoPath, taskResult.worktree);
        } else {
          workingDir = repoPath;
        }
      }

      const systemPrompt = await loadAgentPrompt(
        agentName,
        taskResult.taskId!,
        taskResult.taskCli!
      );

      agentLog.info(`Starting Claude session in: ${workingDir}`);

      const startTime = Date.now();
      const result = await agent.run({
        systemPrompt,
        prompt: taskResult.prompt!,
        startingDirectory: workingDir,
        agentName,
        taskId: taskResult.taskId,
      });
      const duration = Math.round((Date.now() - startTime) / 1000);

      if (result.success) {
        agentLog.info(`Task ${taskResult.taskId} completed successfully (${duration}s)`);
      } else {
        agentLog.error(`Task ${taskResult.taskId} ended with error after ${duration}s: ${result.error}`);
      }

      await Bun.sleep(1000);

    } catch (err) {
      agentLog.error("Error in work loop:", err);
      await Bun.sleep(POLL_INTERVAL_MS);
    }
  }
}

// =============================================================================
// Orchestrator
// =============================================================================

interface AgentConfig {
  name: string;
  command: string[];
  cwd: string;
  env?: Record<string, string>;
}

async function startOrchestrator(): Promise<void> {
  logger.orchestrator.info("Setting up repos...");
  const repos = await getRepos(BLOOM_DIR, REPOS_DIR);
  if (repos.length > 0) {
    await setupRepos(REPOS_DIR, TASKS_FILE, repos, logger.setup);
  } else {
    logger.orchestrator.info("No repos configured. Run 'bloom init' or create bloom.config.yaml");
  }

  let agents: Set<string>;
  try {
    const tasksFile = await loadTasks(TASKS_FILE);

    logger.orchestrator.info("Checking for stuck tasks...");
    const resetCount = resetStuckTasks(tasksFile, logger.reset);
    if (resetCount > 0) {
      logger.orchestrator.info(`Reset ${resetCount} stuck task(s)`);
      await saveTasks(TASKS_FILE, tasksFile);
    }

    logger.orchestrator.info("Priming tasks...");
    const primedCount = await primeTasks(TASKS_FILE, tasksFile, logger.prime);
    if (primedCount > 0) {
      logger.orchestrator.info(`Primed ${primedCount} task(s) to ready_for_agent`);
    } else {
      logger.orchestrator.debug("No tasks needed priming");
    }

    agents = getAllAgents(tasksFile.tasks);
  } catch (err) {
    logger.orchestrator.warn("No tasks.yaml or no agents defined yet. Creating session with dashboard only.");
    agents = new Set();
  }

  await startTUI(agents);
}

async function startTUI(agents: Set<string>): Promise<void> {
  const useCustomFile = TASKS_FILE !== DEFAULT_TASKS_FILE;
  const indexPath = resolve(BLOOM_DIR, "src/index.ts");
  const agentConfigs: AgentConfig[] = [];

  // Dashboard pane
  const dashboardCmd = ["bun", indexPath];
  if (useCustomFile) dashboardCmd.push("-f", TASKS_FILE);
  dashboardCmd.push("dashboard");

  agentConfigs.push({ name: "dashboard", command: dashboardCmd, cwd: BLOOM_DIR });

  // Human Questions pane
  const questionsCmd = ["bun", indexPath];
  if (useCustomFile) questionsCmd.push("-f", TASKS_FILE);
  questionsCmd.push("questions-dashboard");

  agentConfigs.push({ name: "questions", command: questionsCmd, cwd: BLOOM_DIR });

  // Agent panes
  for (const agentName of [...agents].sort()) {
    const cmd = ["bun", indexPath];
    if (useCustomFile) cmd.push("-f", TASKS_FILE);
    cmd.push("agent", "run", agentName);
    agentConfigs.push({ name: agentName, command: cmd, cwd: BLOOM_DIR });
  }

  // Floating agent
  const floatingCmd = ["bun", indexPath];
  if (useCustomFile) floatingCmd.push("-f", TASKS_FILE);
  floatingCmd.push("agent", "run", FLOATING_AGENT);
  agentConfigs.push({ name: FLOATING_AGENT, command: floatingCmd, cwd: BLOOM_DIR });

  logger.orchestrator.info("Starting TUI...");
  const tui = new OrchestratorTUI(agentConfigs);
  tui.start();
}

// =============================================================================
// CLI Commands
// =============================================================================

async function cmdDashboard() {
  const renderDashboard = async () => {
    const tasksFile = await loadTasks(TASKS_FILE);
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
    console.log(`Status:   ${stats.in_progress} in_progress, ${stats.assigned} assigned, ${stats.ready_for_agent} ready, ${stats.todo} todo, ${stats.blocked} blocked\n`);

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
        const taskList = tasks.map(t => t.task).join(", ");
        const worktree = tasks[0]?.worktree ? ` [${tasks[0].worktree}]` : "";
        console.log(`  ${agent}: ${taskList}${worktree}`);
      }
      console.log();
    }

    console.log("Tasks:");
    const byPhase = Map.groupBy(tasksFile.tasks, t => t.phase ?? 0);
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

    const blocked = allTasks.filter(t => t.status === "blocked");
    if (blocked.length > 0) {
      console.log("\n  Blocked Tasks:");
      for (const task of blocked) {
        console.log(`    ${task.id}: ${task.title}`);
      }
    }
  };

  await renderDashboard();
  setInterval(async () => {
    try { await renderDashboard(); } catch {}
  }, 10000);
}

async function cmdList(status?: TaskStatus) {
  const tasksFile = await loadTasks(TASKS_FILE);

  if (status) {
    const tasks = getTasksByStatus(tasksFile.tasks, status);
    console.log(`Tasks with status '${status}':`);
    for (const task of tasks) {
      console.log(formatTask(task, "  "));
    }
    return;
  }

  const byPhase = Map.groupBy(tasksFile.tasks, t => t.phase ?? 0);
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

async function cmdShow(taskId: string) {
  const tasksFile = await loadTasks(TASKS_FILE);
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

async function cmdNext(agentName?: string) {
  const tasksFile = await loadTasks(TASKS_FILE);
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

async function cmdAgents() {
  const tasksFile = await loadTasks(TASKS_FILE);
  const agents = getAllAgents(tasksFile.tasks);

  if (agents.size === 0) {
    console.log("No agents assigned");
    return;
  }

  console.log("Agents:");
  for (const agent of [...agents].sort()) {
    const tasks = getTasksByAgent(tasksFile.tasks, agent);
    const inProgress = tasks.filter(t => t.status === "in_progress").length;
    const assigned = tasks.filter(t => t.status === "assigned").length;
    const done = tasks.filter(t => t.status === "done").length;
    console.log(`  ${agent}: ${inProgress} in_progress, ${assigned} assigned, ${done} done`);
  }
}

async function cmdSetStatus(taskId: string, status: TaskStatus) {
  const tasksFile = await loadTasks(TASKS_FILE);
  const task = findTask(tasksFile.tasks, taskId);

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  const oldStatus = task.status;
  updateTaskStatus(tasksFile.tasks, taskId, status);
  await saveTasks(TASKS_FILE, tasksFile);
  console.log(`${taskId}: ${oldStatus} → ${status}`);
}

async function cmdAssign(taskId: string, agentName: string) {
  const tasksFile = await loadTasks(TASKS_FILE);
  const task = findTask(tasksFile.tasks, taskId);

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  updateTaskStatus(tasksFile.tasks, taskId, "assigned", agentName);
  await saveTasks(TASKS_FILE, tasksFile);
  console.log(`Assigned ${taskId} to ${agentName}`);
}

async function cmdNote(taskId: string, note: string) {
  const tasksFile = await loadTasks(TASKS_FILE);
  const task = findTask(tasksFile.tasks, taskId);

  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  task.ai_notes.push(note);
  await saveTasks(TASKS_FILE, tasksFile);
  console.log(`Added note to ${taskId}`);
}

// =============================================================================
// Human Queue Commands
// =============================================================================

async function cmdAsk(
  agentName: string,
  question: string,
  options: {
    taskId?: string;
    questionType?: QuestionType;
    choices?: string[];
    onYes?: string;
    onNo?: string;
    addNote?: boolean;
  } = {}
) {
  let action: QuestionAction | undefined;

  if (options.onYes || options.onNo) {
    action = {
      type: "set_status",
      onYes: options.onYes,
      onNo: options.onNo,
    };
  } else if (options.addNote) {
    action = {
      type: "add_note",
      payload: "Human response:",
    };
  }

  const id = await askQuestion(agentName, question, {
    taskId: options.taskId,
    choices: options.choices,
    questionType: options.questionType,
    action,
  });

  console.log(`Question ID: ${id}`);
  console.log(`Agent "${agentName}" asks: ${question}`);
  console.log(`Type: ${options.questionType || "auto-detected"}`);

  if (options.choices) {
    console.log(`Choices: ${options.choices.join(", ")}`);
  }

  if (action) {
    console.log(`Action: ${action.type}`);
    if (action.onYes) console.log(`  On Yes: ${action.onYes}`);
    if (action.onNo) console.log(`  On No: ${action.onNo}`);
  }

  console.log(`\nTo answer: bloom answer ${id} "your response"`);
}

async function cmdAnswer(questionId: string, answer: string) {
  const q = await getQuestion(questionId);
  if (!q) {
    console.error(`Question not found: ${questionId}`);
    process.exit(1);
  }

  if (q.status === "answered") {
    console.error(`Question already answered: ${questionId}`);
    process.exit(1);
  }

  const success = await answerQuestion(questionId, answer);
  if (success) {
    console.log(`Answered question ${questionId}`);
    console.log(`Q: ${q.question}`);
    console.log(`A: ${answer}`);
  } else {
    console.error("Failed to answer question");
    process.exit(1);
  }
}

async function cmdQuestions(showAll = false) {
  const questions = await listQuestions(showAll ? undefined : "pending");

  if (questions.length === 0) {
    console.log(showAll ? "No questions in queue" : "No pending questions");
    return;
  }

  console.log(showAll ? "All Questions:" : "Pending Questions:\n");

  for (const q of questions) {
    const time = new Date(q.createdAt).toLocaleTimeString();
    const taskInfo = q.taskId ? ` [task: ${q.taskId}]` : "";
    const statusIcon = q.status === "pending" ? "?" : "✓";

    console.log(`${statusIcon} ${q.id}`);
    console.log(`  From: ${q.agentName}${taskInfo} at ${time}`);
    console.log(`  Q: ${q.question}`);

    if (q.options && q.options.length > 0) {
      console.log(`  Options:`);
      q.options.forEach((opt, i) => console.log(`    ${i + 1}. ${opt}`));
    }

    if (q.status === "answered") {
      console.log(`  A: ${q.answer}`);
    } else {
      console.log(`  Answer: bloom answer ${q.id} "your response"`);
    }
    console.log();
  }
}

async function cmdWaitAnswer(questionId: string, timeoutSecs = 300) {
  const q = await getQuestion(questionId);
  if (!q) {
    console.error(`Question not found: ${questionId}`);
    process.exit(1);
  }

  if (q.status === "answered" && q.answer !== undefined) {
    console.log(q.answer);
    return;
  }

  console.error(`Waiting for answer to: ${q.question}`);

  const answer = await waitForAnswer(questionId, timeoutSecs * 1000);

  if (answer !== null) {
    console.log(answer);
  } else {
    console.error("Timed out waiting for answer");
    process.exit(1);
  }
}

async function cmdClearAnswered() {
  const count = await clearAnsweredQuestions();
  console.log(`Cleared ${count} answered question(s)`);
}

// =============================================================================
// Interjection Commands
// =============================================================================

async function cmdInterjections() {
  const interjections = await listInterjections("pending");

  if (interjections.length === 0) {
    console.log("No pending interjections");
    return;
  }

  console.log("Pending Interjections:\n");

  for (const i of interjections) {
    const time = new Date(i.createdAt).toLocaleTimeString();
    const taskInfo = i.taskId ? ` [task: ${i.taskId}]` : "";

    console.log(`${semantic.info}${i.id}${ansi.reset}`);
    console.log(`  Agent: ${i.agentName}${taskInfo}`);
    console.log(`  Time: ${time}`);
    console.log(`  Dir: ${i.workingDirectory}`);
    if (i.sessionId) {
      console.log(`  Session: ${i.sessionId}`);
    }
    if (i.reason) {
      console.log(`  Reason: ${i.reason}`);
    }
    console.log(`  ${semantic.success}Resume:${ansi.reset} bloom interject resume ${i.id}`);
    console.log();
  }
}

async function cmdInterjectResume(id: string) {
  const i = await getInterjection(id);

  if (!i) {
    console.error(`Interjection not found: ${id}`);
    process.exit(1);
  }

  if (i.status !== "pending") {
    console.error(`Interjection already ${i.status}: ${id}`);
    process.exit(1);
  }

  await markInterjectionResumed(id);

  console.log(`${semantic.warning}Resuming interjected session for ${i.agentName}${ansi.reset}\n`);
  console.log(`Working directory: ${i.workingDirectory}`);

  if (i.sessionId) {
    console.log(`Session ID: ${i.sessionId}`);
    console.log(`\nStarting interactive Claude session with --resume...\n`);

    spawnSync("claude", ["--resume", i.sessionId], {
      cwd: i.workingDirectory,
      stdio: "inherit",
    });
  } else {
    console.log(`\nNo session ID available. Starting fresh Claude session...\n`);
    console.log(`Task ID: ${i.taskId || "unknown"}`);

    spawnSync("claude", [], {
      cwd: i.workingDirectory,
      stdio: "inherit",
    });
  }
}

async function cmdInterjectDismiss(id: string) {
  const success = await dismissInterjection(id);

  if (success) {
    console.log(`Dismissed interjection: ${id}`);
  } else {
    console.error(`Interjection not found: ${id}`);
    process.exit(1);
  }
}

async function cmdQuestionsDashboard() {
  const select = (await import("@inquirer/select")).default;
  const input = (await import("@inquirer/input")).default;
  const confirm = (await import("@inquirer/confirm")).default;

  const executeAction = async (q: Question, answer: string) => {
    if (!q.action || !q.taskId) return;

    const result = getActionResult({ ...q, answer });
    if (!result.shouldExecute) return;

    try {
      const tasksFile = await loadTasks(TASKS_FILE);
      const task = findTask(tasksFile.tasks, q.taskId);
      if (!task) return;

      if (result.status) {
        const oldStatus = task.status;
        task.status = result.status as TaskStatus;
        await saveTasks(TASKS_FILE, tasksFile);
        console.log(`${semantic.success}Action executed:${ansi.reset} ${q.taskId}: ${oldStatus} → ${result.status}`);
        await markActionExecuted(q.id);
      }

      if (result.note) {
        task.ai_notes.push(result.note);
        await saveTasks(TASKS_FILE, tasksFile);
        console.log(`${semantic.success}Note added to task:${ansi.reset} ${q.taskId}`);
        await markActionExecuted(q.id);
      }
    } catch (err) {
      console.log(`${semantic.error}Failed to execute action:${ansi.reset}`, err);
    }
  };

  const runLoop = async () => {
    while (true) {
      const questions = await listQuestions("pending");
      console.clear();

      console.log("══════════════════════════════════════════");
      console.log("  HUMAN QUESTIONS QUEUE");
      console.log("══════════════════════════════════════════\n");

      if (questions.length === 0) {
        console.log("No pending questions - agents are working autonomously.\n");
        console.log("Waiting for questions from agents...\n");

        await new Promise<void>((resolve) => {
          const unsubscribe = watchQueue((event) => {
            if (event.type === "question_added") {
              unsubscribe();
              resolve();
            }
          });
        });
        continue;
      }

      const choices = questions.map((q) => {
        const time = new Date(q.createdAt).toLocaleTimeString();
        const taskInfo = q.taskId ? ` [${q.taskId}]` : "";
        const typeIcon = q.questionType === "yes_no" ? "◉" : q.questionType === "choice" ? "◈" : "◇";
        return {
          name: `${typeIcon} [${q.agentName}${taskInfo}] ${q.question.slice(0, 55)}${q.question.length > 55 ? "..." : ""}`,
          value: q.id,
          description: `Asked at ${time}: ${q.question}`,
        };
      });

      choices.push({
        name: "↻ Refresh list",
        value: "__refresh__",
        description: "Check for new questions",
      });

      try {
        const selectedId = await select({
          message: `${questions.length} question(s) need your attention: (◉=yes/no ◈=choice ◇=open)`,
          choices,
          pageSize: 10,
        });

        if (selectedId === "__refresh__") {
          continue;
        }

        const selectedQ = questions.find((q) => q.id === selectedId);
        if (!selectedQ) continue;

        console.log("\n──────────────────────────────────────────");
        console.log(`Agent: ${selectedQ.agentName}`);
        if (selectedQ.taskId) console.log(`Task: ${selectedQ.taskId}`);
        console.log(`Type: ${selectedQ.questionType || "open"}`);
        console.log(`\nQuestion: ${selectedQ.question}`);

        if (selectedQ.action && selectedQ.taskId) {
          console.log(`\n${semantic.info}Auto-action:${ansi.reset}`);
          if (selectedQ.action.onYes) {
            console.log(`  Yes → set task status to "${selectedQ.action.onYes}"`);
          }
          if (selectedQ.action.onNo) {
            console.log(`  No → set task status to "${selectedQ.action.onNo}"`);
          }
          if (selectedQ.action.type === "add_note") {
            console.log(`  Answer will be added as note to task`);
          }
        }

        if (selectedQ.options && selectedQ.options.length > 0) {
          console.log("\nSuggested options:");
          selectedQ.options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));
        }
        console.log("──────────────────────────────────────────\n");

        let answer: string;

        if (selectedQ.questionType === "yes_no") {
          const result = await confirm({
            message: "Your answer:",
            default: true,
          });
          answer = result ? "yes" : "no";
        } else if (selectedQ.questionType === "choice" && selectedQ.options && selectedQ.options.length > 0) {
          const choiceOptions = selectedQ.options.map((opt) => ({
            name: opt,
            value: opt,
          }));
          choiceOptions.push({ name: "Other (type custom answer)", value: "__other__" });

          const selected = await select({
            message: "Your answer:",
            choices: choiceOptions,
          });

          if (selected === "__other__") {
            answer = await input({
              message: "Custom answer:",
              validate: (value) => value.trim().length > 0 || "Please provide an answer",
            });
          } else {
            answer = selected;
          }
        } else {
          answer = await input({
            message: "Your answer:",
            validate: (value) => value.trim().length > 0 || "Please provide an answer",
          });
        }

        await answerQuestion(selectedId, answer.trim());
        console.log("\n✓ Answer submitted!");

        await executeAction(selectedQ, answer.trim());

        await Bun.sleep(1000);

      } catch (err: unknown) {
        if (err && typeof err === "object" && "name" in err && err.name === "ExitPromptError") {
          console.log("\nExiting questions dashboard...");
          process.exit(0);
        }
        throw err;
      }
    }
  };

  await runLoop();
}

async function cmdReset(taskIdOrFlag: string) {
  const tasksFile = await loadTasks(TASKS_FILE);

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
      await saveTasks(TASKS_FILE, tasksFile);
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
  await saveTasks(TASKS_FILE, tasksFile);
  console.log(`Reset ${taskIdOrFlag}: ${oldStatus} -> ready_for_agent`);
}

async function cmdValidate() {
  const tasksFile = await loadTasks(TASKS_FILE);
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
    const uniqueAgents = new Set(agents.map(a => a.agent));
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

Configuration Commands:
  init [repos...]           Initialize bloom.config.yaml (auto-detect or specify repos)
  config [show]             Show current config
  config repos              List configured repos
  config template           Show example config template

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
  bloom init                        Create config with auto-detect
  bloom init frontend backend       Create config with specific repos
  bloom config repos                Show configured repos
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

async function main(): Promise<void> {
  const { tasksFile: tasksFileArg, logLevel, args } = parseArgs(process.argv.slice(2));

  if (logLevel) {
    setLogLevel(logLevel);
  }

  if (tasksFileArg) {
    TASKS_FILE = resolve(tasksFileArg);
  }

  const cmd = args[0];

  switch (cmd) {
    case "run":
      await startOrchestrator();
      break;

    case "setup": {
      const repos = await getRepos(BLOOM_DIR, REPOS_DIR);
      if (repos.length === 0) {
        console.error("No repos configured. Run 'bloom init' or create bloom.config.yaml");
        console.log("\nExample bloom.config.yaml:");
        console.log(getConfigTemplate());
        process.exit(1);
      }
      await setupRepos(REPOS_DIR, TASKS_FILE, repos, logger.setup);
      break;
    }

    case "init": {
      // bloom init [repo1] [repo2] ...
      const repoNames = args.slice(1);
      if (repoNames.length === 0) {
        // Create config with auto-detect
        await initConfig(BLOOM_DIR);
        console.log("Created bloom.config.yaml with auto-detect enabled.");
        console.log("Place your git repos in the repos/ directory, or edit the config.");
      } else {
        // Create config with specified repos
        await initConfig(BLOOM_DIR, { repos: repoNames });
        console.log(`Created bloom.config.yaml with repos: ${repoNames.join(", ")}`);
      }
      console.log(`\nConfig file: ${getConfigPath(BLOOM_DIR)}`);
      break;
    }

    case "config": {
      if (args[1] === "show" || !args[1]) {
        const configPath = getConfigPath(BLOOM_DIR);
        if (existsSync(configPath)) {
          const content = await Bun.file(configPath).text();
          console.log(content);
        } else {
          console.log("No bloom.config.yaml found. Run 'bloom init' to create one.");
          console.log("\nExample config:");
          console.log(getConfigTemplate());
        }
      } else if (args[1] === "repos") {
        const repos = await getRepos(BLOOM_DIR, REPOS_DIR);
        if (repos.length === 0) {
          console.log("No repos configured or detected.");
        } else {
          console.log("Configured repos:");
          for (const repo of repos) {
            console.log(`  ${repo.name}`);
            console.log(`    path: ${repo.path}`);
            if (repo.remote) console.log(`    remote: ${repo.remote}`);
            console.log(`    branch: ${repo.baseBranch}`);
          }
        }
      } else if (args[1] === "template") {
        console.log(getConfigTemplate());
      } else {
        console.error(`Unknown config subcommand: ${args[1]}`);
        console.error("Usage: bloom config [show|repos|template]");
        process.exit(1);
      }
      break;
    }

    case "plan":
      await runPlanningSession(TASKS_FILE);
      break;

    case "dashboard":
      await cmdDashboard();
      break;

    case "list":
      await cmdList(args[1] as TaskStatus | undefined);
      break;

    case "show":
      if (!args[1]) { console.error("Usage: bloom show <taskid>"); process.exit(1); }
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
      if (!args[1]) { console.error("Usage: bloom done <taskid>"); process.exit(1); }
      await cmdSetStatus(args[1], "done");
      break;

    case "block":
      if (!args[1]) { console.error("Usage: bloom block <taskid>"); process.exit(1); }
      await cmdSetStatus(args[1], "blocked");
      break;

    case "todo":
      if (!args[1]) { console.error("Usage: bloom todo <taskid>"); process.exit(1); }
      await cmdSetStatus(args[1], "todo");
      break;

    case "ready":
      if (!args[1]) { console.error("Usage: bloom ready <taskid>"); process.exit(1); }
      await cmdSetStatus(args[1], "ready_for_agent");
      break;

    case "start":
      if (!args[1]) { console.error("Usage: bloom start <taskid> [agent]"); process.exit(1); }
      await cmdSetStatus(args[1], "in_progress");
      break;

    case "assign":
      if (!args[1] || !args[2]) { console.error("Usage: bloom assign <taskid> <agent>"); process.exit(1); }
      await cmdAssign(args[1], args[2]);
      break;

    case "note":
      if (!args[1] || !args[2]) { console.error("Usage: bloom note <taskid> <note>"); process.exit(1); }
      await cmdNote(args[1], args.slice(2).join(" "));
      break;

    case "reset":
      if (!args[1]) { console.error("Usage: bloom reset <taskid|--stuck>"); process.exit(1); }
      await cmdReset(args[1]);
      break;

    case "agent":
      if (args[1] === "run") {
        if (!args[2]) { console.error("Usage: bloom agent run <name>"); process.exit(1); }
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
      {
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

        const choices = choicesStr ? choicesStr.split(",").map(s => s.trim()) : undefined;

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

main().catch(err => {
  console.error(err);
  process.exit(1);
});

// Re-export for library use
export * from "./task-schema";
export * from "./logger";
export * from "./tasks";
export * from "./config";
