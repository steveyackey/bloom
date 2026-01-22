// =============================================================================
// Create Command - Create a new project with PRD template
// =============================================================================

import chalk from "chalk";
import {
  createProject,
  runCreateSession,
  type CreateResult,
} from "../services/project-service";

// Re-export types and functions from service for backwards compatibility
export { createProject, runCreateSession, type CreateResult };

// =============================================================================
// Command Handler
// =============================================================================

export async function cmdCreate(projectName: string): Promise<void> {
  if (!projectName) {
    console.error(chalk.red("Usage: bloom create <projectName>"));
    process.exit(1);
  }

  console.log(`${chalk.bold.cyan("Creating project")} '${chalk.yellow(projectName)}'...\n`);

  const result = await createProject(projectName);

  if (!result.success) {
    console.error(chalk.red(`Error: ${result.error}`));
    process.exit(1);
  }

  console.log(chalk.bold("Created:"));
  for (const item of result.created) {
    console.log(`  ${chalk.green("+")} ${item}`);
  }

  // Launch Claude session
  await runCreateSession(result.projectDir);

  console.log(chalk.dim(`\n---`));
  console.log(
    `${chalk.green("Project")} '${chalk.yellow(projectName)}' ${chalk.green("created at:")} ${chalk.cyan(result.projectDir)}`
  );
  console.log(`\n${chalk.bold("Next steps:")}`);
  console.log(`  ${chalk.cyan(`cd ${projectName}`)}`);
  console.log(chalk.dim(`\nThen run these commands from within the project directory:`));
  console.log(`  ${chalk.cyan("bloom refine")}        # Refine the PRD and templates`);
  console.log(`  ${chalk.cyan("bloom plan")}          # Create implementation plan`);
  console.log(`  ${chalk.cyan("bloom generate")}      # Generate tasks.yaml from plan`);
  console.log(`  ${chalk.cyan("bloom run")}           # Execute tasks`);
}
