// =============================================================================
// Daemon IPC Protocol - JSON-RPC 2.0 over Unix Domain Socket
// =============================================================================

// =============================================================================
// JSON-RPC 2.0 Base Types
// =============================================================================

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// =============================================================================
// Error Codes
// =============================================================================

export const RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom errors
  DAEMON_ALREADY_RUNNING: -32001,
  DAEMON_NOT_RUNNING: -32002,
  QUEUE_FULL: -32003,
  TASK_NOT_FOUND: -32004,
  WORKSPACE_NOT_FOUND: -32005,
  AGENT_UNAVAILABLE: -32006,
} as const;

// =============================================================================
// RPC Methods
// =============================================================================

export type DaemonMethod =
  | "ping"
  | "status"
  | "shutdown"
  | "enqueue"
  | "enqueue.inbox"
  | "enqueue.research"
  | "dequeue"
  | "subscribe"
  | "unsubscribe";

// =============================================================================
// Request Parameter Types
// =============================================================================

export interface EnqueueParams {
  workspace: string;
  tasksFile: string;
  taskIds?: string[];
  agentOverride?: string;
}

export interface InboxParams {
  instruction: string;
  repo?: string;
  workspace?: string;
  workingDir: string;
  priority?: "low" | "normal" | "high";
  agent?: string;
}

export interface ResearchParams {
  instruction: string;
  workingDir: string;
  repo?: string;
  output?: string;
  agent?: string;
}

export interface DequeueParams {
  entryId: string;
}

export interface SubscribeParams {
  workspace?: string;
  taskId?: string;
  entryId?: string;
}

export interface ShutdownParams {
  force?: boolean;
  timeout?: number;
}

// =============================================================================
// Response Types
// =============================================================================

export interface StatusResult {
  running: boolean;
  pid: number;
  uptime: number;
  agents: {
    max: number;
    maxPerWorkspace: number;
    active: number;
    slots: AgentSlotInfo[];
  };
  queue: {
    pending: number;
    active: number;
    completedToday: number;
    entries: QueueEntryInfo[];
  };
}

export interface AgentSlotInfo {
  id: number;
  status: "idle" | "busy";
  provider?: string;
  workspace?: string;
  taskId?: string;
  duration?: number;
}

export interface QueueEntryInfo {
  id: string;
  source: "workspace" | "inbox" | "research";
  workspace?: string;
  taskId?: string;
  instruction?: string;
  priority: number;
  status: "queued" | "active" | "done" | "failed" | "cancelled";
  enqueuedAt: string;
  startedAt?: string;
}

export interface EnqueueResult {
  submitted: number;
  entryIds: string[];
}

export interface InboxResult {
  entryId: string;
  status: "queued";
}

export interface ResearchResult {
  entryId: string;
  status: "queued";
}

// =============================================================================
// Event Notifications (daemon → client)
// =============================================================================

export interface DaemonEvent {
  type: string;
  workspace?: string;
  taskId?: string;
  entryId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// =============================================================================
// Helpers
// =============================================================================

export function createRequest(method: DaemonMethod, params: Record<string, unknown> = {}): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method,
    params,
  };
}

export function createResponse(id: string, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

export function createErrorResponse(id: string, code: number, message: string, data?: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  };
}

export function createNotification(event: DaemonEvent): JsonRpcNotification {
  return {
    jsonrpc: "2.0",
    method: "event",
    params: event as unknown as Record<string, unknown>,
  };
}

/**
 * Encode a JSON-RPC message for socket transport.
 * Uses newline-delimited JSON (each message is one line).
 */
export function encode(message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification): string {
  return `${JSON.stringify(message)}\n`;
}

/**
 * Decode a newline-delimited JSON message.
 */
export function decode(line: string): JsonRpcRequest | JsonRpcResponse | JsonRpcNotification {
  return JSON.parse(line.trim());
}
