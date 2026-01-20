// =============================================================================
// Repository CLI Command Handlers
// =============================================================================

import { addWorktree, cloneRepo, listRepos, listWorktrees, removeRepo, removeWorktree, syncRepos } from "../repos";
import { BLOOM_DIR } from "./context";

export async function cmdRepoClone(args: string[]): Promise<void> {
  const url = args[0];
  if (!url) {
    console.error("Usage: bloom repo clone <url> [--name <name>]");
    process.exit(1);
  }
  const nameIdx = args.indexOf("--name");
  const name = nameIdx !== -1 ? args[nameIdx + 1] : undefined;

  const result = await cloneRepo(BLOOM_DIR, url, { name });
  if (result.success) {
    console.log(`\nSuccessfully cloned ${result.repoName}`);
    console.log(`  Bare repo: ${result.bareRepoPath}`);
    console.log(`  Worktree:  ${result.worktreePath} (${result.defaultBranch})`);
  } else {
    console.error(`Failed: ${result.error}`);
    process.exit(1);
  }
}

export async function cmdRepoList(): Promise<void> {
  const repos = await listRepos(BLOOM_DIR);
  if (repos.length === 0) {
    console.log("No repos configured. Use 'bloom repo clone <url>' to add one.");
  } else {
    console.log("Configured repositories:\n");
    for (const repo of repos) {
      const status = repo.exists ? "✓" : "✗ (missing)";
      console.log(`${status} ${repo.name}`);
      console.log(`    url: ${repo.url}`);
      console.log(`    default: ${repo.defaultBranch}`);
      if (repo.worktrees.length > 0) {
        console.log(`    worktrees: ${repo.worktrees.join(", ")}`);
      }
    }
  }
}

export async function cmdRepoSync(): Promise<void> {
  console.log("Syncing repositories...\n");
  const result = await syncRepos(BLOOM_DIR);
  if (result.cloned.length > 0) {
    console.log(`Cloned: ${result.cloned.join(", ")}`);
  }
  if (result.skipped.length > 0) {
    console.log(`Updated: ${result.skipped.join(", ")}`);
  }
  if (result.failed.length > 0) {
    console.log(`Failed:`);
    for (const f of result.failed) {
      console.log(`  ${f.name}: ${f.error}`);
    }
  }
  console.log("\nSync complete.");
}

export async function cmdRepoRemove(name: string): Promise<void> {
  if (!name) {
    console.error("Usage: bloom repo remove <name>");
    process.exit(1);
  }
  const result = await removeRepo(BLOOM_DIR, name);
  if (result.success) {
    console.log(`Removed repository: ${name}`);
  } else {
    console.error(`Failed: ${result.error}`);
    process.exit(1);
  }
}

export async function cmdWorktreeAdd(repoName: string, branch: string, create: boolean): Promise<void> {
  if (!repoName || !branch) {
    console.error("Usage: bloom repo worktree add <repo> <branch> [--create]");
    process.exit(1);
  }
  const result = await addWorktree(BLOOM_DIR, repoName, branch, { create });
  if (result.success) {
    console.log(`Created worktree at: ${result.path}`);
  } else {
    console.error(`Failed: ${result.error}`);
    process.exit(1);
  }
}

export async function cmdWorktreeRemove(repoName: string, branch: string): Promise<void> {
  if (!repoName || !branch) {
    console.error("Usage: bloom repo worktree remove <repo> <branch>");
    process.exit(1);
  }
  const result = await removeWorktree(BLOOM_DIR, repoName, branch);
  if (result.success) {
    console.log(`Removed worktree for branch: ${branch}`);
  } else {
    console.error(`Failed: ${result.error}`);
    process.exit(1);
  }
}

export async function cmdWorktreeList(repoName: string): Promise<void> {
  if (!repoName) {
    console.error("Usage: bloom repo worktree list <repo>");
    process.exit(1);
  }
  const worktrees = await listWorktrees(BLOOM_DIR, repoName);
  if (worktrees.length === 0) {
    console.log(`No worktrees found for ${repoName}`);
  } else {
    console.log(`Worktrees for ${repoName}:\n`);
    for (const wt of worktrees) {
      console.log(`  ${wt.branch}`);
      console.log(`    path: ${wt.path}`);
      console.log(`    commit: ${wt.commit.slice(0, 8)}`);
    }
  }
}

// Router for repo subcommands
export async function handleRepoCommand(args: string[]): Promise<void> {
  const subCmd = args[1];

  switch (subCmd) {
    case "clone":
      await cmdRepoClone(args.slice(2));
      break;
    case "list":
      await cmdRepoList();
      break;
    case "sync":
      await cmdRepoSync();
      break;
    case "remove":
      await cmdRepoRemove(args[2]!);
      break;
    case "worktree":
      await handleWorktreeCommand(args);
      break;
    default:
      console.error("Usage: bloom repo <clone|list|sync|remove|worktree> ...");
      process.exit(1);
  }
}

// Router for worktree subcommands
export async function handleWorktreeCommand(args: string[]): Promise<void> {
  const wtCmd = args[2];
  const repoName = args[3]!;

  switch (wtCmd) {
    case "add":
      await cmdWorktreeAdd(repoName, args[4]!, args.includes("--create"));
      break;
    case "remove":
      await cmdWorktreeRemove(repoName, args[4]!);
      break;
    case "list":
      await cmdWorktreeList(repoName);
      break;
    default:
      console.error("Usage: bloom repo worktree <add|remove|list> ...");
      process.exit(1);
  }
}
