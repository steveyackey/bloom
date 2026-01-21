// =============================================================================
// Plan Command - Generate implementation plan from project context
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import { ClaudeAgentProvider } from "../agents";
import { loadPrompt } from "../prompts";
import { listRepos } from "../repos";
import { BLOOM_DIR, findGitRoot } from "./context";

// =============================================================================
// Build Repos Context
// =============================================================================

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

export async function runPlanSession(workingDir: string, planFile: string): Promise<void> {
  const gitRoot = findGitRoot() || workingDir;

  // Build repos context
  const reposContext = await buildReposContext(BLOOM_DIR);

  const systemPrompt = await loadPrompt("plan", {
    WORKING_DIR: workingDir,
    PLAN_FILE: planFile,
    REPOS_CONTEXT: reposContext,
  });

  const agent = new ClaudeAgentProvider({
    interactive: true,
    dangerouslySkipPermissions: true,
  });

  console.log(`Planning session - plan will be written to: ${planFile}\n`);

  const initialPrompt = `Let's create an implementation plan. First, read the PRD.md to understand what we're building, then summarize the key requirements and ask me any clarifying questions before we draft the plan.`;

  // Run Claude from git root but tell it about the working directory
  await agent.run({
    systemPrompt,
    prompt: initialPrompt,
    startingDirectory: gitRoot,
  });
}

// =============================================================================
// Command Handler
// =============================================================================

export async function cmdPlan(): Promise<void> {
  const workingDir = process.cwd();
  const planFile = join(workingDir, "plan.md");
  const prdPath = join(workingDir, "PRD.md");

  // Check for PRD in the project directory
  if (!existsSync(prdPath)) {
    console.log("Note: No PRD.md found in the current directory.");
    console.log("Consider running 'bloom create <name>' first or adding a PRD.md.\n");
  }

  await runPlanSession(workingDir, planFile);

  console.log(`\n---`);
  console.log(`Plan saved to: ${planFile}`);
  console.log(`\nNext steps:`);
  console.log(`  bloom refine        # Refine the plan if needed`);
  console.log(`  bloom generate      # Generate tasks.yaml for execution`);
}
