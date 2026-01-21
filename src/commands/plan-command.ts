// =============================================================================
// Plan Command - Generate implementation plan from project context
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { ClaudeAgentProvider } from "../agents";
import { loadPrompt } from "../prompts";
import { listRepos, pullAllDefaultBranches } from "../repos";
import { BLOOM_DIR, findGitRoot } from "./context";

// =============================================================================
// Build Repos Context
// =============================================================================

export async function buildReposContext(bloomDir: string): Promise<string> {
  const repos = await listRepos(bloomDir);

  if (repos.length === 0) {
    return "No repositories configured. Run `bloom repo clone <url>` to add repositories.";
  }

  const lines: string[] = ["## Configured Repositories", ""];

  for (const repo of repos) {
    lines.push(`### ${repo.name}`);
    lines.push(`- URL: ${repo.url}`);
    lines.push(`- Default Branch: ${repo.defaultBranch}`);
    lines.push(`- Status: ${repo.exists ? "Cloned" : "Not cloned"}`);

    if (repo.worktrees.length > 0) {
      lines.push(`- Worktrees: ${repo.worktrees.join(", ")}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

// =============================================================================
// Run Planning Session
// =============================================================================

export async function runPlanSession(workingDir: string, planFile: string): Promise<void> {
  const gitRoot = findGitRoot() || workingDir;

  // Build repos context
  const reposContext = await buildReposContext(BLOOM_DIR);

  const systemPrompt = await loadPrompt("plan", {
    WORKING_DIR: workingDir,
    PLAN_FILE: planFile,
    REPOS_CONTEXT: reposContext,
  });

  const agent = new ClaudeAgentProvider({
    interactive: true,
    dangerouslySkipPermissions: true,
  });

  console.log(`${chalk.bold("Planning session")} - plan will be written to: ${chalk.cyan(planFile)}\n`);

  const initialPrompt = `Let's create an implementation plan. First, read the PRD.md to understand what we're building, then summarize the key requirements and ask me any clarifying questions before we draft the plan.`;

  // Run Claude from git root but tell it about the working directory
  await agent.run({
    systemPrompt,
    prompt: initialPrompt,
    startingDirectory: gitRoot,
  });
}

// =============================================================================
// Command Handler
// =============================================================================

export async function cmdPlan(): Promise<void> {
  const workingDir = process.cwd();
  const planFile = join(workingDir, "plan.md");
  const prdPath = join(workingDir, "PRD.md");

  // Check for PRD in the project directory
  if (!existsSync(prdPath)) {
    console.log(chalk.yellow("Note: No PRD.md found in the current directory."));
    console.log(chalk.dim("Consider running 'bloom create <name>' first or adding a PRD.md.\n"));
  }

  // Pull updates from default branches before planning
  console.log(chalk.dim("Pulling latest updates from default branches...\n"));
  const pullResult = await pullAllDefaultBranches(BLOOM_DIR);

  if (pullResult.updated.length > 0) {
    console.log(`${chalk.green("Updated:")} ${pullResult.updated.map((u) => chalk.cyan(u)).join(", ")}`);
  }
  if (pullResult.upToDate.length > 0) {
    console.log(`${chalk.dim("Already up to date:")} ${pullResult.upToDate.join(", ")}`);
  }
  if (pullResult.failed.length > 0) {
    console.log(chalk.yellow("\nWarning: Failed to pull updates for some repos:"));
    for (const { name, error } of pullResult.failed) {
      console.log(`  ${chalk.red(name)}: ${error}`);
    }
    console.log(chalk.dim("\nProceeding with planning using existing local state.\n"));
  } else if (pullResult.updated.length > 0 || pullResult.upToDate.length > 0) {
    console.log("");
  }

  await runPlanSession(workingDir, planFile);

  console.log(chalk.dim(`\n---`));
  console.log(`${chalk.green("Plan saved to:")} ${chalk.cyan(planFile)}`);
  console.log(`\n${chalk.bold("Next steps:")}`);
  console.log(`  ${chalk.cyan("bloom refine")}        # Refine the plan if needed`);
  console.log(`  ${chalk.cyan("bloom generate")}      # Generate tasks.yaml for execution`);
}
