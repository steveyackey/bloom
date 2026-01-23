/**
 * Project Service
 * Handles project creation and formatting operations.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import { createAgent } from "../agents";
import { BLOOM_DIR } from "../commands/context";
import { loadPrompt } from "../prompts";

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

/**
 * Runs an interactive Claude session to help with project creation.
 *
 * @param projectDir - Directory of the newly created project
 */
export async function runCreateSession(projectDir: string): Promise<void> {
  const systemPrompt = await loadPrompt(
    "create",
    {
      PROJECT_DIR: projectDir,
    },
    BLOOM_DIR
  );

  const agent = await createAgent("interactive");

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
// Create Project In Place (for 'bloom create .')
// =============================================================================

/**
 * Creates a project in an existing directory by copying templates.
 * Used when user runs 'bloom create .' in an existing folder.
 *
 * @param projectDir - Directory to initialize as a project (must already exist)
 * @param workspaceDir - Directory containing workspace templates (defaults to BLOOM_DIR)
 * @returns CreateResult with success status and created files
 */
export async function createProjectInPlace(projectDir: string, workspaceDir?: string): Promise<CreateResult> {
  const workspaceTemplateDir = join(workspaceDir || BLOOM_DIR, "template");

  const result: CreateResult = {
    success: true,
    projectDir,
    created: [],
  };

  // Check if directory exists
  if (!existsSync(projectDir)) {
    return {
      success: false,
      projectDir,
      created: [],
      error: `Directory '${projectDir}' does not exist. Use 'bloom create <name>' to create a new project.`,
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

  // Copy template files from workspace template/ to project
  // Skip files that already exist, rename CLAUDE.template.md to CLAUDE.md
  const templateFiles = readdirSync(workspaceTemplateDir);
  for (const file of templateFiles) {
    const srcPath = join(workspaceTemplateDir, file);
    // Rename CLAUDE.template.md to CLAUDE.md when copying
    const destFile = file === "CLAUDE.template.md" ? "CLAUDE.md" : file;
    const destPath = join(projectDir, destFile);

    // Skip if file already exists
    if (existsSync(destPath)) {
      continue;
    }

    cpSync(srcPath, destPath, { recursive: true });
    result.created.push(destFile);
  }

  return result;
}

// =============================================================================
// Run Create In-Place Session (reads existing files first)
// =============================================================================

/**
 * Gathers information about existing files in a directory for context.
 *
 * @param projectDir - Directory to scan
 * @returns Object with file listing and contents of key files
 */
function gatherExistingContext(projectDir: string): string {
  const lines: string[] = [];
  const ignoredDirs = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".cache",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
  ]);
  const ignoredFiles = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".DS_Store"]);

  // Extensions we can safely read as text
  const textExtensions = new Set([
    ".md",
    ".txt",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".py",
    ".go",
    ".rs",
    ".sh",
    ".bash",
    ".css",
    ".scss",
    ".html",
    ".xml",
    ".sql",
    ".env.example",
    ".gitignore",
    ".dockerignore",
    "Dockerfile",
    "Makefile",
  ]);

  lines.push("## Existing Files in Project Directory\n");

  try {
    const entries = readdirSync(projectDir, { withFileTypes: true });
    const files: string[] = [];
    const dirs: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") {
        continue; // Skip hidden files except .env.example
      }

      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          dirs.push(`${entry.name}/`);
        }
      } else if (entry.isFile()) {
        if (!ignoredFiles.has(entry.name)) {
          files.push(entry.name);
        }
      }
    }

    // List structure
    lines.push("### Directory Structure\n```");
    for (const dir of dirs.sort()) {
      lines.push(dir);
    }
    for (const file of files.sort()) {
      lines.push(file);
    }
    lines.push("```\n");

    // Read contents of key files (limit to reasonable size)
    const maxFileSize = 10000; // 10KB max per file
    const maxTotalSize = 50000; // 50KB total
    let totalSize = 0;

    lines.push("### File Contents\n");

    for (const file of files.sort()) {
      const ext = file.includes(".") ? `.${file.split(".").pop()!}` : file;
      const filePath = join(projectDir, file);

      // Check if we should read this file
      if (!textExtensions.has(ext) && !textExtensions.has(file)) {
        continue;
      }

      try {
        const stats = statSync(filePath);
        if (stats.size > maxFileSize) {
          lines.push(`**${file}** (too large, ${stats.size} bytes)\n`);
          continue;
        }

        if (totalSize + stats.size > maxTotalSize) {
          lines.push(`\n*Remaining files omitted due to size limit*\n`);
          break;
        }

        const content = readFileSync(filePath, "utf-8");
        totalSize += stats.size;

        lines.push(`**${file}:**`);
        lines.push("```");
        lines.push(content.trim());
        lines.push("```\n");
      } catch {
        // Skip files we can't read
      }
    }
  } catch {
    lines.push("*Could not read directory contents*\n");
  }

  return lines.join("\n");
}

/**
 * Runs an interactive Claude session for in-place project creation.
 * Reads existing files in the directory first to gather context,
 * then helps create the PRD.
 *
 * @param projectDir - Directory of the project
 * @param projectName - Name of the project (from folder name)
 */
export async function runCreateInPlaceSession(projectDir: string, projectName: string): Promise<void> {
  // Gather context from existing files
  console.log(chalk.dim("Reading existing files for context...\n"));
  const existingContext = gatherExistingContext(projectDir);

  const systemPrompt = await loadPrompt(
    "create-in-place",
    {
      PROJECT_DIR: projectDir,
      PROJECT_NAME: projectName,
      EXISTING_CONTEXT: existingContext,
    },
    BLOOM_DIR
  );

  const agent = await createAgent("interactive");

  console.log(`${chalk.bold.cyan("Starting project creation session...")}\n`);
  console.log(chalk.dim("Claude will review existing files and help you create the PRD.\n"));

  const initialPrompt = `I've set up a project in the current directory called "${projectName}". I've already gathered some research and context. Please review what's here and help me create a comprehensive PRD.md based on this context and any additional information I provide.`;

  await agent.run({
    systemPrompt,
    prompt: initialPrompt,
    startingDirectory: projectDir,
  });
}
