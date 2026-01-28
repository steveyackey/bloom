// =============================================================================
// Daemon Scheduler
// =============================================================================
// Continuously dequeues tasks and assigns them to available agent slots.

import { createLogger } from "../infra/logger";
import { type AgentPool, acquireSlot, executeEntry } from "./pool";
import { peekNext } from "./queue";
import type { DaemonState } from "./state";

const logger = createLogger("daemon-scheduler");

// =============================================================================
// Scheduler
// =============================================================================

const POLL_INTERVAL_MS = 3_000;

export interface SchedulerHandle {
  stop: () => void;
  running: boolean;
}

/**
 * Start the scheduler loop. Polls the queue and dispatches to available slots.
 * Returns a handle to stop the scheduler.
 */
export function startScheduler(
  pool: AgentPool,
  state: DaemonState,
  onEvent?: (event: Record<string, unknown>) => void
): SchedulerHandle {
  let running = true;
  const activeTasks: Set<string> = new Set();

  const handle: SchedulerHandle = {
    get running() {
      return running;
    },
    stop() {
      running = false;
    },
  };

  // Run the dispatch loop
  (async () => {
    logger.info("Scheduler started");

    while (running) {
      try {
        const next = peekNext(state);

        if (next && !activeTasks.has(next.id)) {
          const slot = acquireSlot(pool, state, next);

          if (slot) {
            activeTasks.add(next.id);
            logger.debug(`Dispatching entry ${next.id} to slot ${slot.id}`);

            // Run in background (don't await - let scheduler continue)
            executeEntry(pool, state, slot, next, onEvent)
              .catch((err) => {
                logger.error(`Error executing entry ${next.id}: ${err}`);
              })
              .finally(() => {
                activeTasks.delete(next.id);
              });
          }
        }
      } catch (err) {
        logger.error(`Scheduler error: ${err}`);
      }

      await Bun.sleep(POLL_INTERVAL_MS);
    }

    logger.info("Scheduler stopped");
  })();

  return handle;
}
