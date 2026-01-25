// =============================================================================
// Orchestrator and Agent Work Loop
// =============================================================================

import { runAgentWorkLoopCLI } from "../adapters/cli";
import { listRepos, pullDefaultBranch } from "../infra/git";
import { logger } from "../infra/logger";
import { OrchestratorTUI } from "../orchestrator-tui";
import { createDashboardService } from "../services";
import { getAllAgents, getAllRepos, loadTasks, primeTasks, resetStuckTasks, saveTasks } from "../tasks";
import { BLOOM_DIR, FLOATING_AGENT, getTasksFile, POLL_INTERVAL_MS, REPOS_DIR } from "./context";

// =============================================================================
// Types
// =============================================================================

interface AgentConfig {
  name: string;
  command?: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** If set, run this service in-process instead of spawning a subprocess */
  service?: import("../orchestrator-tui").InProcessService;
}

// =============================================================================
// Agent Work Loop
// =============================================================================

/**
 * Run the agent work loop with CLI console output.
 * This is a convenience wrapper around the event-driven work loop.
 */
export async function runAgentWorkLoop(agentName: string): Promise<void> {
  const envOverride = process.env.BLOOM_AGENT_OVERRIDE;

  await runAgentWorkLoopCLI(agentName, {
    tasksFile: getTasksFile(),
    bloomDir: BLOOM_DIR,
    reposDir: REPOS_DIR,
    pollIntervalMs: POLL_INTERVAL_MS,
    agentProviderOverride: envOverride,
  });
}

// =============================================================================
// Orchestrator
// =============================================================================

export async function startOrchestrator(agentOverride?: string): Promise<void> {
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

  let agents: Set<string>;
  let taskRepos: Set<string>;
  try {
    logger.orchestrator.info("Validating tasks.yaml...");
    const tasksFile = await loadTasks(getTasksFile());

    // Extract repos referenced in tasks
    taskRepos = getAllRepos(tasksFile.tasks);

    // Pull latest updates only for repos used in tasks
    if (taskRepos.size > 0) {
      const existingRepos = repos.filter((r) => r.exists).map((r) => r.name);
      const reposToPull = [...taskRepos].filter((r) => existingRepos.includes(r));

      if (reposToPull.length > 0) {
        logger.orchestrator.info(`Pulling latest updates for task repos: ${reposToPull.join(", ")}...`);

        const updated: string[] = [];
        const upToDate: string[] = [];
        const failed: { name: string; error: string }[] = [];

        for (const repoName of reposToPull) {
          const result = await pullDefaultBranch(BLOOM_DIR, repoName);
          if (!result.success) {
            failed.push({ name: repoName, error: result.error || "Unknown error" });
          } else if (result.updated) {
            updated.push(repoName);
          } else {
            upToDate.push(repoName);
          }
        }

        if (updated.length > 0) {
          logger.orchestrator.info(`Updated: ${updated.join(", ")}`);
        }
        if (upToDate.length > 0) {
          logger.orchestrator.info(`Already up to date: ${upToDate.join(", ")}`);
        }
        if (failed.length > 0) {
          for (const { name, error } of failed) {
            logger.orchestrator.warn(`Failed to pull ${name}: ${error}`);
          }
          logger.orchestrator.info("Proceeding with existing local state.");
        }
      }
    }

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

  await startTUI(agents, agentOverride);
}

async function startTUI(agents: Set<string>, agentOverride?: string): Promise<void> {
  const agentConfigs: AgentConfig[] = [];
  // Always pass the tasks file explicitly since subprocesses run in BLOOM_DIR,
  // not the original pwd where the user ran `bloom run`
  // Note: Global flags must come AFTER the command name for Clerc CLI parsing
  const tasksFile = getTasksFile();

  // If an agent override was specified via --agent flag, pass it to subprocesses
  const agentEnv = agentOverride ? { BLOOM_AGENT_OVERRIDE: agentOverride } : undefined;

  // Dashboard pane (runs in-process - no subprocess needed)
  agentConfigs.push({
    name: "dashboard",
    service: createDashboardService(tasksFile),
  });

  // Human Questions pane (needs interactive terminal, must be subprocess)
  agentConfigs.push({ name: "questions", command: ["bloom", "questions-dashboard", "-f", tasksFile], cwd: BLOOM_DIR });

  // Agent panes (spawn claude CLI, must be subprocess)
  for (const agentName of [...agents].sort()) {
    agentConfigs.push({
      name: agentName,
      command: ["bloom", "agent", "run", agentName, "-f", tasksFile],
      cwd: BLOOM_DIR,
      env: agentEnv,
    });
  }

  // Floating agent (spawn claude CLI, must be subprocess)
  agentConfigs.push({
    name: FLOATING_AGENT,
    command: ["bloom", "agent", "run", FLOATING_AGENT, "-f", tasksFile],
    cwd: BLOOM_DIR,
    env: agentEnv,
  });

  logger.orchestrator.info("Starting TUI...");
  const tui = new OrchestratorTUI(agentConfigs);
  await tui.start();
}
