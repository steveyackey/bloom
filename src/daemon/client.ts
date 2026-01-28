// =============================================================================
// Daemon IPC Client
// =============================================================================
// Used by CLI commands to communicate with the running daemon.

import { connect, type Socket } from "node:net";
import {
  createRequest,
  type DaemonMethod,
  decode,
  encode,
  type JsonRpcNotification,
  type JsonRpcResponse,
} from "./protocol";
import { getSocketPath, isDaemonRunning } from "./state";

// =============================================================================
// Client
// =============================================================================

const REQUEST_TIMEOUT_MS = 10_000;

export class DaemonClient {
  private socket: Socket | null = null;
  private buffer = "";
  private pendingRequests = new Map<
    string,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private eventHandler?: (event: Record<string, unknown>) => void;

  /**
   * Connect to the daemon socket.
   */
  async connect(): Promise<void> {
    const socketPath = getSocketPath();

    return new Promise((resolve, reject) => {
      this.socket = connect(socketPath, () => {
        resolve();
      });

      this.socket.on("data", (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.socket.on("error", (err) => {
        reject(new Error(`Failed to connect to daemon: ${err.message}`));
      });

      this.socket.on("close", () => {
        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(new Error("Connection closed"));
          this.pendingRequests.delete(id);
        }
        this.socket = null;
      });
    });
  }

  /**
   * Disconnect from the daemon.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }

  /**
   * Set a handler for daemon event notifications.
   */
  onEvent(handler: (event: Record<string, unknown>) => void): void {
    this.eventHandler = handler;
  }

  /**
   * Send an RPC request and wait for the response.
   */
  async request(method: DaemonMethod, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.socket) {
      throw new Error("Not connected to daemon");
    }

    const req = createRequest(method, params);
    const encoded = encode(req);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(req.id);
        reject(new Error(`Request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(req.id, { resolve, reject, timer });
      this.socket!.write(encoded);
    });
  }

  // =========================================================================
  // Convenience Methods
  // =========================================================================

  async ping(): Promise<boolean> {
    try {
      const result = (await this.request("ping")) as { pong: boolean };
      return result.pong === true;
    } catch {
      return false;
    }
  }

  async status(): Promise<unknown> {
    return this.request("status");
  }

  async enqueue(params: {
    workspace: string;
    tasksFile: string;
    taskIds?: string[];
    agentOverride?: string;
  }): Promise<unknown> {
    return this.request("enqueue", params as unknown as Record<string, unknown>);
  }

  async inbox(params: {
    instruction: string;
    repo?: string;
    workspace?: string;
    workingDir: string;
    priority?: string;
    agent?: string;
  }): Promise<unknown> {
    return this.request("enqueue.inbox", params as unknown as Record<string, unknown>);
  }

  async research(params: {
    instruction: string;
    workingDir: string;
    repo?: string;
    output?: string;
    agent?: string;
  }): Promise<unknown> {
    return this.request("enqueue.research", params as unknown as Record<string, unknown>);
  }

  async shutdown(params?: { force?: boolean; timeout?: number }): Promise<unknown> {
    return this.request("shutdown", (params ?? {}) as Record<string, unknown>);
  }

  async subscribe(params?: { workspace?: string; taskId?: string; entryId?: string }): Promise<unknown> {
    return this.request("subscribe", (params ?? {}) as Record<string, unknown>);
  }

  // =========================================================================
  // Internal
  // =========================================================================

  private processBuffer(): void {
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (!line.trim()) continue;

      try {
        const message = decode(line);

        if ("id" in message) {
          // Response to a request
          const response = message as JsonRpcResponse;
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(response.id);

            if (response.error) {
              pending.reject(new Error(`${response.error.message} (code: ${response.error.code})`));
            } else {
              pending.resolve(response.result);
            }
          }
        } else if ("method" in message && (message as JsonRpcNotification).method === "event") {
          // Event notification
          const notification = message as JsonRpcNotification;
          if (this.eventHandler) {
            this.eventHandler(notification.params);
          }
        }
      } catch {
        // Ignore malformed messages
      }

      newlineIndex = this.buffer.indexOf("\n");
    }
  }
}

// =============================================================================
// Helper: Get a connected client (or null if daemon not running)
// =============================================================================

/**
 * Try to connect to the daemon. Returns null if daemon is not running.
 */
export async function connectToDaemon(): Promise<DaemonClient | null> {
  const running = await isDaemonRunning();
  if (!running) return null;

  const client = new DaemonClient();
  try {
    await client.connect();
    // Verify connection with ping
    const pong = await client.ping();
    if (!pong) {
      client.disconnect();
      return null;
    }
    return client;
  } catch {
    return null;
  }
}
