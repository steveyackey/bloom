#!/usr/bin/env bun
// =============================================================================
// Daemon Entry Point (for background fork)
// =============================================================================
// This file is spawned as a child process by `bloom start`.

import { startDaemon } from "./server";

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
