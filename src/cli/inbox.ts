// =============================================================================
// CLI: bloom inbox
// =============================================================================

import chalk from "chalk";
import type { Clerc } from "clerc";
import { connectToDaemon } from "../daemon";
import type { InboxResult } from "../daemon/protocol";

// =============================================================================
// Register Command
// =============================================================================

export function registerInboxCommand(cli: ReturnType<typeof Clerc.create>): void {
  cli
    .command("inbox", "Submit a quick task to the daemon", {
      parameters: ["[instruction...]"],
      flags: {
        repo: {
          description: "Target repository name",
          type: String,
          short: "r",
        },
        priority: {
          description: "Task priority (low, normal, high)",
          type: String,
          short: "p",
          default: "normal",
        },
        agent: {
          description: "Preferred agent provider",
          type: String,
          short: "a",
        },
      },
      help: { group: "workflow" },
    })
    .on("inbox", async (ctx) => {
      const instructionParts = ctx.parameters.instruction as string[] | undefined;
      const instruction = instructionParts?.join(" ")?.trim();

      if (!instruction) {
        console.error(`${chalk.red("Error:")} Please provide an instruction.`);
        console.log(`  Usage: ${chalk.cyan('bloom inbox "fix the login bug"')}`);
        process.exit(1);
      }

      const { repo, priority, agent } = ctx.flags;

      // Connect to daemon
      const client = await connectToDaemon();
      if (!client) {
        console.error(`${chalk.red("Daemon is not running.")} Start it with: ${chalk.cyan("bloom start")}`);
        process.exit(1);
      }

      try {
        // Detect workspace from cwd
        const workingDir = process.cwd();
        let workspace: string | undefined;

        // Try to find bloom.config.yaml upward
        const { existsSync } = await import("node:fs");
        const { dirname, join } = await import("node:path");
        let dir = workingDir;
        while (dir !== dirname(dir)) {
          if (existsSync(join(dir, "bloom.config.yaml"))) {
            workspace = dir;
            break;
          }
          dir = dirname(dir);
        }

        const result = (await client.inbox({
          instruction,
          repo: repo as string | undefined,
          workspace,
          workingDir,
          priority: priority as string | undefined,
          agent: agent as string | undefined,
        })) as InboxResult;

        console.log(`${chalk.green("Task queued")} [${chalk.dim(result.entryId.slice(0, 8))}]`);
        console.log(`  ${chalk.dim("Instruction:")} ${instruction}`);
        if (repo) console.log(`  ${chalk.dim("Repo:")} ${repo}`);
        console.log(`  ${chalk.dim("Check progress:")} ${chalk.cyan("bloom status")}`);
      } catch (err) {
        console.error(`${chalk.red("Error submitting task:")} ${err}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });
}
