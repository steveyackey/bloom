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

  // Run Claude from git root but tell it about the working directory
  await agent.run({
    systemPrompt,
    prompt: "",
    startingDirectory: gitRoot,
  });
}

// =============================================================================
// Command Handler
// =============================================================================

export async function cmdPlan(): Promise<void> {
  const workingDir = process.cwd();
  const planFile = join(workingDir, "plan.md");

  // Check for PRD or other context
  const templateDir = join(workingDir, "template");
  const prdPath = join(templateDir, "PRD.md");

  if (!existsSync(prdPath)) {
    console.log("Note: No PRD found at template/PRD.md");
    console.log("Consider running 'bloom create <name>' first or adding project context.\n");
  }

  await runPlanSession(workingDir, planFile);

  console.log(`\n---`);
  console.log(`Plan saved to: ${planFile}`);
  console.log(`\nNext steps:`);
  console.log(`  Review plan.md and make any adjustments`);
  console.log(`  bloom generate      # Generate tasks.yaml for execution`);
}
