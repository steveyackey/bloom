// Create Command - Create a new project with PRD template
import chalk from "chalk";
import { formatProjectName, createProject, runCreateSession } from "../services";

export { createProject }; // Re-export for backwards compatibility

export async function cmdCreate(nameArgs: string[]): Promise<void> {
  if (!nameArgs || nameArgs.length === 0) {
    console.error(chalk.red("Usage: bloom create <projectName>"));
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
