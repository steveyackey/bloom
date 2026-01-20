// =============================================================================
// Create Command - Create a new project with PRD template
// =============================================================================

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { ClaudeAgentProvider } from "../agents";
import { loadPrompt } from "../prompts";

// =============================================================================
// Default Templates
// =============================================================================

const DEFAULT_PRD_TEMPLATE = `# Product Requirements Document: [Project Name]

## Overview
Brief description of the project and its purpose.

## Problem Statement
What problem does this solve? Why does it need to exist?

## Target Users
Who will use this? What are their needs?

## Goals & Success Criteria
- Primary goal
- How will we measure success?

## Core Features
1. **Feature Name**: Description
2. **Feature Name**: Description

## Technical Requirements
- Platform/runtime requirements
- Key technologies or frameworks
- Constraints or limitations

## Non-Goals (Out of Scope)
- What this project will NOT do (for this version)

## Open Questions
- Any unresolved decisions or unknowns
`;

const DEFAULT_CLAUDE_MD = `# Project Guidelines

## Commit Style
Always use conventional commits.

## Development Workflow
1. Review the PRD in \`template/PRD.md\`
2. Check the plan in \`plan.md\`
3. Follow the tasks in \`tasks.yaml\`

## Code Standards
- Write clear, maintainable code
- Add tests for new functionality
- Update documentation as needed
`;

// =============================================================================
// Create Project
// =============================================================================

export interface CreateResult {
  success: boolean;
  projectDir: string;
  created: string[];
  error?: string;
}

export async function createProject(projectName: string, baseDir?: string): Promise<CreateResult> {
  const cwd = baseDir || process.cwd();
  const projectDir = resolve(cwd, projectName);

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

  // Create project directory
  mkdirSync(projectDir, { recursive: true });
  result.created.push(`${projectName}/`);

  // Initialize git repository
  const gitResult = spawnSync("git", ["init"], {
    cwd: projectDir,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (gitResult.status !== 0) {
    return {
      success: false,
      projectDir,
      created: result.created,
      error: `Failed to initialize git: ${gitResult.stderr}`,
    };
  }
  result.created.push(".git/");

  // Create template directory
  const templateDir = join(projectDir, "template");
  mkdirSync(templateDir, { recursive: true });
  result.created.push("template/");

  // Create PRD template
  const prdPath = join(templateDir, "PRD.md");
  await Bun.write(prdPath, DEFAULT_PRD_TEMPLATE);
  result.created.push("template/PRD.md");

  // Create CLAUDE.md
  const claudeMdPath = join(projectDir, "CLAUDE.md");
  await Bun.write(claudeMdPath, DEFAULT_CLAUDE_MD);
  result.created.push("CLAUDE.md");

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

  console.log(`\nStarting project creation session...\n`);
  console.log(`Claude will help you define your project and fill out the PRD.\n`);

  await agent.run({
    systemPrompt,
    prompt: "",
    startingDirectory: projectDir,
  });
}

// =============================================================================
// Command Handler
// =============================================================================

export async function cmdCreate(projectName: string): Promise<void> {
  if (!projectName) {
    console.error("Usage: bloom create <projectName>");
    process.exit(1);
  }

  console.log(`Creating project '${projectName}'...\n`);

  const result = await createProject(projectName);

  if (!result.success) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  console.log("Created:");
  for (const item of result.created) {
    console.log(`  + ${item}`);
  }

  // Launch Claude session
  await runCreateSession(result.projectDir);

  console.log(`\n---`);
  console.log(`Project '${projectName}' created at: ${result.projectDir}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${projectName}`);
  console.log(`  bloom plan          # Create implementation plan`);
}
