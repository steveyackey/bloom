#!/usr/bin/env bun
// =============================================================================
// Daemon Load Test Script
// =============================================================================
// Submits a large number of fake inbox tasks to stress test the daemon queue.
//
// Usage:
//   bun run scripts/load-test-daemon.ts [--tasks=100000] [--batch=1000] [--skip-agent]
//                                       [--completed=0] [--projects=0]
//
// Options:
//   --tasks=N      Number of tasks to submit (default: 100000)
//   --batch=N      Batch size for progress reporting (default: 1000)
//   --skip-agent   Don't actually run agents, just test queue throughput
//   --completed=N  Pre-populate queue with N completed tasks (stress test history)
//   --projects=N   Number of fake completed "projects" to add (each has 5-10 tasks)
//
// This script is NOT part of the normal test pipeline.
// =============================================================================

import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// =============================================================================
// Configuration
// =============================================================================

const args = process.argv.slice(2);
const getArg = (name: string, defaultValue: number): number => {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? parseInt(arg.split("=")[1]!, 10) : defaultValue;
};
const hasFlag = (name: string): boolean => args.includes(`--${name}`);

const TOTAL_TASKS = getArg("tasks", 100000);
const BATCH_SIZE = getArg("batch", 1000);
const SKIP_AGENT = hasFlag("skip-agent");
const PRE_COMPLETED = getArg("completed", 0);
const PRE_PROJECTS = getArg("projects", 0);

// Paths
const DAEMON_DIR = join(homedir(), ".bloom", "daemon");
const STATE_PATH = join(DAEMON_DIR, "state.json");
const PID_PATH = join(DAEMON_DIR, "daemon.pid");
const SOCKET_PATH = join(DAEMON_DIR, "daemon.sock");

// =============================================================================
// Helpers
// =============================================================================

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

function formatRate(count: number, ms: number): string {
  const perSecond = (count / ms) * 1000;
  return `${perSecond.toFixed(0)}/s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function generateId(): string {
  return crypto.randomUUID();
}

// =============================================================================
// Resource Monitoring
// =============================================================================

interface ResourceSnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

function getResourceSnapshot(): ResourceSnapshot {
  const mem = process.memoryUsage();
  return {
    timestamp: Date.now(),
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    rss: mem.rss,
  };
}

function getDaemonMemory(pid: number): { rss: number; vsz: number } | null {
  try {
    const result = execSync(`ps -o rss=,vsz= -p ${pid} 2>/dev/null`, { encoding: "utf-8" });
    const [rss, vsz] = result.trim().split(/\s+/).map(Number);
    return { rss: (rss || 0) * 1024, vsz: (vsz || 0) * 1024 }; // Convert KB to bytes
  } catch {
    return null;
  }
}

// =============================================================================
// State Types (simplified, matches daemon)
// =============================================================================

interface QueueEntry {
  id: string;
  source: "workspace" | "inbox" | "research";
  workspace?: string;
  workingDir: string;
  taskRef?: { tasksFile: string; taskId: string };
  inlineTask?: { instruction: string; type: string; output?: string };
  priority: number;
  enqueuedAt: string;
  startedAt?: string;
  completedAt?: string;
  status: "queued" | "active" | "done" | "failed" | "cancelled";
  assignedSlot?: number;
  agentPreference?: string;
  result?: string;
  error?: string;
}

interface DaemonState {
  version: 1;
  queue: QueueEntry[];
  stats: {
    totalEnqueued: number;
    totalCompleted: number;
    totalFailed: number;
    startedAt: string;
    lastActivity?: string;
  };
}

// =============================================================================
// Pre-population (completed tasks/projects)
// =============================================================================

function createCompletedEntry(index: number, projectName?: string): QueueEntry {
  const now = new Date();
  const enqueuedAt = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
  const startedAt = new Date(enqueuedAt.getTime() + Math.random() * 1000);
  const completedAt = new Date(startedAt.getTime() + Math.random() * 60 * 1000);

  return {
    id: generateId(),
    source: projectName ? "workspace" : "inbox",
    workspace: projectName ? `/fake/workspace/${projectName}` : undefined,
    workingDir: projectName ? `/fake/workspace/${projectName}` : process.cwd(),
    taskRef: projectName
      ? { tasksFile: `/fake/workspace/${projectName}/tasks.yaml`, taskId: `task-${index}` }
      : undefined,
    inlineTask: !projectName
      ? { instruction: `Completed load test task #${index}`, type: "inbox" }
      : undefined,
    priority: 50,
    enqueuedAt: enqueuedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    status: "done",
    result: `Task completed successfully (simulated)`,
  };
}

