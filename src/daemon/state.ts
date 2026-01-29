// =============================================================================
// Daemon State Persistence
// =============================================================================
// Persists queue state using JSONL Write-Ahead Log for high-throughput operations.
// Provides O(1) appends instead of O(n) full-file rewrites.

import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getBloomHome } from "../infra/config";
import { getIpcPath, ipcPathNeedsCleanup, isProcessRunning } from "./platform";
import type { QueueEntry } from "./queue";
import { StateWal } from "./state-wal";

// =============================================================================
// Paths
// =============================================================================

export function getDaemonDir(): string {
  return join(getBloomHome(), "daemon");
}

export function getStatePath(): string {
  return join(getDaemonDir(), "state.jsonl");
}

export function getPidPath(): string {
  return join(getDaemonDir(), "daemon.pid");
}

export function getSocketPath(): string {
  return getIpcPath(getDaemonDir());
}

export function getLogPath(): string {
  return join(getDaemonDir(), "daemon.log");
}

// =============================================================================
// State Schema (for compatibility)
// =============================================================================

export interface DaemonState {
  version: 1;
  queue: QueueEntry[];
  stats: {
    totalEnqueued: number;
    totalCompleted: number;
    totalFailed: number;
    startedAt: string;
    lastActivity?: string;
  };
  /** Internal: WAL instance for persistence */
  _wal?: StateWal;
}

// Note: createEmptyState was removed - WAL handles state initialization now

// =============================================================================
// State I/O
// =============================================================================

export function ensureDaemonDir(): void {
  const dir = getDaemonDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load persisted state from WAL. Returns empty state if no WAL exists.
 * On load, active tasks are reset to queued (agent died with daemon).
 */
export async function loadState(): Promise<DaemonState> {
  const daemonDir = getDaemonDir();
  ensureDaemonDir();

  const wal = new StateWal(daemonDir);
  await wal.load(daemonDir);

  // Create state object with WAL reference
  const stats = wal.getStats();
  const state: DaemonState = {
    version: 1,
    queue: wal.getAll(),
    stats,
    _wal: wal,
  };

  return state;
}

/**
 * Persist state changes. With WAL, this is a no-op as changes are
 * written incrementally via walEnqueue/walUpdate.
 * Kept for backward compatibility during transition.
 * @deprecated Use walEnqueue/walUpdate instead
 */
export async function saveState(_state: DaemonState): Promise<void> {
  // No-op: WAL handles persistence incrementally
  // This function is kept for backward compatibility with existing code
  // that may call saveState() directly.

  // If WAL exists, just ensure it's flushed
  if (_state._wal) {
    await _state._wal.flush();
  }
}

/**
 * Add an entry to the WAL (O(1) append).
 */
export function walEnqueue(state: DaemonState, entry: QueueEntry): void {
  if (state._wal) {
    state._wal.enqueue(entry);
  }
  // Also update in-memory queue
  state.queue.push(entry);
  state.stats.totalEnqueued++;
}

/**
 * Update an entry in the WAL (O(1) append).
 */
export function walUpdate(
  state: DaemonState,
  id: string,
  changes: Partial<QueueEntry>,
  statsIncrement?: "completed" | "failed"
): void {
  if (state._wal) {
    state._wal.update(id, changes, statsIncrement);
  }

  // Also update in-memory
  const entry = state.queue.find((e) => e.id === id);
  if (entry) {
    Object.assign(entry, changes);
    if (statsIncrement === "completed") {
      state.stats.totalCompleted++;
    } else if (statsIncrement === "failed") {
      state.stats.totalFailed++;
    }
  }
}

/**
 * Flush WAL to disk (ensure all writes are persisted).
 */
export async function flushState(state: DaemonState): Promise<void> {
  if (state._wal) {
    await state._wal.flush();
  }
}

/**
 * Compact WAL if needed (remove old completed entries).
 */
export async function compactState(state: DaemonState): Promise<void> {
  if (state._wal?.needsCompaction()) {
    await state._wal.compact();
    // Update in-memory queue after compaction
    state.queue = state._wal.getAll();
  }
}

/**
 * Close the WAL (flush and cleanup).
 */
export async function closeState(state: DaemonState): Promise<void> {
  if (state._wal) {
    await state._wal.close();
  }
}

// =============================================================================
// PID File
// =============================================================================

/**
 * Write daemon PID file.
 */
export async function writePid(pid: number): Promise<void> {
  ensureDaemonDir();
  await Bun.write(getPidPath(), String(pid));
}

/**
 * Read daemon PID. Returns null if not running or PID file missing.
 * Uses platform-appropriate liveness check (signal 0 on Unix, tasklist on Windows).
 */
export async function readPid(): Promise<number | null> {
  const path = getPidPath();
  if (!existsSync(path)) return null;

  try {
    const content = await Bun.file(path).text();
    const pid = parseInt(content.trim(), 10);
    if (Number.isNaN(pid)) return null;

    // Cross-platform process liveness check
    if (isProcessRunning(pid)) {
      return pid;
    }

    // Process not running, clean up stale PID file
    removePid();
    return null;
  } catch {
    return null;
  }
}

/**
 * Remove PID file.
 */
export function removePid(): void {
  const path = getPidPath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

/**
 * Remove socket file (Unix only — Windows named pipes are auto-cleaned by the OS).
 */
export function removeSocket(): void {
  if (!ipcPathNeedsCleanup()) return;

  const path = getSocketPath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

/**
 * Check if daemon is running.
 */
export async function isDaemonRunning(): Promise<boolean> {
  const pid = await readPid();
  return pid !== null;
}
