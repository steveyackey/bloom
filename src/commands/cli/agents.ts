// =============================================================================
// Agent Commands for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";

import { getAgentNames } from "../../completions/providers";
import { triggerInterject } from "../../human-queue";
import { getTasksFile } from "../context";
import { runAgentWorkLoop, startOrchestrator } from "../orchestrator";
import { cmdAgents } from "../tasks";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register agent commands with a Clerc CLI instance.
 */
export function registerAgentCommands(cli: Clerc): Clerc {
  return cli
    .command("run", "Start the orchestrator with all agents", {})
    .on("run", async () => {
      await startOrchestrator();
    })
    .command("agent run", "Run a specific agent's work loop", {
      parameters: [
        {
          key: "<name>",
          description: "Name of the agent to run",
          completions: {
            handler: async (complete) => {
              const names = await getAgentNames(getTasksFile());
              for (const name of names) {
                complete(name, "Agent name");
              }
            },
          },
        },
      ],
    })
    .on("agent run", async (ctx) => {
      const name = ctx.parameters.name as string;
      await runAgentWorkLoop(name);
    })
    .command("agent list", "List all agents defined in tasks")
    .command("agents", "List all agents defined in tasks (alias for 'agent list')")
    .on("agent list", async () => {
      await cmdAgents();
    })
    .on("agents", async () => {
      await cmdAgents();
    })
    .command("agent interject", "Trigger an interject for a running agent", {
      parameters: [
        {
          key: "<name>",
          description: "Name of the agent to interject",
          completions: {
            handler: async (complete) => {
              const names = await getAgentNames(getTasksFile());
              for (const name of names) {
                complete(name, "Agent name");
              }
            },
          },
        },
        {
          key: "[reason]",
          description: "Reason for the interjection",
        },
      ],
    })
    .on("agent interject", async (ctx) => {
      const name = ctx.parameters.name as string;
      const reason = (ctx.parameters.reason as string) || undefined;
      await triggerInterject(name, reason);
      console.log(`Interject triggered for agent: ${name}`);
    });
}
