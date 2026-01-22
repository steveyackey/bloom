// =============================================================================
// Planning Commands for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";

import { cmdEnter } from "../enter";
import { cmdGenerate } from "../generate";
import { cmdPlan } from "../plan-command";
import { cmdRefine } from "../refine";

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
  return cli
    .command("plan", "Generate implementation plan from PRD")
    .on("plan", async () => {
      await cmdPlan();
    })
    .command("refine", "Interactively refine project documents")
    .on("refine", async () => {
      await cmdRefine();
    })
    .command("generate", "Generate tasks.yaml from implementation plan")
    .on("generate", async () => {
      await cmdGenerate();
    })
    .command("enter", "Open Claude Code session in project context")
    .on("enter", async () => {
      await cmdEnter();
    });
}
