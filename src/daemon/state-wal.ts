// =============================================================================
// Daemon State Write-Ahead Log (WAL)
// =============================================================================
// JSONL-based append-only state persistence for high-throughput queue operations.
// Each operation appends a single line to the log file instead of rewriting the
// entire state, providing O(1) writes instead of O(n).
//
// File format (state.jsonl):
//   {"op":"init","stats":{...},"timestamp":"..."}
//   {"op":"enqueue","entry":{...},"timestamp":"..."}
//   {"op":"update","id":"...","changes":{...},"timestamp":"..."}
//   {"op":"compact","version":2,"timestamp":"..."}
//
// On startup, the log is replayed to reconstruct in-memory state.
// Compaction rewrites the file with current state when it grows too large.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { QueueEntry } from "./queue";

// =============================================================================
// Types
// =============================================================================

interface WalOpInit {
  op: "init";
  stats: {
    totalEnqueued: number;
    totalCompleted: number;
    totalFailed: number;
    startedAt: string;
  };
  timestamp: string;
}

interface WalOpEnqueue {
  op: "enqueue";
  entry: QueueEntry;
  timestamp: string;
}

interface WalOpUpdate {
  op: "update";
  id: string;
  changes: Partial<QueueEntry> & { statsIncrement?: "completed" | "failed" };
  timestamp: string;
}

interface WalOpCompact {
  op: "compact";
  version: number;
  timestamp: string;
}

type WalOp = WalOpInit | WalOpEnqueue | WalOpUpdate | WalOpCompact;

export interface WalState {
  entries: Map<string, QueueEntry>;
  stats: {
    totalEnqueued: number;
    totalCompleted: number;
    totalFailed: number;
    startedAt: string;
    lastActivity?: string;
  };
  compactVersion: number;
  opCount: number;
}

// =============================================================================
// Configuration
// =============================================================================

const COMPACT_THRESHOLD = 10000; // Compact after this many operations
const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

// =============================================================================
// WAL Operations
// =============================================================================

export class StateWal {
  private walPath: string;
  private state: WalState;
  private writeBuffer: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushIntervalMs = 100; // Batch writes every 100ms

  constructor(daemonDir: string) {
    this.walPath = join(daemonDir, "state.jsonl");
    this.state = this.createEmptyState();
  }

  private createEmptyState(): WalState {
    return {
      entries: new Map(),
      stats: {
        totalEnqueued: 0,
        totalCompleted: 0,
        totalFailed: 0,
        startedAt: new Date().toISOString(),
      },
      compactVersion: 0,
      opCount: 0,
    };
  }

