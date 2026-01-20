// =============================================================================
// Enter Command - Enter Claude Code in project context
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import { ClaudeAgentProvider } from "../agents";
import { findGitRoot } from "./context";

// =============================================================================
// Run Enter Session
// =============================================================================

export async function runEnterSession(workingDir: string): Promise<void> {
  const gitRoot = findGitRoot() || workingDir;

  const systemPrompt = `You are working in a Bloom project.

Working Directory: ${workingDir}
Git Root: ${gitRoot}

This is an open-ended session - help the user with whatever they need.

You have access to the entire git repository for context, but you're starting in the project directory.`;

  const agent = new ClaudeAgentProvider({
    interactive: true,
    dangerouslySkipPermissions: true,
  });

  await agent.run({
    systemPrompt,
    prompt: "",
    startingDirectory: workingDir,
  });
}

// =============================================================================
// Command Handler
// =============================================================================

export async function cmdEnter(): Promise<void> {
  const workingDir = process.cwd();

  // Show what files exist in the project
  const hasPrd = existsSync(join(workingDir, "PRD.md"));
  const hasPlan = existsSync(join(workingDir, "plan.md"));
  const hasTasks = existsSync(join(workingDir, "tasks.yaml"));

  console.log(`Entering Claude Code in: ${workingDir}\n`);

  if (hasPrd || hasPlan || hasTasks) {
    console.log("Project files:");
    if (hasPrd) console.log("  - PRD.md");
    if (hasPlan) console.log("  - plan.md");
    if (hasTasks) console.log("  - tasks.yaml");
    console.log("");
  }

  await runEnterSession(workingDir);
}
