// =============================================================================
// Agent Commands for Clerc CLI
// =============================================================================

import chalk from "chalk";
import type { Clerc } from "clerc";

import { createAgentByName } from "../agents/factory";
import {
  checkAllAgentAvailability,
  getAgentDefinition,
  getAgentVersion,
  getRegisteredAgentNames,
  isValidAgentName,
} from "../agents/loader";
import { getTasksFile } from "../commands/context";
import { runAgentWorkLoop, startOrchestrator } from "../commands/orchestrator";
import { cmdAgents } from "../commands/tasks";
import { getAgentNamesSync } from "../completions/providers";
import { triggerInterject } from "../human-queue";
import { getDefaultInteractiveAgent, getDefaultNonInteractiveAgent, loadUserConfig } from "../user-config";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register agent commands with a Clerc CLI instance.
 */
export function registerAgentCommands(cli: Clerc): Clerc {
  return cli
    .command("run", "Start the orchestrator with all agents", {
      flags: {
        agent: {
          type: String,
          short: "a",
          description: "Override the default agent for task execution",
        },
      },
      help: { group: "workflow" },
    })
    .on("run", async (ctx) => {
      const agent = ctx.flags.agent as string | undefined;
      await startOrchestrator(agent);
    })
    .command("agent run", "Run a specific agent's work loop", {
      parameters: [
        {
          key: "<name>",
          description: "Name of the agent to run",
          completions: {
            handler: (complete) => {
              const names = getAgentNamesSync(getTasksFile());
              for (const name of names) {
                complete(name, "Agent name");
              }
            },
          },
        },
      ],
      help: { group: "agent-ops" },
    })
    .on("agent run", async (ctx) => {
      const name = ctx.parameters.name as string;
      await runAgentWorkLoop(name);
    })
    .command("agent list", "List all agents defined in tasks", {
      help: { group: "agent-ops" },
    })
    .command("agents", "List all agents defined in tasks (alias for 'agent list')", {
      help: { group: "agent-ops" },
    })
    .on("agent list", async () => {
      await cmdAgents();
    })
    .on("agents", async () => {
      await cmdAgents();
    })
    .command("agent interject", "Trigger an interject for a running agent", {
      parameters: [
        {
          key: "<name>",
          description: "Name of the agent to interject",
          completions: {
            handler: (complete) => {
              const names = getAgentNamesSync(getTasksFile());
              for (const name of names) {
                complete(name, "Agent name");
              }
            },
          },
        },
        {
          key: "[reason]",
          description: "Reason for the interjection",
        },
      ],
      help: { group: "agent-ops" },
    })
    .on("agent interject", async (ctx) => {
      const name = ctx.parameters.name as string;
      const reason = (ctx.parameters.reason as string) || undefined;
      await triggerInterject(name, reason);
      console.log(`Interject triggered for agent: ${name}`);
    })
    .command("agent check", "Check which agent CLIs are installed and available", {
      help: { group: "system" },
    })
    .on("agent check", async () => {
      await cmdAgentCheck();
    })
    .command("agent validate", "Validate an agent works by running a test prompt", {
      parameters: [
        {
          key: "[name]",
          description: "Agent to validate (uses default if not specified)",
        },
      ],
      flags: {
        streaming: {
          type: Boolean,
          short: "s",
          description: "Test streaming (non-interactive) mode instead of interactive",
        },
      },
      help: { group: "system" },
    })
    .on("agent validate", async (ctx) => {
      const name = ctx.parameters.name as string | undefined;
      const streaming = ctx.flags.streaming as boolean;
      await cmdAgentValidate(name, streaming);
    });
}

// =============================================================================
// Agent Check Command
// =============================================================================