function prepopulateState(completedCount: number, projectCount: number): number {
  mkdirSync(DAEMON_DIR, { recursive: true });

  let state: DaemonState = {
    version: 1,
    queue: [],
    stats: {
      totalEnqueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      startedAt: new Date().toISOString(),
    },
  };

  // Add completed inbox tasks
  for (let i = 0; i < completedCount; i++) {
    state.queue.push(createCompletedEntry(i));
    state.stats.totalEnqueued++;
    state.stats.totalCompleted++;
  }

  // Add completed projects (each with 5-10 tasks)
  let projectTasks = 0;
  for (let p = 0; p < projectCount; p++) {
    const projectName = `project-${p + 1}`;
    const taskCount = 5 + Math.floor(Math.random() * 6);
    projectTasks += taskCount;

    for (let t = 0; t < taskCount; t++) {
      state.queue.push(createCompletedEntry(t, projectName));
      state.stats.totalEnqueued++;
      state.stats.totalCompleted++;
    }
  }

  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  return completedCount + projectTasks;
}

// =============================================================================
// Daemon Management
// =============================================================================

function isDaemonRunning(): boolean {
  if (!existsSync(PID_PATH)) return false;
  try {
    const pid = parseInt(readFileSync(PID_PATH, "utf-8").trim(), 10);
    process.kill(pid, 0); // Check if process exists
    return true;
  } catch {
    return false;
  }
}

function getDaemonPid(): number | null {
  if (!existsSync(PID_PATH)) return null;
  try {
    return parseInt(readFileSync(PID_PATH, "utf-8").trim(), 10);
  } catch {
    return null;
  }
}

async function startDaemon(skipAgent: boolean): Promise<number> {
  const cliArgs = ["run", "src/cli.ts", "daemon", "start", "--foreground"];
  if (skipAgent) {
    cliArgs.push("--max-agents=0");
  }

  const child = spawn("bun", cliArgs, {
    cwd: process.cwd(),
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });

  child.unref();

  // Wait for daemon to start
  for (let i = 0; i < 50; i++) {
    await Bun.sleep(100);
    if (isDaemonRunning()) {
      return getDaemonPid()!;
    }
  }

  throw new Error("Daemon failed to start within timeout");
}

async function stopDaemon(pid: number): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process may already be gone
  }

  // Wait for cleanup
  await Bun.sleep(500);

  // Force cleanup files
  try {
    if (existsSync(SOCKET_PATH)) {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(SOCKET_PATH);
    }
    if (existsSync(PID_PATH)) {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(PID_PATH);
    }
  } catch {
    // Ignore cleanup errors
  }
}

// =============================================================================
// IPC Client (inline implementation to avoid import issues)
// =============================================================================

import { connect, type Socket } from "node:net";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

class SimpleClient {
  private socket: Socket;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = "";
  private idCounter = 0;

  constructor(socket: Socket) {
    this.socket = socket;

    socket.on("data", (data) => {
      this.buffer += data.toString();
      let idx = this.buffer.indexOf("\n");
      while (idx !== -1) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 1);
        if (line.trim()) {
          try {
            const msg = JSON.parse(line) as JsonRpcResponse;
            if (msg.id && this.pending.has(msg.id)) {
              const { resolve, reject } = this.pending.get(msg.id)!;
              this.pending.delete(msg.id);
              if (msg.error) {
                reject(new Error(msg.error.message));
              } else {
                resolve(msg.result);
              }
            }
          } catch {}
        }
        idx = this.buffer.indexOf("\n");
      }
    });
  }

  private async call(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = `${++this.idCounter}`;
    const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(JSON.stringify(request) + "\n");

      // Timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 30000);
    });
  }

  async status(): Promise<{ queue: { entries: unknown[]; pending: number; active: number }; agents: { active: number; max: number } }> {
    return (await this.call("status", {})) as any;
  }

  async inbox(params: { instruction: string; workingDir: string; priority: string }): Promise<{ entryId: string }> {
    return (await this.call("enqueue.inbox", params)) as any;
  }

  disconnect(): void {
    this.socket.destroy();
  }
}

