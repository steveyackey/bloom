// =============================================================================
// Config Commands for Clerc CLI
// =============================================================================

import chalk from "chalk";
import { Clerc, Types } from "clerc";

import { listRepos } from "../../repos";
import { loadUserConfig, setGitProtocol } from "../../user-config";
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
  const userConfig = await loadUserConfig();
  console.log(chalk.bold("User config") + chalk.dim(" (~/.bloom/config.yaml):\n"));
  console.log(`  ${chalk.bold("gitProtocol:")} ${chalk.cyan(userConfig.gitProtocol)}`);
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
 * Set the git protocol.
 */
async function setProtocol(protocol: Protocol): Promise<void> {
  await setGitProtocol(protocol);
  console.log(`${chalk.green("Git protocol set to:")} ${chalk.cyan(protocol)}`);
}
