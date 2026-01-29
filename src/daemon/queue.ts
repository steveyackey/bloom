// =============================================================================
// Daemon Task Queue
// =============================================================================
// Global priority queue for tasks across all workspaces.
// Uses JSONL Write-Ahead Log for O(1) persistence operations.

import type { DaemonState } from "./state";
import { walEnqueue, walUpdate } from "./state";

// =============================================================================
// Types
// =============================================================================

export type QueueEntrySource = "workspace" | "inbox" | "research";
export type QueueEntryStatus = "queued" | "active" | "done" | "failed" | "cancelled";

export interface QueueEntry {
  id: string;
  source: QueueEntrySource;

  // Workspace context
  workspace?: string;
  workingDir: string;

  // Task reference (for workspace tasks)
  taskRef?: {
    tasksFile: string;
    taskId: string;
  };

  // Inline task (for inbox/research)
  inlineTask?: {
    instruction: string;
    type: "inbox" | "research";
    output?: string;
  };

  // Scheduling
  priority: number;
  enqueuedAt: string;
  startedAt?: string;
  completedAt?: string;

  // Status
  status: QueueEntryStatus;
  assignedSlot?: number;
  agentPreference?: string;

  // Results
  result?: string;
  error?: string;
}

// =============================================================================
// Priority Constants
// =============================================================================

export const PRIORITY = {
  HIGH: 10,
  NORMAL: 50,
  LOW: 90,
} as const;

export function parsePriority(input?: string): number {
  switch (input) {
    case "high":
      return PRIORITY.HIGH;
    case "low":
      return PRIORITY.LOW;
    default:
      return PRIORITY.NORMAL;
  }
}

// =============================================================================
// Queue Operations
// =============================================================================

/**
 * Add an entry to the queue. Returns the entry ID.
 * Uses O(1) WAL append instead of full state rewrite.
 */
export async function enqueue(
  state: DaemonState,
  entry: Omit<QueueEntry, "id" | "enqueuedAt" | "status">
): Promise<string> {
  const id = crypto.randomUUID();
  const fullEntry: QueueEntry = {
    ...entry,
    id,
    enqueuedAt: new Date().toISOString(),
    status: "queued",
  };

  // O(1) WAL append
  walEnqueue(state, fullEntry);
  return id;
}

/**
 * Remove (cancel) a queued entry. Only cancels entries in "queued" status.
 * Returns true if cancelled.
 */
export async function dequeue(state: DaemonState, entryId: string): Promise<boolean> {
  const entry = state.queue.find((e) => e.id === entryId);
  if (!entry || entry.status !== "queued") return false;

  const changes = {
    status: "cancelled" as const,
    completedAt: new Date().toISOString(),
  };

  // O(1) WAL update
  walUpdate(state, entryId, changes);
  return true;
}

/**
 * Get the next entry to execute, respecting priority and FIFO ordering.
 * Applies starvation prevention (boost priority after 5 min wait).
 */
export function peekNext(state: DaemonState): QueueEntry | null {
  const now = Date.now();
  const STARVATION_THRESHOLD_MS = 5 * 60 * 1000;

  const queued = state.queue.filter((e) => e.status === "queued");
  if (queued.length === 0) return null;

  // Sort by effective priority (with starvation boost)
  queued.sort((a, b) => {
    const aWait = now - new Date(a.enqueuedAt).getTime();
    const bWait = now - new Date(b.enqueuedAt).getTime();

    // Boost priority by 10 for each 5-minute interval waited
    const aEffective = a.priority - Math.floor(aWait / STARVATION_THRESHOLD_MS) * 10;
    const bEffective = b.priority - Math.floor(bWait / STARVATION_THRESHOLD_MS) * 10;

    if (aEffective !== bEffective) return aEffective - bEffective;
    // FIFO within same priority
    return new Date(a.enqueuedAt).getTime() - new Date(b.enqueuedAt).getTime();
  });

  return queued[0] ?? null;
}

/**
 * Mark an entry as active (being worked on by an agent).
 */
export async function markActive(state: DaemonState, entryId: string, slotId: number): Promise<void> {
  const entry = state.queue.find((e) => e.id === entryId);
  if (!entry) return;

  const changes = {
    status: "active" as const,
    startedAt: new Date().toISOString(),
    assignedSlot: slotId,
  };

  // O(1) WAL update
  walUpdate(state, entryId, changes);
}

/**
 * Mark an entry as completed.
 */
export async function markDone(state: DaemonState, entryId: string, result?: string): Promise<void> {
  const entry = state.queue.find((e) => e.id === entryId);
  if (!entry) return;

  const changes = {
    status: "done" as const,
    completedAt: new Date().toISOString(),
    assignedSlot: undefined,
    result,
  };

  // O(1) WAL update with stats increment
  walUpdate(state, entryId, changes, "completed");
}

/**
 * Mark an entry as failed.
 */
export async function markFailed(state: DaemonState, entryId: string, error: string): Promise<void> {
  const entry = state.queue.find((e) => e.id === entryId);
  if (!entry) return;

  const changes = {
    status: "failed" as const,
    completedAt: new Date().toISOString(),
    assignedSlot: undefined,
    error,
  };

  // O(1) WAL update with stats increment
  walUpdate(state, entryId, changes, "failed");
}

/**
 * Get all entries matching a filter.
 */
export function getEntries(
  state: DaemonState,
  filter?: { status?: QueueEntryStatus; workspace?: string; source?: QueueEntrySource }
): QueueEntry[] {
  let entries = state.queue;

  if (filter?.status) {
    entries = entries.filter((e) => e.status === filter.status);
  }
  if (filter?.workspace) {
    entries = entries.filter((e) => e.workspace === filter.workspace);
  }
  if (filter?.source) {
    entries = entries.filter((e) => e.source === filter.source);
  }

  return entries;
}

/**
 * Count entries by status.
 */
export function countByStatus(state: DaemonState): Record<QueueEntryStatus, number> {
  const counts: Record<QueueEntryStatus, number> = {
    queued: 0,
    active: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const entry of state.queue) {
    counts[entry.status]++;
  }

  return counts;
}

/**
 * Count active entries for a specific workspace.
 */
export function countActiveForWorkspace(state: DaemonState, workspace: string): number {
  return state.queue.filter((e) => e.status === "active" && e.workspace === workspace).length;
}
