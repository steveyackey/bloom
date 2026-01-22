/**
 * Project Service
 * Handles project creation and formatting operations.
 */

import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import { ClaudeAgentProvider } from "../agents";
import { loadPrompt } from "../prompts";
import { BLOOM_DIR } from "../commands/context";

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
// Format Project Name
// =============================================================================

/**
 * Formats a project name for display and file system use.
 *
 * @param input - Either a string or array of strings (from variadic CLI args)
 * @returns Object with slug (filesystem-safe) and displayName (human-readable)
 * @throws Error if input is empty
 *
 * @example
 * formatProjectName(['My', 'Big', 'Idea'])
 * // => { slug: 'my-big-idea', displayName: 'My Big Idea' }
 *
 * formatProjectName('my-project')
 * // => { slug: 'my-project', displayName: 'my-project' }
 */
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

  // Create slug: lowercase, spaces to dashes, remove special chars (keep alphanumeric and dashes)
  const slug = displayName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  return { slug, displayName };
}

// =============================================================================
// Create Project
// =============================================================================

/**
 * Creates a new project in the workspace.
 *
 * @param projectName - Name of the project directory to create
 * @param baseDir - Base directory to create project in (defaults to cwd)
 * @param workspaceDir - Directory containing workspace templates (defaults to BLOOM_DIR)
 * @returns CreateResult with success status and created files
 */
export async function createProject(
  projectName: string,
  baseDir?: string,
  workspaceDir?: string,
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

/**
 * Runs an interactive Claude session to help with project creation.
 *
 * @param projectDir - Directory of the newly created project
 */
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
