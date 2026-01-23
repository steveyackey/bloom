// =============================================================================
// Create Feature - Create a new project with PRD template
// =============================================================================

import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import type { Clerc } from "clerc";
import { ClaudeAgentProvider } from "../../core/agents";
import { BLOOM_DIR } from "../../core/context";
import { loadPrompt } from "../../core/prompts";

// =============================================================================
// Types
// =============================================================================

export interface CreateResult {
  success: boolean;
  projectDir: string;
  created: string[];
  error?: string;
}

export interface FormattedProjectName {
  slug: string;
  displayName: string;
}

// =============================================================================
// Implementation
// =============================================================================

export function formatProjectName(input: string | string[]): FormattedProjectName {
  let displayName: string;

  if (Array.isArray(input)) {
    if (input.length === 0) {
      throw new Error("Project name cannot be empty");
    }
    displayName = input.join(" ");
  } else {
    if (!input || input.trim() === "") {
      throw new Error("Project name cannot be empty");
    }
    displayName = input.trim();
  }

  // Collapse multiple spaces to single space
  displayName = displayName.replace(/\s+/g, " ");

  // Create slug: lowercase, spaces to dashes, remove special chars
  const slug = displayName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  return { slug, displayName };
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

// =============================================================================
// CLI Registration
// =============================================================================

export function register(cli: Clerc): Clerc {
  return cli
    .command("create", "Create a new project with PRD template", {
      parameters: ["<name...>"],
      help: { group: "workflow" },
    })
    .on("create", async (ctx) => {
      const nameArgs = ctx.parameters.name as string[];
      await cmdCreate(nameArgs);
    });
}
