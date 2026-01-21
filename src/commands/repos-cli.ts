// =============================================================================
// Repository CLI Command Handlers
// =============================================================================

import chalk from "chalk";
import {
  addWorktree,
  cloneRepo,
  createRepo,
  listRepos,
  listWorktrees,
  removeRepo,
  removeWorktree,
  syncRepos,
} from "../repos";
import { BLOOM_DIR } from "./context";

export async function cmdRepoClone(args: string[]): Promise<void> {
  const url = args[0];
  if (!url) {
    console.error(chalk.red("Usage: bloom repo clone <url|org/repo> [--name <name>]"));
    console.error(chalk.dim("\nExamples:"));
    console.error(`  ${chalk.cyan("bloom repo clone")} ${chalk.yellow("steveyackey/bloom")}`);
    console.error(`  ${chalk.cyan("bloom repo clone")} ${chalk.yellow("https://github.com/org/repo")}`);
    console.error(`  ${chalk.cyan("bloom repo clone")} ${chalk.yellow("git@github.com:org/repo.git")}`);
    process.exit(1);
  }
  const nameIdx = args.indexOf("--name");
  const name = nameIdx !== -1 ? args[nameIdx + 1] : undefined;

  const result = await cloneRepo(BLOOM_DIR, url, { name });
  if (result.success) {
    console.log(`\n${chalk.green("Successfully cloned")} ${chalk.cyan(result.repoName)}`);
    console.log(`  ${chalk.bold("Bare repo:")} ${chalk.dim(result.bareRepoPath)}`);
    console.log(
      `  ${chalk.bold("Worktree:")}  ${chalk.blue(result.worktreePath)} ${chalk.dim(`(${result.defaultBranch})`)}`
    );
  } else {
    console.error(chalk.red(`Failed: ${result.error}`));
    process.exit(1);
  }
}

export async function cmdRepoCreate(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error(chalk.red("Usage: bloom repo create <name>"));
    console.error(chalk.dim("\nCreates a new local repository with worktree setup."));
    process.exit(1);
  }

  const result = await createRepo(BLOOM_DIR, name);
  if (result.success) {
    console.log(`\n${chalk.green("Successfully created")} ${chalk.cyan(result.repoName)}`);
    console.log(`  ${chalk.bold("Bare repo:")} ${chalk.dim(result.bareRepoPath)}`);
    console.log(
      `  ${chalk.bold("Worktree:")}  ${chalk.blue(result.worktreePath)} ${chalk.dim(`(${result.defaultBranch})`)}`
    );
    console.log(`\n${chalk.bold("To push to GitHub with gh CLI:")}`);
    console.log(`  ${chalk.cyan(`cd ${result.worktreePath}`)}`);
    console.log(`  ${chalk.cyan(`gh repo create ${result.repoName} --public --source=. --push`)}`);
    console.log(chalk.dim(`  # or for private: gh repo create ${result.repoName} --private --source=. --push`));
    console.log(`\n${chalk.bold("Or manually via GitHub UI:")}`);
    console.log(chalk.dim("  1. Create a new repository on github.com (without README)"));
    console.log(chalk.dim("  2. Then run:"));
    console.log(`     ${chalk.cyan(`cd ${result.worktreePath}`)}`);
    console.log(`     ${chalk.cyan("git remote add origin")} ${chalk.yellow("<your-repo-url>")}`);
    console.log(`     ${chalk.cyan(`git push -u origin ${result.defaultBranch}`)}`);
  } else {
    console.error(chalk.red(`Failed: ${result.error}`));
    process.exit(1);
  }
}

