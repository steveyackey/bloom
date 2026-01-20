// =============================================================================
// Git Worktree Helpers (Legacy - for task worktrees within repos)
// =============================================================================

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Simple repo interface for setupRepos (legacy compatibility)
export interface SetupRepo {
  name: string;
  path: string;
  remote?: string;
  baseBranch: string;
}

export function worktreeExists(repoPath: string, worktreeName: string): boolean {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: repoPath });
  if (result.status !== 0) return false;
  return result.stdout.toString().includes(`worktree ${join(repoPath, worktreeName)}`);
}

export function createWorktree(
  repoPath: string,
  worktreeName: string,
  baseBranch = "main",
  logger?: { info: (msg: string) => void }
): boolean {
  const worktreePath = join(repoPath, worktreeName);

  if (existsSync(worktreePath)) {
    logger?.info(`Path already exists: ${worktreePath}`);
    return true;
  }

  const branchName = `worktree/${worktreeName}`;
  const result = spawnSync("git", ["worktree", "add", "-b", branchName, worktreePath, baseBranch], {
    cwd: repoPath,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    const retry = spawnSync("git", ["worktree", "add", worktreePath, branchName], {
      cwd: repoPath,
      stdio: "inherit",
    });
    return retry.status === 0;
  }

  return true;
}

export function getWorktreePath(repoPath: string, worktreeName: string): string {
  return join(repoPath, worktreeName);
}

// =============================================================================
// Repos Setup
// =============================================================================

export async function setupRepos(
  reposDir: string,
  tasksFile: string,
  repos: SetupRepo[],
  logger: { info: (msg: string) => void; debug: (msg: string) => void }
): Promise<void> {
  logger.info("Setting up repos directory structure...");

  if (!existsSync(reposDir)) {
    mkdirSync(reposDir, { recursive: true });
  }

  for (const repo of repos) {
    const repoPath = repo.path;

    if (!existsSync(repoPath)) {
      if (repo.remote) {
        // Clone from remote
        logger.info(`Cloning ${repo.name} from ${repo.remote}...`);
        const result = spawnSync("git", ["clone", repo.remote, repoPath], { stdio: "inherit" });
        if (result.status !== 0) {
          logger.info(`Failed to clone ${repo.name}, creating blank repo instead`);
          await createBlankRepo(repoPath, repo.name);
        }
      } else {
        // Create blank repo
        logger.info(`Creating blank repo: ${repo.name}`);
        await createBlankRepo(repoPath, repo.name);
      }
    } else {
      logger.debug(`Repo already exists: ${repo.name}`);
    }
  }

  if (!existsSync(tasksFile)) {
    logger.info("Creating empty tasks.yaml");
    const YAML = await import("yaml");
    await Bun.write(tasksFile, YAML.stringify({ tasks: [] }));
  }

  logger.info("Repos setup complete.");
}

async function createBlankRepo(repoPath: string, name: string): Promise<void> {
  mkdirSync(repoPath, { recursive: true });
  spawnSync("git", ["init"], { cwd: repoPath, stdio: "inherit" });
  const readmePath = join(repoPath, "README.md");
  await Bun.write(readmePath, `# ${name}\n\nRepository managed by bloom.\n`);
  spawnSync("git", ["add", "."], { cwd: repoPath, stdio: "inherit" });
  spawnSync("git", ["commit", "-m", "Initial commit"], { cwd: repoPath, stdio: "inherit" });
}
