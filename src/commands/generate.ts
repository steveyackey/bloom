// =============================================================================
// Generate Command - Generate tasks.yaml from implementation plan
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { ClaudeAgentProvider } from "../agents";
import { loadPrompt } from "../prompts";
import { pullAllDefaultBranches } from "../repos";
import { BLOOM_DIR } from "./context";
import { buildReposContext } from "./plan-command";

// =============================================================================
// Run Generate Session
// =============================================================================

export async function runGenerateSession(workingDir: string, tasksFile: string): Promise<void> {
  // Build repos context
  const reposContext = await buildReposContext(BLOOM_DIR);

  const systemPrompt = await loadPrompt("generate", {
    WORKING_DIR: workingDir,
    TASKS_FILE: tasksFile,
    REPOS_CONTEXT: reposContext,
  });

  const agent = new ClaudeAgentProvider({
    interactive: true,
    dangerouslySkipPermissions: true,
  });

  console.log(`${chalk.bold("Generate session")} - tasks will be written to: ${chalk.cyan(tasksFile)}\n`);

  const initialPrompt = `Please read the plan.md and generate a tasks.yaml file. Start by reading the plan, then create the task definitions.

IMPORTANT: After writing tasks.yaml, you MUST validate it by running \`bloom validate\`. If validation fails (especially YAML parsing errors with strings containing special characters like backticks, quotes, or colons), fix the quoting issues and re-validate until it passes.`;

  // Run Claude from the working directory
  await agent.run({
    systemPrompt,
    prompt: initialPrompt,
    startingDirectory: workingDir,
  });
}

// =============================================================================
// Command Handler
// =============================================================================

export async function cmdGenerate(): Promise<void> {
  const workingDir = process.cwd();
  const planFile = join(workingDir, "plan.md");
  const tasksFile = join(workingDir, "tasks.yaml");

  // Check for plan.md
  if (!existsSync(planFile)) {
    console.log(chalk.yellow("Note: No plan found at plan.md"));
    console.log(chalk.dim("Consider running 'bloom plan' first to create an implementation plan.\n"));
  }

  // Pull updates from default branches before generating
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
    console.log(chalk.dim("\nProceeding with generation using existing local state.\n"));
  } else if (pullResult.updated.length > 0 || pullResult.upToDate.length > 0) {
    console.log("");
  }

  await runGenerateSession(workingDir, tasksFile);

  console.log(chalk.dim(`\n---`));
  console.log(`${chalk.green("Tasks generated to:")} ${chalk.cyan(tasksFile)}`);
  console.log(`\n${chalk.bold("Next steps:")}`);
  console.log(`  ${chalk.cyan("bloom validate")}      # Check for issues`);
  console.log(`  ${chalk.cyan("bloom run")}           # Execute tasks (run from this directory)`);
}
