// =============================================================================
// Git Infrastructure - Public API
// =============================================================================

// Clone and create
export { type CloneResult, type CreateRepoResult, cloneRepo, createRepo } from "./clone";
// Config and paths
export {
  branchExists,
  type ConfigFile,
  findRepo,
  getBareRepoPath,
  getDefaultBranch,
  getReposDir,
  getReposFilePath,
  getWorktreePath,
  getWorktreesDir,
  loadReposFile,
  type RepoEntry,
  type ReposFile,
  runGit,
  saveReposFile,
} from "./config";
// Merge lock
export {
  acquireMergeLock,
  type MergeLock,
  releaseMergeLock,
  waitForMergeLock,
} from "./merge-lock";
// Status and branch operations
export {
  cleanupMergedBranches,
  deleteLocalBranch,
  type GitStatusResult,
  getCurrentBranch,
  getMergedBranches,
  getWorktreeStatus,
  mergeBranch,
  pushBranch,
} from "./status";
// Sync, pull, remove, list
export {
  listRepos,
  type PullAllResult,
  type PullResult,
  pullAllDefaultBranches,
  pullDefaultBranch,
  type RepoInfo,
  removeRepo,
  type SyncResult,
  syncRepos,
} from "./sync";
// Worktree management
export { addWorktree, listWorktrees, removeWorktree } from "./worktree";
