// =============================================================================
// Config Commands for Clerc CLI
// =============================================================================

import chalk from "chalk";
import { type Clerc, Types } from "clerc";
import { getRegisteredAgentNames, isValidAgentName, listAgentModels } from "../agents/loader";
import { BLOOM_DIR } from "../commands/context";
import { listRepos } from "../repos";
import {
  type AgentSection,
  getAgentConfig,
  getConfiguredModels,
  getDefaultInteractiveAgent,
  getDefaultModel,
  getDefaultNonInteractiveAgent,
  KNOWN_AGENTS,
  loadUserConfig,
  type PerAgentConfig,
  setAgentDefaultModel,
  setAgentModels,
  setDefaultInteractiveAgent,
  setDefaultNonInteractiveAgent,
  setGitProtocol,
} from "../user-config";

// =============================================================================
// Constants
// =============================================================================

const PROTOCOLS = ["ssh", "https"] as const;
type Protocol = (typeof PROTOCOLS)[number];

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register config commands with a Clerc CLI instance.
 */
export function registerConfigCommands(cli: Clerc): Clerc {
  return cli
    .command("config", "Show configuration", {
      alias: "cfg",
      help: { group: "system" },
    })
    .on("config", async () => {
      await showConfig();
    })
    .command("config set-protocol", "Set git protocol for repository URLs", {
      parameters: [
        {
          key: "<protocol>",
          description: "Git protocol (ssh or https)",
          type: Types.Enum(...PROTOCOLS),
          completions: {
            handler: (complete) => {
              for (const protocol of PROTOCOLS) {
                complete(protocol, `Use ${protocol.toUpperCase()} for git operations`);
              }
            },
          },
        },
      ],
      help: { group: "system" },
    })
    .on("config set-protocol", async (ctx) => {
      const protocol = ctx.parameters.protocol as Protocol;
      await setProtocol(protocol);
    })
    .command("config set-interactive", "Set default agent for interactive mode", {
      parameters: [
        {
          key: "<agent>",
          description: "Agent name",
          completions: {
            handler: (complete) => {
              for (const agent of getRegisteredAgentNames()) {
                complete(agent, `Use ${agent} for interactive mode`);
              }
            },
          },
        },
      ],
      help: { group: "system" },
    })
    .on("config set-interactive", async (ctx) => {
      const agent = ctx.parameters.agent as string;
      await cmdSetInteractive(agent);
    })
    .command("config set-noninteractive", "Set default agent for non-interactive mode", {
      parameters: [
        {
          key: "<agent>",
          description: "Agent name",
          completions: {
            handler: (complete) => {
              for (const agent of getRegisteredAgentNames()) {
                complete(agent, `Use ${agent} for non-interactive mode`);
              }
            },
          },
        },
      ],
      help: { group: "system" },
    })
    .on("config set-noninteractive", async (ctx) => {
      const agent = ctx.parameters.agent as string;
      await cmdSetNonInteractive(agent);
    })
    .command("config set-model", "Set default model for an agent", {
      parameters: [
        {
          key: "<agent>",
          description: "Agent name",
          completions: {
            handler: (complete) => {
              for (const agent of getRegisteredAgentNames()) {
                complete(agent, `Configure ${agent}`);
              }
            },
          },
        },
        {
          key: "<model>",
          description: "Model name",
        },
      ],
      help: { group: "system" },
    })
    .on("config set-model", async (ctx) => {
      const agent = ctx.parameters.agent as string;
      const model = ctx.parameters.model as string;
      await cmdSetModel(agent, model);
    })
    .command("config models", "Show and discover available models for agents", {
      parameters: [
        {
          key: "[agent]",
          description: "Agent to show models for (shows all if not specified)",
          completions: {
            handler: (complete) => {
              for (const agent of getRegisteredAgentNames()) {
                complete(agent, `Show models for ${agent}`);
              }
            },
          },
        },
      ],
      flags: {
        discover: {
          type: Boolean,
          short: "d",
          description: "Discover available models from agent CLI",
        },
        save: {
          type: Boolean,
          short: "s",
          description: "Save discovered models to config",
        },
      },
      help: { group: "system" },
    })
    .on("config models", async (ctx) => {
      const agent = ctx.parameters.agent as string | undefined;
      const discover = ctx.flags.discover as boolean;
      const save = ctx.flags.save as boolean;
      await cmdModels(agent, discover, save);
    });
}

