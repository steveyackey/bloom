// =============================================================================
// Cross-Platform Abstractions for Daemon
// =============================================================================
// Provides platform-specific implementations for IPC, process management,
// and signal handling. Supports Linux, macOS, and Windows.

import { execSync } from "node:child_process";
import { join } from "node:path";

// =============================================================================
// Platform Detection
// =============================================================================

export const IS_WINDOWS = process.platform === "win32";
export const IS_MACOS = process.platform === "darwin";
export const IS_LINUX = process.platform === "linux";

// =============================================================================
// IPC Transport Path
// =============================================================================

/**
 * Get the IPC endpoint path for the daemon.
 *
 * - Linux/macOS: Unix domain socket at `~/.bloom/daemon/daemon.sock`
 * - Windows: Named pipe at `\\.\pipe\bloom-daemon`
 *
 * Node's `net` module supports both transparently — `net.createServer().listen(path)`
 * and `net.connect(path)` work with both Unix sockets and Windows named pipes.
 */
export function getIpcPath(daemonDir: string): string {
  if (IS_WINDOWS) {
    // Windows named pipes don't live on the filesystem — they use a kernel namespace.
    // The path must start with \\.\pipe\
    return "\\\\.\\pipe\\bloom-daemon";
  }
  return join(daemonDir, "daemon.sock");
}

/**
 * Whether the IPC path is a filesystem path that needs cleanup on exit.
 * Named pipes on Windows are automatically cleaned up by the OS.
 */
export function ipcPathNeedsCleanup(): boolean {
  return !IS_WINDOWS;
}

// =============================================================================
// Process Liveness Check
// =============================================================================

/**
 * Check if a process with the given PID is running.
 *
 * - Linux/macOS: `process.kill(pid, 0)` — signal 0 checks existence
 * - Windows: `tasklist /FI "PID eq ..."` — signal 0 is unreliable on Windows
 */
export function isProcessRunning(pid: number): boolean {
  if (IS_WINDOWS) {
    try {
      const output = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      // tasklist returns the process row if it exists, or "INFO: No tasks..."
      return output.includes(String(pid));
    } catch {
      return false;
    }
  }

  // Unix: signal 0 tests process existence without sending a real signal
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Signal Handling
// =============================================================================

/**
 * Register shutdown handlers that work across platforms.
 *
 * - Linux/macOS: SIGTERM + SIGINT
 * - Windows: SIGINT (Ctrl+C) + SIGHUP (console close). SIGTERM doesn't exist.
 *   Also uses `process.on("exit")` as a last-resort cleanup.
 */
export function registerShutdownHandlers(onGraceful: () => void, onImmediate: () => void): void {
  // SIGINT (Ctrl+C) works on all platforms
  process.on("SIGINT", onImmediate);

  if (IS_WINDOWS) {
    // Windows doesn't have SIGTERM. Use SIGHUP for console close events.
    process.on("SIGHUP", onGraceful);
  } else {
    // Unix: SIGTERM is the standard graceful shutdown signal
    process.on("SIGTERM", onGraceful);
  }
}

// =============================================================================
// Background Process Spawn
// =============================================================================

/**
 * Build the command and options to spawn the daemon as a background process.
 *
 * - Linux/macOS: `Bun.spawn` with detached stdio
 * - Windows: Uses `Bun.spawn` with detached stdio (same approach; Bun handles
 *   Windows subprocess detachment). The entry point script is the same.
 *
 * Returns the command array and spawn options.
 */
export function buildDaemonSpawnArgs(
  entryPath: string,
  extraArgs: string[]
): { command: string[]; env: Record<string, string | undefined> } {
  return {
    command: ["bun", "run", entryPath, ...extraArgs],
    env: { ...process.env },
  };
}

// =============================================================================
// Home Directory
// =============================================================================

/**
 * Get user's home directory path for display purposes.
 *
 * - Linux/macOS: $HOME
 * - Windows: %USERPROFILE% (or %HOME% if set)
 */
export function getHomeDirForDisplay(): string {
  if (IS_WINDOWS) {
    return process.env.USERPROFILE ?? process.env.HOME ?? "";
  }
  return process.env.HOME ?? "";
}

/**
 * Shorten a path for display by replacing the home directory prefix with ~.
 */
export function shortPath(fullPath: string): string {
  const home = getHomeDirForDisplay();
  if (home && fullPath.startsWith(home)) {
    return `~${fullPath.slice(home.length)}`;
  }
  // Just return last 2 segments
  const sep = IS_WINDOWS ? "\\" : "/";
  const parts = fullPath.split(sep);
  return parts.slice(-2).join(sep);
}
