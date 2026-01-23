// =============================================================================
// Config Feature - View and modify configuration
// =============================================================================

import chalk from "chalk";
import type { Clerc } from "clerc";
import { loadUserConfig, setGitProtocol } from "../../core/config";
import { BLOOM_DIR } from "../../core/context";
import { listRepos } from "../../core/repos";

// =============================================================================
// Implementation
// =============================================================================

export async function cmdConfig(): Promise<void> {
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

export async function cmdSetProtocol(protocol: string): Promise<void> {
  if (protocol !== "ssh" && protocol !== "https") {
    console.error(chalk.red("Usage: bloom config set-protocol <ssh|https>"));
    process.exit(1);
  }
  await setGitProtocol(protocol);
  console.log(`${chalk.green("Git protocol set to:")} ${chalk.cyan(protocol)}`);
}

// =============================================================================
// CLI Registration
// =============================================================================

export function register(cli: Clerc): Clerc {
  return cli
    .command("config", "Show configuration", {
      help: { group: "system" },
    })
    .on("config", async () => {
      await cmdConfig();
    })
    .command("config set-protocol", "Set git protocol preference (ssh or https)", {
      parameters: ["<protocol>"],
      help: { group: "system" },
    })
    .on("config set-protocol", async (ctx) => {
      await cmdSetProtocol(ctx.parameters.protocol as string);
    });
}