export async function cmdRepoList(): Promise<void> {
  const repos = await listRepos(BLOOM_DIR);
  if (repos.length === 0) {
    console.log(chalk.dim("No repos configured. Use 'bloom repo clone <url>' to add one."));
  } else {
    console.log(chalk.bold("Configured repositories:\n"));
    for (const repo of repos) {
      const status = repo.exists ? chalk.green("✓") : chalk.red("✗ (missing)");
      console.log(`${status} ${chalk.cyan.bold(repo.name)}`);
      console.log(`    ${chalk.bold("url:")} ${chalk.dim(repo.url)}`);
      console.log(`    ${chalk.bold("default:")} ${chalk.yellow(repo.defaultBranch)}`);
      if (repo.worktrees.length > 0) {
        console.log(`    ${chalk.bold("worktrees:")} ${repo.worktrees.map((w) => chalk.blue(w)).join(", ")}`);
      }
    }
  }
}

export async function cmdRepoSync(): Promise<void> {
  console.log(chalk.dim("Syncing repositories...\n"));
  const result = await syncRepos(BLOOM_DIR);
  if (result.cloned.length > 0) {
    console.log(`${chalk.green("Cloned:")} ${result.cloned.map((c) => chalk.cyan(c)).join(", ")}`);
  }
  if (result.skipped.length > 0) {
    console.log(`${chalk.blue("Updated:")} ${result.skipped.map((s) => chalk.cyan(s)).join(", ")}`);
  }
  if (result.failed.length > 0) {
    console.log(chalk.red("Failed:"));
    for (const f of result.failed) {
      console.log(`  ${chalk.red(f.name)}: ${f.error}`);
    }
  }
  console.log(`\n${chalk.green("Sync complete.")}`);
}

export async function cmdRepoRemove(name: string): Promise<void> {
  if (!name) {
    console.error(chalk.red("Usage: bloom repo remove <name>"));
    process.exit(1);
  }
  const result = await removeRepo(BLOOM_DIR, name);
  if (result.success) {
    console.log(`${chalk.green("Removed repository:")} ${chalk.cyan(name)}`);
  } else {
    console.error(chalk.red(`Failed: ${result.error}`));
    process.exit(1);
  }
}

export async function cmdWorktreeAdd(repoName: string, branch: string, create: boolean): Promise<void> {
  if (!repoName || !branch) {
    console.error(chalk.red("Usage: bloom repo worktree add <repo> <branch> [--create]"));
    process.exit(1);
  }
  const result = await addWorktree(BLOOM_DIR, repoName, branch, { create });
  if (result.success) {
    console.log(`${chalk.green("Created worktree at:")} ${chalk.blue(result.path)}`);
  } else {
    console.error(chalk.red(`Failed: ${result.error}`));
    process.exit(1);
  }
}

export async function cmdWorktreeRemove(repoName: string, branch: string): Promise<void> {
  if (!repoName || !branch) {
    console.error(chalk.red("Usage: bloom repo worktree remove <repo> <branch>"));
    process.exit(1);
  }
  const result = await removeWorktree(BLOOM_DIR, repoName, branch);
  if (result.success) {
    console.log(`${chalk.green("Removed worktree for branch:")} ${chalk.yellow(branch)}`);
  } else {
    console.error(chalk.red(`Failed: ${result.error}`));
    process.exit(1);
  }
}

export async function cmdWorktreeList(repoName: string): Promise<void> {
  if (!repoName) {
    console.error(chalk.red("Usage: bloom repo worktree list <repo>"));
    process.exit(1);
  }
  const worktrees = await listWorktrees(BLOOM_DIR, repoName);
  if (worktrees.length === 0) {
    console.log(chalk.dim(`No worktrees found for ${repoName}`));
  } else {
    console.log(`${chalk.bold("Worktrees for")} ${chalk.cyan(repoName)}:\n`);
    for (const wt of worktrees) {
      console.log(`  ${chalk.yellow(wt.branch)}`);
      console.log(`    ${chalk.bold("path:")} ${chalk.blue(wt.path)}`);
      console.log(`    ${chalk.bold("commit:")} ${chalk.dim(wt.commit.slice(0, 8))}`);
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
    case "create":
      await cmdRepoCreate(args.slice(2));
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
      console.error(chalk.red("Usage: bloom repo <clone|create|list|sync|remove|worktree> ..."));
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
      console.error(chalk.red("Usage: bloom repo worktree <add|remove|list> ..."));
      process.exit(1);
  }
}
