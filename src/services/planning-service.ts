/**
 * Planning Service
 * Handles planning, generation, and refinement operations.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { ClaudeAgentProvider } from "../agents";
import { findGitRoot } from "../commands/context";
import { loadPrompt } from "../prompts";
import { listRepos } from "../repos";

// =============================================================================
// RefineFile Interface
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

/**
 * Builds context from repositories for planning sessions.
 */
export async function buildReposContext(bloomDir: string): Promise<string> {
  const repos = await listRepos(bloomDir);

  if (repos.length === 0) {
    return "No repositories configured. Run `bloom repo clone <url>` to add repositories.";
  }

  const lines: string[] = ["## Configured Repositories", ""];

  for (const repo of repos) {
    lines.push(`### ${repo.name}`);
    lines.push(`- URL: ${repo.url}`);
    lines.push(`- Default Branch: ${repo.defaultBranch}`);
    lines.push(`- Status: ${repo.exists ? "Cloned" : "Not cloned"}`);

    if (repo.worktrees.length > 0) {
      lines.push(`- Worktrees: ${repo.worktrees.join(", ")}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

// =============================================================================
// Run Planning Session
// =============================================================================

/**
 * Runs a planning session with the AI.
 */
export async function runPlanSession(workingDir: string, planFile: string, bloomDir: string): Promise<void> {
  const gitRoot = findGitRoot() || workingDir;

  // Build repos context
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

  // Run Claude from git root but tell it about the working directory
  await agent.run({
    systemPrompt,
    prompt: initialPrompt,
    startingDirectory: gitRoot,
  });
}

// =============================================================================
// Run Generate Session
// =============================================================================

/**
 * Runs a task generation session.
 */
export async function runGenerateSession(workingDir: string, tasksFile: string, bloomDir: string): Promise<void> {
  // Build repos context
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

IMPORTANT: After writing tasks.yaml, you MUST validate it by running \`bloom validate\`. If validation fails (especially YAML parsing errors with strings containing special characters like backticks, quotes, or colons), fix the quoting issues and re-validate until it passes.`;

  // Run Claude from the working directory
  await agent.run({
    systemPrompt,
    prompt: initialPrompt,
    startingDirectory: workingDir,
  });
}

// =============================================================================
// Run Refine Session
// =============================================================================

/**
 * Runs a refinement session for PRD or plan.
 */
export async function runRefineSession(workingDir: string, selectedFile: RefineFile, bloomDir: string): Promise<void> {
  // bloomDir is accepted for API consistency but not used directly in this function
  // (the refine session doesn't need repos context - it works on local project files)
  void bloomDir;

  const gitRoot = findGitRoot() || workingDir;

  // Build context about what files exist in the project
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
- Defines WHAT to build and WHY
- Should have clear problem statement, target users, goals, features
- This is the foundation - get this right before planning

**plan.md** - Implementation Plan
- Defines HOW to build it
- Breaks work into phases with clear tasks and acceptance criteria
- Created by 'bloom plan' from the PRD

**tasks.yaml** - Task Definitions (for execution)
- Machine-readable tasks for agents to execute
- Generated by 'bloom generate' from plan.md
- Can be refined to adjust task details, dependencies, or agent assignments

**CLAUDE.md** - Guidelines for Claude agents
- Project-specific instructions for Claude when working on tasks
- Code standards, patterns, conventions to follow

You can read files from anywhere in the git repository to gather context (repos/, other projects, etc.), but you should only modify files in the current project directory: ${workingDir}

When helping the user:
1. Read the target file first to understand its current state
2. Ask clarifying questions to understand what they want to change
3. Suggest specific improvements with clear reasoning
4. Make edits when the user approves

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
