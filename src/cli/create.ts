// =============================================================================
// Create Command for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";
import { cmdCreate } from "../commands/create";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the create command with a Clerc CLI instance.
 */
export function registerCreateCommand(cli: Clerc): Clerc {
  return cli
    .command("create", "Create a new project with PRD template", {
      parameters: ["[name...]"],
      help: { group: "workflow" },
    })
    .on("create", async (ctx) => {
      const nameArgs = (ctx.parameters.name as string[]) || [];
      await cmdCreate(nameArgs);
    });
}
