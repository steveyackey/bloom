// =============================================================================
// Configuration CLI Command Handlers
// =============================================================================

import { listRepos } from "../repos";
import { loadUserConfig, setGitProtocol } from "../user-config";
import { BLOOM_DIR } from "./context";

export async function handleConfigCommand(args: string[]): Promise<void> {
  if (args[1] === "show" || !args[1]) {
    const userConfig = await loadUserConfig();
    console.log("User config (~/.bloom/config.yaml):\n");
    console.log(`  gitProtocol: ${userConfig.gitProtocol}`);
    console.log(`\nProject repos (bloom.repos.yaml):`);
    const repos = await listRepos(BLOOM_DIR);
    if (repos.length === 0) {
      console.log("  (none)");
    } else {
      for (const repo of repos) {
        console.log(`  - ${repo.name}`);
      }
    }
  } else if (args[1] === "set-protocol") {
    const protocol = args[2];
    if (protocol !== "ssh" && protocol !== "https") {
      console.error("Usage: bloom config set-protocol <ssh|https>");
      process.exit(1);
    }
    await setGitProtocol(protocol);
    console.log(`Git protocol set to: ${protocol}`);
  } else {
    console.error("Usage: bloom config [show|set-protocol <ssh|https>]");
    process.exit(1);
  }
}
