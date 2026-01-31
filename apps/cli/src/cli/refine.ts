// =============================================================================
// Refine Command for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";
import { cmdRefine } from "../commands/refine";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the refine command with a Clerc CLI instance.
 */
export function registerRefineCommand(cli: Clerc): Clerc {
  return cli
    .command("refine", "Interactively refine project documents", {
      flags: {
        agent: {
          type: String,
          short: "a",
          description: "Override the default agent for this command",
        },
      },
      help: { group: "workflow" },
    })
    .on("refine", async (ctx) => {
      const agent = ctx.flags.agent as string | undefined;
      await cmdRefine(agent);
    });
}
