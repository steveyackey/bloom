// =============================================================================
// Generate Command - Generate tasks.yaml from implementation plan
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import { ClaudeAgentProvider } from "../agents";
import { loadPrompt } from "../prompts";
import { BLOOM_DIR, findGitRoot } from "./context";
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

  const initialPrompt = `Please read the plan.md and generate a tasks.yaml file. Start by reading the plan, then create the task definitions.

IMPORTANT: After writing tasks.yaml, you MUST validate it by running \`bloom validate\`. If validation fails (especially YAML parsing errors with strings containing special characters like backticks, quotes, or colons), fix the quoting issues and re-validate until it passes.`;

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

export async function cmdGenerate(): Promise<void> {
  const workingDir = process.cwd();
  const planFile = join(workingDir, "plan.md");
  const tasksFile = join(workingDir, "tasks.yaml");

  // Check for plan.md
  if (!existsSync(planFile)) {
    console.log("Note: No plan found at plan.md");
    console.log("Consider running 'bloom plan' first to create an implementation plan.\n");
  }

  await runGenerateSession(workingDir, tasksFile);

  console.log(`\n---`);
  console.log(`Tasks generated to: ${tasksFile}`);
  console.log(`\nNext steps:`);
  console.log(`  bloom validate      # Check for issues`);
  console.log(`  bloom run           # Execute tasks`);
}
