// =============================================================================
// Orchestrator Event Types
// =============================================================================
// This module defines all events emitted by the orchestrator work loop.
// Adapters (CLI, TUI, Web) subscribe to these events to display progress.

/**
 * Event emitted when an agent starts its work loop
 */
export interface AgentStartedEvent {
  type: "agent:started";
  agentName: string;
  provider: string;
  pollInterval: number;
}

/**
 * Event emitted when an agent is polling for work but none is available
 */
export interface AgentIdleEvent {
  type: "agent:idle";
  agentName: string;
}

/**
 * Event emitted when a task is picked up by an agent
 */
export interface TaskFoundEvent {
  type: "task:found";
  taskId: string;
  title: string;
  agentName: string;
  repo?: string | null;
}

/**
 * Event emitted when an agent session starts working on a task
 */
export interface TaskStartedEvent {
  type: "task:started";
  taskId: string;
  agentName: string;
  workingDir: string;
  provider: string;
  resuming: boolean;
}

/**
 * Event emitted when a task completes successfully
 */
export interface TaskCompletedEvent {
  type: "task:completed";
  taskId: string;
  agentName: string;
  duration: number;
}

/**
 * Event emitted when a task fails
 */
export interface TaskFailedEvent {
  type: "task:failed";
  taskId: string;
  agentName: string;
  duration: number;
  error: string;
}

/**
 * Event emitted when a task is blocked (e.g., max retries reached)
 */
export interface TaskBlockedEvent {
  type: "task:blocked";
  taskId: string;
  agentName: string;
  reason: string;
}

/**
 * Event emitted when a step starts within a task
 */
export interface StepStartedEvent {
  type: "step:started";
  taskId: string;
  stepId: string;
  stepIndex: number;
  totalSteps: number;
  agentName: string;
  resuming: boolean;
}

/**
 * Event emitted when a step completes successfully
 */
export interface StepCompletedEvent {
  type: "step:completed";
  taskId: string;
  stepId: string;
  stepIndex: number;
  totalSteps: number;
  duration: number;
  hasMoreSteps: boolean;
}

/**
 * Event emitted when a step fails
 */
export interface StepFailedEvent {
  type: "step:failed";
  taskId: string;
  stepId: string;
  error: string;
}

/**
 * Event emitted when all steps in a task are complete
 */
export interface AllStepsCompletedEvent {
  type: "steps:all_completed";
  taskId: string;
  totalSteps: number;
  totalDuration: number;
}

/**
 * Event emitted when pulling latest from remote
 */
export interface GitPullingEvent {
  type: "git:pulling";
  repo: string;
}

/**
 * Event emitted when pull completes
 */
export interface GitPulledEvent {
  type: "git:pulled";
  repo: string;
  updated: boolean;
  error?: string;
}

/**
 * Event emitted when creating a git worktree
 */
export interface WorktreeCreatingEvent {
  type: "worktree:creating";
  repo: string;
  branch: string;
  baseBranch?: string;
}

/**
 * Event emitted when worktree creation completes
 */
export interface WorktreeCreatedEvent {
  type: "worktree:created";
  repo: string;
  branch: string;
  success: boolean;
  error?: string;
}

/**
 * Event emitted when uncommitted changes are detected
 */
export interface UncommittedChangesEvent {
  type: "git:uncommitted_changes";
  branch: string;
  modifiedFiles: string[];
  untrackedFiles: string[];
  stagedFiles: string[];
}

/**
 * Event emitted when resuming agent to commit changes
 */
export interface CommitRetryEvent {
  type: "commit:retry";
  taskId: string;
  attempt: number;
  maxAttempts: number;
}

/**
 * Event emitted when pushing a branch
 */
export interface GitPushingEvent {
  type: "git:pushing";
  branch: string;
  remote: string;
}

/**
 * Event emitted when push completes
 */
export interface GitPushedEvent {
  type: "git:pushed";
  branch: string;
  remote: string;
  success: boolean;
  error?: string;
}

/**
 * Event emitted when creating a PR
 */
export interface GitPRCreatingEvent {
  type: "git:pr_creating";
  sourceBranch: string;
  targetBranch: string;
}

/**
 * Event emitted when PR creation completes
 */
export interface GitPRCreatedEvent {
  type: "git:pr_created";
  url?: string;
  sourceBranch: string;
  targetBranch: string;
  alreadyExists?: boolean;
  error?: string;
}

/**
 * Event emitted when waiting for merge lock
 */
export interface MergeLockWaitingEvent {
  type: "merge:lock_waiting";
  targetBranch: string;
  holder: string;
  holderBranch: string;
  waitTime: number;
}

/**
 * Event emitted when merge lock is acquired
 */
export interface MergeLockAcquiredEvent {
  type: "merge:lock_acquired";
  targetBranch: string;
}