// =============================================================================
// Command Handlers
// =============================================================================

/**
 * Display current configuration.
 */
async function showConfig(): Promise<void> {
  const userConfig = await loadUserConfig({ validate: false }); // Don't log warnings during display
  console.log(chalk.bold("User config") + chalk.dim(" (~/.bloom/config.yaml):\n"));
  console.log(`  ${chalk.bold("gitProtocol:")} ${chalk.cyan(userConfig.gitProtocol)}`);

  // Display agent configuration
  console.log(`\n${chalk.bold("Agent configuration:")}`);
  const defaultInteractive = getDefaultInteractiveAgent(userConfig);
  const defaultNonInteractive = getDefaultNonInteractiveAgent(userConfig);
  console.log(`  ${chalk.bold("defaultInteractive:")} ${chalk.cyan(defaultInteractive)}`);
  console.log(`  ${chalk.bold("defaultNonInteractive:")} ${chalk.cyan(defaultNonInteractive)}`);

  if (userConfig.agent?.timeout) {
    console.log(`  ${chalk.bold("timeout:")} ${chalk.cyan(userConfig.agent.timeout)}s`);
  }

  // Display per-agent configs
  if (userConfig.agent) {
    const agentSection = userConfig.agent as AgentSection;
    for (const agentName of KNOWN_AGENTS) {
      const agentConfig = getAgentConfig(userConfig, agentName);
      if (agentConfig) {
        const isDefaultInteractive = agentName === defaultInteractive;
        const isDefaultNonInteractive = agentName === defaultNonInteractive;
        let badge = "";
        if (isDefaultInteractive && isDefaultNonInteractive) {
          badge = chalk.dim(" (default)");
        } else if (isDefaultInteractive) {
          badge = chalk.dim(" (interactive)");
        } else if (isDefaultNonInteractive) {
          badge = chalk.dim(" (non-interactive)");
        }
        console.log(`\n  ${chalk.bold(`${agentName}:`)}${badge}`);
        displayAgentConfig(agentConfig, agentName);
      }
    }

    // Show any unknown agent configs
    const reservedKeys = ["defaultInteractive", "defaultNonInteractive", "timeout", ...KNOWN_AGENTS];
    const unknownAgents = Object.keys(agentSection).filter((key) => !reservedKeys.includes(key));
    for (const agentName of unknownAgents) {
      const config = agentSection[agentName];
      if (config && typeof config === "object") {
        console.log(`\n  ${chalk.bold(`${agentName}:`)} ${chalk.yellow("(custom agent)")}`);
        displayAgentConfig(config as PerAgentConfig, agentName);
      }
    }
  }

  console.log(`\n${chalk.bold("Workspace:")} ${chalk.cyan(BLOOM_DIR)}`);
  console.log(`\n${chalk.bold("Project repos")} ${chalk.dim("(bloom.config.yaml)")}:`);
  const repos = await listRepos(BLOOM_DIR);
  if (repos.length === 0) {
    console.log(chalk.dim("  (none)"));
  } else {
    for (const repo of repos) {
      console.log(`  ${chalk.dim("-")} ${chalk.cyan(repo.name)}`);
    }
  }
}

/**
 * Display a per-agent configuration.
 */
function displayAgentConfig(config: PerAgentConfig, agentName: string): void {
  if (config.defaultModel) {
    console.log(`    ${chalk.dim("defaultModel:")} ${chalk.cyan(config.defaultModel)}`);
  } else if (agentName === "opencode") {
    console.log(`    ${chalk.dim("defaultModel:")} ${chalk.red("(required - not set)")}`);
  }

  if (config.models && config.models.length > 0) {
    console.log(`    ${chalk.dim("models:")}`);
    for (const model of config.models) {
      const isDefault = model === config.defaultModel;
      console.log(`      ${chalk.dim("-")} ${chalk.cyan(model)}${isDefault ? chalk.green(" *") : ""}`);
    }
  }

  if (config.allowedTools) {
    const tools = config.allowedTools === "all" ? "all" : config.allowedTools.join(", ");
    console.log(`    ${chalk.dim("allowedTools:")} ${chalk.cyan(tools)}`);
  }

  if (config.deniedTools && config.deniedTools.length > 0) {
    console.log(`    ${chalk.dim("deniedTools:")} ${chalk.cyan(config.deniedTools.join(", "))}`);
  }

  // Codex-specific
  if ("fullAuto" in config && config.fullAuto !== undefined) {
    console.log(`    ${chalk.dim("fullAuto:")} ${chalk.cyan(config.fullAuto)}`);
  }
}

