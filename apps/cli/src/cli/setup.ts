// =============================================================================
// Setup Command for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";
import { BLOOM_DIR } from "../commands/context";
import { listRepos, syncRepos } from "../infra/git";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the setup command with a Clerc CLI instance.
 */
export function registerSetupCommand(cli: Clerc): Clerc {
  return cli
    .command("setup", "Sync repositories (clone or update all configured repos)", {
      help: { group: "system" },
    })
    .on("setup", async () => {
      const repos = await listRepos(BLOOM_DIR);
      if (repos.length === 0) {
        console.error("No repos configured. Use 'bloom repo clone <url>' to add repos first.");
        process.exit(1);
      }
      console.log("Syncing repositories...\n");
      const result = await syncRepos(BLOOM_DIR);
      if (result.cloned.length > 0) {
        console.log(`Cloned: ${result.cloned.join(", ")}`);
      }
      if (result.pulled.length > 0) {
        console.log(`Pulled: ${result.pulled.join(", ")}`);
      }
      if (result.upToDate.length > 0) {
        console.log(`Up to date: ${result.upToDate.join(", ")}`);
      }
      if (result.failed.length > 0) {
        console.log(`Failed:`);
        for (const f of result.failed) {
          console.log(`  ${f.name}: ${f.error}`);
        }
      }
      console.log("\nSetup complete.");
    });
}
