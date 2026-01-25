/**
 * Repo Service
 * Handles repository operations like pulling and formatting results.
 */

import chalk from "chalk";
import { type PullAllResult, pullAllDefaultBranches } from "../infra/git";

// Re-export types and functions from repos.ts
export type { CloneResult, PullAllResult, PullResult, RepoInfo, SyncResult } from "../infra/git";
export {
  acquireMergeLock,
  addWorktree,
  branchExists,
  cleanupMergedBranches,
  cloneRepo,
  deleteLocalBranch,
  getBareRepoPath,
  getCurrentBranch,
  getMergedBranches,
  getWorktreePath,
  getWorktreeStatus,
  listRepos,
  listWorktrees,
  mergeBranch,
  pullAllDefaultBranches,
  pullDefaultBranch,
  pushBranch,
  releaseMergeLock,
  removeRepo,
  removeWorktree,
  syncRepos,
  waitForMergeLock,
} from "../infra/git";

/**
 * Formats pull results for display.
 * Returns an array of formatted lines (without final newline handling).
 * Uses chalk for colors (green/cyan for updated, dim for up-to-date, yellow/red for failed).
 *
 * @param result - The pull all result containing updated, upToDate, and failed repos
 * @returns Array of formatted lines ready for console output
 */
export function formatPullResults(result: PullAllResult): string[] {
  const lines: string[] = [];

  if (result.updated.length > 0) {
    lines.push(`${chalk.green("Updated:")} ${result.updated.map((u) => chalk.cyan(u)).join(", ")}`);
  }

  if (result.upToDate.length > 0) {
    lines.push(`${chalk.dim("Already up to date:")} ${result.upToDate.join(", ")}`);
  }

  if (result.failed.length > 0) {
    lines.push(chalk.yellow("\nWarning: Failed to pull updates for some repos:"));
    for (const { name, error } of result.failed) {
      lines.push(`  ${chalk.red(name)}: ${error}`);
    }
    lines.push(chalk.dim("\nProceeding with existing local state.\n"));
  }

  return lines;
}

