// =============================================================================
// Repository Commands for Clerc CLI
// =============================================================================

import chalk from "chalk";
import type { Clerc } from "clerc";
import { BLOOM_DIR } from "../commands/context";
import { getRepoNamesSync } from "../completions/providers";
import {
  addWorktree,
  cloneRepo,
  createRepo,
  listRepos,
  listWorktrees,
  removeRepo,
  removeWorktree,
  resetRepo,
  syncRepos,
} from "../infra/git";

// =============================================================================
// Completions Handler for Repo Names
// =============================================================================

const repoNameCompletions = (complete: (value: string, description: string) => void) => {
  const repos = getRepoNamesSync(BLOOM_DIR);
  for (const repo of repos) {
    complete(repo, "Repository");
  }
};

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register repository management commands with a Clerc CLI instance.
 *
 * Commands:
 * - repo clone: Clone external repository as bare repo
 * - repo create: Create new local repository
 * - repo list: List configured repositories
 * - repo sync: Sync all configured repos
 * - repo remove: Remove repository configuration
 * - repo worktree add: Create worktree for branch
 * - repo worktree remove: Remove worktree
 * - repo worktree list: List worktrees for repo
 */
export function registerRepoCommands(cli: Clerc): Clerc {
  return (
    cli
      // =========================================================================
      // repo clone - Clone external repository as bare repo
      // =========================================================================
      .command("repo clone", "Clone external repository as bare repo", {
        parameters: ["<url>"],
        flags: {
          name: {
            type: String,
            description: "Custom name for the repository",
          },
        },
        help: { group: "repo" },
      })
      .on("repo clone", async (ctx) => {
        const { url } = ctx.parameters;
        const { name } = ctx.flags;

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
      })

      // =========================================================================
      // repo create - Create new local repository
      // =========================================================================
      .command("repo create", "Create new local repository", {
        parameters: ["<name>"],
        help: { group: "repo" },
      })
      .on("repo create", async (ctx) => {
        const { name } = ctx.parameters;

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
      })

      // =========================================================================
      // repo list - List configured repositories
      // =========================================================================
      .command("repo list", "List configured repositories", {
        help: { group: "repo" },
      })
      .on("repo list", async () => {
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
      })

      // =========================================================================
      // repo sync - Sync all configured repos and pull default branches
      // =========================================================================
      .command("repo sync", "Sync all configured repos and pull default branches", {
        help: { group: "repo" },
      })
      .on("repo sync", async () => {
        console.log(chalk.dim("Syncing repositories...\n"));
        const result = await syncRepos(BLOOM_DIR);
        if (result.cloned.length > 0) {
          console.log(`${chalk.green("Cloned:")} ${result.cloned.map((c) => chalk.cyan(c)).join(", ")}`);
        }
        if (result.pulled.length > 0) {
          console.log(`${chalk.green("Pulled:")} ${result.pulled.map((p) => chalk.cyan(p)).join(", ")}`);
        }
        if (result.upToDate.length > 0) {
          console.log(`${chalk.blue("Up to date:")} ${result.upToDate.map((u) => chalk.cyan(u)).join(", ")}`);
        }
        if (result.failed.length > 0) {
          console.log(chalk.red("Failed:"));
          for (const f of result.failed) {
            console.log(`  ${chalk.red(f.name)}: ${f.error}`);
          }
        }
        console.log(`\n${chalk.green("Sync complete.")}`);
      })

      // =========================================================================
      // repo remove - Remove repository configuration
      // =========================================================================
      .command("repo remove", "Remove repository configuration", {
        parameters: [
          {
            key: "<name>",
            description: "Repository name",
            completions: {
              handler: repoNameCompletions,
            },
          },
        ],
        help: { group: "repo" },
      })
      .on("repo remove", async (ctx) => {
        const { name } = ctx.parameters;

        const result = await removeRepo(BLOOM_DIR, name);
        if (result.success) {
          console.log(`${chalk.green("Removed repository:")} ${chalk.cyan(name)}`);
        } else {
          console.error(chalk.red(`Failed: ${result.error}`));
          process.exit(1);
        }
      })

      // =========================================================================
      // repo reset - Reset repository to clean state
      // =========================================================================
      .command("repo reset", "Remove all non-default worktrees and branches", {
        parameters: [
          {
            key: "<repo>",
            description: "Repository name",
            completions: {
              handler: repoNameCompletions,
            },
          },
        ],
        flags: {
          "dry-run": {
            type: Boolean,
            alias: "n",
            description: "Preview what will be deleted without making changes",
          },
          force: {
            type: Boolean,
            alias: "f",
            description: "Skip confirmation prompt",
          },
        },
        help: { group: "repo" },
      })
      .on("repo reset", async (ctx) => {
        const { repo } = ctx.parameters;
        const { "dry-run": dryRun, force } = ctx.flags;

        // Get preview of what will be reset
        const preview = await resetRepo(repo, { dryRun: true });

        if (!preview.success) {
          console.error(chalk.red(`Failed: ${preview.error}`));
          process.exit(1);
        }

        // Check if there's anything to clean up
        if (preview.worktreesToRemove.length === 0 && preview.branchesToDelete.length === 0) {
          console.log(chalk.dim(`Repository ${chalk.cyan(repo)} is already clean.`));
          console.log(chalk.dim(`Only the default branch ${chalk.yellow(preview.defaultBranch)} exists.`));
          return;
        }

        // Show what will be deleted
        console.log(chalk.bold(`\nReset preview for ${chalk.cyan(repo)}:\n`));

        if (preview.worktreesToRemove.length > 0) {
          console.log(chalk.bold("Worktrees to remove:"));
          for (const wt of preview.worktreesToRemove) {
            const warning = wt.hasUncommittedChanges ? chalk.yellow(" ⚠ uncommitted changes") : "";
            console.log(`  ${chalk.red("✗")} ${chalk.yellow(wt.branch)} ${chalk.dim(`(${wt.path})`)}${warning}`);
          }
          console.log();
        }

        if (preview.branchesToDelete.length > 0) {
          console.log(chalk.bold("Local branches to delete:"));
          for (const branch of preview.branchesToDelete) {
            console.log(`  ${chalk.red("✗")} ${chalk.yellow(branch)}`);
          }
          console.log();
        }

        if (preview.remoteBranchesToDelete.length > 0) {
          console.log(chalk.bold("Remote branches to delete:"));
          for (const branch of preview.remoteBranchesToDelete) {
            console.log(`  ${chalk.red("✗")} ${chalk.yellow(`origin/${branch}`)}`);
          }
          console.log();
        }

        console.log(chalk.bold("Preserved:"));
        console.log(`  ${chalk.green("✓")} ${chalk.yellow(preview.defaultBranch)} ${chalk.dim("(default branch)")}`);
        console.log();

        // If dry-run, stop here
        if (dryRun) {
          console.log(chalk.dim("Dry-run mode: no changes made."));
          console.log(chalk.dim(`Run without ${chalk.cyan("-n")} to apply changes.`));
          return;
        }

        // Confirm unless --force is set
        if (!force) {
          const readline = await import("node:readline");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question(chalk.yellow("Proceed with reset? [y/N] "), (ans) => {
              rl.close();
              resolve(ans);
            });
          });

          if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
            console.log(chalk.dim("Reset cancelled."));
            return;
          }
        }

        // Perform the actual reset
        console.log(chalk.dim("\nResetting repository..."));
        const result = await resetRepo(repo, { dryRun: false });

        if (!result.success) {
          console.error(chalk.red(`\nFailed: ${result.error}`));
          process.exit(1);
        }

        // Report results
        console.log();
        if (result.worktreesRemoved.length > 0) {
          console.log(chalk.green(`Removed ${result.worktreesRemoved.length} worktree(s)`));
        }
        if (result.branchesDeleted.length > 0) {
          console.log(chalk.green(`Deleted ${result.branchesDeleted.length} local branch(es)`));
        }
        if (result.remoteBranchesDeleted.length > 0) {
          console.log(chalk.green(`Deleted ${result.remoteBranchesDeleted.length} remote branch(es)`));
        }
        if (result.failed.length > 0) {
          console.log(chalk.yellow(`\nFailed to remove ${result.failed.length} item(s):`));
          for (const f of result.failed) {
            console.log(`  ${chalk.red("✗")} ${f.item}: ${chalk.dim(f.error)}`);
          }
        }
        console.log(
          chalk.green(`\nRepository ${chalk.cyan(repo)} has been reset to ${chalk.yellow(result.defaultBranch)}.`)
        );
      })

      // =========================================================================
      // repo worktree add - Create worktree for branch
      // =========================================================================
      .command("repo worktree add", "Create worktree for branch", {
        parameters: [
          {
            key: "<repo>",
            description: "Repository name",
            completions: {
              handler: repoNameCompletions,
            },
          },
          "<branch>",
        ],
        flags: {
          create: {
            type: Boolean,
            description: "Create new branch",
          },
        },
        help: { group: "repo" },
      })
      .on("repo worktree add", async (ctx) => {
        const { repo, branch } = ctx.parameters;
        const { create } = ctx.flags;

        const result = await addWorktree(BLOOM_DIR, repo, branch, { create: create ?? false });
        if (result.success) {
          console.log(`${chalk.green("Created worktree at:")} ${chalk.blue(result.path)}`);
        } else {
          console.error(chalk.red(`Failed: ${result.error}`));
          process.exit(1);
        }
      })

      // =========================================================================
      // repo worktree remove - Remove worktree
      // =========================================================================
      .command("repo worktree remove", "Remove worktree", {
        parameters: [
          {
            key: "<repo>",
            description: "Repository name",
            completions: {
              handler: repoNameCompletions,
            },
          },
          "<branch>",
        ],
        help: { group: "repo" },
      })
      .on("repo worktree remove", async (ctx) => {
        const { repo, branch } = ctx.parameters;

        const result = await removeWorktree(BLOOM_DIR, repo, branch);
        if (result.success) {
          console.log(`${chalk.green("Removed worktree for branch:")} ${chalk.yellow(branch)}`);
        } else {
          console.error(chalk.red(`Failed: ${result.error}`));
          process.exit(1);
        }
      })

      // =========================================================================
      // repo worktree list - List worktrees for repo
      // =========================================================================
      .command("repo worktree list", "List worktrees for repo", {
        parameters: [
          {
            key: "<repo>",
            description: "Repository name",
            completions: {
              handler: repoNameCompletions,
            },
          },
        ],
        help: { group: "repo" },
      })
      .on("repo worktree list", async (ctx) => {
        const { repo } = ctx.parameters;

        const worktrees = await listWorktrees(BLOOM_DIR, repo);
        if (worktrees.length === 0) {
          console.log(chalk.dim(`No worktrees found for ${repo}`));
        } else {
          console.log(`${chalk.bold("Worktrees for")} ${chalk.cyan(repo)}:\n`);
          for (const wt of worktrees) {
            console.log(`  ${chalk.yellow(wt.branch)}`);
            console.log(`    ${chalk.bold("path:")} ${chalk.blue(wt.path)}`);
            console.log(`    ${chalk.bold("commit:")} ${chalk.dim(wt.commit.slice(0, 8))}`);
          }
        }
      })
  );
}
