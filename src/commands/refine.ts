// =============================================================================
// Refine Command - Refine PRD, plan, or other project documents
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { type RefineFile, runRefineSession } from "../services/planning-service";
import { pullAndLogResults } from "../services/repo-service";
import { BLOOM_DIR } from "./context";

// Re-export for backwards compatibility
export { type RefineFile, runRefineSession } from "../services/planning-service";

// =============================================================================
// File Selection
// =============================================================================

const REFINE_FILES: RefineFile[] = [
  {
    name: "PRD.md",
    description: "Product Requirements Document - defines WHAT to build and WHY",
    nextStep: "Create implementation plan from PRD",
    nextCommand: "bloom plan",
  },
  {
    name: "plan.md",
    description: "Implementation Plan - defines HOW to build it",
    nextStep: "Generate tasks.yaml for execution",
    nextCommand: "bloom generate",
  },
  {
    name: "tasks.yaml",
    description: "Task Definitions - machine-readable tasks for agents",
    nextStep: "Execute tasks with agents",
    nextCommand: "bloom run",
  },
  {
    name: "CLAUDE.md",
    description: "Guidelines for Claude agents working on this project",
    nextStep: "Continue with your workflow",
    nextCommand: "",
  },
];

async function selectFileToRefine(workingDir: string): Promise<RefineFile | null> {
  const select = (await import("@inquirer/select")).default;

  // Find which files exist
  const existingFiles = REFINE_FILES.filter((f) => existsSync(join(workingDir, f.name)));

  if (existingFiles.length === 0) {
    return null;
  }

  const choices = existingFiles.map((f) => ({
    name: `${chalk.cyan(f.name)} ${chalk.dim("-")} ${f.description}`,
    value: f,
  }));

  const selected = await select({
    message: "Which file would you like to refine?",
    choices,
  });

  return selected;
}

// =============================================================================
// Command Handler
// =============================================================================

export async function cmdRefine(agentName?: string): Promise<void> {
  const workingDir = process.cwd();

  // Ask user which file to refine
  const selectedFile = await selectFileToRefine(workingDir);

  if (!selectedFile) {
    console.log(chalk.yellow("No project files found in the current directory.\n"));
    console.log(chalk.bold("Typical project files:"));
    console.log(`  ${chalk.cyan("PRD.md")}      - Product Requirements Document`);
    console.log(`  ${chalk.cyan("plan.md")}     - Implementation plan`);
    console.log(`  ${chalk.cyan("tasks.yaml")}  - Task definitions`);
    console.log(`  ${chalk.cyan("CLAUDE.md")}   - Guidelines for Claude\n`);
    console.log(chalk.dim("Run 'bloom create <name>' to create a new project with templates."));
    process.exit(1);
  }

  // Pull updates from default branches before refining
  console.log(chalk.dim("Pulling latest updates from default branches...\n"));
  await pullAndLogResults(BLOOM_DIR);

  await runRefineSession(workingDir, selectedFile, BLOOM_DIR, agentName);

  console.log(chalk.dim(`\n---`));
  console.log(chalk.green("Refine session complete."));

  // Show next step based on selected file
  if (selectedFile.nextCommand) {
    console.log(
      `\n${chalk.bold("Next:")} ${chalk.cyan(selectedFile.nextCommand.padEnd(16))} ${chalk.dim("#")} ${selectedFile.nextStep}`
    );
  }
}
