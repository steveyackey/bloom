// =============================================================================
// TUI Types
// =============================================================================

import type { QuestionType } from "../../human-queue";
import type { ProcessStats } from "../../infra/terminal";

/**
 * Type of pane in the TUI.
 */
export type PaneType = "agent" | "dashboard" | "questions";

/**
 * Represents a pane in the TUI.
 */
export interface AgentPane {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Type of pane */
  paneType: PaneType;
  /** Current status */
  status: "idle" | "running" | "completed" | "failed" | "blocked";
  /** Scrollable output log (array of lines) */
  outputLines: string[];
  /** Current scroll offset (0 = most recent, positive = scroll up) */
  scrollOffset: number;
  /** Current task being worked on */
  currentTaskId?: string;
  /** Current task title */
  currentTaskTitle?: string;
  /** Current agent subprocess PID (for stats) */
  currentPid?: number;
  /** Latest process stats */
  stats?: ProcessStats;
  /** When the current task started */
  taskStartTime?: number;
}

/**
 * View mode for the TUI.
 */
export type ViewMode = "tiled" | "single";

/**
 * Configuration for running the TUI.
 */
export interface TUIConfig {
  /** Agent names to display */
  agents: string[];
  /** Path to tasks file */
  tasksFile: string;
  /** Bloom workspace directory */
  bloomDir: string;
  /** Repos directory */
  reposDir: string;
  /** Poll interval in milliseconds */
  pollIntervalMs: number;
  /** Optional agent provider override */
  agentProviderOverride?: string;
}

/**
 * Represents a pending question for display in the TUI.
 */
export interface QuestionDisplay {
  id: string;
  agentName: string;
  question: string;
  questionType: QuestionType;
  options?: string[];
  createdAt: Date;
}

/**
 * Summary of task statuses for dashboard display.
 */
export interface TasksSummary {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  pending: number;
}
