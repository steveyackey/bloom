// =============================================================================
// Refine Command - Refine PRD, plan, or other project documents
// =============================================================================

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ClaudeAgentProvider } from "../agents";
import { findGitRoot } from "./context";

// =============================================================================
// Run Refine Session
// =============================================================================

export async function runRefineSession(workingDir: string): Promise<void> {
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

Your role is to help the user refine their project documents:
- **PRD.md** - Product Requirements Document defining what to build
- **plan.md** - Implementation plan with phases and tasks
- **CLAUDE.md** - Guidelines for Claude when working on this project
- Any other documentation in the project

You can read files from anywhere in the git repository to gather context (repos/, other projects, etc.), but you should only modify files in the current project directory: ${workingDir}

When helping the user:
1. Ask clarifying questions to understand their goals
2. Read existing documents to understand current state
3. Suggest specific improvements with clear reasoning
4. Make edits when the user approves

Focus on making documents clear, complete, and actionable. Good PRDs have specific requirements, good plans have clear phases and tasks, and good CLAUDE.md files give agents the context they need.`;

  const agent = new ClaudeAgentProvider({
    interactive: true,
    dangerouslySkipPermissions: true,
  });

  console.log(`Refine session for: ${workingDir}\n`);
  console.log(`You can refine PRD.md, plan.md, CLAUDE.md, or any other documents.`);
  console.log(`Claude can read context from the entire workspace but will only edit files in this project.\n`);

  await agent.run({
    systemPrompt,
    prompt: "",
    startingDirectory: workingDir,
  });
}

// =============================================================================
// Command Handler
// =============================================================================

export async function cmdRefine(): Promise<void> {
  const workingDir = process.cwd();

  // Check if we're in a project directory (has at least PRD.md or plan.md)
  const hasPrd = existsSync(join(workingDir, "PRD.md"));
  const hasPlan = existsSync(join(workingDir, "plan.md"));
  const hasClaudeMd = existsSync(join(workingDir, "CLAUDE.md"));

  if (!hasPrd && !hasPlan && !hasClaudeMd) {
    console.log("No project files found (PRD.md, plan.md, or CLAUDE.md).\n");
    console.log("Make sure you're in a project directory created with 'bloom create'.");
    console.log("Or run 'bloom create <name>' to create a new project.");
    process.exit(1);
  }

  await runRefineSession(workingDir);

  console.log(`\n---`);
  console.log(`Refine session complete.`);
  console.log(`\nNext steps:`);
  console.log(`  bloom plan          # Create/update implementation plan`);
  console.log(`  bloom generate      # Generate tasks.yaml from plan`);
  console.log(`  bloom run           # Execute tasks`);
}
