// =============================================================================
// Daemon Protocol Tests
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
  createErrorResponse,
  createNotification,
  createRequest,
  createResponse,
  type DaemonEvent,
  decode,
  encode,
  RPC_ERRORS,
} from "../../src/daemon/protocol";

describe("createRequest", () => {
  test("creates valid JSON-RPC 2.0 request", () => {
    const request = createRequest("ping", {});

    expect(request.jsonrpc).toBe("2.0");
    expect(request.id).toBeDefined();
    expect(typeof request.id).toBe("string");
    expect(request.method).toBe("ping");
    expect(request.params).toEqual({});
  });

  test("includes params in request", () => {
    const request = createRequest("enqueue", {
      workspace: "/home/user/project",
      tasksFile: "/home/user/project/tasks.yaml",
    });

    expect(request.params).toEqual({
      workspace: "/home/user/project",
      tasksFile: "/home/user/project/tasks.yaml",
    });
  });

  test("generates unique IDs", () => {
    const request1 = createRequest("ping", {});
    const request2 = createRequest("ping", {});

    expect(request1.id).not.toBe(request2.id);
  });
});

describe("createResponse", () => {
  test("creates valid JSON-RPC 2.0 response", () => {
    const response = createResponse("test-id-123", { success: true });

    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBe("test-id-123");
    expect(response.result).toEqual({ success: true });
    expect(response.error).toBeUndefined();
  });

  test("handles null result", () => {
    const response = createResponse("test-id", null);
    expect(response.result).toBe(null);
  });
});

describe("createErrorResponse", () => {
  test("creates valid JSON-RPC 2.0 error response", () => {
    const response = createErrorResponse("error-id", RPC_ERRORS.INTERNAL_ERROR, "Something went wrong");

    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBe("error-id");
    expect(response.result).toBeUndefined();
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(RPC_ERRORS.INTERNAL_ERROR);
    expect(response.error?.message).toBe("Something went wrong");
  });

  test("includes optional data in error", () => {
    const response = createErrorResponse("error-id", RPC_ERRORS.INVALID_PARAMS, "Missing required field", {
      field: "workspace",
    });

    expect(response.error?.data).toEqual({ field: "workspace" });
  });

  test("handles error without data", () => {
    const response = createErrorResponse("error-id", RPC_ERRORS.METHOD_NOT_FOUND, "Unknown method");
    expect(response.error?.data).toBeUndefined();
  });
});

describe("createNotification", () => {
  test("creates valid JSON-RPC 2.0 notification", () => {
    const event: DaemonEvent = {
      type: "task_started",
      workspace: "/home/user/project",
      taskId: "task-123",
      entryId: "entry-456",
      data: { agent: "claude" },
      timestamp: new Date().toISOString(),
    };

    const notification = createNotification(event);

    expect(notification.jsonrpc).toBe("2.0");
    expect(notification.method).toBe("event");
    expect(notification.params).toBeDefined();
  });
});

describe("encode", () => {
  test("encodes request to newline-delimited JSON", () => {
    const request = createRequest("ping", {});
    const encoded = encode(request);

    expect(encoded.endsWith("\n")).toBe(true);
    expect(JSON.parse(encoded)).toEqual(request);
  });

  test("encodes response to newline-delimited JSON", () => {
    const response = createResponse("id", { ok: true });
    const encoded = encode(response);

    expect(encoded.endsWith("\n")).toBe(true);
    expect(JSON.parse(encoded)).toEqual(response);
  });

  test("encodes notification to newline-delimited JSON", () => {
    const event: DaemonEvent = {
      type: "test",
      data: {},
      timestamp: new Date().toISOString(),
    };
    const notification = createNotification(event);
    const encoded = encode(notification);

    expect(encoded.endsWith("\n")).toBe(true);
    expect(JSON.parse(encoded)).toEqual(notification);
  });
});

describe("decode", () => {
  test("decodes request from JSON string", () => {
    const original = createRequest("status", {});
    const encoded = JSON.stringify(original);
    const decoded = decode(encoded);

    expect(decoded).toEqual(original);
  });

  test("decodes response from JSON string", () => {
    const original = createResponse("id-123", { running: true, pid: 12345 });
    const encoded = JSON.stringify(original);
    const decoded = decode(encoded);

    expect(decoded).toEqual(original);
  });

  test("handles trailing whitespace", () => {
    const original = createRequest("ping", {});
    const encoded = `${JSON.stringify(original)}   \n`;
    const decoded = decode(encoded);

    expect(decoded).toEqual(original);
  });

  test("round-trips correctly with encode", () => {
    const original = createRequest("enqueue", {
      workspace: "/test",
      tasksFile: "/test/tasks.yaml",
    });

    const encoded = encode(original);
    const decoded = decode(encoded);

    expect(decoded).toEqual(original);
  });
});

describe("RPC_ERRORS", () => {
  test("has standard JSON-RPC 2.0 error codes", () => {
    expect(RPC_ERRORS.PARSE_ERROR).toBe(-32700);
    expect(RPC_ERRORS.INVALID_REQUEST).toBe(-32600);
    expect(RPC_ERRORS.METHOD_NOT_FOUND).toBe(-32601);
    expect(RPC_ERRORS.INVALID_PARAMS).toBe(-32602);
    expect(RPC_ERRORS.INTERNAL_ERROR).toBe(-32603);
  });

  test("has custom daemon error codes", () => {
    expect(RPC_ERRORS.DAEMON_ALREADY_RUNNING).toBe(-32001);
    expect(RPC_ERRORS.DAEMON_NOT_RUNNING).toBe(-32002);
    expect(RPC_ERRORS.QUEUE_FULL).toBe(-32003);
    expect(RPC_ERRORS.TASK_NOT_FOUND).toBe(-32004);
    expect(RPC_ERRORS.WORKSPACE_NOT_FOUND).toBe(-32005);
    expect(RPC_ERRORS.AGENT_UNAVAILABLE).toBe(-32006);
  });
});
