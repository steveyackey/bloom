// =============================================================================
// Daemon Server
// =============================================================================
// The main daemon process. Listens on a Unix domain socket (or Windows named pipe) for IPC.

import { createServer, type Server, type Socket } from "node:net";
import { createLogger } from "../infra/logger";
import { registerShutdownHandlers } from "./platform";
import { type AgentPool, activeSlotCount, createPool, getSlotInfos } from "./pool";
import {
  createErrorResponse,
  createNotification,
  createResponse,
  type DaemonMethod,
  decode,
  type EnqueueParams,
  encode,
  type InboxParams,
  type JsonRpcRequest,
  type ResearchParams,
  RPC_ERRORS,
  type ShutdownParams,
  type StatusResult,
} from "./protocol";
import { countByStatus, dequeue, enqueue, getEntries, PRIORITY, parsePriority, type QueueEntry } from "./queue";
import { type SchedulerHandle, startScheduler } from "./scheduler";
import {
  type DaemonState,
  ensureDaemonDir,
  getSocketPath,
  loadState,
  removePid,
  removeSocket,
  writePid,
} from "./state";

const logger = createLogger("daemon-server");

// =============================================================================
// Server State
// =============================================================================

let server: Server | null = null;
let state: DaemonState;
let pool: AgentPool;
let scheduler: SchedulerHandle | null = null;
const subscribers = new Map<Socket, { workspace?: string; taskId?: string; entryId?: string }>();
const startTime = Date.now();

// =============================================================================
// Event Broadcasting
// =============================================================================

function broadcastEvent(event: Record<string, unknown>): void {
  const notification = createNotification({
    type: event.type as string,
    workspace: event.workspace as string | undefined,
    taskId: event.taskId as string | undefined,
    entryId: event.entryId as string | undefined,
    data: event,
    timestamp: new Date().toISOString(),
  });

  const encoded = encode(notification);

  for (const [socket, filter] of subscribers) {
    // Filter events based on subscription
    if (filter.workspace && event.workspace !== filter.workspace) continue;
    if (filter.taskId && event.taskId !== filter.taskId) continue;
    if (filter.entryId && event.entryId !== filter.entryId) continue;

    try {
      socket.write(encoded);
    } catch {
      // Client disconnected, clean up
      subscribers.delete(socket);
    }
  }
}

// =============================================================================
// Request Handlers
// =============================================================================

async function handleRequest(request: JsonRpcRequest, socket: Socket): Promise<void> {
  const method = request.method as DaemonMethod;

  try {
    switch (method) {
      case "ping": {
        socket.write(encode(createResponse(request.id, { pong: true })));
        break;
      }

      case "status": {
        const counts = countByStatus(state);
        const result: StatusResult = {
          running: true,
          pid: process.pid,
          uptime: Math.round((Date.now() - startTime) / 1000),
          agents: {
            max: pool.config.maxAgents,
            maxPerWorkspace: pool.config.maxPerWorkspace,
            active: activeSlotCount(pool),
            slots: getSlotInfos(pool),
          },
          queue: {
            pending: counts.queued,
            active: counts.active,
            completedToday: state.stats.totalCompleted,
            entries: getEntries(state).map((e) => ({
              id: e.id,
              source: e.source,
              workspace: e.workspace,
              taskId: e.taskRef?.taskId,
              instruction: e.inlineTask?.instruction,
              priority: e.priority,
              status: e.status,
              enqueuedAt: e.enqueuedAt,
              startedAt: e.startedAt,
            })),
          },
        };
        socket.write(encode(createResponse(request.id, result)));
        break;
      }

      case "enqueue": {
        const params = request.params as unknown as EnqueueParams;
        const entryIds: string[] = [];

        // For workspace tasks, create one entry per task ID
        const taskIds = params.taskIds ?? ["__all__"];
        for (const taskId of taskIds) {
          const entry: Omit<QueueEntry, "id" | "enqueuedAt" | "status"> = {
            source: "workspace",
            workspace: params.workspace,
            workingDir: params.workspace,
            taskRef: {
              tasksFile: params.tasksFile,
              taskId,
            },
            priority: PRIORITY.NORMAL,
            agentPreference: params.agentOverride,
          };
          const id = await enqueue(state, entry);
          entryIds.push(id);
        }

        socket.write(encode(createResponse(request.id, { submitted: entryIds.length, entryIds })));
        break;
      }

      case "enqueue.inbox": {
        const params = request.params as unknown as InboxParams;
        const entry: Omit<QueueEntry, "id" | "enqueuedAt" | "status"> = {
          source: "inbox",
          workspace: params.workspace,
          workingDir: params.workingDir,
          inlineTask: {
            instruction: params.instruction,
            type: "inbox",
          },
          priority: parsePriority(params.priority),
          agentPreference: params.agent,
        };
        const id = await enqueue(state, entry);
        socket.write(encode(createResponse(request.id, { entryId: id, status: "queued" })));
        break;
      }

      case "enqueue.research": {
        const params = request.params as unknown as ResearchParams;
        const entry: Omit<QueueEntry, "id" | "enqueuedAt" | "status"> = {
          source: "research",
          workspace: undefined,
          workingDir: params.workingDir,
          inlineTask: {
            instruction: params.instruction,
            type: "research",
            output: params.output,
          },
          priority: PRIORITY.NORMAL,
          agentPreference: params.agent,
        };
        const id = await enqueue(state, entry);
        socket.write(encode(createResponse(request.id, { entryId: id, status: "queued" })));
        break;
      }

      case "dequeue": {
        const params = request.params as { entryId: string };
        const success = await dequeue(state, params.entryId);
        socket.write(encode(createResponse(request.id, { success })));
        break;
      }

      case "subscribe": {
        const params = request.params as { workspace?: string; taskId?: string; entryId?: string };
        subscribers.set(socket, params);
        socket.write(encode(createResponse(request.id, { subscribed: true })));
        break;
      }

      case "unsubscribe": {
        subscribers.delete(socket);
        socket.write(encode(createResponse(request.id, { unsubscribed: true })));
        break;
      }

      case "shutdown": {
        const params = (request.params ?? {}) as ShutdownParams;
        socket.write(encode(createResponse(request.id, { shutting_down: true })));

        // Initiate shutdown
        await shutdown(params.force ?? false, params.timeout ?? 300);
        break;
      }

      default:
        socket.write(encode(createErrorResponse(request.id, RPC_ERRORS.METHOD_NOT_FOUND, `Unknown method: ${method}`)));
    }
  } catch (err) {
    socket.write(encode(createErrorResponse(request.id, RPC_ERRORS.INTERNAL_ERROR, String(err))));
  }
}

