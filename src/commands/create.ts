// =============================================================================
// Create Command - Create a new project with PRD template
// =============================================================================

import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import { ClaudeAgentProvider } from "../agents";
import { loadPrompt } from "../prompts";
import { BLOOM_DIR } from "./context";

// =============================================================================
// Create Project
// =============================================================================

export interface CreateResult {
  success: boolean;
  projectDir: string;
  created: string[];
  error?: string;
}

export async function createProject(
  projectName: string,
  baseDir?: string,
  workspaceDir?: string
): Promise<CreateResult> {
  const cwd = baseDir || process.cwd();
  const projectDir = resolve(cwd, projectName);
  const workspaceTemplateDir = join(workspaceDir || BLOOM_DIR, "template");

  const result: CreateResult = {
    success: true,
    projectDir,
    created: [],
  };

  // Check if directory already exists
  if (existsSync(projectDir)) {
    return {
      success: false,
      projectDir,
      created: [],
      error: `Directory '${projectName}' already exists`,
    };
  }

  // Check if workspace template directory exists
  if (!existsSync(workspaceTemplateDir)) {
    return {
      success: false,
      projectDir,
      created: [],
      error: `No template/ folder found. Run 'bloom init' first to create workspace templates.`,
    };
  }

  // Create project directory
  mkdirSync(projectDir, { recursive: true });
  result.created.push(`${projectName}/`);

  // Copy template files from workspace template/ to project
  // Rename CLAUDE.template.md to CLAUDE.md
  const templateFiles = readdirSync(workspaceTemplateDir);
  for (const file of templateFiles) {
    const srcPath = join(workspaceTemplateDir, file);
    // Rename CLAUDE.template.md to CLAUDE.md when copying
    const destFile = file === "CLAUDE.template.md" ? "CLAUDE.md" : file;
    const destPath = join(projectDir, destFile);
    cpSync(srcPath, destPath, { recursive: true });
    result.created.push(destFile);
  }

  return result;
}

// =============================================================================
// Run Create Session (launches Claude to help with PRD)
// =============================================================================

export async function runCreateSession(projectDir: string): Promise<void> {
  const systemPrompt = await loadPrompt("create", {
    PROJECT_DIR: projectDir,
  });

  const agent = new ClaudeAgentProvider({
    interactive: true,
    dangerouslySkipPermissions: true,
  });

  console.log(`\n${chalk.bold.cyan("Starting project creation session...")}\n`);
  console.log(chalk.dim("Claude will help you define your project and fill out the PRD.\n"));

  const initialPrompt = `I've just created a new project and need help filling out the PRD.md. What would you like to build? Tell me about your idea and I'll help you capture the requirements.`;

  await agent.run({
    systemPrompt,
    prompt: initialPrompt,
    startingDirectory: projectDir,
  });
}

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
