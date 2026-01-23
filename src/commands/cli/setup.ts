// =============================================================================
// Setup Commands for Clerc CLI (init, create, setup)
// =============================================================================

import type { Clerc } from "clerc";

import { listRepos, syncRepos } from "../../repos";
import { BLOOM_DIR } from "../context";
import { cmdCreate } from "../create";
import { cmdInit } from "../init";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register setup commands with a Clerc CLI instance.
 *
 * Commands:
 * - init: Initialize a Bloom workspace
 * - create: Create a new project with PRD template
 * - setup: Sync repositories (clone or update)
 */
export function registerSetupCommands(cli: Clerc): Clerc {
  return cli
    .command("init", "Initialize a Bloom workspace in the current directory", {
      help: { group: "workflow" },
    })
    .on("init", async () => {
      await cmdInit();
    })
    .command("create", "Create a new project with PRD template", {
      parameters: ["<name...>"],
      help: { group: "workflow" },
    })
    .on("create", async (ctx) => {
      const nameArgs = ctx.parameters.name as string[];
      await cmdCreate(nameArgs);
    })
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
      if (result.skipped.length > 0) {
        console.log(`Updated: ${result.skipped.join(", ")}`);
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
