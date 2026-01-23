#!/usr/bin/env bun
import { createAgent } from "./agents";
import { BLOOM_DIR } from "./commands/context";
import { loadPlanningPrompt } from "./prompts";

export async function runPlanningSession(tasksFile: string): Promise<void> {
  const systemPrompt = await loadPlanningPrompt(tasksFile, BLOOM_DIR);

  const agent = await createAgent("interactive");

  console.log(`Planning session - tasks will be written to: ${tasksFile}\n`);

  await agent.run({
    systemPrompt,
    prompt: "",
    startingDirectory: process.cwd(),
  });
}

// CLI
if (import.meta.main) {
  let tasksFile = process.env.TASKS_FILE || "tasks.yaml";
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-f" || args[i] === "--file") {
      tasksFile = args[i + 1]!;
      break;
    }
  }

  runPlanningSession(tasksFile);
}
