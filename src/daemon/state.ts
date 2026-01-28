// =============================================================================
// Daemon State Persistence
// =============================================================================
// Persists queue state to ~/.bloom/daemon/state.json so tasks survive restarts.

import { existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getBloomHome } from "../infra/config";
import { getIpcPath, ipcPathNeedsCleanup, isProcessRunning } from "./platform";
import type { QueueEntry } from "./queue";

// =============================================================================
// Paths
// =============================================================================

export function getDaemonDir(): string {
  return join(getBloomHome(), "daemon");
}

export function getStatePath(): string {
  return join(getDaemonDir(), "state.json");
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
// State Schema
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
}

function createEmptyState(): DaemonState {
  return {
    version: 1,
    queue: [],
    stats: {
      totalEnqueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      startedAt: new Date().toISOString(),
    },
  };
}

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
 * Load persisted state. Returns empty state if file doesn't exist.
 * On load, active tasks are reset to queued (agent died with daemon).
 */
export async function loadState(): Promise<DaemonState> {
  const path = getStatePath();
  if (!existsSync(path)) {
    return createEmptyState();
  }

  try {
    const content = await Bun.file(path).text();
    const state = JSON.parse(content) as DaemonState;

    // Reset active tasks to queued (daemon restarted, agents are gone)
    for (const entry of state.queue) {
      if (entry.status === "active") {
        entry.status = "queued";
        entry.assignedSlot = undefined;
        entry.startedAt = undefined;
      }
    }

    // Remove completed/failed/cancelled entries older than 24h
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    state.queue = state.queue.filter((entry) => {
      if (entry.status === "queued" || entry.status === "active") return true;
      const completedAt = entry.completedAt ? new Date(entry.completedAt).getTime() : 0;
      return completedAt > cutoff;
    });

    return state;
  } catch {
    return createEmptyState();
  }
}

/**
 * Persist state to disk. Uses atomic write (temp file + rename).
 */
export async function saveState(state: DaemonState): Promise<void> {
  ensureDaemonDir();
  const path = getStatePath();
  const tmpPath = `${path}.tmp`;

  state.stats.lastActivity = new Date().toISOString();
  await Bun.write(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, path);
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
