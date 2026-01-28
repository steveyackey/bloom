// =============================================================================
// Daemon Dashboard Server - Web UI for daemon task queue monitoring
// =============================================================================

import { createLogger } from "../../infra/logger";
import { connectToDaemon } from "../client";
import type { StatusResult } from "../protocol";
import { renderDashboardHTML } from "./ui";

const log = createLogger("daemon-dashboard");

export interface DashboardOptions {
  port: number;
  open: boolean;
}

interface DashboardState {
  status: StatusResult | null;
  lastError: string | null;
  version: number;
  connected: boolean;
}

// Global state
const state: DashboardState = {
  status: null,
  lastError: null,
  version: 0,
  connected: false,
};

// SSE clients for live updates
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

function notifyClients() {
  const message = `data: ${JSON.stringify({ version: state.version })}\n\n`;
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  for (const client of clients) {
    try {
      client.enqueue(data);
    } catch {
      clients.delete(client);
    }
  }
}

async function pollDaemon(): Promise<void> {
  try {
    const client = await connectToDaemon();
    if (!client) {
      if (state.connected || state.status !== null) {
        state.connected = false;
        state.status = null;
        state.lastError = null;
        state.version++;
        notifyClients();
      }
      return;
    }

    try {
      const status = (await client.status()) as StatusResult;
      state.status = status;
      state.lastError = null;
      state.connected = true;
      state.version++;
      notifyClients();
      log.debug(`Daemon polled (v${state.version})`);
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err);
      state.connected = false;
      state.version++;
      notifyClients();
      log.error(`Error polling daemon: ${state.lastError}`);
    } finally {
      client.disconnect();
    }
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    state.connected = false;
    state.version++;
    notifyClients();
  }
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // API: daemon status
  if (path === "/api/status") {
    return Response.json({
      version: state.version,
      connected: state.connected,
      status: state.status,
      error: state.lastError,
    });
  }

  // SSE endpoint for live updates
  if (path === "/api/events") {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        clients.add(controller);
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ version: state.version })}\n\n`));
      },
      cancel() {
        // Cleanup handled by notifyClients
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Manual refresh
  if (path === "/api/refresh" && req.method === "POST") {
    await pollDaemon();
    return Response.json({ version: state.version });
  }

  // Main UI
  if (path === "/" || path === "/index.html") {
    const html = renderDashboardHTML();
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

export async function startDashboardServer(options: DashboardOptions): Promise<void> {
  // Initial poll
  await pollDaemon();

  // Poll daemon every 2 seconds
  const pollInterval = setInterval(() => pollDaemon(), 2000);

  const server = Bun.serve({
    port: options.port,
    fetch: handleRequest,
  });

  const url = `http://localhost:${server.port}`;
  log.info(`Bloom Dashboard running at ${url}`);
  log.info("Press Ctrl+C to stop");

  // Open browser if requested
  if (options.open) {
    const platform = process.platform;
    const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
    try {
      Bun.spawn([cmd, url], { stdout: "ignore", stderr: "ignore" });
    } catch {
      // Ignore errors opening browser
    }
  }

  // Graceful shutdown
  const shutdown = () => {
    log.info("Shutting down dashboard...");
    clearInterval(pollInterval);
    server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process running
  await new Promise(() => {});
}
