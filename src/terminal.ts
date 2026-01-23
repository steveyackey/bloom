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
 */
export async function getProcessStats(pid: number): Promise<ProcessStats | null> {
  if (feature("WINDOWS")) {
    // Windows: use tasklist - not as accurate but works
    return null; // TODO: Windows support
  }

  try {
    // Linux/macOS: read from /proc/{pid}/stat and /proc/{pid}/statm
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