async function cmdAgentCheck(): Promise<void> {
  const userConfig = await loadUserConfig({ validate: false });
  const defaultInteractive = getDefaultInteractiveAgent(userConfig);
  const defaultNonInteractive = getDefaultNonInteractiveAgent(userConfig);
  const registeredAgents = getRegisteredAgentNames();

  console.log(chalk.bold("Agent CLI Status\n"));

  // Check availability of all agents
  const availability = await checkAllAgentAvailability();

  // Get versions for available agents
  const versions: Record<string, string | null> = {};
  for (const name of registeredAgents) {
    if (availability[name]) {
      versions[name] = await getAgentVersion(name);
    }
  }

  // Display results
  for (const name of registeredAgents) {
    const isDefaultInteractive = name === defaultInteractive;
    const isDefaultNonInteractive = name === defaultNonInteractive;
    const isAvailable = availability[name];
    const version = versions[name];

    // Build default badge
    let defaultBadge = "";
    if (isDefaultInteractive && isDefaultNonInteractive) {
      defaultBadge = chalk.cyan(" (default)");
    } else if (isDefaultInteractive) {
      defaultBadge = chalk.cyan(" (interactive)");
    } else if (isDefaultNonInteractive) {
      defaultBadge = chalk.cyan(" (non-interactive)");
    }

    const statusIcon = isAvailable ? chalk.green("✓") : chalk.red("✗");
    const nameText = isAvailable ? chalk.white(name) : chalk.dim(name);
    const versionText = version ? chalk.dim(` ${version}`) : "";
    const notInstalled = isAvailable ? "" : chalk.red(" not installed");

    console.log(`  ${statusIcon} ${nameText}${defaultBadge}${versionText}${notInstalled}`);
  }

  // Show warnings if default agents are not available
  const warnings: string[] = [];
  if (!availability[defaultInteractive]) {
    warnings.push(`Default interactive agent '${defaultInteractive}' is not installed`);
  }
  if (!availability[defaultNonInteractive] && defaultNonInteractive !== defaultInteractive) {
    warnings.push(`Default non-interactive agent '${defaultNonInteractive}' is not installed`);
  }
  if (warnings.length > 0) {
    console.log("");
    for (const warning of warnings) {
      console.log(chalk.yellow(`Warning: ${warning}`));
    }
    console.log(chalk.dim("  Use 'bloom config set-interactive <agent>' or 'bloom config set-noninteractive <agent>'"));
  }

  // Summary
  const availableCount = Object.values(availability).filter(Boolean).length;
  const totalCount = registeredAgents.length;
  console.log("");
  console.log(chalk.dim(`${availableCount}/${totalCount} agents available`));
}

// =============================================================================
// Agent Validate Command
// =============================================================================

async function cmdAgentValidate(agentName?: string, streaming = false): Promise<void> {
  const userConfig = await loadUserConfig({ validate: false });
  // Use appropriate default based on mode
  const defaultAgent = streaming ? getDefaultNonInteractiveAgent(userConfig) : getDefaultInteractiveAgent(userConfig);
  const targetAgent = agentName || defaultAgent;

  // Check if agent is registered
  if (!isValidAgentName(targetAgent)) {
    console.error(chalk.red(`Unknown agent: ${targetAgent}`));
    console.error(chalk.dim(`Available agents: ${getRegisteredAgentNames().join(", ")}`));
    process.exit(1);
  }

  // Check if CLI is installed
  const availability = await checkAllAgentAvailability();
  if (!availability[targetAgent]) {
    console.error(chalk.red(`Agent CLI not installed: ${targetAgent}`));
    console.error(chalk.dim("Run 'bloom agent check' to see installation status"));
    process.exit(1);
  }

  const definition = getAgentDefinition(targetAgent);
  if (!definition) {
    console.error(chalk.red(`No definition found for agent: ${targetAgent}`));
    process.exit(1);
  }

  const mode = streaming ? "streaming" : "interactive";
  console.log(chalk.bold(`\nValidating ${targetAgent} in ${mode} mode...\n`));

  // Show the command that will be run
  const modeConfig = streaming ? definition.streaming : definition.interactive;
  const cmdParts = [definition.command];
  if (modeConfig.subcommand) {
    cmdParts.push(modeConfig.subcommand);
  }
  cmdParts.push(...modeConfig.base_args);
  console.log(chalk.dim(`Command: ${cmdParts.join(" ")} [+ prompt]\n`));

  const testPrompt = "Reply with ONLY the single word 'VALIDATED' and nothing else.";
  const testSystemPrompt = "You are a validation test. Follow instructions exactly.";

  try {
    const agent = createAgentByName(targetAgent, !streaming);

    const startTime = Date.now();
    const result = await agent.run({
      prompt: testPrompt,
      systemPrompt: testSystemPrompt,
      startingDirectory: process.cwd(),
      agentName: `validate-${targetAgent}`,
    });

    const duration = Date.now() - startTime;

    console.log("");
    if (result.success) {
      const hasValidated = result.output.toLowerCase().includes("validated");
      if (hasValidated) {
        console.log(chalk.green("✓ Agent validated successfully"));
        console.log(chalk.dim(`  Response received in ${(duration / 1000).toFixed(1)}s`));
      } else {
        console.log(chalk.yellow("⚠ Agent responded but output unexpected"));
        console.log(chalk.dim(`  Expected 'VALIDATED', got: ${result.output.slice(0, 100)}...`));
      }
    } else {
      console.log(chalk.red("✗ Agent validation failed"));
      if (result.error) {
        console.log(chalk.red(`  Error: ${result.error}`));
      }
    }

    if (result.sessionId) {
      console.log(chalk.dim(`  Session: ${result.sessionId}`));
    }
  } catch (error) {
    console.error(chalk.red("✗ Agent validation failed"));
    console.error(chalk.red(`  Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}
