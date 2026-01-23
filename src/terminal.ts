// =============================================================================
// Terminal/PTY Abstraction Layer
// =============================================================================
// Uses Bun.spawn with terminal option on non-Windows (faster, built-in)
// Uses bun-pty on Windows as a fallback
//
// Build with: --feature WINDOWS for Windows builds

import { feature } from "bun:bundle";

// =============================================================================
// Interface
// =============================================================================

export interface TerminalProcess {
  /** Write data to the terminal stdin */
  write(data: string): void;
  /** Resize the terminal */
  resize(cols: number, rows: number): void;
  /** Kill the process */
  kill(signal?: string): void;
  /** Promise that resolves with exit code when process exits */
  readonly exited: Promise<number>;
  /** Process ID (if available) */
  readonly pid?: number;
}

export interface TerminalSpawnOptions {
  cwd: string;
  env?: Record<string, string>;
  cols: number;
  rows: number;
  /** Called when data is received from the terminal */
  onData: (data: string) => void;
  /** Called when process exits */
  onExit?: (code: number) => void;
}

// =============================================================================
// Bun.spawn Terminal Backend (non-Windows)
// =============================================================================

function spawnWithBunTerminal(command: string[], options: TerminalSpawnOptions): TerminalProcess {
  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env } as Record<string, string>,
    stdin: "pipe",
    terminal: {
      cols: options.cols,
      rows: options.rows,
      name: "xterm-256color",
      data: (_term, data) => {
        const text = new TextDecoder().decode(data);
        options.onData(text);
      },
    },
  });

  const exitedPromise = proc.exited.then((code) => {
    options.onExit?.(code);
    return code;
  });

  return {
    write(data: string) {
      proc.terminal?.write(data);
    },
    resize(cols: number, rows: number) {
      try {
        proc.terminal?.resize(cols, rows);
      } catch {
        // Ignore resize errors (process may have exited)
      }
    },
    kill(signal?: string) {
      proc.kill(signal ? (signal as NodeJS.Signals) : undefined);
    },
    get exited() {
      return exitedPromise;
    },
    get pid() {
      return proc.pid;
    },
  };
}

// =============================================================================
// bun-pty Backend (Windows) - only included when building with --feature WINDOWS
// =============================================================================

let spawnWithBunPty: ((command: string[], options: TerminalSpawnOptions) => Promise<TerminalProcess>) | null = null;

if (feature("WINDOWS")) {
  // This entire block is eliminated at compile time for non-Windows builds
  const pty = require("bun-pty");

  spawnWithBunPty = async (command: string[], options: TerminalSpawnOptions): Promise<TerminalProcess> => {
    const [cmd, ...args] = command;
    if (!cmd) {
      throw new Error("Command is required");
    }

    // Filter out undefined values from env
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...process.env, ...options.env })) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    const proc = pty.spawn(cmd, args, {
      name: "xterm-256color",
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env,
    });

    // Set up data handler
    const dataDisposable = proc.onData((data: string) => {
      options.onData(data);
    });

    // Create exit promise
    const exitedPromise = new Promise<number>((resolve) => {
      proc.onExit((exitCode: number) => {
        dataDisposable.dispose();
        options.onExit?.(exitCode);
        resolve(exitCode);
      });
    });

    return {
      write(data: string) {
        proc.write(data);
      },
      resize(cols: number, rows: number) {
        try {
          proc.resize(cols, rows);
        } catch {
          // Ignore resize errors
        }
      },
      kill(signal?: string) {
        proc.kill(signal);
      },
      get exited() {
        return exitedPromise;
      },
      get pid() {
        return proc.pid;
      },
    };
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Spawn a command in a pseudo-terminal.
 * Uses Bun.spawn with terminal option on non-Windows (faster, smaller).
 * Uses bun-pty on Windows (requires building with --feature WINDOWS).
 */
export async function spawnTerminal(command: string[], options: TerminalSpawnOptions): Promise<TerminalProcess> {
  if (feature("WINDOWS")) {
    if (!spawnWithBunPty) {
      throw new Error("Windows support not compiled in. Build with --feature WINDOWS");
    }
    return spawnWithBunPty(command, options);
  }
  return spawnWithBunTerminal(command, options);
}

// =============================================================================
// Process Stats
// =============================================================================

