// =============================================================================
// Enter Command - Enter Claude Code in project context
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { createAgent } from "../agents";
import { findGitRoot } from "./context";

// =============================================================================
// Run Enter Session
// =============================================================================

export async function runEnterSession(workingDir: string, agentName?: string): Promise<void> {
  const gitRoot = findGitRoot() || workingDir;

  const systemPrompt = `You are working in a Bloom project.

Working Directory: ${workingDir}
Git Root: ${gitRoot}

This is an open-ended session - help the user with whatever they need.

You have access to the entire git repository for context, but you're starting in the project directory.`;

  const agent = await createAgent("interactive", { agentName });

  await agent.run({
    systemPrompt,
    prompt: "",
    startingDirectory: workingDir,
  });
}

// =============================================================================
// Command Handler
// =============================================================================

export async function cmdEnter(agentName?: string): Promise<void> {
  const workingDir = process.cwd();

  // Show what files exist in the project
  const hasPrd = existsSync(join(workingDir, "PRD.md"));
  const hasPlan = existsSync(join(workingDir, "plan.md"));
  const hasTasks = existsSync(join(workingDir, "tasks.yaml"));

  const agentDisplay = agentName ? ` (using ${agentName})` : "";
  console.log(`${chalk.bold.cyan("Entering session in:")} ${chalk.dim(workingDir)}${chalk.cyan(agentDisplay)}\n`);

  if (hasPrd || hasPlan || hasTasks) {
    console.log(chalk.bold("Project files:"));
    if (hasPrd) console.log(`  ${chalk.green("•")} PRD.md`);
    if (hasPlan) console.log(`  ${chalk.green("•")} plan.md`);
    if (hasTasks) console.log(`  ${chalk.green("•")} tasks.yaml`);
    console.log("");
  }

  await runEnterSession(workingDir, agentName);
}
