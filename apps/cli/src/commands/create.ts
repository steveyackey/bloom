// Create Command - Create a new project with PRD template
import { basename, resolve } from "node:path";
import chalk from "chalk";
import {
  createProject,
  createProjectInPlace,
  formatProjectName,
  runCreateInPlaceSession,
  runCreateSession,
} from "../services";

export { createProject }; // Re-export for backwards compatibility

export async function cmdCreate(nameArgs: string[]): Promise<void> {
  // Handle 'bloom create .' - in-place project creation
  if (nameArgs.length === 1 && nameArgs[0] === ".") {
    await cmdCreateInPlace();
    return;
  }

  if (!nameArgs || nameArgs.length === 0) {
    console.error(chalk.red("Usage: bloom create <projectName>"));
    console.error(chalk.red("       bloom create .  (use current directory)"));
    process.exit(1);
  }

  const { slug, displayName } = formatProjectName(nameArgs);
  console.log(`${chalk.bold.cyan("Creating project")} '${chalk.yellow(displayName)}'...\n`);

  const result = await createProject(slug);
  if (!result.success) {
    console.error(chalk.red(`Error: ${result.error}`));
    process.exit(1);
  }

  console.log(chalk.bold("Created:"));
  for (const item of result.created) {
    console.log(`  ${chalk.green("+")} ${item}`);
  }

  await runCreateSession(result.projectDir);

  console.log(chalk.dim(`\n---`));
  console.log(
    `${chalk.green("Project")} '${chalk.yellow(displayName)}' ${chalk.green("created at:")} ${chalk.cyan(result.projectDir)}`
  );
  console.log(`\n${chalk.bold("Next steps:")}`);
  console.log(`  ${chalk.cyan(`cd ${slug}`)}`);
  console.log(chalk.dim(`\nThen run these commands from within the project directory:`));
  console.log(`  ${chalk.cyan("bloom refine")}        # Refine the PRD and templates`);
  console.log(`  ${chalk.cyan("bloom plan")}          # Create implementation plan`);
  console.log(`  ${chalk.cyan("bloom generate")}      # Generate tasks.yaml from plan`);
  console.log(`  ${chalk.cyan("bloom run")}           # Execute tasks`);
}

/**
 * Handle 'bloom create .' - create project in current directory
 * Reads existing files for context, then creates PRD
 */
async function cmdCreateInPlace(): Promise<void> {
  const projectDir = resolve(process.cwd());
  const projectName = basename(projectDir);

  console.log(`${chalk.bold.cyan("Creating project in current directory")} '${chalk.yellow(projectName)}'...\n`);

  const result = await createProjectInPlace(projectDir);
  if (!result.success) {
    console.error(chalk.red(`Error: ${result.error}`));
    process.exit(1);
  }

  if (result.created.length > 0) {
    console.log(chalk.bold("Created:"));
    for (const item of result.created) {
      console.log(`  ${chalk.green("+")} ${item}`);
    }
  }

  // Run the in-place create session which reads existing files first
  await runCreateInPlaceSession(projectDir, projectName);

  console.log(chalk.dim(`\n---`));
  console.log(
    `${chalk.green("Project")} '${chalk.yellow(projectName)}' ${chalk.green("initialized at:")} ${chalk.cyan(projectDir)}`
  );
  console.log(`\n${chalk.bold("Next steps:")}`);
  console.log(`  ${chalk.cyan("bloom refine")}        # Refine the PRD and templates`);
  console.log(`  ${chalk.cyan("bloom plan")}          # Create implementation plan`);
  console.log(`  ${chalk.cyan("bloom generate")}      # Generate tasks.yaml from plan`);
  console.log(`  ${chalk.cyan("bloom run")}           # Execute tasks`);
}
