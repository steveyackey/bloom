// =============================================================================
// Update Command for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";
import { cmdUpdate } from "../commands/update";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the update command with a Clerc CLI instance.
 */
export function registerUpdateCommand(cli: Clerc): Clerc {
  return cli
    .command("update", "Update bloom to the latest version", {
      help: { group: "system" },
    })
    .on("update", async () => {
      await cmdUpdate();
    });
}
