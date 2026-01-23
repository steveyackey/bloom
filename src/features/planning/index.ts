// =============================================================================
// Planning Feature - Plan, refine, generate, and enter commands
// =============================================================================

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { Clerc } from "clerc";
import { ClaudeAgentProvider } from "../../core/agents";
import { BLOOM_DIR, findGitRoot, getTasksFile } from "../../core/context";
import { loadPrompt } from "../../core/prompts";
import { listRepos } from "../../core/repos";

// =============================================================================
// Types
// =============================================================================

export interface RefineFile {
  name: string;
  description: string;
  nextStep: string;
  nextCommand: string;
}

// =============================================================================
// Build Repos Context
// =============================================================================

async function buildReposContext(bloomDir: string): Promise<string> {
  const repos = await listRepos(bloomDir);

  if (repos.length === 0) {
    return "No repositories configured. Run `bloom repo clone <url>` to add repositories.";
  }

  const lines: string[] = ["## Configured Repositories", ""];
  lines.push("When assigning tasks to repos, use the **repo name** (not the path).");
  lines.push("The worktree paths are shown for reference only.");
  lines.push("");

  for (const repo of repos) {
    const safeBranch = repo.defaultBranch.replace(/\//g, "-");
    const defaultWorktreePath = `repos/${repo.name}/${safeBranch}`;

    lines.push(`### ${repo.name}`);
    lines.push(`- **Repo name for tasks.yaml**: \`${repo.name}\``);
    lines.push(`- URL: ${repo.url}`);
    lines.push(`- Default Branch: ${repo.defaultBranch}`);
    lines.push(`- Status: ${repo.exists ? "Cloned" : "Not cloned"}`);

    if (repo.exists) {
      lines.push(`- Default worktree: \`${defaultWorktreePath}\``);
    }

    if (repo.worktrees.length > 0) {
      lines.push(`- Active worktrees:`);
      for (const worktree of repo.worktrees) {
        lines.push(`  - \`repos/${repo.name}/${worktree}\` (branch: ${worktree.replace(/-/g, "/")})`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

// =============================================================================
// Plan Command
// =============================================================================

async function runPlanSession(workingDir: string, planFile: string, bloomDir: string): Promise<void> {
  const gitRoot = findGitRoot() || workingDir;
  const reposContext = await buildReposContext(bloomDir);

  const systemPrompt = await loadPrompt("plan", {
    WORKING_DIR: workingDir,
    PLAN_FILE: planFile,
    REPOS_CONTEXT: reposContext,
  });

  const agent = new ClaudeAgentProvider({
    interactive: true,
    dangerouslySkipPermissions: true,
  });

  console.log(`${chalk.bold("Planning session")} - plan will be written to: ${chalk.cyan(planFile)}\n`);

  const initialPrompt = `Let's create an implementation plan. First, read the PRD.md to understand what we're building, then summarize the key requirements and ask me any clarifying questions before we draft the plan.`;

  await agent.run({
    systemPrompt,
    prompt: initialPrompt,
    startingDirectory: gitRoot,
  });
}

export async function cmdPlan(): Promise<void> {
  const workingDir = process.cwd();
  const planFile = join(workingDir, "plan.md");

  if (!existsSync(join(workingDir, "PRD.md"))) {
    console.error(chalk.yellow("No PRD.md found. Run 'bloom create' first or create PRD.md manually."));
    process.exit(1);
  }

  await runPlanSession(workingDir, planFile, BLOOM_DIR);
}

// =============================================================================
// Refine Command
// =============================================================================

const REFINEABLE_FILES: RefineFile[] = [
  {
    name: "PRD.md",
    description: "Product Requirements Document - defines WHAT to build",
    nextStep: "After refining PRD, run 'bloom plan' to create implementation plan",
    nextCommand: "bloom plan",
  },
  {
    name: "plan.md",
    description: "Implementation Plan - defines HOW to build it",
    nextStep: "After refining plan, run 'bloom generate' to create tasks",
    nextCommand: "bloom generate",
  },
  {
    name: "tasks.yaml",
    description: "Task definitions - machine-readable tasks for agents",
    nextStep: "After refining tasks, run 'bloom run' to execute",
    nextCommand: "bloom run",
  },
  {
    name: "CLAUDE.md",
    description: "Agent guidelines - instructions for Claude when working on tasks",
    nextStep: "Guidelines will be used when agents run tasks",
    nextCommand: "bloom run",
  },
];

async function runRefineSession(workingDir: string, selectedFile: RefineFile, bloomDir: string): Promise<void> {
  void bloomDir; // Not used for refine
  const gitRoot = findGitRoot() || workingDir;

  const projectFiles: string[] = [];
  if (existsSync(workingDir)) {
    const files = readdirSync(workingDir);
    for (const file of files) {
      const filePath = join(workingDir, file);
      const stat = statSync(filePath);
      if (stat.isFile() && (file.endsWith(".md") || file.endsWith(".yaml") || file.endsWith(".yml"))) {
        projectFiles.push(file);
      }
    }
  }

  const filesContext =
    projectFiles.length > 0
      ? `Available files in project:\n${projectFiles.map((f) => `  - ${f}`).join("\n")}`
      : "No markdown or yaml files found in the project directory.";

  const systemPrompt = `You are helping refine project documentation in a Bloom workspace.

Working Directory: ${workingDir}
Git Root: ${gitRoot}

${filesContext}

Your role is to help the user refine their project documents. The key files are:

**PRD.md** - Product Requirements Document (start here!)
**plan.md** - Implementation Plan
**tasks.yaml** - Task Definitions (for execution)
**CLAUDE.md** - Guidelines for Claude agents

Focus on making documents clear, complete, and actionable.`;

  const agent = new ClaudeAgentProvider({
    interactive: true,
    dangerouslySkipPermissions: true,
  });

  console.log(`${chalk.bold("Refining:")} ${chalk.cyan(selectedFile.name)}\n`);

  const initialPrompt = `I want to refine ${selectedFile.name}. Please read it first and help me improve it.`;

  await agent.run({
    systemPrompt,
    prompt: initialPrompt,
    startingDirectory: workingDir,
  });
}

export async function cmdRefine(targetFile?: string): Promise<void> {
  const workingDir = process.cwd();

  // Find available files
  const availableFiles = REFINEABLE_FILES.filter((f) => existsSync(join(workingDir, f.name)));

  if (availableFiles.length === 0) {
    console.error(chalk.yellow("No refineable files found (PRD.md, plan.md, tasks.yaml, CLAUDE.md)."));
    console.error(chalk.dim("Run 'bloom create <name>' to create a project with templates."));
    process.exit(1);
  }

  let selectedFile: RefineFile;

  if (targetFile) {
    const found = availableFiles.find((f) => f.name.toLowerCase() === targetFile.toLowerCase());
    if (!found) {
      console.error(chalk.red(`File '${targetFile}' not found or not refineable.`));
      console.error(chalk.dim(`Available: ${availableFiles.map((f) => f.name).join(", ")}`));
      process.exit(1);
    }
    selectedFile = found;
  } else {
    // Interactive selection
    const select = (await import("@inquirer/select")).default;
    selectedFile = await select({
      message: "Which file would you like to refine?",
      choices: availableFiles.map((f) => ({
        name: `${chalk.cyan(f.name)} - ${f.description}`,
        value: f,
      })),
    });
  }

  await runRefineSession(workingDir, selectedFile, BLOOM_DIR);

  console.log(chalk.dim(`\n---`));
  console.log(`${chalk.bold("Next step:")} ${selectedFile.nextStep}`);
  console.log(`  ${chalk.cyan(selectedFile.nextCommand)}`);
}

// =============================================================================
// Generate Command
// =============================================================================

async function runGenerateSession(workingDir: string, tasksFile: string, bloomDir: string): Promise<void> {
  const reposContext = await buildReposContext(bloomDir);

  const systemPrompt = await loadPrompt("generate", {
    WORKING_DIR: workingDir,
    TASKS_FILE: tasksFile,
    REPOS_CONTEXT: reposContext,
  });

  const agent = new ClaudeAgentProvider({
    interactive: true,
    dangerouslySkipPermissions: true,
  });

  console.log(`${chalk.bold("Generate session")} - tasks will be written to: ${chalk.cyan(tasksFile)}\n`);

  const initialPrompt = `Please read the plan.md and generate a tasks.yaml file. Start by reading the plan, then create the task definitions.

IMPORTANT: After writing tasks.yaml, you MUST validate it by running \`bloom validate\`. If validation fails, fix the issues and re-validate until it passes.`;

  await agent.run({
    systemPrompt,
    prompt: initialPrompt,
    startingDirectory: workingDir,
  });
}

export async function cmdGenerate(): Promise<void> {
  const workingDir = process.cwd();
  const tasksFile = getTasksFile();

  if (!existsSync(join(workingDir, "plan.md"))) {
    console.error(chalk.yellow("No plan.md found. Run 'bloom plan' first."));
    process.exit(1);
  }

  await runGenerateSession(workingDir, tasksFile, BLOOM_DIR);
}

// =============================================================================
// Enter Command
// =============================================================================

export async function cmdEnter(): Promise<void> {
  const workingDir = process.cwd();

  const agent = new ClaudeAgentProvider({
    interactive: true,
    dangerouslySkipPermissions: true,
  });

  const systemPrompt = `You are a helpful assistant in a Bloom workspace.
Working directory: ${workingDir}

You can help with:
- Reading and editing project files
- Running commands
- Answering questions about the codebase

Be direct and helpful.`;

  console.log(chalk.bold("Entering Claude Code session...\n"));

  await agent.run({
    systemPrompt,
    prompt: "Hello! I'm ready to help. What would you like to work on?",
    startingDirectory: workingDir,
  });
}

// =============================================================================
// CLI Registration
// =============================================================================

export function register(cli: Clerc): Clerc {
  return cli
    .command("plan", "Create implementation plan from PRD", {
      help: { group: "workflow" },
    })
    .on("plan", async () => {
      await cmdPlan();
    })

    .command("refine", "Interactively refine project documents", {
      parameters: ["[file]"],
      help: { group: "workflow" },
    })
    .on("refine", async (ctx) => {
      await cmdRefine(ctx.parameters.file as string | undefined);
    })

    .command("generate", "Generate tasks.yaml from plan", {
      help: { group: "workflow" },
    })
    .on("generate", async () => {
      await cmdGenerate();
    })

    .command("enter", "Open interactive Claude Code session", {
      help: { group: "workflow" },
    })
    .on("enter", async () => {
      await cmdEnter();
    });
}
