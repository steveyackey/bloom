// =============================================================================
// Orchestrator and Agent Work Loop
// =============================================================================

import { join, resolve } from "node:path";
import { ClaudeAgentProvider } from "../agents";
import { createWorktree, getWorktreePath, worktreeExists } from "../git";
import { logger } from "../logger";
import { OrchestratorTUI } from "../orchestrator-tui";
import { loadAgentPrompt } from "../prompts";
import { listRepos, pullAllDefaultBranches } from "../repos";
import {
  getAllAgents,
  getAvailableTasks,
  loadTasks,
  primeTasks,
  resetStuckTasks,
  saveTasks,
  updateTaskStatus,
} from "../tasks";
import { BLOOM_DIR, DEFAULT_TASKS_FILE, FLOATING_AGENT, getTasksFile, POLL_INTERVAL_MS, REPOS_DIR } from "./context";

// =============================================================================
// Types
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

interface AgentConfig {
  name: string;
  command: string[];
  cwd: string;
  env?: Record<string, string>;
}

// =============================================================================
// Agent Work Loop
// =============================================================================

async function getTaskForAgent(agentName: string): Promise<TaskGetResult> {
  const tasksFile = await loadTasks(getTasksFile());
  const available = getAvailableTasks(tasksFile.tasks, agentName);

  const task = available[0];
  if (!task) {
    return { available: false };
  }

  updateTaskStatus(tasksFile.tasks, task.id, "in_progress", agentName);
  await saveTasks(getTasksFile(), tasksFile);

  const taskCli = `bloom${getTasksFile() !== DEFAULT_TASKS_FILE ? ` -f "${getTasksFile()}"` : ""}`;

  let prompt = `# Task: ${task.title}\n\n## Task ID: ${task.id}\n\n`;

  if (task.instructions) {
    prompt += `## Instructions\n${task.instructions}\n\n`;
  }

  if (task.acceptance_criteria.length > 0) {
    prompt += `## Acceptance Criteria\n${task.acceptance_criteria.map((c) => `- ${c}`).join("\n")}\n\n`;
  }

  if (task.depends_on.length > 0) {
    prompt += `## Dependencies (completed)\n${task.depends_on.map((d) => `- ${d}`).join("\n")}\n\n`;
  }

  if (task.ai_notes.length > 0) {
    prompt += `## Previous Notes\n${task.ai_notes.map((n) => `- ${n}`).join("\n")}\n\n`;
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

export async function runAgentWorkLoop(agentName: string): Promise<void> {
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

      const systemPrompt = await loadAgentPrompt(agentName, taskResult.taskId!, taskResult.taskCli!);

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

export async function startOrchestrator(): Promise<void> {
  logger.orchestrator.info("Checking repos...");
  const repos = await listRepos(BLOOM_DIR);
  if (repos.length === 0) {
    logger.orchestrator.info("No repos configured. Use 'bloom repo clone <url>' to add one.");
  } else {
    const missingRepos = repos.filter((r) => !r.exists);
    if (missingRepos.length > 0) {
      logger.orchestrator.warn(`Missing repos: ${missingRepos.map((r) => r.name).join(", ")}. Run 'bloom repo sync'.`);
    } else {
      logger.orchestrator.info(`Found ${repos.length} repo(s): ${repos.map((r) => r.name).join(", ")}`);
    }
  }

  // Pull latest updates from default branches
  if (repos.length > 0 && repos.some((r) => r.exists)) {
    logger.orchestrator.info("Pulling latest updates from default branches...");
    const pullResult = await pullAllDefaultBranches(BLOOM_DIR);

    if (pullResult.updated.length > 0) {
      logger.orchestrator.info(`Updated: ${pullResult.updated.join(", ")}`);
    }
    if (pullResult.upToDate.length > 0) {
      logger.orchestrator.info(`Already up to date: ${pullResult.upToDate.join(", ")}`);
    }
    if (pullResult.failed.length > 0) {
      for (const { name, error } of pullResult.failed) {
        logger.orchestrator.warn(`Failed to pull ${name}: ${error}`);
      }
      logger.orchestrator.info("Proceeding with existing local state.");
    }
  }

  let agents: Set<string>;
  try {
    logger.orchestrator.info("Validating tasks.yaml...");
    const tasksFile = await loadTasks(getTasksFile());

    logger.orchestrator.info("Checking for stuck tasks...");
    const resetCount = resetStuckTasks(tasksFile, logger.reset);
    if (resetCount > 0) {
      logger.orchestrator.info(`Reset ${resetCount} stuck task(s)`);
      await saveTasks(getTasksFile(), tasksFile);
    }

    logger.orchestrator.info("Priming tasks...");
    const primedCount = await primeTasks(getTasksFile(), tasksFile, logger.prime);
    if (primedCount > 0) {
      logger.orchestrator.info(`Primed ${primedCount} task(s) to ready_for_agent`);
    } else {
      logger.orchestrator.debug("No tasks needed priming");
    }

    agents = getAllAgents(tasksFile.tasks);
  } catch (err) {
    // Check if it's a YAML parsing error
    if (err instanceof Error && (err.name === "YAMLParseError" || err.message.includes("YAML"))) {
      logger.orchestrator.error("Failed to parse tasks.yaml - likely a YAML syntax error.");
      logger.orchestrator.error("Run 'bloom validate' for details, then fix the issues.");
      logger.orchestrator.error(`Error: ${err.message}`);
      process.exit(1);
    }
    logger.orchestrator.warn("No tasks.yaml or no agents defined yet. Creating session with dashboard only.");
    agents = new Set();
  }

  await startTUI(agents);
}

async function startTUI(agents: Set<string>): Promise<void> {
  const useCustomFile = getTasksFile() !== DEFAULT_TASKS_FILE;
  const agentConfigs: AgentConfig[] = [];

  // Dashboard pane
  const dashboardCmd = ["bloom"];
  if (useCustomFile) dashboardCmd.push("-f", getTasksFile());
  dashboardCmd.push("dashboard");

  agentConfigs.push({ name: "dashboard", command: dashboardCmd, cwd: BLOOM_DIR });

  // Human Questions pane
  const questionsCmd = ["bloom"];
  if (useCustomFile) questionsCmd.push("-f", getTasksFile());
  questionsCmd.push("questions-dashboard");

  agentConfigs.push({ name: "questions", command: questionsCmd, cwd: BLOOM_DIR });

  // Agent panes
  for (const agentName of [...agents].sort()) {
    const cmd = ["bloom"];
    if (useCustomFile) cmd.push("-f", getTasksFile());
    cmd.push("agent", "run", agentName);
    agentConfigs.push({ name: agentName, command: cmd, cwd: BLOOM_DIR });
  }

  // Floating agent
  const floatingCmd = ["bloom"];
  if (useCustomFile) floatingCmd.push("-f", getTasksFile());
  floatingCmd.push("agent", "run", FLOATING_AGENT);
  agentConfigs.push({ name: FLOATING_AGENT, command: floatingCmd, cwd: BLOOM_DIR });

  logger.orchestrator.info("Starting TUI...");
  const tui = new OrchestratorTUI(agentConfigs);
  await tui.start();
}
