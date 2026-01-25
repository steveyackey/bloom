// =============================================================================
// Bloom View Server - Bun-powered visual inspector
// =============================================================================

import { type FSWatcher, watch } from "node:fs";
import { dirname } from "node:path";
import chalk from "chalk";
import { loadTasks } from "../tasks";
import { buildTaskGraph, type TaskGraph } from "./graph";
import { buildSystemPrompt, buildTaskPrompt } from "./prompts";
import { renderHTML } from "./ui";

export interface ServerOptions {
  tasksFile: string;
  port: number;
  open: boolean;
}

interface ServerState {
  tasksFile: string;
  graph: TaskGraph | null;
  lastError: string | null;
  version: number; // Increments on each reload
}

// Global state for the server
const state: ServerState = {
  tasksFile: "",
  graph: null,
  lastError: null,
  version: 0,
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

async function reloadTasks() {
  try {
    const tasksFile = await loadTasks(state.tasksFile);
    state.graph = buildTaskGraph(tasksFile, state.tasksFile);
    state.lastError = null;
    state.version++;
    notifyClients();
    console.log(chalk.gray(`[${new Date().toLocaleTimeString()}] Tasks reloaded (v${state.version})`));
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    state.version++;
    notifyClients();
    console.error(chalk.red(`[${new Date().toLocaleTimeString()}] Error reloading tasks: ${state.lastError}`));
  }
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // API Routes
  if (path === "/api/tasks") {
    if (state.lastError) {
      return Response.json({ error: state.lastError }, { status: 500 });
    }
    return Response.json({
      version: state.version,
      graph: state.graph,
    });
  }

  if (path.startsWith("/api/task/") && path.endsWith("/prompt")) {
    const taskId = path.slice("/api/task/".length, -"/prompt".length);

    if (!state.graph) {
      return Response.json({ error: "Tasks not loaded" }, { status: 500 });
    }

    const node = state.graph.nodes.find((n) => n.id === taskId);
    if (!node) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    try {
      const [systemPrompt, userPrompt] = await Promise.all([
        buildSystemPrompt(node, state.tasksFile),
        buildTaskPrompt(node, state.graph),
      ]);

      return Response.json({
        systemPrompt,
        userPrompt,
      });
    } catch (err) {
      return Response.json(
        {
          error: err instanceof Error ? err.message : String(err),
        },
        { status: 500 }
      );
    }
  }

  // SSE endpoint for live updates
  if (path === "/api/events") {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        clients.add(controller);

        // Send initial version
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ version: state.version })}\n\n`));
      },
      cancel() {
        // Client disconnected - cleanup handled by notifyClients
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
    await reloadTasks();
    return Response.json({ version: state.version });
  }

  // Main UI
  if (path === "/" || path === "/index.html") {
    const html = renderHTML(state.graph, state.lastError);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

export async function startViewServer(options: ServerOptions): Promise<void> {
  state.tasksFile = options.tasksFile;

  // Initial load
  await reloadTasks();

  // Set up file watcher
  let watcher: FSWatcher | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    watcher = watch(dirname(options.tasksFile), (_event, filename) => {
      if (filename === "tasks.yaml" || filename?.endsWith("tasks.yaml")) {
        // Debounce rapid changes
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => reloadTasks(), 100);
      }
    });
  } catch {
    console.log(chalk.yellow("File watching not available - use Refresh button"));
  }

  const server = Bun.serve({
    port: options.port,
    fetch: handleRequest,
  });

  const url = `http://localhost:${server.port}`;
  console.log(chalk.green(`\n  Bloom View running at ${chalk.bold(url)}\n`));
  console.log(chalk.gray("  Press Ctrl+C to stop\n"));

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

  // Handle graceful shutdown
  const shutdown = () => {
    console.log(chalk.gray("\n  Shutting down..."));
    if (watcher) watcher.close();
    if (debounceTimer) clearTimeout(debounceTimer);
    server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process running
  await new Promise(() => {});
}
