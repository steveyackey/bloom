// =============================================================================
// Git Infrastructure - Re-exports from repos.ts
// =============================================================================
// This module provides the public API for git operations.
// The implementation lives in repos.ts at the src root for now.

export type {
  CloneResult,
  ConfigFile,
  CreateRepoResult,
  GitStatusResult,
  MergeLock,
  PullAllResult,
  PullResult,
  RepoEntry,
  RepoInfo,
  ReposFile,
  SyncResult,
} from "../../repos";

export {
  acquireMergeLock,
  addWorktree,
  branchExists,
  cleanupMergedBranches,
  cloneRepo,
  createRepo,
  deleteLocalBranch,
  findRepo,
  getBareRepoPath,
  getCurrentBranch,
  getMergedBranches,
  getReposDir,
  getReposFilePath,
  getWorktreePath,
  getWorktreeStatus,
  getWorktreesDir,
  listRepos,
  listWorktrees,
  loadReposFile,
  mergeBranch,
  pullAllDefaultBranches,
  pullDefaultBranch,
  pushBranch,
  releaseMergeLock,
  removeRepo,
  removeWorktree,
  saveReposFile,
  syncRepos,
  waitForMergeLock,
} from "../../repos";
