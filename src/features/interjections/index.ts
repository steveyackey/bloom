// =============================================================================
// Interjections Feature - Agent interjection commands
// =============================================================================

import chalk from "chalk";
import type { Clerc } from "clerc";
import { interjectSession } from "../../core/agents";
import {
  createInterjection,
  dismissInterjection,
  listInterjections,
  markInterjectionResumed,
  triggerInterject,
} from "../../core/questions";

// =============================================================================
// Command Implementations
// =============================================================================

async function cmdListInterjections(): Promise<void> {
  const interjections = await listInterjections("pending");

  if (interjections.length === 0) {
    console.log(chalk.dim("No pending interjections."));
    return;
  }

  console.log(chalk.bold("Pending Interjections:"));
  for (const i of interjections) {
    console.log(`\n${chalk.yellow("!")} ${chalk.cyan(i.id)}`);
    console.log(`  ${chalk.bold("Agent:")} ${chalk.magenta(i.agentName)}`);
    if (i.taskId) console.log(`  ${chalk.bold("Task:")} ${chalk.yellow(i.taskId)}`);
    console.log(`  ${chalk.bold("Directory:")} ${chalk.blue(i.workingDirectory)}`);
    if (i.reason) console.log(`  ${chalk.bold("Reason:")} ${i.reason}`);
    if (i.sessionId) console.log(`  ${chalk.bold("Session:")} ${chalk.dim(i.sessionId)}`);
  }
}

async function cmdInterject(agentName: string, reason?: string): Promise<void> {
  // Try to interject a running session first
  const session = interjectSession(agentName);

  if (session) {
    // Create interjection record for the interrupted session
    const id = await createInterjection(agentName, {
      taskId: session.taskId,
      sessionId: session.sessionId,
      workingDirectory: session.workingDirectory,
      reason: reason || "User requested interjection",
    });
    console.log(`${chalk.yellow("Interjected")} ${chalk.magenta(agentName)} - session stopped`);
    console.log(`  ${chalk.bold("Interjection ID:")} ${chalk.cyan(id)}`);
    if (session.sessionId) {
      console.log(`  ${chalk.bold("Session ID:")} ${chalk.dim(session.sessionId)}`);
      console.log(chalk.dim(`  Resume with: bloom interject resume ${id}`));
    }
  } else {
    // No active session, create a trigger for when the agent starts
    await triggerInterject(agentName, reason);
    console.log(`${chalk.yellow("Interject trigger created for")} ${chalk.magenta(agentName)}`);
    console.log(chalk.dim("  The agent will be interrupted when it starts its next task."));
  }
}

async function cmdResumeInterjection(interjectionId: string): Promise<void> {
  const interjections = await listInterjections("pending");
  const interjection = interjections.find((i) => i.id === interjectionId);

  if (!interjection) {
    console.error(chalk.red(`Interjection not found: ${interjectionId}`));
    process.exit(1);
  }

  await markInterjectionResumed(interjectionId);

  console.log(`${chalk.green("Marked as resumed:")} ${chalk.cyan(interjectionId)}`);
  if (interjection.sessionId) {
    console.log(`\n${chalk.bold("To continue the session manually:")}`);
    console.log(`  cd ${interjection.workingDirectory}`);
    console.log(`  claude --resume ${interjection.sessionId}`);
  }
}

async function cmdDismissInterjection(interjectionId: string): Promise<void> {
  const success = await dismissInterjection(interjectionId);

  if (success) {
    console.log(`${chalk.green("Dismissed:")} ${chalk.cyan(interjectionId)}`);
  } else {
    console.error(chalk.red(`Interjection not found: ${interjectionId}`));
    process.exit(1);
  }
}

// =============================================================================
// Completions
// =============================================================================

function getInterjectionIdsSync(): string[] {
  const fs = require("node:fs");
  const path = require("node:path");

  const dir = path.join(process.cwd(), ".interjections");
  if (!fs.existsSync(dir)) return [];

  try {
    return fs
      .readdirSync(dir)
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

const interjectionIdCompletions = (complete: (value: string, description: string) => void) => {
  for (const id of getInterjectionIdsSync()) {
    complete(id, "Interjection ID");
  }
};

// =============================================================================
// CLI Registration
// =============================================================================

export function register(cli: Clerc): Clerc {
  return cli
    .command("interject", "List pending interjections or interject an agent", {
      parameters: ["[agent]"],
      flags: {
        reason: { type: String, short: "r", description: "Reason for interjection" },
      },
      help: { group: "interjections" },
    })
    .on("interject", async (ctx) => {
      const agentName = ctx.parameters.agent as string | undefined;
      if (agentName) {
        await cmdInterject(agentName, ctx.flags.reason as string | undefined);
      } else {
        await cmdListInterjections();
      }
    })

    .command("interject resume", "Resume an interjected session", {
      parameters: [
        { key: "<id>", description: "Interjection ID", completions: { handler: interjectionIdCompletions } },
      ],
      help: { group: "interjections" },
    })
    .on("interject resume", async (ctx) => {
      await cmdResumeInterjection(ctx.parameters.id as string);
    })

    .command("interject dismiss", "Dismiss an interjection", {
      parameters: [
        { key: "<id>", description: "Interjection ID", completions: { handler: interjectionIdCompletions } },
      ],
      help: { group: "interjections" },
    })
    .on("interject dismiss", async (ctx) => {
      await cmdDismissInterjection(ctx.parameters.id as string);
    });
}
