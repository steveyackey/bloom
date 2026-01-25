// =============================================================================
// Process Stats Utilities
// =============================================================================
// Provides utilities for getting CPU and memory statistics of processes.

import { feature } from "bun:bundle";

// =============================================================================
// Types
// =============================================================================

export interface ProcessStats {
  /** CPU usage percentage (0-100) */
  cpu: number;
  /** Memory usage in MB */
  memory: number;
}

// =============================================================================
// Implementation
// =============================================================================

// Windows CPU delta tracking - stores previous CPU time and timestamp per PID
const windowsCpuHistory = new Map<number, { cpuTime: number; timestamp: number }>();

/**
 * Get CPU and memory stats for a process.
 * Returns null if stats cannot be retrieved (process exited, etc.)
 *
 * Platform support:
 * - Linux: reads from /proc/{pid}/stat (most accurate)
 * - macOS: uses ps command
 * - Windows: uses PowerShell Get-Process
 */
export async function getProcessStats(pid: number): Promise<ProcessStats | null> {
  const results = await getProcessStatsBatch([pid]);
  return results.get(pid) || null;
}

/**
 * Get CPU and memory stats for multiple processes in a single call.
 * More efficient than calling getProcessStats() for each PID individually.
 *
 * @param pids - Array of process IDs to get stats for
 * @returns Map of PID to ProcessStats (missing PIDs indicate process not found)
 */
export async function getProcessStatsBatch(pids: number[]): Promise<Map<number, ProcessStats>> {
  if (pids.length === 0) return new Map();

  if (feature("WINDOWS")) {
    return getWindowsProcessStatsBatch(pids);
  }

  // Try Linux /proc first (faster and more accurate)
  const linuxStats = await getLinuxProcessStatsBatch(pids);
  if (linuxStats.size > 0) return linuxStats;

  // Fall back to ps for macOS (and Linux if /proc fails)
  return getPsProcessStatsBatch(pids);
}

async function getLinuxProcessStatsBatch(pids: number[]): Promise<Map<number, ProcessStats>> {
  const results = new Map<number, ProcessStats>();

  try {
    // Read uptime once for all processes
    const uptimeContent = await Bun.file("/proc/uptime")
      .text()
      .catch(() => null);
    if (!uptimeContent) return results;

    const uptime = Number.parseFloat(uptimeContent.split(" ")[0] || "0");
    const hertz = 100; // Standard Linux clock ticks per second
    const pageSize = 4096; // Standard page size

    // Read stats for all PIDs in parallel
    await Promise.all(
      pids.map(async (pid) => {
        try {
          const [statContent, statmContent] = await Promise.all([
            Bun.file(`/proc/${pid}/stat`)
              .text()
              .catch(() => null),
            Bun.file(`/proc/${pid}/statm`)
              .text()
              .catch(() => null),
          ]);

          if (!statContent || !statmContent) return;

          // Parse stat - comm field (in parentheses) can contain spaces
          const lastParenIndex = statContent.lastIndexOf(")");
          if (lastParenIndex === -1) return;

          // Fields after comm: state(3) ppid(4) ... utime(14) stime(15) ... starttime(22)
          const fieldsAfterComm = statContent.slice(lastParenIndex + 2).split(" ");
          const utime = Number.parseInt(fieldsAfterComm[11] || "0", 10);
          const stime = Number.parseInt(fieldsAfterComm[12] || "0", 10);
          const starttime = Number.parseInt(fieldsAfterComm[19] || "0", 10);
          const totalTime = utime + stime;

          // Calculate CPU usage
          const seconds = uptime - starttime / hertz;
          const cpu = seconds > 0 ? (100 * (totalTime / hertz)) / seconds : 0;

          // Parse statm - fields: size resident shared text lib data dt
          const statmParts = statmContent.split(" ");
          const rss = Number.parseInt(statmParts[1] || "0", 10);
          const memory = (rss * pageSize) / (1024 * 1024);

          results.set(pid, {
            cpu: Math.min(100, Math.round(cpu * 10) / 10),
            memory: Math.round(memory * 10) / 10,
          });
        } catch {
          // Skip this PID
        }
      })
    );
  } catch {
    // Return whatever we collected
  }

  return results;
}

async function getPsProcessStatsBatch(pids: number[]): Promise<Map<number, ProcessStats>> {
  const results = new Map<number, ProcessStats>();

  try {
    // Use ps with multiple PIDs in one call: ps -p pid1,pid2,pid3 -o pid=,%cpu=,rss=
    const pidList = pids.join(",");
    const proc = Bun.spawn(["ps", "-p", pidList, "-o", "pid=,%cpu=,rss="], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    // Parse output - each line: "  123  5.2 12345" (pid, cpu%, rss in KB)
    for (const line of output.trim().split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;

      const pid = Number.parseInt(parts[0] || "0", 10);
      const cpu = Number.parseFloat(parts[1] || "0");
      const rssKb = Number.parseInt(parts[2] || "0", 10);
      const memory = rssKb / 1024;

      if (pid > 0) {
        results.set(pid, {
          cpu: Math.min(100, Math.round(cpu * 10) / 10),
          memory: Math.round(memory * 10) / 10,
        });
      }
    }
  } catch {
    // Return whatever we collected
  }

  return results;
}

async function getWindowsProcessStatsBatch(pids: number[]): Promise<Map<number, ProcessStats>> {
  const results = new Map<number, ProcessStats>();

  try {
    // Use PowerShell to get process stats for all PIDs in one call
    const pidList = pids.join(",");
    const psCommand = `Get-Process -Id ${pidList} -ErrorAction SilentlyContinue | Select-Object Id,CPU,WorkingSet64 | ConvertTo-Json -AsArray`;

    const proc = Bun.spawn(["powershell", "-NoProfile", "-Command", psCommand], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !output.trim()) {
      return results;
    }

    const now = Date.now();
    const data = JSON.parse(output.trim());
    if (!Array.isArray(data)) return results;

    for (const item of data) {
      const pid = item.Id;
      const cpuTime = item.CPU || 0;
      const memoryBytes = item.WorkingSet64 || 0;

      // Calculate instantaneous CPU% using delta from previous measurement
      let cpuPercent = 0;
      const prev = windowsCpuHistory.get(pid);
      if (prev) {
        const timeDeltaSec = (now - prev.timestamp) / 1000;
        if (timeDeltaSec > 0) {
          const cpuDelta = cpuTime - prev.cpuTime;
          // CPU time delta / wall time delta * 100 = CPU percentage
          cpuPercent = (cpuDelta / timeDeltaSec) * 100;
        }
      }

      // Store current values for next calculation
      windowsCpuHistory.set(pid, { cpuTime, timestamp: now });

      const memory = memoryBytes / (1024 * 1024);

      results.set(pid, {
        cpu: Math.min(100, Math.round(cpuPercent * 10) / 10),
        memory: Math.round(memory * 10) / 10,
      });
    }

    // Clean up history for PIDs no longer being tracked
    for (const historyPid of windowsCpuHistory.keys()) {
      if (!pids.includes(historyPid)) {
        windowsCpuHistory.delete(historyPid);
      }
    }
  } catch {
    // Return whatever we collected
  }

  return results;
}
