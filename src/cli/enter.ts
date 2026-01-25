// =============================================================================
// Enter Command for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";
import { cmdEnter } from "../commands/enter";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the enter command with a Clerc CLI instance.
 */
export function registerEnterCommand(cli: Clerc): Clerc {
  return cli
    .command("enter", "Open Claude Code session in project context", {
      flags: {
        agent: {
          type: String,
          short: "a",
          description: "Override the default agent for this command",
        },
      },
      help: { group: "system" },
    })
    .on("enter", async (ctx) => {
      const agent = ctx.flags.agent as string | undefined;
      await cmdEnter(agent);
    });
}
