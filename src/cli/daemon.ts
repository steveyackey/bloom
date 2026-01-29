// =============================================================================
// CLI: bloom daemon start / bloom daemon stop / bloom daemon status
// =============================================================================

import { spawn } from "node:child_process";
import { join } from "node:path";
import chalk from "chalk";
import type { Clerc } from "clerc";
import type { AgentSlotInfo, StatusResult } from "../daemon";
import { connectToDaemon, getDaemonDir, isDaemonRunning, readPid } from "../daemon";
import { buildDaemonSpawnArgs, shortPath } from "../daemon/platform";

// =============================================================================
// Register Commands
// =============================================================================

export function registerDaemonCommands(cli: ReturnType<typeof Clerc.create>): void {
  // =========================================================================
  // bloom daemon start
  // =========================================================================
  cli
    .command("daemon start", "Start the bloom daemon", {
      flags: {
        foreground: {
          description: "Run in foreground (for debugging)",
          type: Boolean,
          default: false,
        },
        maxAgents: {
          description: "Max concurrent agents",
          type: Number,
        },
        maxPerWorkspace: {
          description: "Max agents per workspace",
          type: Number,
        },
      },
      help: { group: "system" },
    })
    .on("daemon start", async (ctx) => {
      const { foreground, maxAgents, maxPerWorkspace } = ctx.flags;

      // Check if already running
      const running = await isDaemonRunning();
      if (running) {
        const pid = await readPid();
        console.log(`${chalk.yellow("Daemon already running")} (pid: ${pid})`);
        return;
      }

      if (foreground) {
        // Run in foreground (for debugging)
        console.log(`${chalk.green("Starting daemon in foreground...")}`);
        const { startDaemon } = await import("../daemon/server");
        await startDaemon({
          maxAgents: maxAgents as number | undefined,
          maxPerWorkspace: maxPerWorkspace as number | undefined,
          foreground: true,
        });
        // startDaemon blocks until shutdown
      } else {
        // Fork to background (cross-platform)
        const daemonEntry = new URL("../daemon/entry.ts", import.meta.url).pathname;
        const extraArgs: string[] = [];
        if (maxAgents) extraArgs.push("--max-agents", String(maxAgents));
        if (maxPerWorkspace) extraArgs.push("--max-per-workspace", String(maxPerWorkspace));

        const spawnArgs = buildDaemonSpawnArgs(daemonEntry, extraArgs);

        // Use Node's spawn with detached:true to properly daemonize
        // Bun.spawn doesn't support detached mode, causing the child to receive
        // signals when the parent exits
        const [cmd, ...args] = spawnArgs.command;
        const proc = spawn(cmd, args, {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
          env: spawnArgs.env as NodeJS.ProcessEnv,
        });

        // Detach immediately so parent can exit cleanly
        proc.unref();

        // Give daemon a moment to start
        await Bun.sleep(1000);

        const pid = await readPid();
        if (pid) {
          console.log(`${chalk.green("Daemon started")} (pid: ${pid})`);
          console.log(`  Log: ${join(getDaemonDir(), "daemon.log")}`);
        } else {
          console.log(`${chalk.red("Failed to start daemon")}. Check ${join(getDaemonDir(), "daemon.log")}`);
          process.exit(1);
        }
      }
    });

  // =========================================================================
  // bloom daemon stop
  // =========================================================================
  cli
    .command("daemon stop", "Stop the bloom daemon", {
      flags: {
        force: {
          description: "Force immediate shutdown",
          type: Boolean,
          default: false,
        },
        timeout: {
          description: "Grace period in seconds (default: 300)",
          type: Number,
        },
      },
      help: { group: "system" },
    })
    .on("daemon stop", async (ctx) => {
      const { force, timeout } = ctx.flags;

      const client = await connectToDaemon();
      if (!client) {
        console.log(`${chalk.yellow("Daemon is not running")}`);
        return;
      }

      try {
        console.log(force ? "Force stopping daemon..." : "Stopping daemon (waiting for active tasks)...");
        await client.shutdown({
          force: force as boolean,
          timeout: timeout as number | undefined,
        });
        console.log(`${chalk.green("Daemon stopped")}`);
      } catch (err) {
        console.error(`${chalk.red("Error stopping daemon:")} ${err}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  // =========================================================================
  // bloom daemon status
  // =========================================================================
  cli
    .command("daemon status", "Show daemon status", {
      flags: {
        json: {
          description: "Output as JSON",
          type: Boolean,
          default: false,
        },
      },
      help: { group: "system" },
    })
    .on("daemon status", async (ctx) => {
      const { json: jsonOutput } = ctx.flags;

      const client = await connectToDaemon();
      if (!client) {
        if (jsonOutput) {
          console.log(JSON.stringify({ running: false }));
        } else {
          console.log(`${chalk.dim("Daemon:")} ${chalk.red("not running")}`);
          console.log(`  Start with: ${chalk.cyan("bloom daemon start")}`);
        }
        return;
      }

      try {
        const status = (await client.status()) as StatusResult;

        if (jsonOutput) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }

        // Format uptime
        const hours = Math.floor(status.uptime / 3600);
        const minutes = Math.floor((status.uptime % 3600) / 60);
        const uptimeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        console.log(`${chalk.dim("Daemon:")} ${chalk.green("running")} (pid: ${status.pid}, uptime: ${uptimeStr})`);
        console.log(`${chalk.dim("Agents:")} ${status.agents.active}/${status.agents.max} active`);
        console.log();

        // Active slots
        const busySlots = status.agents.slots.filter((s: AgentSlotInfo) => s.status === "busy");
        if (busySlots.length > 0) {
          console.log(chalk.bold("Active:"));
          for (const slot of busySlots) {
            const duration = slot.duration ? formatDuration(slot.duration) : "?";
            const workspace = slot.workspace ? shortPath(slot.workspace) : "inbox";
            console.log(
              `  ${chalk.dim(`[${slot.id}]`)} ${chalk.cyan(slot.provider ?? "?")}  → ${workspace}  ${chalk.dim(`task:${slot.taskId ?? "?"}`)}  (${duration})`
            );
          }
          console.log();
        }

        // Queue
        const pendingEntries = status.queue.entries.filter((e) => e.status === "queued");
        if (pendingEntries.length > 0 || status.queue.pending > 0) {
          console.log(`${chalk.bold("Queue:")} ${status.queue.pending} pending`);
          for (const entry of pendingEntries.slice(0, 10)) {
            const label = entry.instruction ? entry.instruction.slice(0, 50) : (entry.taskId ?? entry.id.slice(0, 8));
            const workspace = entry.workspace ? shortPath(entry.workspace) : "";
            console.log(`  ${chalk.dim(`[${entry.id.slice(0, 8)}]`)} ${workspace ? `${workspace}  ` : ""}${label}`);
          }
          if (pendingEntries.length > 10) {
            console.log(chalk.dim(`  ... and ${pendingEntries.length - 10} more`));
          }
          console.log();
        }

        console.log(chalk.dim(`Completed today: ${status.queue.completedToday} tasks`));
      } catch (err) {
        console.error(`${chalk.red("Error getting status:")} ${err}`);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });
}

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}
