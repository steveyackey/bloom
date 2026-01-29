// =============================================================================
// Daemon Module Exports
// =============================================================================

export { connectToDaemon, DaemonClient } from "./client";
export type { AgentPool, AgentSlot, PoolConfig } from "./pool";
export type {
  AgentSlotInfo,
  DaemonEvent,
  DaemonMethod,
  QueueEntryInfo,
  StatusResult,
} from "./protocol";
export type { QueueEntry, QueueEntrySource, QueueEntryStatus } from "./queue";
export { type DaemonConfig, startDaemon } from "./server";
export { getDaemonDir, isDaemonRunning, readPid } from "./state";
