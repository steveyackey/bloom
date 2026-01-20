// =============================================================================
// Generate Command - Generate tasks.yaml from implementation plan
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import { ClaudeAgentProvider } from "../agents";
import { loadPrompt } from "../prompts";
import { BLOOM_DIR, findGitRoot, getTasksFile } from "./context";
import { buildReposContext } from "./plan-command";

// =============================================================================
// Run Generate Session
// =============================================================================

export async function runGenerateSession(workingDir: string, tasksFile: string): Promise<void> {
  const gitRoot = findGitRoot() || workingDir;

  // Build repos context
  const reposContext = await buildReposContext(BLOOM_DIR);

  const systemPrompt = await loadPrompt("generate", {
    WORKING_DIR: workingDir,
    TASKS_FILE: tasksFile,
    REPOS_CONTEXT: reposContext,
  });

  const agent = new ClaudeAgentProvider({
    interactive: true,
    dangerouslySkipPermissions: true,
  });

  console.log(`Generate session - tasks will be written to: ${tasksFile}\n`);

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

export async function cmdGenerate(): Promise<void> {
  const workingDir = process.cwd();
  const planFile = join(workingDir, "plan.md");
  const tasksFile = getTasksFile();

  // Check for plan.md
  if (!existsSync(planFile)) {
    console.log("Note: No plan found at plan.md");
    console.log("Consider running 'bloom plan' first to create an implementation plan.\n");
  }

  await runGenerateSession(workingDir, tasksFile);

  console.log(`\n---`);
  console.log(`Tasks generated to: ${tasksFile}`);
  console.log(`\nNext steps:`);
  console.log(`  Review tasks.yaml and make any adjustments`);
  console.log(`  bloom validate      # Check for issues`);
  console.log(`  bloom run           # Start the orchestrator`);
}
