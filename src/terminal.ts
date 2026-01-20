// =============================================================================
// Terminal/PTY Abstraction Layer
// =============================================================================
// Uses Bun.spawn with terminal option on non-Windows (faster, built-in)
// Uses bun-pty on Windows as a fallback

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
// Platform Detection
// =============================================================================

const IS_WINDOWS = process.platform === "win32";

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
  };
}

// =============================================================================
// bun-pty Backend (Windows)
// =============================================================================

// Type definition for bun-pty (loaded dynamically)
interface BunPty {
  spawn(
    command: string,
    args: string[],
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: Record<string, string>;
    }
  ): {
    pid: number;
    cols: number;
    rows: number;
    process: string;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
    onData(callback: (data: string) => void): { dispose(): void };
    onExit(callback: (exitCode: number, signal?: number) => void): { dispose(): void };
  };
}

// Cache for the bun-pty module
let bunPtyModule: BunPty | null = null;
let bunPtyLoadPromise: Promise<BunPty> | null = null;

async function loadBunPty(): Promise<BunPty> {
  if (bunPtyModule) return bunPtyModule;
  if (bunPtyLoadPromise) return bunPtyLoadPromise;

  // Dynamic import - bun-pty is an optional dependency
  bunPtyLoadPromise = import("bun-pty").then((mod) => {
    bunPtyModule = mod as unknown as BunPty;
    return bunPtyModule;
  });

  return bunPtyLoadPromise;
}

async function spawnWithBunPty(command: string[], options: TerminalSpawnOptions): Promise<TerminalProcess> {
  const pty = await loadBunPty();

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
  const dataDisposable = proc.onData((data) => {
    options.onData(data);
  });

  // Create exit promise
  const exitedPromise = new Promise<number>((resolve) => {
    proc.onExit((exitCode) => {
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
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Spawn a command in a pseudo-terminal.
 * Uses Bun.spawn with terminal option on non-Windows (faster, smaller).
 * Uses bun-pty on Windows.
 */
export async function spawnTerminal(command: string[], options: TerminalSpawnOptions): Promise<TerminalProcess> {
  if (IS_WINDOWS) {
    return spawnWithBunPty(command, options);
  }
  return spawnWithBunTerminal(command, options);
}

/**
 * Check if the current platform requires bun-pty.
 * Useful for showing install instructions.
 */
export function requiresBunPty(): boolean {
  return IS_WINDOWS;
}

/**
 * Check if bun-pty is available (for Windows).
 */
export async function isBunPtyAvailable(): Promise<boolean> {
  if (!IS_WINDOWS) return true; // Not needed on non-Windows

  try {
    await loadBunPty();
    return true;
  } catch {
    return false;
  }
}