  /**
   * Load state by replaying the WAL file.
   * Migrates from old JSON format if present.
   */
  async load(daemonDir: string): Promise<void> {
    mkdirSync(daemonDir, { recursive: true });

    // Check for old JSON format and migrate
    const oldJsonPath = join(daemonDir, "state.json");
    if (existsSync(oldJsonPath) && !existsSync(this.walPath)) {
      await this.migrateFromJson(oldJsonPath);
      return;
    }

    if (!existsSync(this.walPath)) {
      // Initialize new WAL
      this.state = this.createEmptyState();
      this.appendOp({
        op: "init",
        stats: this.state.stats,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Replay WAL
    this.state = this.createEmptyState();
    const content = readFileSync(this.walPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const op = JSON.parse(line) as WalOp;
        this.applyOp(op);
      } catch {
        // Skip malformed lines
      }
    }

    // Reset active tasks to queued (daemon restarted)
    for (const entry of this.state.entries.values()) {
      if (entry.status === "active") {
        entry.status = "queued";
        entry.assignedSlot = undefined;
        entry.startedAt = undefined;
      }
    }

    // Compact if needed
    if (this.state.opCount > COMPACT_THRESHOLD) {
      await this.compact();
    }
  }

  /**
   * Migrate from old JSON state format to JSONL WAL.
   */
  private async migrateFromJson(jsonPath: string): Promise<void> {
    try {
      const content = readFileSync(jsonPath, "utf-8");
      const oldState = JSON.parse(content) as {
        version: number;
        queue: QueueEntry[];
        stats: WalState["stats"];
      };

      this.state = this.createEmptyState();
      this.state.stats = oldState.stats;

      // Write init op
      this.appendOp({
        op: "init",
        stats: this.state.stats,
        timestamp: new Date().toISOString(),
      });

      // Write all entries
      for (const entry of oldState.queue) {
        this.state.entries.set(entry.id, entry);
        this.appendOp({
          op: "enqueue",
          entry,
          timestamp: new Date().toISOString(),
        });
      }

      // Flush and compact to start fresh
      this.flushSync();
      await this.compact();

      // Remove old JSON file after successful migration
      const { unlinkSync } = await import("node:fs");
      unlinkSync(jsonPath);
    } catch {
      // If migration fails, start fresh
      this.state = this.createEmptyState();
      this.appendOp({
        op: "init",
        stats: this.state.stats,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Apply a WAL operation to in-memory state.
   */
  private applyOp(op: WalOp): void {
    this.state.opCount++;

    switch (op.op) {
      case "init":
        this.state.stats = { ...op.stats };
        break;

      case "enqueue":
        this.state.entries.set(op.entry.id, op.entry);
        break;

      case "update": {
        const entry = this.state.entries.get(op.id);
        if (entry) {
          Object.assign(entry, op.changes);
          if (op.changes.statsIncrement === "completed") {
            this.state.stats.totalCompleted++;
          } else if (op.changes.statsIncrement === "failed") {
            this.state.stats.totalFailed++;
          }
        }
        break;
      }

      case "compact":
        this.state.compactVersion = op.version;
        this.state.opCount = 0;
        break;
    }

    this.state.stats.lastActivity = op.timestamp;
  }

  /**
   * Append an operation to the WAL (buffered).
   */
  private appendOp(op: WalOp): void {
    this.writeBuffer.push(JSON.stringify(op));
    this.scheduleFlush();
  }

  /**
   * Schedule a batched flush.
   */
  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushSync();
      this.flushTimer = null;
    }, this.flushIntervalMs);
  }

  /**
   * Flush write buffer to disk synchronously.
   */
  flushSync(): void {
    if (this.writeBuffer.length === 0) return;
    const data = `${this.writeBuffer.join("\n")}\n`;
    this.writeBuffer = [];
    appendFileSync(this.walPath, data);
  }

  /**
   * Compact the WAL file by rewriting with current state.
   * Removes completed entries older than retention period.
   */
  async compact(): Promise<void> {
    const now = Date.now();
    const tmpPath = `${this.walPath}.tmp`;
    const lines: string[] = [];

    // Write init
    lines.push(
      JSON.stringify({
        op: "init",
        stats: this.state.stats,
        timestamp: new Date().toISOString(),
      })
    );

    // Write current entries (filter old completed)
    for (const entry of this.state.entries.values()) {
      // Keep queued/active entries
      if (entry.status === "queued" || entry.status === "active") {
        lines.push(JSON.stringify({ op: "enqueue", entry, timestamp: new Date().toISOString() }));
        continue;
      }

      // Keep recent completed/failed/cancelled
      const completedAt = entry.completedAt ? new Date(entry.completedAt).getTime() : 0;
      if (now - completedAt < HISTORY_RETENTION_MS) {
        lines.push(JSON.stringify({ op: "enqueue", entry, timestamp: new Date().toISOString() }));
      } else {
        // Remove from in-memory state
        this.state.entries.delete(entry.id);
      }
    }

    // Write compact marker
    this.state.compactVersion++;
    lines.push(
      JSON.stringify({
        op: "compact",
        version: this.state.compactVersion,
        timestamp: new Date().toISOString(),
      })
    );

    // Atomic write
    writeFileSync(tmpPath, `${lines.join("\n")}\n`);
    renameSync(tmpPath, this.walPath);

    this.state.opCount = lines.length;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Add a new entry to the queue.
   */
  enqueue(entry: QueueEntry): void {
    this.state.entries.set(entry.id, entry);
    this.state.stats.totalEnqueued++;
    this.applyOp({
      op: "enqueue",
      entry,
      timestamp: new Date().toISOString(),
    });
    this.appendOp({
      op: "enqueue",
      entry,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Update an entry's status/fields.
   */
  update(id: string, changes: Partial<QueueEntry>, statsIncrement?: "completed" | "failed"): void {
    const entry = this.state.entries.get(id);
    if (!entry) return;

    Object.assign(entry, changes);
    if (statsIncrement === "completed") {
      this.state.stats.totalCompleted++;
    } else if (statsIncrement === "failed") {
      this.state.stats.totalFailed++;
    }

    this.appendOp({
      op: "update",
      id,
      changes: { ...changes, statsIncrement },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get an entry by ID.
   */
  get(id: string): QueueEntry | undefined {
    return this.state.entries.get(id);
  }

  /**
   * Get all entries as array.
   */
  getAll(): QueueEntry[] {
    return Array.from(this.state.entries.values());
  }

  /**
   * Get current stats.
   */
  getStats(): WalState["stats"] {
    return { ...this.state.stats };
  }

  /**
   * Check if compaction is needed.
   */
  needsCompaction(): boolean {
    return this.state.opCount > COMPACT_THRESHOLD;
  }

  /**
   * Ensure all writes are flushed to disk.
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushSync();
  }

  /**
   * Close the WAL (flush and cleanup).
   */
  async close(): Promise<void> {
    await this.flush();
  }
}
