// =============================================================================
// Daemon Queue Tests
// =============================================================================

import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  countActiveForWorkspace,
  countByStatus,
  dequeue,
  enqueue,
  getEntries,
  markActive,
  markDone,
  markFailed,
  PRIORITY,
  parsePriority,
  peekNext,
} from "../../src/daemon/queue";
import type { DaemonState } from "../../src/daemon/state";

// Mock saveState to avoid file I/O
mock.module("../../src/daemon/state", () => ({
  saveState: async () => {},
}));

// =============================================================================
// Test Helpers
// =============================================================================

function createState(): DaemonState {
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
// Tests
// =============================================================================

describe("parsePriority", () => {
  test("parses 'high' as PRIORITY.HIGH", () => {
    expect(parsePriority("high")).toBe(PRIORITY.HIGH);
  });

  test("parses 'low' as PRIORITY.LOW", () => {
    expect(parsePriority("low")).toBe(PRIORITY.LOW);
  });

  test("parses 'normal' as PRIORITY.NORMAL", () => {
    expect(parsePriority("normal")).toBe(PRIORITY.NORMAL);
  });

  test("defaults to PRIORITY.NORMAL for undefined", () => {
    expect(parsePriority(undefined)).toBe(PRIORITY.NORMAL);
  });

  test("defaults to PRIORITY.NORMAL for unknown input", () => {
    expect(parsePriority("unknown")).toBe(PRIORITY.NORMAL);
  });
});

describe("enqueue", () => {
  test("adds entry to queue with generated ID", async () => {
    const state = createState();

    const id = await enqueue(state, {
      source: "inbox",
      workingDir: "/test",
      priority: PRIORITY.NORMAL,
    });

    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
    expect(state.queue.length).toBe(1);
    expect(state.queue[0]!.id).toBe(id);
    expect(state.queue[0]!.status).toBe("queued");
    expect(state.stats.totalEnqueued).toBe(1);
  });

  test("sets enqueuedAt timestamp", async () => {
    const state = createState();
    const before = new Date().toISOString();

    await enqueue(state, {
      source: "workspace",
      workingDir: "/test",
      priority: PRIORITY.HIGH,
    });

    const after = new Date().toISOString();
    const enqueuedAt = state.queue[0]!.enqueuedAt;

    expect(enqueuedAt >= before).toBe(true);
    expect(enqueuedAt <= after).toBe(true);
  });
});

describe("dequeue", () => {
  test("cancels queued entry", async () => {
    const state = createState();
    const id = await enqueue(state, {
      source: "inbox",
      workingDir: "/test",
      priority: PRIORITY.NORMAL,
    });

    const result = await dequeue(state, id);

    expect(result).toBe(true);
    expect(state.queue[0]!.status).toBe("cancelled");
    expect(state.queue[0]!.completedAt).toBeDefined();
  });

  test("returns false for non-existent entry", async () => {
    const state = createState();
    const result = await dequeue(state, "non-existent-id");
    expect(result).toBe(false);
  });

  test("returns false for non-queued entry", async () => {
    const state = createState();
    const id = await enqueue(state, {
      source: "inbox",
      workingDir: "/test",
      priority: PRIORITY.NORMAL,
    });

    // Mark as active first
    await markActive(state, id, 0);

    const result = await dequeue(state, id);
    expect(result).toBe(false);
    expect(state.queue[0]!.status).toBe("active");
  });
});

describe("peekNext", () => {
  test("returns null for empty queue", () => {
    const state = createState();
    expect(peekNext(state)).toBe(null);
  });

  test("returns highest priority entry", async () => {
    const state = createState();

    await enqueue(state, { source: "inbox", workingDir: "/low", priority: PRIORITY.LOW });
    await enqueue(state, { source: "inbox", workingDir: "/high", priority: PRIORITY.HIGH });
    await enqueue(state, { source: "inbox", workingDir: "/normal", priority: PRIORITY.NORMAL });

    const next = peekNext(state);
    expect(next).not.toBe(null);
    expect(next?.priority).toBe(PRIORITY.HIGH);
    expect(next?.workingDir).toBe("/high");
  });

  test("uses FIFO ordering within same priority", async () => {
    const state = createState();

    await enqueue(state, { source: "inbox", workingDir: "/first", priority: PRIORITY.NORMAL });
    await Bun.sleep(10); // Small delay to ensure different timestamps
    await enqueue(state, { source: "inbox", workingDir: "/second", priority: PRIORITY.NORMAL });

    const next = peekNext(state);
    expect(next?.workingDir).toBe("/first");
  });

  test("skips non-queued entries", async () => {
    const state = createState();

    const id = await enqueue(state, { source: "inbox", workingDir: "/active", priority: PRIORITY.HIGH });
    await enqueue(state, { source: "inbox", workingDir: "/queued", priority: PRIORITY.NORMAL });

    await markActive(state, id, 0);

    const next = peekNext(state);
    expect(next?.workingDir).toBe("/queued");
  });
});

describe("markActive", () => {
  test("updates entry status and sets slot", async () => {
    const state = createState();
    const id = await enqueue(state, {
      source: "inbox",
      workingDir: "/test",
      priority: PRIORITY.NORMAL,
    });

    await markActive(state, id, 2);

    expect(state.queue[0]!.status).toBe("active");
    expect(state.queue[0]!.assignedSlot).toBe(2);
    expect(state.queue[0]!.startedAt).toBeDefined();
  });
});

describe("markDone", () => {
  test("marks entry as done with result", async () => {
    const state = createState();
    const id = await enqueue(state, {
      source: "inbox",
      workingDir: "/test",
      priority: PRIORITY.NORMAL,
    });

    await markActive(state, id, 0);
    await markDone(state, id, "Task completed successfully");

    expect(state.queue[0]!.status).toBe("done");
    expect(state.queue[0]!.result).toBe("Task completed successfully");
    expect(state.queue[0]!.completedAt).toBeDefined();
    expect(state.queue[0]!.assignedSlot).toBeUndefined();
    expect(state.stats.totalCompleted).toBe(1);
  });
});

describe("markFailed", () => {
  test("marks entry as failed with error", async () => {
    const state = createState();
    const id = await enqueue(state, {
      source: "inbox",
      workingDir: "/test",
      priority: PRIORITY.NORMAL,
    });

    await markActive(state, id, 0);
    await markFailed(state, id, "Something went wrong");

    expect(state.queue[0]!.status).toBe("failed");
    expect(state.queue[0]!.error).toBe("Something went wrong");
    expect(state.queue[0]!.completedAt).toBeDefined();
    expect(state.queue[0]!.assignedSlot).toBeUndefined();
    expect(state.stats.totalFailed).toBe(1);
  });
});

describe("getEntries", () => {
  let state: DaemonState;

  beforeEach(async () => {
    state = createState();
    await enqueue(state, { source: "inbox", workingDir: "/inbox1", priority: PRIORITY.NORMAL, workspace: "/ws1" });
    await enqueue(state, { source: "workspace", workingDir: "/ws1", priority: PRIORITY.HIGH, workspace: "/ws1" });
    await enqueue(state, { source: "research", workingDir: "/ws2", priority: PRIORITY.LOW, workspace: "/ws2" });
  });

  test("returns all entries with no filter", () => {
    const entries = getEntries(state);
    expect(entries.length).toBe(3);
  });

  test("filters by status", async () => {
    await markActive(state, state.queue[0]!.id, 0);

    const queued = getEntries(state, { status: "queued" });
    expect(queued.length).toBe(2);

    const active = getEntries(state, { status: "active" });
    expect(active.length).toBe(1);
  });

  test("filters by workspace", () => {
    const ws1Entries = getEntries(state, { workspace: "/ws1" });
    expect(ws1Entries.length).toBe(2);

    const ws2Entries = getEntries(state, { workspace: "/ws2" });
    expect(ws2Entries.length).toBe(1);
  });

  test("filters by source", () => {
    const inboxEntries = getEntries(state, { source: "inbox" });
    expect(inboxEntries.length).toBe(1);

    const workspaceEntries = getEntries(state, { source: "workspace" });
    expect(workspaceEntries.length).toBe(1);
  });
});

describe("countByStatus", () => {
  test("counts entries by status", async () => {
    const state = createState();

    await enqueue(state, { source: "inbox", workingDir: "/1", priority: PRIORITY.NORMAL });
    await enqueue(state, { source: "inbox", workingDir: "/2", priority: PRIORITY.NORMAL });
    await enqueue(state, { source: "inbox", workingDir: "/3", priority: PRIORITY.NORMAL });

    await markActive(state, state.queue[0]!.id, 0);
    await markDone(state, state.queue[0]!.id);

    await markActive(state, state.queue[1]!.id, 1);
    await markFailed(state, state.queue[1]!.id, "error");

    const counts = countByStatus(state);

    expect(counts.done).toBe(1);
    expect(counts.failed).toBe(1);
    expect(counts.queued).toBe(1);
    expect(counts.active).toBe(0);
    expect(counts.cancelled).toBe(0);
  });
});

describe("countActiveForWorkspace", () => {
  test("counts active entries for specific workspace", async () => {
    const state = createState();

    await enqueue(state, { source: "inbox", workingDir: "/1", priority: PRIORITY.NORMAL, workspace: "/ws1" });
    await enqueue(state, { source: "inbox", workingDir: "/2", priority: PRIORITY.NORMAL, workspace: "/ws1" });
    await enqueue(state, { source: "inbox", workingDir: "/3", priority: PRIORITY.NORMAL, workspace: "/ws2" });

    await markActive(state, state.queue[0]!.id, 0);
    await markActive(state, state.queue[2]!.id, 1);

    expect(countActiveForWorkspace(state, "/ws1")).toBe(1);
    expect(countActiveForWorkspace(state, "/ws2")).toBe(1);
    expect(countActiveForWorkspace(state, "/ws3")).toBe(0);
  });
});