async function connectToDaemon(): Promise<SimpleClient | null> {
  if (!existsSync(SOCKET_PATH)) return null;

  return new Promise((resolve) => {
    const socket = connect(SOCKET_PATH);
    socket.once("connect", () => resolve(new SimpleClient(socket)));
    socket.once("error", () => resolve(null));
    setTimeout(() => resolve(null), 5000);
  });
}

// =============================================================================
// Load Test
// =============================================================================

async function runLoadTest(): Promise<void> {
  const resourceSnapshots: ResourceSnapshot[] = [];
  const daemonMemSnapshots: { timestamp: number; rss: number }[] = [];

  console.log("=".repeat(70));
  console.log("  BLOOM DAEMON LOAD TEST");
  console.log("=".repeat(70));
  console.log(`  Tasks to submit:    ${formatNumber(TOTAL_TASKS)}`);
  console.log(`  Batch size:         ${formatNumber(BATCH_SIZE)}`);
  console.log(`  Skip agent:         ${SKIP_AGENT}`);
  console.log(`  Pre-completed:      ${formatNumber(PRE_COMPLETED)}`);
  console.log(`  Pre-projects:       ${formatNumber(PRE_PROJECTS)}`);
  console.log("=".repeat(70));
  console.log();

  // Initial resource snapshot
  resourceSnapshots.push(getResourceSnapshot());

  // Step 1: Pre-populate with completed tasks if requested
  let prepopulated = 0;
  if (PRE_COMPLETED > 0 || PRE_PROJECTS > 0) {
    console.log("[1/5] Pre-populating with historical data...");
    prepopulated = prepopulateState(PRE_COMPLETED, PRE_PROJECTS);
    console.log(`      Added ${formatNumber(prepopulated)} completed entries\n`);
  } else {
    console.log("[1/5] No pre-population requested\n");
  }

  // Step 2: Start daemon
  let daemonPid: number | null = null;
  let daemonStartedByUs = false;

  if (!isDaemonRunning()) {
    console.log("[2/5] Starting daemon...");
    daemonPid = await startDaemon(SKIP_AGENT);
    daemonStartedByUs = true;
    console.log(`      Daemon started (PID: ${daemonPid})\n`);
  } else {
    daemonPid = getDaemonPid();
    console.log(`[2/5] Daemon already running (PID: ${daemonPid})\n`);
  }

  // Step 3: Connect to daemon
  console.log("[3/5] Connecting to daemon...");
  const client = await connectToDaemon();
  if (!client) {
    console.error("      Failed to connect to daemon!");
    process.exit(1);
  }

  const initialStatus = await client.status();
  console.log(`      Connected (queue has ${formatNumber(initialStatus.queue.entries.length)} entries)\n`);

  // Capture daemon memory before test
  if (daemonPid) {
    const mem = getDaemonMemory(daemonPid);
    if (mem) daemonMemSnapshots.push({ timestamp: Date.now(), rss: mem.rss });
  }

  // Step 4: Submit tasks
  console.log("[4/5] Submitting tasks...");
  console.log();

  const startTime = Date.now();
  let submitted = 0;
  let errors = 0;
  const latencies: number[] = [];

  const printProgress = (current: number, total: number, rate: string, avgLatency: string) => {
    const percent = ((current / total) * 100).toFixed(1);
    const barWidth = 40;
    const filled = Math.round((current / total) * barWidth);
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
    process.stdout.write(
      `\r      [${bar}] ${percent}% | ${formatNumber(current)}/${formatNumber(total)} | ${rate} | avg: ${avgLatency}`
    );
  };

  // Submit tasks
  for (let i = 0; i < TOTAL_TASKS; i++) {
    const taskStart = Date.now();

    try {
      await client.inbox({
        instruction: `Load test task #${i + 1}: Simulate work for testing purposes`,
        workingDir: process.cwd(),
        priority: "normal",
      });
      submitted++;
      latencies.push(Date.now() - taskStart);
    } catch (err) {
      errors++;
    }

    // Update progress and capture resources every batch
    if ((i + 1) % BATCH_SIZE === 0 || i === TOTAL_TASKS - 1) {
      const elapsed = Date.now() - startTime;
      const rate = formatRate(submitted, elapsed);
      const avgLatency =
        latencies.length > 0 ? `${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1)}ms` : "N/A";
      printProgress(i + 1, TOTAL_TASKS, rate, avgLatency);

      // Capture resource snapshot
      resourceSnapshots.push(getResourceSnapshot());

      // Capture daemon memory
      if (daemonPid) {
        const mem = getDaemonMemory(daemonPid);
        if (mem) daemonMemSnapshots.push({ timestamp: Date.now(), rss: mem.rss });
      }
    }
  }

  console.log("\n");

  // Step 5: Results
  const totalTime = Date.now() - startTime;
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
  const p50 = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] : 0;
  const p95 = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] : 0;
  const p99 = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] : 0;

  // Resource analysis
  const firstSnapshot = resourceSnapshots[0]!;
  const lastSnapshot = resourceSnapshots[resourceSnapshots.length - 1]!;
  const peakRss = Math.max(...resourceSnapshots.map((s) => s.rss));
  const daemonPeakRss = daemonMemSnapshots.length > 0 ? Math.max(...daemonMemSnapshots.map((s) => s.rss)) : 0;

  console.log("[5/5] Results");
  console.log("=".repeat(70));
  console.log(`  Total time:      ${formatDuration(totalTime)}`);
  console.log(`  Tasks submitted: ${formatNumber(submitted)}`);
  console.log(`  Errors:          ${formatNumber(errors)}`);
  console.log(`  Throughput:      ${formatRate(submitted, totalTime)}`);
  console.log();
  console.log("  Latency (per task):");
  console.log(`    Min:           ${minLatency.toFixed(1)}ms`);
  console.log(`    Avg:           ${avgLatency.toFixed(1)}ms`);
  console.log(`    P50:           ${p50?.toFixed(1) ?? "N/A"}ms`);
  console.log(`    P95:           ${p95?.toFixed(1) ?? "N/A"}ms`);
  console.log(`    P99:           ${p99?.toFixed(1) ?? "N/A"}ms`);
  console.log(`    Max:           ${maxLatency.toFixed(1)}ms`);
  console.log();
  console.log("  Client Memory:");
  console.log(`    Start RSS:     ${formatBytes(firstSnapshot.rss)}`);
  console.log(`    End RSS:       ${formatBytes(lastSnapshot.rss)}`);
  console.log(`    Peak RSS:      ${formatBytes(peakRss)}`);
  console.log(`    Heap growth:   ${formatBytes(lastSnapshot.heapUsed - firstSnapshot.heapUsed)}`);
  if (daemonPeakRss > 0) {
    console.log();
    console.log("  Daemon Memory:");
    console.log(`    Peak RSS:      ${formatBytes(daemonPeakRss)}`);
  }
  console.log("=".repeat(70));

  // Get final queue status
  try {
    const status = await client.status();
    console.log();
    console.log("  Queue Status:");
    console.log(`    Total entries: ${formatNumber(status.queue.entries.length)}`);
    console.log(`    Pending:       ${formatNumber(status.queue.pending)}`);
    console.log(`    Active:        ${formatNumber(status.queue.active)}`);
    console.log(`    Agents:        ${status.agents.active}/${status.agents.max}`);
    console.log("=".repeat(70));
  } catch {
    // Ignore status errors
  }

  client.disconnect();

  // Cleanup
  if (daemonStartedByUs && daemonPid) {
    console.log("\nCleaning up...");
    await stopDaemon(daemonPid);
    console.log("Done!");
  }

  console.log();
}

// =============================================================================
// Main
// =============================================================================

runLoadTest().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