// =============================================================================
// Connection Handler
// =============================================================================

function handleConnection(socket: Socket): void {
  let buffer = "";

  socket.on("data", (data) => {
    buffer += data.toString();

    // Process complete messages (newline-delimited)
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      if (line.trim()) {
        try {
          const message = decode(line);
          // Only handle requests (have an id)
          if ("id" in message && "method" in message) {
            handleRequest(message as JsonRpcRequest, socket);
          }
        } catch {
          logger.warn("Failed to parse message from client");
        }
      }

      newlineIndex = buffer.indexOf("\n");
    }
  });

  socket.on("close", () => {
    subscribers.delete(socket);
  });

  socket.on("error", () => {
    subscribers.delete(socket);
  });
}

// =============================================================================
// Daemon Lifecycle
// =============================================================================

export interface DaemonConfig {
  maxAgents?: number;
  maxPerWorkspace?: number;
  foreground?: boolean;
}

/**
 * Start the daemon server.
 */
export async function startDaemon(config: DaemonConfig = {}): Promise<void> {
  ensureDaemonDir();

  // Load persisted state
  state = await loadState();
  logger.info(`Loaded state: ${state.queue.length} entries in queue`);

  // Create agent pool
  pool = createPool({
    maxAgents: config.maxAgents,
    maxPerWorkspace: config.maxPerWorkspace,
  });
  logger.info(`Agent pool: ${pool.config.maxAgents} max agents, ${pool.config.maxPerWorkspace} max per workspace`);

  // Clean up stale socket
  removeSocket();

  // Start Unix socket server
  const socketPath = getSocketPath();

  return new Promise((resolve, reject) => {
    server = createServer(handleConnection);

    server.on("error", (err) => {
      logger.error(`Server error: ${err}`);
      reject(err);
    });

    server.listen(socketPath, () => {
      logger.info(`Daemon listening on ${socketPath}`);

      // Write PID file
      writePid(process.pid);

      // Start scheduler
      scheduler = startScheduler(pool, state, broadcastEvent);

      // Handle signals (cross-platform: SIGTERM+SIGINT on Unix, SIGINT+SIGHUP on Windows)
      registerShutdownHandlers(
        () => shutdown(false, 300),
        () => shutdown(false, 30)
      );

      resolve();
    });
  });
}

/**
 * Gracefully shut down the daemon.
 */
async function shutdown(force: boolean, timeoutSec: number): Promise<void> {
  logger.info(`Shutting down (force: ${force}, timeout: ${timeoutSec}s)`);

  // Stop scheduler (no new tasks dispatched)
  if (scheduler) {
    scheduler.stop();
    scheduler = null;
  }

  if (!force) {
    // Wait for active tasks to complete
    const deadline = Date.now() + timeoutSec * 1000;
    while (activeSlotCount(pool) > 0 && Date.now() < deadline) {
      logger.info(`Waiting for ${activeSlotCount(pool)} active agent(s)...`);
      await Bun.sleep(2000);
    }

    if (activeSlotCount(pool) > 0) {
      logger.warn(`Timed out waiting for agents. ${activeSlotCount(pool)} still active.`);
    }
  }

  // Close server
  if (server) {
    server.close();
    server = null;
  }

  // Clean up
  removeSocket();
  removePid();

  logger.info("Daemon stopped");
  process.exit(0);
}
