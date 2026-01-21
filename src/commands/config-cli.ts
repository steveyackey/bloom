// =============================================================================
// Configuration CLI Command Handlers
// =============================================================================

import chalk from "chalk";
import { listRepos } from "../repos";
import { loadUserConfig, setGitProtocol } from "../user-config";
import { BLOOM_DIR } from "./context";

export async function handleConfigCommand(args: string[]): Promise<void> {
  if (args[1] === "show" || !args[1]) {
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
  } else if (args[1] === "set-protocol") {
    const protocol = args[2];
    if (protocol !== "ssh" && protocol !== "https") {
      console.error(chalk.red("Usage: bloom config set-protocol <ssh|https>"));
      process.exit(1);
    }
    await setGitProtocol(protocol);
    console.log(`${chalk.green("Git protocol set to:")} ${chalk.cyan(protocol)}`);
  } else {
    console.error(chalk.red("Usage: bloom config [show|set-protocol <ssh|https>]"));
    process.exit(1);
  }
}
