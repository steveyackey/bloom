// =============================================================================
// Init Command - Initialize a new Bloom workspace
// =============================================================================

import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as YAML from "yaml";
import { BLOOM_DIR, isInGitRepo } from "./context";

// Path to template folder (relative to this file's package)
const PACKAGE_TEMPLATE_DIR = resolve(import.meta.dirname ?? ".", "..", "..", "template");

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
  const templateDir = join(dir, "template");

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

  // Add repos/ to .gitignore (create or append)
  const gitignorePath = join(dir, ".gitignore");
  const reposIgnoreEntry = "repos/";
  if (existsSync(gitignorePath)) {
    const gitignoreContent = readFileSync(gitignorePath, "utf-8");
    if (!gitignoreContent.includes(reposIgnoreEntry)) {
      const newline = gitignoreContent.endsWith("\n") ? "" : "\n";
      appendFileSync(gitignorePath, `${newline}${reposIgnoreEntry}\n`);
      result.created.push(".gitignore (added repos/)");
    } else {
      result.skipped.push(".gitignore (repos/ already present)");
    }
  } else {
    await Bun.write(gitignorePath, `${reposIgnoreEntry}\n`);
    result.created.push(".gitignore");
  }

  // Create template directory and copy template files
  if (existsSync(templateDir)) {
    result.skipped.push("template/");
  } else {
    mkdirSync(templateDir, { recursive: true });
    result.created.push("template/");

    // Copy template files from package to workspace template/
    if (existsSync(PACKAGE_TEMPLATE_DIR)) {
      const templateFiles = readdirSync(PACKAGE_TEMPLATE_DIR);
      for (const file of templateFiles) {
        const srcPath = join(PACKAGE_TEMPLATE_DIR, file);
        const destPath = join(templateDir, file);
        cpSync(srcPath, destPath, { recursive: true });
        result.created.push(`template/${file}`);
      }
    } else {
      // Fallback: create minimal templates if package template dir doesn't exist
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

      const planContent = `# Implementation Plan

## Summary
Brief summary of what will be implemented based on the PRD.

## Architecture Overview
High-level architecture decisions and design patterns to be used.

## Implementation Phases

### Phase 1: [Phase Name]
**Goal**: What this phase accomplishes

**Tasks**:
1. Task description
2. Task description

**Acceptance Criteria**:
- [ ] Criterion 1
- [ ] Criterion 2

## Dependencies
- List any external dependencies or prerequisites

## Risks & Mitigations
- **Risk**: Description
  - **Mitigation**: How to address it

## Open Questions
- Questions that need resolution before or during implementation
`;

      const claudeContent = `# Project Guidelines

## Commit Style
Always use conventional commits.

## Development Workflow
1. Review the PRD in PRD.md
2. Check the plan in plan.md
3. Follow the tasks in tasks.yaml

## Code Standards
- Write clear, maintainable code
- Add tests for new functionality
- Update documentation as needed
`;

      await Bun.write(join(templateDir, "PRD.md"), prdContent);
      result.created.push("template/PRD.md");

      await Bun.write(join(templateDir, "plan.md"), planContent);
      result.created.push("template/plan.md");

      await Bun.write(join(templateDir, "CLAUDE.template.md"), claudeContent);
      result.created.push("template/CLAUDE.template.md");
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
  console.log("  bloom repo clone <url>    Add repositories to work on");
  console.log("  bloom create <name>       Create a new project");
}
