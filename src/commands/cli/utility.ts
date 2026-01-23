// =============================================================================
// Utility Commands for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";

import { cmdUpdate } from "../update";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register utility commands with a Clerc CLI instance.
 *
 * Note: The `version` command is handled by Clerc's built-in `.version()` method.
 * The `completions` command is handled by the `completionsPlugin()`.
 * The `help` command is handled by Clerc's built-in helpPlugin (via --help flag).
 */
export function registerUtilityCommands(cli: Clerc): Clerc {
  return cli
    .command("update", "Update bloom to the latest version", {
      help: { group: "system" },
    })
    .on("update", async () => {
      await cmdUpdate();
    });
}