/**
 * Event emitted when merge lock times out
 */
export interface MergeLockTimeoutEvent {
  type: "merge:lock_timeout";
  targetBranch: string;
}

/**
 * Event emitted when a merge retry is attempted
 */
export interface MergeRetryEvent {
  type: "merge:retry";
  taskId: string;
  attempt: number;
  maxAttempts: number;
}

/**
 * Event emitted when starting a merge operation
 */
export interface GitMergingEvent {
  type: "git:merging";
  sourceBranch: string;
  targetBranch: string;
}

/**
 * Event emitted when merge completes successfully
 */
export interface GitMergedEvent {
  type: "git:merged";
  sourceBranch: string;
  targetBranch: string;
}

/**
 * Event emitted when merge has conflicts
 */
export interface GitMergeConflictEvent {
  type: "git:merge_conflict";
  sourceBranch: string;
  targetBranch: string;
  error: string;
}

/**
 * Event emitted when merge conflict resolution starts
 */
export interface MergeConflictResolvingEvent {
  type: "merge:conflict_resolving";
  sourceBranch: string;
  targetBranch: string;
}

/**
 * Event emitted when merge conflict resolution completes
 */
export interface MergeConflictResolvedEvent {
  type: "merge:conflict_resolved";
  sourceBranch: string;
  targetBranch: string;
  success: boolean;
}

/**
 * Event emitted when cleaning up merged branches
 */
export interface GitCleanupEvent {
  type: "git:cleanup";
  targetBranch: string;
  /** Local branches deleted */
  deleted: string[];
  /** Branches that failed to delete */
  failed: Array<{ branch: string; error: string }>;
  /** Worktrees that were removed */
  worktreesRemoved: string[];
  /** Remote branches deleted */
  remotesDeleted: string[];
  /** Remote branches that failed to delete */
  remotesFailed: Array<{ branch: string; error: string }>;
}

/**
 * Event emitted when a session ID is corrupted and cleared
 */
export interface SessionCorruptedEvent {
  type: "session:corrupted";
  taskId: string;
  wasResuming: boolean;
  reason: string;
}

/**
 * Event emitted when a question is created by an agent
 */
export interface QuestionCreatedEvent {
  type: "question:created";
  questionId: string;
  agentName: string;
  question: string;
  questionType: "yes_no" | "open" | "choice";
}

/**
 * Event emitted when a question is answered
 */
export interface QuestionAnsweredEvent {
  type: "question:answered";
  questionId: string;
  answer: string;
}

/**
 * Generic error event
 */
export interface ErrorEvent {
  type: "error";
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Generic log event for debugging
 */
export interface LogEvent {
  type: "log";
  level: "debug" | "info" | "warn" | "error";
  message: string;
  args?: unknown[];
}

/**
 * Event emitted when agent output is received (streaming)
 */
export interface AgentOutputEvent {
  type: "agent:output";
  agentName: string;
  data: string;
}

/**
 * Event emitted when the agent subprocess starts
 */
export interface AgentProcessStartedEvent {
  type: "agent:process_started";
  agentName: string;
  pid: number;
  command: string;
}

/**
 * Event emitted when the agent subprocess ends
 */
export interface AgentProcessEndedEvent {
  type: "agent:process_ended";
  agentName: string;
  pid: number;
  exitCode: number | null;
}

/**
 * Union type of all orchestrator events
 */
export type OrchestratorEvent =
  | AgentStartedEvent
  | AgentIdleEvent
  | AgentOutputEvent
  | AgentProcessStartedEvent
  | AgentProcessEndedEvent
  | TaskFoundEvent
  | TaskStartedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | TaskBlockedEvent
  | StepStartedEvent
  | StepCompletedEvent
  | StepFailedEvent
  | AllStepsCompletedEvent
  | GitPullingEvent
  | GitPulledEvent
  | WorktreeCreatingEvent
  | WorktreeCreatedEvent
  | UncommittedChangesEvent
  | CommitRetryEvent
  | GitPushingEvent
  | GitPushedEvent
  | GitPRCreatingEvent
  | GitPRCreatedEvent
  | MergeLockWaitingEvent
  | MergeLockAcquiredEvent
  | MergeLockTimeoutEvent
  | MergeRetryEvent
  | GitMergingEvent
  | GitMergedEvent
  | GitMergeConflictEvent
  | MergeConflictResolvingEvent
  | MergeConflictResolvedEvent
  | GitCleanupEvent
  | SessionCorruptedEvent
  | QuestionCreatedEvent
  | QuestionAnsweredEvent
  | ErrorEvent
  | LogEvent;

/**
 * Event handler callback type
 */
export type EventHandler = (event: OrchestratorEvent) => void;
