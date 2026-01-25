// =============================================================================
// Run Command for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";

import { startOrchestrator } from "../commands/orchestrator";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the run command with a Clerc CLI instance.
 */
export function registerRunCommand(cli: Clerc): Clerc {
  return cli
    .command("run", "Start the orchestrator with all agents", {
      flags: {
        agent: {
          type: String,
          short: "a",
          description: "Override the default agent for task execution",
        },
      },
      help: { group: "workflow" },
    })
    .on("run", async (ctx) => {
      const agent = ctx.flags.agent as string | undefined;
      await startOrchestrator(agent);
    });
}
