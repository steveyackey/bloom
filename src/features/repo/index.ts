// =============================================================================
// Repo Feature - Repository management with bare repos and worktrees
// =============================================================================

import chalk from "chalk";
import type { Clerc } from "clerc";
import { BLOOM_DIR } from "../../core/context";
import {
  addWorktree,
  cloneRepo,
  createRepo,
  listRepos,
  listWorktrees,
  removeRepo,
  removeWorktree,
  syncRepos,
} from "../../core/repos";

// =============================================================================
// Completions
// =============================================================================

function getRepoNamesSync(): string[] {
  // Sync read of bloom.config.yaml for completions
  const fs = require("node:fs");
  const path = require("node:path");
  const YAML = require("yaml");

  const configPath = path.join(BLOOM_DIR, "bloom.config.yaml");
  if (!fs.existsSync(configPath)) return [];

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const config = YAML.parse(content);
    return (config.repos || []).map((r: { name: string }) => r.name);
  } catch {
    return [];
  }
}

const repoNameCompletions = (complete: (value: string, description: string) => void) => {
  const repos = getRepoNamesSync();
  for (const repo of repos) {
    complete(repo, "Repository");
  }
};

// =============================================================================
// CLI Registration
// =============================================================================

export function register(cli: Clerc): Clerc {
  return cli
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

      const result = await cloneRepo(BLOOM_DIR, url as string, { name: name as string | undefined });
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

    .command("repo create", "Create new local repository", {
      parameters: ["<name>"],
      help: { group: "repo" },
    })
    .on("repo create", async (ctx) => {
      const { name } = ctx.parameters;

      const result = await createRepo(BLOOM_DIR, name as string);
      if (result.success) {
        console.log(`\n${chalk.green("Successfully created")} ${chalk.cyan(result.repoName)}`);
        console.log(`  ${chalk.bold("Bare repo:")} ${chalk.dim(result.bareRepoPath)}`);
        console.log(
          `  ${chalk.bold("Worktree:")}  ${chalk.blue(result.worktreePath)} ${chalk.dim(`(${result.defaultBranch})`)}`
        );
        console.log(`\n${chalk.bold("To push to GitHub with gh CLI:")}`);
        console.log(`  ${chalk.cyan(`cd ${result.worktreePath}`)}`);
        console.log(`  ${chalk.cyan(`gh repo create ${result.repoName} --public --source=. --push`)}`);
      } else {
        console.error(chalk.red(`Failed: ${result.error}`));
        process.exit(1);
      }
    })

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

    .command("repo sync", "Sync all configured repos (fetch updates)", {
      help: { group: "repo" },
    })
    .on("repo sync", async () => {
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
    })

    .command("repo remove", "Remove repository configuration", {
      parameters: [
        {
          key: "<name>",
          description: "Repository name",
          completions: { handler: repoNameCompletions },
        },
      ],
      help: { group: "repo" },
    })
    .on("repo remove", async (ctx) => {
      const { name } = ctx.parameters;

      const result = await removeRepo(BLOOM_DIR, name as string);
      if (result.success) {
        console.log(`${chalk.green("Removed repository:")} ${chalk.cyan(name)}`);
      } else {
        console.error(chalk.red(`Failed: ${result.error}`));
        process.exit(1);
      }
    })

    .command("repo worktree add", "Create worktree for branch", {
      parameters: [
        {
          key: "<repo>",
          description: "Repository name",
          completions: { handler: repoNameCompletions },
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

      const result = await addWorktree(BLOOM_DIR, repo as string, branch as string, { create: create ?? false });
      if (result.success) {
        console.log(`${chalk.green("Created worktree at:")} ${chalk.blue(result.path)}`);
      } else {
        console.error(chalk.red(`Failed: ${result.error}`));
        process.exit(1);
      }
    })

    .command("repo worktree remove", "Remove worktree", {
      parameters: [
        {
          key: "<repo>",
          description: "Repository name",
          completions: { handler: repoNameCompletions },
        },
        "<branch>",
      ],
      help: { group: "repo" },
    })
    .on("repo worktree remove", async (ctx) => {
      const { repo, branch } = ctx.parameters;

      const result = await removeWorktree(BLOOM_DIR, repo as string, branch as string);
      if (result.success) {
        console.log(`${chalk.green("Removed worktree for branch:")} ${chalk.yellow(branch)}`);
      } else {
        console.error(chalk.red(`Failed: ${result.error}`));
        process.exit(1);
      }
    })

    .command("repo worktree list", "List worktrees for repo", {
      parameters: [
        {
          key: "<repo>",
          description: "Repository name",
          completions: { handler: repoNameCompletions },
        },
      ],
      help: { group: "repo" },
    })
    .on("repo worktree list", async (ctx) => {
      const { repo } = ctx.parameters;

      const worktrees = await listWorktrees(BLOOM_DIR, repo as string);
      if (worktrees.length === 0) {
        console.log(chalk.dim(`No worktrees found for ${repo}`));
      } else {
        console.log(`${chalk.bold("Worktrees for")} ${chalk.cyan(repo as string)}:\n`);
        for (const wt of worktrees) {
          console.log(`  ${chalk.yellow(wt.branch)}`);
          console.log(`    ${chalk.bold("path:")} ${chalk.blue(wt.path)}`);
          console.log(`    ${chalk.bold("commit:")} ${chalk.dim(wt.commit.slice(0, 8))}`);
        }
      }
    });
}