export interface ProcessStats {
  /** CPU usage percentage (0-100) */
  cpu: number;
  /** Memory usage in MB */
  memory: number;
}

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
  if (feature("WINDOWS")) {
    return getWindowsProcessStats(pid);
  }

  // Try Linux /proc first (faster and more accurate)
  const linuxStats = await getLinuxProcessStats(pid);
  if (linuxStats) return linuxStats;

  // Fall back to ps for macOS (and Linux if /proc fails)
  return getPsProcessStats(pid);
}

async function getLinuxProcessStats(pid: number): Promise<ProcessStats | null> {
  try {
    const statFile = Bun.file(`/proc/${pid}/stat`);
    const statmFile = Bun.file(`/proc/${pid}/statm`);
    const uptimeFile = Bun.file("/proc/uptime");

    const [statContent, statmContent, uptimeContent] = await Promise.all([
      statFile.text().catch(() => null),
      statmFile.text().catch(() => null),
      uptimeFile.text().catch(() => null),
    ]);

    if (!statContent || !statmContent || !uptimeContent) {
      return null;
    }

    // Parse stat - fields: pid (comm) state ppid pgrp session tty_nr tpgid flags
    //               minflt cminflt majflt cmajflt utime stime cutime cstime ...
    const statParts = statContent.split(" ");
    const utime = Number.parseInt(statParts[13] || "0", 10);
    const stime = Number.parseInt(statParts[14] || "0", 10);
    const starttime = Number.parseInt(statParts[21] || "0", 10);
    const totalTime = utime + stime;

    // Parse uptime
    const uptime = Number.parseFloat(uptimeContent.split(" ")[0] || "0");

    // Get clock ticks per second (usually 100)
    const hertz = 100; // Assuming standard Linux value

    // Calculate CPU usage
    const seconds = uptime - starttime / hertz;
    const cpu = seconds > 0 ? (100 * (totalTime / hertz)) / seconds : 0;

    // Parse statm - fields: size resident shared text lib data dt
    const statmParts = statmContent.split(" ");
    const rss = Number.parseInt(statmParts[1] || "0", 10); // resident pages
    const pageSize = 4096; // Assuming standard page size
    const memory = (rss * pageSize) / (1024 * 1024); // Convert to MB

    return {
      cpu: Math.min(100, Math.round(cpu * 10) / 10),
      memory: Math.round(memory * 10) / 10,
    };
  } catch {
    return null;
  }
}

async function getPsProcessStats(pid: number): Promise<ProcessStats | null> {
  try {
    // Use ps to get CPU% and RSS (resident set size in KB)
    // Works on macOS and Linux
    const proc = Bun.spawn(["ps", "-p", String(pid), "-o", "%cpu=,rss="], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !output.trim()) {
      return null;
    }

    // Parse output: "  5.2 12345" (cpu% and rss in KB)
    const parts = output.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const cpu = Number.parseFloat(parts[0] || "0");
    const rssKb = Number.parseInt(parts[1] || "0", 10);
    const memory = rssKb / 1024; // Convert KB to MB

    return {
      cpu: Math.min(100, Math.round(cpu * 10) / 10),
      memory: Math.round(memory * 10) / 10,
    };
  } catch {
    return null;
  }
}

async function getWindowsProcessStats(pid: number): Promise<ProcessStats | null> {
  try {
    // Use PowerShell to get process stats
    // Get-Process returns CPU time in seconds and WorkingSet64 in bytes
    const psCommand = `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object CPU,WorkingSet64 | ConvertTo-Json`;

    const proc = Bun.spawn(["powershell", "-NoProfile", "-Command", psCommand], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !output.trim()) {
      return null;
    }

    const data = JSON.parse(output.trim());
    if (!data) return null;

    // CPU is total CPU time in seconds - convert to approximate percentage
    // This is cumulative, not instantaneous, so it's less accurate than Linux/macOS
    // WorkingSet64 is memory in bytes
    const cpuSeconds = data.CPU || 0;
    const memoryBytes = data.WorkingSet64 || 0;

    // For CPU%, we'll show the cumulative CPU time as a rough indicator
    // A more accurate approach would track delta over time, but this gives a ballpark
    const cpu = Math.min(100, Math.round(cpuSeconds * 10) / 10);
    const memory = Math.round((memoryBytes / (1024 * 1024)) * 10) / 10; // Convert to MB

    return { cpu, memory };
  } catch {
    return null;
  }
}
