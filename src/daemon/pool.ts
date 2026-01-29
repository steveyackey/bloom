// =============================================================================
// Agent Pool - Concurrency Manager
// =============================================================================
// Manages a fixed pool of agent slots. Each slot can run one agent process.

import { createAgent } from "../agents";
import { getDefaultAgentName, loadUserConfig } from "../infra/config";
import { createLogger } from "../infra/logger";
import { countActiveForWorkspace, markActive, markDone, markFailed, type QueueEntry } from "./queue";
import type { DaemonState } from "./state";

const logger = createLogger("daemon-pool");

// =============================================================================
// Types
// =============================================================================

export interface PoolConfig {
  maxAgents: number;
  maxPerWorkspace: number;
}

export interface AgentSlot {
  id: number;
  status: "idle" | "busy";
  currentEntry?: QueueEntry;
  provider?: string;
  pid?: number;
  startedAt?: string;
}

export interface AgentPool {
  config: PoolConfig;
  slots: AgentSlot[];
}

// =============================================================================
// Pool Lifecycle
// =============================================================================

const DEFAULT_MAX_AGENTS = 3;
const DEFAULT_MAX_PER_WORKSPACE = 2;

export function createPool(config?: Partial<PoolConfig>): AgentPool {
  const maxAgents = config?.maxAgents ?? DEFAULT_MAX_AGENTS;
  const maxPerWorkspace = config?.maxPerWorkspace ?? DEFAULT_MAX_PER_WORKSPACE;

  const slots: AgentSlot[] = [];
  for (let i = 0; i < maxAgents; i++) {
    slots.push({ id: i, status: "idle" });
  }

  return {
    config: { maxAgents, maxPerWorkspace },
    slots,
  };
}

/**
 * Try to acquire a slot for an entry. Returns null if no slot available
 * or workspace concurrency limit reached.
 */
export function acquireSlot(pool: AgentPool, state: DaemonState, entry: QueueEntry): AgentSlot | null {
  // Check per-workspace limit
  if (entry.workspace) {
    const activeCount = countActiveForWorkspace(state, entry.workspace);
    if (activeCount >= pool.config.maxPerWorkspace) {
      logger.debug(`Workspace ${entry.workspace} at concurrency limit (${activeCount}/${pool.config.maxPerWorkspace})`);
      return null;
    }
  }

  // Find an idle slot
  const slot = pool.slots.find((s) => s.status === "idle");
  if (!slot) {
    logger.debug("No idle slots available");
    return null;
  }

  return slot;
}

/**
 * Mark a slot as busy with the given entry.
 */
export function occupySlot(slot: AgentSlot, entry: QueueEntry, provider: string): void {
  slot.status = "busy";
  slot.currentEntry = entry;
  slot.provider = provider;
  slot.startedAt = new Date().toISOString();
}

/**
 * Release a slot back to idle.
 */
export function releaseSlot(slot: AgentSlot): void {
  slot.status = "idle";
  slot.currentEntry = undefined;
  slot.provider = undefined;
  slot.pid = undefined;
  slot.startedAt = undefined;
}

/**
 * Get count of active (busy) slots.
 */
export function activeSlotCount(pool: AgentPool): number {
  return pool.slots.filter((s) => s.status === "busy").length;
}

/**
 * Get info about all slots for status display.
 */
export function getSlotInfos(pool: AgentPool): Array<{
  id: number;
  status: "idle" | "busy";
  provider?: string;
  workspace?: string;
  taskId?: string;
  duration?: number;
}> {
  const now = Date.now();
  return pool.slots.map((slot) => ({
    id: slot.id,
    status: slot.status,
    provider: slot.provider,
    workspace: slot.currentEntry?.workspace,
    taskId: slot.currentEntry?.taskRef?.taskId ?? slot.currentEntry?.id,
    duration: slot.startedAt ? Math.round((now - new Date(slot.startedAt).getTime()) / 1000) : undefined,
  }));
}

// =============================================================================
// Agent Auto-Selection
// =============================================================================

/**
 * Select the best agent provider for a queue entry.
 *
 * Priority:
 * 1. Entry's explicit agent preference
 * 2. User config default (nonInteractive)
 * 3. Load-balanced selection (fewest active slots)
 */
export async function selectAgent(_pool: AgentPool, entry: QueueEntry): Promise<string> {
  // Explicit preference
  if (entry.agentPreference) {
    return entry.agentPreference;
  }

  // User config default
  const userConfig = await loadUserConfig();
  return getDefaultAgentName(userConfig, "nonInteractive");
}

// =============================================================================
// Task Execution
// =============================================================================

/**
 * Execute a queue entry on a slot. Runs the agent and updates state on completion.
 * This is the bridge between the daemon queue and the existing agent system.
 */
export async function executeEntry(
  pool: AgentPool,
  state: DaemonState,
  slot: AgentSlot,
  entry: QueueEntry,
  onEvent?: (event: Record<string, unknown>) => void
): Promise<void> {
  const provider = await selectAgent(pool, entry);
  occupySlot(slot, entry, provider);
  await markActive(state, entry.id, slot.id);

  logger.info(`Slot ${slot.id}: Starting ${provider} for entry ${entry.id} (${entry.source})`);

  try {
    const agent = await createAgent("nonInteractive", {
      agentName: provider,
      streamOutput: false,
    });

    // Build prompt based on source type
    let prompt: string;
    let systemPrompt = "";

    if (entry.source === "research") {
      systemPrompt = [
        "You are in research mode. Your job is to investigate and report findings.",
        "Do NOT make changes to any files. Do NOT create commits or branches.",
        `Working directory: ${entry.workingDir}`,
      ].join("\n");
      prompt = entry.inlineTask?.instruction ?? "No instruction provided";
    } else if (entry.source === "inbox") {
      prompt = entry.inlineTask?.instruction ?? "No instruction provided";
    } else {
      // Workspace task - the work loop handles prompt compilation
      // For daemon mode, we provide the task reference
      prompt = `Execute task ${entry.taskRef?.taskId} from ${entry.taskRef?.tasksFile}`;
    }

    const result = await agent.run({
      systemPrompt,
      prompt,
      startingDirectory: entry.workingDir,
      agentName: provider,
      taskId: entry.taskRef?.taskId,
      onOutput: (data) => {
        onEvent?.({
          type: "agent:output",
          entryId: entry.id,
          data,
        });
      },
      onProcessStart: (pid) => {
        slot.pid = pid;
        onEvent?.({
          type: "agent:process_started",
          entryId: entry.id,
          pid,
        });
      },
      onProcessEnd: (pid, exitCode) => {
        onEvent?.({
          type: "agent:process_ended",
          entryId: entry.id,
          pid,
          exitCode,
        });
      },
    });

    if (result.success) {
      await markDone(state, entry.id, result.output);
      logger.info(`Slot ${slot.id}: Entry ${entry.id} completed successfully`);
    } else {
      await markFailed(state, entry.id, result.error ?? "Agent failed");
      logger.warn(`Slot ${slot.id}: Entry ${entry.id} failed: ${result.error}`);
    }
  } catch (err) {
    await markFailed(state, entry.id, String(err));
    logger.error(`Slot ${slot.id}: Entry ${entry.id} threw: ${err}`);
  } finally {
    releaseSlot(slot);
  }
}
