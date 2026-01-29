// =============================================================================
// Run Command for Clerc CLI
// =============================================================================

import chalk from "chalk";
import type { Clerc } from "clerc";
import { BLOOM_DIR, getTasksFile } from "../commands/context";
import { startOrchestrator } from "../commands/orchestrator";
import { connectToDaemon } from "../daemon";
import { isDaemonEnabled, loadUserConfig } from "../infra/config";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the run command with a Clerc CLI instance.
 */
export function registerRunCommand(cli: Clerc): Clerc {
  return cli
    .command("run", "Start the orchestrator with all agents", {
      flags: {
        agent: {
          type: String,
          short: "a",
          description: "Override the default agent for task execution",
        },
        noDaemon: {
          type: Boolean,
          description: "Force foreground mode (bypass daemon even if running)",
          default: false,
        },
        follow: {
          type: Boolean,
          description: "Follow daemon output after submitting (daemon mode only)",
          default: false,
        },
      },
      help: { group: "workflow" },
    })
    .on("run", async (ctx) => {
      const agent = ctx.flags.agent as string | undefined;
      const noDaemon = ctx.flags.noDaemon as boolean;
      const follow = ctx.flags.follow as boolean;

      // Check if we should use daemon mode
      if (!noDaemon) {
        const userConfig = await loadUserConfig();
        if (isDaemonEnabled(userConfig)) {
          const client = await connectToDaemon();
          if (client) {
            try {
              const result = await client.enqueue({
                workspace: BLOOM_DIR,
                tasksFile: getTasksFile(),
                agentOverride: agent,
              });

              const enqueueResult = result as { submitted: number; entryIds: string[] };
              console.log(`${chalk.green("Submitted")} ${enqueueResult.submitted} task(s) to daemon queue`);

              if (follow) {
                console.log(chalk.dim("Following output (Ctrl+C to detach)...\n"));
                await client.subscribe({ workspace: BLOOM_DIR });
                client.onEvent((event) => {
                  if (event.type === "agent:output") {
                    process.stdout.write(String(event.data ?? ""));
                  }
                });
                process.on("SIGINT", () => {
                  console.log(chalk.dim("\nDetached. Tasks continue in background."));
                  client.disconnect();
                  process.exit(0);
                });
                await new Promise(() => {});
              } else {
                console.log(`  ${chalk.dim("Check progress:")} ${chalk.cyan("bloom daemon status")}`);
                client.disconnect();
              }
              return;
            } catch (err) {
              console.warn(
                `${chalk.yellow("Warning:")} Failed to submit to daemon (${err}). Falling back to foreground mode.`
              );
              client.disconnect();
            }
          }
        }
      }

      // Foreground mode (original behavior)
      await startOrchestrator(agent);
    });
}
