#!/usr/bin/env bun
// =============================================================================
// Daemon Entry Point (for background fork)
// =============================================================================
// This file is spawned as a child process by `bloom daemon start`.

import { appendFileSync, writeFileSync } from "node:fs";
import { startDaemon } from "./server";
import { ensureDaemonDir, getLogPath } from "./state";

// Set up log file redirection for background mode
ensureDaemonDir();
const logPath = getLogPath();

// Clear/create log file
writeFileSync(logPath, `[${new Date().toISOString()}] Daemon starting...\n`);

// Override console methods to write to log file
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function writeToLog(prefix: string, args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const message = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  appendFileSync(logPath, `[${timestamp}] ${prefix}${message}\n`);
}

console.log = (...args: unknown[]) => writeToLog("", args);
console.error = (...args: unknown[]) => writeToLog("[ERROR] ", args);
console.warn = (...args: unknown[]) => writeToLog("[WARN] ", args);

// Handle uncaught errors
process.on("uncaughtException", (err) => {
  writeToLog("[FATAL] Uncaught exception: ", [err.stack || err.message]);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  writeToLog("[FATAL] Unhandled rejection: ", [String(reason)]);
  process.exit(1);
});

// Parse args
const args = process.argv.slice(2);
let maxAgents: number | undefined;
let maxPerWorkspace: number | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--max-agents" && args[i + 1]) {
    maxAgents = parseInt(args[i + 1]!, 10);
    i++;
  }
  if (args[i] === "--max-per-workspace" && args[i + 1]) {
    maxPerWorkspace = parseInt(args[i + 1]!, 10);
    i++;
  }
}

// Start daemon (blocks until shutdown)
await startDaemon({ maxAgents, maxPerWorkspace, foreground: true });
