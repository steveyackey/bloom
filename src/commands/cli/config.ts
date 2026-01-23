// =============================================================================
// Config Commands for Clerc CLI
// =============================================================================

import chalk from "chalk";
import { type Clerc, Types } from "clerc";

import { listRepos } from "../../repos";
import {
  type AgentSection,
  getAgentConfig,
  getDefaultAgentName,
  KNOWN_AGENTS,
  loadUserConfig,
  type PerAgentConfig,
  setGitProtocol,
} from "../../user-config";
import { BLOOM_DIR } from "../context";

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
  if (userConfig.agent) {
    console.log(`\n${chalk.bold("Agent configuration:")}`);
    const defaultAgent = getDefaultAgentName(userConfig);
    console.log(`  ${chalk.bold("default:")} ${chalk.cyan(defaultAgent)}`);

    if (userConfig.agent.timeout) {
      console.log(`  ${chalk.bold("timeout:")} ${chalk.cyan(userConfig.agent.timeout)}s`);
    }

    // Display per-agent configs
    const agentSection = userConfig.agent as AgentSection;
    for (const agentName of KNOWN_AGENTS) {
      const agentConfig = getAgentConfig(userConfig, agentName);
      if (agentConfig) {
        console.log(`\n  ${chalk.bold(`${agentName}:`)}${agentName === defaultAgent ? chalk.dim(" (default)") : ""}`);
        displayAgentConfig(agentConfig, agentName);
      }
    }

    // Show any unknown agent configs
    const reservedKeys = ["default", "timeout", ...KNOWN_AGENTS];
    const unknownAgents = Object.keys(agentSection).filter((key) => !reservedKeys.includes(key));
    for (const agentName of unknownAgents) {
      const config = agentSection[agentName];
      if (config && typeof config === "object") {
        console.log(`\n  ${chalk.bold(`${agentName}:`)} ${chalk.yellow("(unknown agent)")}`);
        displayAgentConfig(config as PerAgentConfig, agentName);
      }
    }
  } else if (userConfig.interactiveAgent || userConfig.nonInteractiveAgent) {
    // Legacy format
    console.log(`\n${chalk.bold("Agent configuration")} ${chalk.dim("(legacy format)")}:`);
    if (userConfig.interactiveAgent) {
      console.log(`  ${chalk.bold("interactiveAgent:")} ${chalk.cyan(userConfig.interactiveAgent.agent)}`);
      if (userConfig.interactiveAgent.model) {
        console.log(`    ${chalk.dim("model:")} ${chalk.cyan(userConfig.interactiveAgent.model)}`);
      }
    }
    if (userConfig.nonInteractiveAgent) {
      console.log(`  ${chalk.bold("nonInteractiveAgent:")} ${chalk.cyan(userConfig.nonInteractiveAgent.agent)}`);
      if (userConfig.nonInteractiveAgent.model) {
        console.log(`    ${chalk.dim("model:")} ${chalk.cyan(userConfig.nonInteractiveAgent.model)}`);
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
  if (config.model) {
    console.log(`    ${chalk.dim("model:")} ${chalk.cyan(config.model)}`);
  } else if (agentName === "opencode") {
    console.log(`    ${chalk.dim("model:")} ${chalk.red("(required - not set)")}`);
  }

  if (config.allowedTools) {
    const tools = config.allowedTools === "all" ? "all" : config.allowedTools.join(", ");
    console.log(`    ${chalk.dim("allowedTools:")} ${chalk.cyan(tools)}`);
  }

  if (config.deniedTools && config.deniedTools.length > 0) {
    console.log(`    ${chalk.dim("deniedTools:")} ${chalk.cyan(config.deniedTools.join(", "))}`);
  }

  // Cline-specific
  if ("mode" in config && config.mode) {
    console.log(`    ${chalk.dim("mode:")} ${chalk.cyan(config.mode)}`);
  }
  if ("provider" in config && config.provider) {
    console.log(`    ${chalk.dim("provider:")} ${chalk.cyan(config.provider)}`);
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
