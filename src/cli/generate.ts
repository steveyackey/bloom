// =============================================================================
// Generate Command for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";
import { cmdGenerate } from "../commands/generate";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the generate command with a Clerc CLI instance.
 */
export function registerGenerateCommand(cli: Clerc): Clerc {
  return cli
    .command("generate", "Generate tasks.yaml from implementation plan", {
      flags: {
        agent: {
          type: String,
          short: "a",
          description: "Override the default agent for this command",
        },
      },
      help: { group: "workflow" },
    })
    .on("generate", async (ctx) => {
      const agent = ctx.flags.agent as string | undefined;
      await cmdGenerate(agent);
    });
}
