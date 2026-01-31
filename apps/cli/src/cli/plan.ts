// =============================================================================
// Plan Command for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";
import { cmdPlan } from "../commands/plan-command";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the plan command with a Clerc CLI instance.
 */
export function registerPlanCommand(cli: Clerc): Clerc {
  return cli
    .command("plan", "Generate implementation plan from PRD", {
      flags: {
        agent: {
          type: String,
          short: "a",
          description: "Override the default agent for this command",
        },
      },
      help: { group: "workflow" },
    })
    .on("plan", async (ctx) => {
      const agent = ctx.flags.agent as string | undefined;
      await cmdPlan(agent);
    });
}
