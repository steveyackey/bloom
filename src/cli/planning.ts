// =============================================================================
// Planning Commands for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";

import { cmdEnter } from "../commands/enter";
import { cmdGenerate } from "../commands/generate";
import { cmdPlan } from "../commands/plan-command";
import { cmdRefine } from "../commands/refine";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register planning workflow commands with a Clerc CLI instance.
 *
 * These commands handle the planning phase of the Bloom workflow:
 * - plan: Generate implementation plan from PRD
 * - refine: Interactively refine project documents
 * - generate: Generate tasks.yaml from implementation plan
 * - enter: Open Claude Code session in project context
 */
export function registerPlanningCommands(cli: Clerc): Clerc {
  // Common agent flag definition
  const agentFlag = {
    agent: {
      type: String,
      short: "a",
      description: "Override the default agent for this command",
    },
  };

  return cli
    .command("plan", "Generate implementation plan from PRD", {
      flags: agentFlag,
      help: { group: "workflow" },
    })
    .on("plan", async (ctx) => {
      const agent = ctx.flags.agent as string | undefined;
      await cmdPlan(agent);
    })
    .command("refine", "Interactively refine project documents", {
      flags: agentFlag,
      help: { group: "workflow" },
    })
    .on("refine", async (ctx) => {
      const agent = ctx.flags.agent as string | undefined;
      await cmdRefine(agent);
    })
    .command("generate", "Generate tasks.yaml from implementation plan", {
      flags: agentFlag,
      help: { group: "workflow" },
    })
    .on("generate", async (ctx) => {
      const agent = ctx.flags.agent as string | undefined;
      await cmdGenerate(agent);
    })
    .command("enter", "Open Claude Code session in project context", {
      flags: agentFlag,
      help: { group: "system" },
    })
    .on("enter", async (ctx) => {
      const agent = ctx.flags.agent as string | undefined;
      await cmdEnter(agent);
    });
}
