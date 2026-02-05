// =============================================================================
// Orchestrator Module - Public API
// =============================================================================
// This module provides the event-driven orchestrator for agent work loops.
// Adapters (CLI, TUI, Web) subscribe to events to display progress.

// Event types
export type {
  AgentIdleEvent,
  AgentOutputEvent,
  AgentProcessEndedEvent,
  AgentProcessStartedEvent,
  AgentStartedEvent,
  AllStepsCompletedEvent,
  CommitRetryEvent,
  ErrorEvent,
  EventHandler,
  GitCleanupEvent,
  GitMergeConflictEvent,
  GitMergedEvent,
  GitMergingEvent,
  GitPRCreatedEvent,
  GitPRCreatingEvent,
  GitPulledEvent,
  GitPullingEvent,
  GitPushedEvent,
  GitPushingEvent,
  LogEvent,
  MergeConflictResolvedEvent,
  MergeConflictResolvingEvent,
  MergeLockAcquiredEvent,
  MergeLockTimeoutEvent,
  MergeLockWaitingEvent,
  OrchestratorEvent,
  SessionCorruptedEvent,
  StepCompletedEvent,
  StepFailedEvent,
  StepStartedEvent,
  TaskBlockedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskFoundEvent,
  TaskStartedEvent,
  UncommittedChangesEvent,
  WorktreeCreatedEvent,
  WorktreeCreatingEvent,
} from "./events";

export type { CreatePRResult, MergeContext, MergeResult, UncommittedChangesResult } from "./post-task";
// Post-task operations (for advanced use cases)
export {
  acquireMergeLock,
  checkUncommittedChanges,
  cleanupMergedBranchesForTask,
  createPullRequest,
  ensureTargetWorktree,
  performMerge,
  pushBranchToRemote,
  pushMergedBranch,
  releaseMergeLockForBranch,
  setTaskDone,
  setTaskPendingMerge,
} from "./post-task";
export type { GitTaskInfo, TaskGetResult } from "./task-prompt";
// Task prompt utilities (for advanced use cases)
export {
  buildCommitResumePrompt,
  buildMergeConflictPrompt,
  buildTargetWorktreeCommitPrompt,
  getTaskForAgent,
  saveTaskSessionId,
} from "./task-prompt";
export type { WorkLoopOptions } from "./work-loop";
// Work loop
export { runAgentWorkLoop } from "./work-loop";
