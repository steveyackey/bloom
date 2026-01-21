// =============================================================================
// Generate Command - Generate tasks.yaml from implementation plan
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { ClaudeAgentProvider } from "../agents";
import { loadPrompt } from "../prompts";
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

  await runGenerateSession(workingDir, tasksFile);

  console.log(chalk.dim(`\n---`));
  console.log(`${chalk.green("Tasks generated to:")} ${chalk.cyan(tasksFile)}`);
  console.log(`\n${chalk.bold("Next steps:")}`);
  console.log(`  ${chalk.cyan("bloom validate")}      # Check for issues`);
  console.log(`  ${chalk.cyan("bloom run")}           # Execute tasks (run from this directory)`);
}
