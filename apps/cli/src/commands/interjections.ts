// =============================================================================
// Interjection Commands
// =============================================================================

import { spawnSync } from "node:child_process";
import chalk from "chalk";
import { dismissInterjection, getInterjection, listInterjections, markInterjectionResumed } from "../human-queue";

export async function cmdInterjections(): Promise<void> {
  const interjections = await listInterjections("pending");

  if (interjections.length === 0) {
    console.log(chalk.dim("No pending interjections"));
    return;
  }

  console.log(chalk.bold("Pending Interjections:\n"));

  for (const i of interjections) {
    const time = chalk.gray(new Date(i.createdAt).toLocaleTimeString());
    const taskInfo = i.taskId ? chalk.dim(` [task: ${chalk.yellow(i.taskId)}]`) : "";

    console.log(chalk.yellow(i.id));
    console.log(`  ${chalk.bold("Agent:")} ${chalk.cyan(i.agentName)}${taskInfo}`);
    console.log(`  ${chalk.bold("Time:")} ${time}`);
    console.log(`  ${chalk.bold("Dir:")} ${chalk.blue(i.workingDirectory)}`);
    if (i.sessionId) {
      console.log(`  ${chalk.bold("Session:")} ${chalk.dim(i.sessionId)}`);
    }
    if (i.reason) {
      console.log(`  ${chalk.bold("Reason:")} ${i.reason}`);
    }
    console.log(`  ${chalk.dim("Resume:")} ${chalk.cyan(`bloom interject resume ${i.id}`)}`);
    console.log();
  }
}

export async function cmdInterjectResume(id: string): Promise<void> {
  const i = await getInterjection(id);

  if (!i) {
    console.error(chalk.red(`Interjection not found: ${id}`));
    process.exit(1);
  }

  if (i.status !== "pending") {
    console.error(chalk.red(`Interjection already ${i.status}: ${id}`));
    process.exit(1);
  }

  await markInterjectionResumed(id);

  console.log(`${chalk.green("Resuming interjected session for")} ${chalk.cyan(i.agentName)}\n`);
  console.log(`${chalk.bold("Working directory:")} ${chalk.blue(i.workingDirectory)}`);

  if (i.sessionId) {
    console.log(`${chalk.bold("Session ID:")} ${chalk.dim(i.sessionId)}`);
    console.log(chalk.dim(`\nStarting interactive Claude session with --resume...\n`));

    spawnSync("claude", ["--resume", i.sessionId], {
      cwd: i.workingDirectory,
      stdio: "inherit",
    });
  } else {
    console.log(chalk.dim(`\nNo session ID available. Starting fresh Claude session...\n`));
    console.log(`${chalk.bold("Task ID:")} ${chalk.yellow(i.taskId || "unknown")}`);

    spawnSync("claude", [], {
      cwd: i.workingDirectory,
      stdio: "inherit",
    });
  }
}

export async function cmdInterjectDismiss(id: string): Promise<void> {
  const success = await dismissInterjection(id);

  if (success) {
    console.log(`${chalk.green("Dismissed interjection:")} ${chalk.yellow(id)}`);
  } else {
    console.error(chalk.red(`Interjection not found: ${id}`));
    process.exit(1);
  }
}
