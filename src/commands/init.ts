// =============================================================================
// Init Command - Initialize a new Bloom workspace
// =============================================================================

import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import * as YAML from "yaml";
import { BLOOM_DIR, isInGitRepo } from "./context";

// Path to template folder (relative to this file's package)
const TEMPLATE_DIR = resolve(import.meta.dirname ?? ".", "..", "..", "template");

export interface InitResult {
  success: boolean;
  created: string[];
  skipped: string[];
  error?: string;
}

export async function initWorkspace(dir: string = BLOOM_DIR): Promise<InitResult> {
  const result: InitResult = {
    success: true,
    created: [],
    skipped: [],
  };

  const configFile = join(dir, "bloom.config.yaml");
  const reposDir = join(dir, "repos");
  const tasksFile = join(dir, "tasks.yaml");
  const projectDir = join(dir, "project");

  // Create bloom.config.yaml (marks this as a bloom project)
  if (existsSync(configFile)) {
    result.skipped.push("bloom.config.yaml");
  } else {
    const config = {
      version: 1,
      repos: [],
    };
    await Bun.write(configFile, YAML.stringify(config, { indent: 2 }));
    result.created.push("bloom.config.yaml");
  }

  // Create repos directory
  if (existsSync(reposDir)) {
    result.skipped.push("repos/");
  } else {
    mkdirSync(reposDir, { recursive: true });
    result.created.push("repos/");
  }

  // Create tasks.yaml
  if (existsSync(tasksFile)) {
    result.skipped.push("tasks.yaml");
  } else {
    await Bun.write(tasksFile, YAML.stringify({ tasks: [] }, { indent: 2 }));
    result.created.push("tasks.yaml");
  }

  // Create project directory with template files
  if (existsSync(projectDir)) {
    result.skipped.push("project/");
  } else {
    mkdirSync(projectDir, { recursive: true });
    result.created.push("project/");

    // Copy template files into project folder
    if (existsSync(TEMPLATE_DIR)) {
      const templateFiles = readdirSync(TEMPLATE_DIR);
      for (const file of templateFiles) {
        const srcPath = join(TEMPLATE_DIR, file);
        const destPath = join(projectDir, file);
        cpSync(srcPath, destPath, { recursive: true });
        result.created.push(`project/${file}`);
      }
    } else {
      // Fallback: create minimal PRD.md if template doesn't exist
      const prdContent = `# Product Requirements Document: [Project Name]

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
      await Bun.write(join(projectDir, "PRD.md"), prdContent);
      result.created.push("project/PRD.md");
    }
  }

  return result;
}

export async function cmdInit(): Promise<void> {
  if (!isInGitRepo()) {
    console.log("Not in a git repository.\n");
    console.log("Bloom works best inside a git repo. Please run:");
    console.log("  git init");
    console.log("  git remote add origin <your-repo-url>");
    console.log("  git push -u origin main\n");
    console.log("Then run 'bloom init' again.");
    process.exit(1);
  }

  console.log(`Initializing Bloom workspace in ${BLOOM_DIR}\n`);

  const result = await initWorkspace();

  if (result.created.length > 0) {
    console.log("Created:");
    for (const item of result.created) {
      console.log(`  + ${item}`);
    }
  }

  if (result.skipped.length > 0) {
    console.log("Already exists:");
    for (const item of result.skipped) {
      console.log(`  - ${item}`);
    }
  }

  console.log("\nWorkspace ready. Next steps:");
  console.log("  bloom repo clone <url>    Add a repository");
  console.log("  bloom plan                Create tasks with Claude");
  console.log("  bloom run                 Start the orchestrator");
}
