// =============================================================================
// Plan Command - Generate implementation plan from project context
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { runPlanSession } from "../services/planning-service";
import { pullAndLogResults } from "../services/repo-service";
import { BLOOM_DIR } from "./context";

// Re-export for backwards compatibility
export { buildReposContext, runPlanSession } from "../services/planning-service";

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
  await pullAndLogResults(BLOOM_DIR);

  await runPlanSession(workingDir, planFile, BLOOM_DIR);

  console.log(chalk.dim(`\n---`));
  console.log(`${chalk.green("Plan saved to:")} ${chalk.cyan(planFile)}`);
  console.log(`\n${chalk.bold("Next steps:")}`);
  console.log(`  ${chalk.cyan("bloom refine")}        # Refine the plan if needed`);
  console.log(`  ${chalk.cyan("bloom generate")}      # Generate tasks.yaml for execution`);
}
