/**
 * Repo Service
 * Handles repository operations like pulling and formatting results.
 */

import chalk from "chalk";
import {
  type PullAllResult,
  pullAllDefaultBranches,
  listRepos,
  addWorktree,
  removeWorktree,
  listWorktrees,
  cloneRepo,
  removeRepo,
  syncRepos,
  getWorktreePath,
  getBareRepoPath,
  getWorktreeStatus,
} from "../repos";

// Re-export types and functions from repos.ts
export type { PullAllResult, PullResult, RepoInfo, CloneResult, SyncResult } from "../repos";
export {
  pullAllDefaultBranches,
  pullDefaultBranch,
  listRepos,
  addWorktree,
  removeWorktree,
  listWorktrees,
  cloneRepo,
  removeRepo,
  syncRepos,
  getWorktreePath,
  getBareRepoPath,
  getWorktreeStatus,
  branchExists,
  pushBranch,
  getCurrentBranch,
  mergeBranch,
  deleteLocalBranch,
  getMergedBranches,
  cleanupMergedBranches,
  acquireMergeLock,
  releaseMergeLock,
  waitForMergeLock,
} from "../repos";

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

/**
 * Pulls all default branches and logs the formatted results to console.
 * Convenience wrapper that combines pullAllDefaultBranches with formatPullResults.
 *
 * @param bloomDir - The bloom workspace directory
 * @returns The pull result for further use by callers
 */
export async function pullAndLogResults(bloomDir: string): Promise<PullAllResult> {
  const result = await pullAllDefaultBranches(bloomDir);
  const lines = formatPullResults(result);

  for (const line of lines) {
    console.log(line);
  }

  // Add blank line after results if there were any non-failed repos
  if (result.failed.length === 0 && (result.updated.length > 0 || result.upToDate.length > 0)) {
    console.log("");
  }

  return result;
}