/**
 * Set the git protocol.
 */
async function setProtocol(protocol: Protocol): Promise<void> {
  await setGitProtocol(protocol);
  console.log(`${chalk.green("Git protocol set to:")} ${chalk.cyan(protocol)}`);
}

/**
 * Set the default interactive agent.
 */
async function cmdSetInteractive(agent: string): Promise<void> {
  if (!isValidAgentName(agent)) {
    console.error(chalk.red(`Unknown agent: ${agent}`));
    console.error(chalk.dim(`Available agents: ${getRegisteredAgentNames().join(", ")}`));
    process.exit(1);
  }
  await setDefaultInteractiveAgent(agent);
  console.log(`${chalk.green("Default interactive agent set to:")} ${chalk.cyan(agent)}`);
}

/**
 * Set the default non-interactive agent.
 */
async function cmdSetNonInteractive(agent: string): Promise<void> {
  if (!isValidAgentName(agent)) {
    console.error(chalk.red(`Unknown agent: ${agent}`));
    console.error(chalk.dim(`Available agents: ${getRegisteredAgentNames().join(", ")}`));
    process.exit(1);
  }
  await setDefaultNonInteractiveAgent(agent);
  console.log(`${chalk.green("Default non-interactive agent set to:")} ${chalk.cyan(agent)}`);
}

/**
 * Set the default model for an agent.
 */
async function cmdSetModel(agent: string, model: string): Promise<void> {
  if (!isValidAgentName(agent)) {
    console.error(chalk.red(`Unknown agent: ${agent}`));
    console.error(chalk.dim(`Available agents: ${getRegisteredAgentNames().join(", ")}`));
    process.exit(1);
  }
  await setAgentDefaultModel(agent, model);
  console.log(`${chalk.green(`Default model for ${agent} set to:`)} ${chalk.cyan(model)}`);
}

/**
 * Show and optionally discover models for agents.
 */
async function cmdModels(agentName?: string, discover = false, save = false): Promise<void> {
  const userConfig = await loadUserConfig({ validate: false });
  const agents = agentName ? [agentName] : getRegisteredAgentNames();

  for (const agent of agents) {
    if (!isValidAgentName(agent)) {
      console.error(chalk.red(`Unknown agent: ${agent}`));
      continue;
    }

    console.log(chalk.bold(`\n${agent}:`));

    // Show configured models
    const configuredModels = getConfiguredModels(userConfig, agent);
    const defaultModel = getDefaultModel(userConfig, agent);

    if (configuredModels.length > 0) {
      console.log(chalk.dim("  Configured models:"));
      for (const model of configuredModels) {
        const isDefault = model === defaultModel;
        console.log(`    ${chalk.dim("-")} ${chalk.cyan(model)}${isDefault ? chalk.green(" (default)") : ""}`);
      }
    } else {
      console.log(chalk.dim("  No models configured"));
    }

    // Discover models from CLI if requested
    if (discover) {
      console.log(chalk.dim("  Discovering models from CLI..."));
      const discoveredModels = await listAgentModels(agent);
      if (discoveredModels && discoveredModels.length > 0) {
        console.log(chalk.dim("  Available from CLI:"));
        for (const model of discoveredModels) {
          const isConfigured = configuredModels.includes(model);
          console.log(
            `    ${chalk.dim("-")} ${chalk.cyan(model)}${isConfigured ? chalk.dim(" (configured)") : chalk.green(" (new)")}`
          );
        }

        // Save discovered models to config if requested
        if (save) {
          // Merge with existing models, keeping configured ones first
          const mergedModels = [...new Set([...configuredModels, ...discoveredModels])];
          await setAgentModels(agent, mergedModels);
          console.log(chalk.green(`  Saved ${mergedModels.length} models to config`));
        }
      } else {
        console.log(chalk.dim("  No models discovered (agent may not support model listing)"));
      }
    }
  }

  if (!discover) {
    console.log(chalk.dim("\nTip: Use --discover (-d) to fetch models from agent CLIs"));
    console.log(chalk.dim("     Use --save (-s) with --discover to save discovered models"));
  }
}
