// =============================================================================
// Enter Command - Enter Claude Code in project context
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { createAgent } from "../agents";
import { addWorktree, getBareRepoPath, getWorktreePath, listWorktrees, loadReposFile } from "../infra/git";
import { BLOOM_DIR, findGitRoot } from "./context";

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
// Mode 1: No Args - Enter session in current directory
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

// =============================================================================
// Mode 2: Repo Only - Interactive worktree picker
// =============================================================================

export async function cmdEnterRepo(repoName: string, agentName?: string): Promise<void> {
  // Validate repo exists in config
  const reposFile = await loadReposFile(BLOOM_DIR);
  const repo = reposFile.repos.find((r) => r.name === repoName);

  if (!repo) {
    console.error(chalk.red(`Repository '${repoName}' not found.`));
    console.error(chalk.dim("Available repos:"));
    for (const r of reposFile.repos) {
      console.error(chalk.dim(`  • ${r.name}`));
    }
    process.exit(1);
  }

  // Check bare repo exists
  const bareRepoPath = getBareRepoPath(BLOOM_DIR, repoName);
  if (!existsSync(bareRepoPath)) {
    console.error(chalk.red(`Bare repository not found at ${bareRepoPath}`));
    console.error(chalk.dim("Try running 'bloom repo sync' to restore it."));
    process.exit(1);
  }

  // Get existing worktrees
  const worktrees = await listWorktrees(BLOOM_DIR, repoName);

  // Build choices for the picker
  const select = (await import("@inquirer/select")).default;

  const choices: Array<{ name: string; value: string; description?: string }> = worktrees.map((wt) => ({
    name: wt.branch,
    value: wt.branch,
    description: wt.path,
  }));

  choices.push({
    name: `${chalk.green("+")} Create new worktree`,
    value: "__create_new__",
  });

  // Default to the repo's default branch
  const defaultValue = worktrees.some((wt) => wt.branch === repo.defaultBranch) ? repo.defaultBranch : undefined;

  const agentDisplay = agentName ? ` (using ${agentName})` : "";
  console.log(`${chalk.bold.cyan("Select worktree for")} ${chalk.cyan(repoName)}${chalk.cyan(agentDisplay)}\n`);

  const selected = await select({
    message: "Worktree",
    choices,
    default: defaultValue,
  });

  if (selected === "__create_new__") {
    const input = (await import("@inquirer/input")).default;

    const branchName = await input({
      message: "New branch name",
    });

    if (!branchName.trim()) {
      console.error(chalk.red("Branch name cannot be empty."));
      process.exit(1);
    }

    console.log(chalk.dim(`Creating worktree for branch '${branchName}'...`));
    const result = await addWorktree(BLOOM_DIR, repoName, branchName.trim(), { create: true });

    if (!result.success) {
      console.error(chalk.red(`Failed to create worktree: ${result.error}`));
      process.exit(1);
    }

    console.log(`${chalk.green("Created worktree at:")} ${chalk.blue(result.path)}\n`);
    await runEnterSession(result.path, agentName);
  } else {
    const worktreePath = getWorktreePath(BLOOM_DIR, repoName, selected);
    console.log(`${chalk.bold.cyan("Entering:")} ${chalk.blue(worktreePath)}\n`);
    await runEnterSession(worktreePath, agentName);
  }
}

// =============================================================================
// Mode 3: Repo + Branch - Direct worktree entry
// =============================================================================

export async function cmdEnterRepoBranch(repoName: string, branch: string, agentName?: string): Promise<void> {
  // Validate repo exists in config
  const reposFile = await loadReposFile(BLOOM_DIR);
  const repo = reposFile.repos.find((r) => r.name === repoName);

  if (!repo) {
    console.error(chalk.red(`Repository '${repoName}' not found.`));
    console.error(chalk.dim("Available repos:"));
    for (const r of reposFile.repos) {
      console.error(chalk.dim(`  • ${r.name}`));
    }
    process.exit(1);
  }

  // Check bare repo exists
  const bareRepoPath = getBareRepoPath(BLOOM_DIR, repoName);
  if (!existsSync(bareRepoPath)) {
    console.error(chalk.red(`Bare repository not found at ${bareRepoPath}`));
    console.error(chalk.dim("Try running 'bloom repo sync' to restore it."));
    process.exit(1);
  }

  const worktreePath = getWorktreePath(BLOOM_DIR, repoName, branch);

  // If worktree doesn't exist, create it
  if (!existsSync(worktreePath)) {
    console.log(chalk.dim(`Creating worktree for branch '${branch}'...`));
    const result = await addWorktree(BLOOM_DIR, repoName, branch, { create: true });

    if (!result.success) {
      console.error(chalk.red(`Failed to create worktree: ${result.error}`));
      process.exit(1);
    }

    console.log(`${chalk.green("Created worktree at:")} ${chalk.blue(result.path)}\n`);
    await runEnterSession(result.path, agentName);
  } else {
    const agentDisplay = agentName ? ` (using ${agentName})` : "";
    console.log(`${chalk.bold.cyan("Entering:")} ${chalk.blue(worktreePath)}${chalk.cyan(agentDisplay)}\n`);
    await runEnterSession(worktreePath, agentName);
  }
}
