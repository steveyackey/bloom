// =============================================================================
// Generate Command - Generate tasks.yaml from implementation plan
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { pullAllDefaultBranches } from "../infra/git";
import { runGenerateSession } from "../services/planning-service";
import { formatPullResults } from "../services/repo-service";
import { BLOOM_DIR } from "./context";

// =============================================================================
// Command Handler
// =============================================================================

export async function cmdGenerate(agentName?: string): Promise<void> {
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
  for (const line of formatPullResults(pullResult)) {
    console.log(line);
  }
  if (pullResult.failed.length === 0 && (pullResult.updated.length > 0 || pullResult.upToDate.length > 0)) {
    console.log("");
  }

  await runGenerateSession(workingDir, tasksFile, BLOOM_DIR, agentName);

  console.log(chalk.dim(`\n---`));
  console.log(`${chalk.green("Tasks generated to:")} ${chalk.cyan(tasksFile)}`);
  console.log(`\n${chalk.bold("Next steps:")}`);
  console.log(`  ${chalk.cyan("bloom validate")}      # Check for issues`);
  console.log(`  ${chalk.cyan("bloom run")}           # Execute tasks (run from this directory)`);
}
