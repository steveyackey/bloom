// =============================================================================
// CLI: bloom research
// =============================================================================

import chalk from "chalk";
import type { Clerc } from "clerc";
import { connectToDaemon } from "../daemon";
import type { ResearchResult } from "../daemon/protocol";

// =============================================================================
// Register Command
// =============================================================================

export function registerResearchCommand(cli: ReturnType<typeof Clerc.create>): void {
  cli
    .command("research", "Research a question using an agent (read-only)", {
      parameters: ["[question...]"],
      flags: {
        output: {
          description: "Write findings to file instead of stdout",
          type: String,
          short: "o",
        },
        agent: {
          description: "Preferred agent provider",
          type: String,
          short: "a",
        },
        follow: {
          description: "Follow agent output in real-time",
          type: Boolean,
          default: true,
        },
      },
      help: { group: "workflow" },
    })
    .on("research", async (ctx) => {
      const questionParts = ctx.parameters.question as string[] | undefined;
      const question = questionParts?.join(" ")?.trim();

      if (!question) {
        console.error(`${chalk.red("Error:")} Please provide a research question.`);
        console.log(`  Usage: ${chalk.cyan('bloom research "how does the auth middleware work?"')}`);
        process.exit(1);
      }

      const { output, agent, follow } = ctx.flags;

      // Connect to daemon
      const client = await connectToDaemon();
      if (!client) {
        console.error(`${chalk.red("Daemon is not running.")} Start it with: ${chalk.cyan("bloom daemon start")}`);
        process.exit(1);
      }

      try {
        const workingDir = process.cwd();

        const result = (await client.research({
          instruction: question,
          workingDir,
          output: output as string | undefined,
          agent: agent as string | undefined,
        })) as ResearchResult;

        console.log(`${chalk.green("Research task queued")} [${chalk.dim(result.entryId.slice(0, 8))}]`);
        console.log(`  ${chalk.dim("Question:")} ${question}`);
        console.log(`  ${chalk.dim("Working dir:")} ${workingDir}`);
        if (output) {
          console.log(`  ${chalk.dim("Output:")} ${output}`);
        }

        if (follow) {
          // Subscribe to events for this entry
          console.log();
          console.log(chalk.dim("Following agent output (Ctrl+C to detach)..."));
          console.log();

          await client.subscribe({ entryId: result.entryId });
          client.onEvent((event) => {
            if (event.type === "agent:output") {
              process.stdout.write(String(event.data ?? ""));
            } else if (event.type === "task:completed" || event.type === "entry:done") {
              console.log();
              console.log(chalk.green("Research complete."));
              client.disconnect();
              process.exit(0);
            } else if (event.type === "task:failed" || event.type === "entry:failed") {
              console.log();
              console.error(chalk.red(`Research failed: ${event.error ?? "unknown error"}`));
              client.disconnect();
              process.exit(1);
            }
          });

          // Keep process alive until event stream ends or Ctrl+C
          process.on("SIGINT", () => {
            console.log(chalk.dim("\nDetached. Task continues in background."));
            client.disconnect();
            process.exit(0);
          });

          // Wait indefinitely (event handlers will exit)
          await new Promise(() => {});
        } else {
          console.log(`  ${chalk.dim("Check progress:")} ${chalk.cyan("bloom status")}`);
          client.disconnect();
        }
      } catch (err) {
        console.error(`${chalk.red("Error submitting research:")} ${err}`);
        client.disconnect();
        process.exit(1);
      }
    });
}
