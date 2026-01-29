#!/usr/bin/env bun
// =============================================================================
// Simple Load Test - Submits tasks to an already running daemon
// =============================================================================
// Usage: bun run scripts/submit-load-test.ts [--tasks=N] [--batch=N]
//
// Prerequisites: Start daemon first with:
//   bun run src/cli.ts daemon start --foreground --max-agents=0
// =============================================================================

import { connect, type Socket } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const getArg = (name: string, defaultValue: number): number => {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? parseInt(arg.split("=")[1]!, 10) : defaultValue;
};

const TOTAL_TASKS = getArg("tasks", 100000);
const BATCH_SIZE = getArg("batch", 1000);
const SOCKET_PATH = join(homedir(), ".bloom", "daemon", "daemon.sock");
const PID_PATH = join(homedir(), ".bloom", "daemon", "daemon.pid");

// Helpers
function fmt(n: number): string { return n.toLocaleString(); }
function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(1)}s`;
}
function fmtRate(count: number, ms: number): string { return `${((count / ms) * 1000).toFixed(0)}/s`; }
function fmtBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}

function getDaemonPid(): number | null {
  try {
    const { readFileSync } = require("node:fs");
    return parseInt(readFileSync(PID_PATH, "utf-8").trim(), 10);
  } catch { return null; }
}

function getDaemonMem(pid: number): number {
  try {
    const result = execSync(`ps -o rss= -p ${pid} 2>/dev/null`, { encoding: "utf-8" });
    return parseInt(result.trim(), 10) * 1024;
  } catch { return 0; }
}

// Simple JSON-RPC client
class Client {
  private socket: Socket;
  private pending = new Map<string, { resolve: Function; reject: Function }>();
  private buffer = "";
  private id = 0;

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
            const msg = JSON.parse(line);
            if (msg.id && this.pending.has(msg.id)) {
              const { resolve, reject } = this.pending.get(msg.id)!;
              this.pending.delete(msg.id);
              msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
            }
          } catch {}
        }
        idx = this.buffer.indexOf("\n");
      }
    });
  }

  async call(method: string, params: any): Promise<any> {
    const id = `${++this.id}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("Timeout"));
        }
      }, 30000);
    });
  }

  close() { this.socket.destroy(); }
}

async function main() {
  console.log("=".repeat(70));
  console.log("  BLOOM DAEMON LOAD TEST");
  console.log("=".repeat(70));
  console.log(`  Tasks: ${fmt(TOTAL_TASKS)}    Batch: ${fmt(BATCH_SIZE)}`);
  console.log("=".repeat(70));
  console.log();

  if (!existsSync(SOCKET_PATH)) {
    console.error("Daemon not running! Start it with:");
    console.error("  bun run src/cli.ts daemon start --foreground --max-agents=0");
    process.exit(1);
  }

  const daemonPid = getDaemonPid();
  const startMem = process.memoryUsage();
  const startDaemonMem = daemonPid ? getDaemonMem(daemonPid) : 0;

  // Connect
  console.log("Connecting to daemon...");
  const socket = connect(SOCKET_PATH);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  const client = new Client(socket);

  const initStatus = await client.call("status", {});
  console.log(`Connected (${fmt(initStatus.queue.entries.length)} existing entries)\n`);

  // Submit
  console.log("Submitting tasks...\n");
  const startTime = Date.now();
  let submitted = 0;
  let errors = 0;
  const latencies: number[] = [];

  for (let i = 0; i < TOTAL_TASKS; i++) {
    const t0 = Date.now();
    try {
      await client.call("enqueue.inbox", {
        instruction: `Load test task #${i + 1}`,
        workingDir: process.cwd(),
        priority: "normal",
      });
      submitted++;
      latencies.push(Date.now() - t0);
    } catch { errors++; }

    if ((i + 1) % BATCH_SIZE === 0 || i === TOTAL_TASKS - 1) {
      const pct = ((i + 1) / TOTAL_TASKS * 100).toFixed(1);
      const rate = fmtRate(submitted, Date.now() - startTime);
      const avg = latencies.length ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1) : "0";
      process.stdout.write(`\r  [${pct.padStart(5)}%] ${fmt(i + 1).padStart(10)}/${fmt(TOTAL_TASKS)} | ${rate.padStart(8)} | avg: ${avg}ms`);
    }
  }
  console.log("\n");

  // Results
  const totalTime = Date.now() - startTime;
  const sorted = [...latencies].sort((a, b) => a - b);
  const endMem = process.memoryUsage();
  const endDaemonMem = daemonPid ? getDaemonMem(daemonPid) : 0;

  console.log("=".repeat(70));
  console.log("  RESULTS");
  console.log("=".repeat(70));
  console.log(`  Time:        ${fmtMs(totalTime)}`);
  console.log(`  Submitted:   ${fmt(submitted)}`);
  console.log(`  Errors:      ${fmt(errors)}`);
  console.log(`  Throughput:  ${fmtRate(submitted, totalTime)}`);
  console.log();
  console.log("  Latency:");
  console.log(`    Min:       ${sorted[0]?.toFixed(1) ?? 0}ms`);
  console.log(`    P50:       ${sorted[Math.floor(sorted.length * 0.5)]?.toFixed(1) ?? 0}ms`);
  console.log(`    P95:       ${sorted[Math.floor(sorted.length * 0.95)]?.toFixed(1) ?? 0}ms`);
  console.log(`    P99:       ${sorted[Math.floor(sorted.length * 0.99)]?.toFixed(1) ?? 0}ms`);
  console.log(`    Max:       ${sorted[sorted.length - 1]?.toFixed(1) ?? 0}ms`);
  console.log();
  console.log("  Memory (client):");
  console.log(`    Start:     ${fmtBytes(startMem.rss)}`);
  console.log(`    End:       ${fmtBytes(endMem.rss)}`);
  console.log(`    Growth:    ${fmtBytes(endMem.heapUsed - startMem.heapUsed)}`);
  if (daemonPid && startDaemonMem && endDaemonMem) {
    console.log();
    console.log("  Memory (daemon):");
    console.log(`    Start:     ${fmtBytes(startDaemonMem)}`);
    console.log(`    End:       ${fmtBytes(endDaemonMem)}`);
    console.log(`    Growth:    ${fmtBytes(endDaemonMem - startDaemonMem)}`);
  }

  // Final status
  const finalStatus = await client.call("status", {});
  console.log();
  console.log("  Queue:");
  console.log(`    Total:     ${fmt(finalStatus.queue.entries.length)}`);
  console.log(`    Pending:   ${fmt(finalStatus.queue.pending)}`);
  console.log("=".repeat(70));

  client.close();
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
