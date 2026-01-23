// =============================================================================
// Run Feature - Orchestrator and agent execution
// =============================================================================

import type { Clerc } from "clerc";

// Re-export orchestrator functions
export { runAgentWorkLoop, startOrchestrator } from "./orchestrator";

// =============================================================================
// CLI Registration
// =============================================================================

export function register(cli: Clerc): Clerc {
  return cli
    .command("run", "Start the orchestrator to execute tasks", {
      flags: {
        agents: {
          type: String,
          description: "Comma-separated list of agents to run (default: all)",
          short: "a",
        },
      },
      help: { group: "workflow" },
    })
    .on("run", async (ctx) => {
      const { startOrchestrator } = await import("./orchestrator");
      const agentNames = ctx.flags.agents ? (ctx.flags.agents as string).split(",").map((a) => a.trim()) : undefined;
      await startOrchestrator(agentNames);
    })

    .command("agent run", "Run a specific agent directly", {
      parameters: ["<name>"],
      help: { group: "workflow" },
    })
    .on("agent run", async (ctx) => {
      const { runAgentWorkLoop } = await import("./orchestrator");
      await runAgentWorkLoop(ctx.parameters.name as string);
    });
}
