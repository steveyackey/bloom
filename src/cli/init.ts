// =============================================================================
// Init Command for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";
import { cmdInit } from "../commands/init";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the init command with a Clerc CLI instance.
 */
export function registerInitCommand(cli: Clerc): Clerc {
  return cli
    .command("init", "Initialize a Bloom workspace in the current directory", {
      help: { group: "workflow" },
    })
    .on("init", async () => {
      await cmdInit();
    });
}
