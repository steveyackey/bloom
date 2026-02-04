// =============================================================================
// macOS Platform Backend
// =============================================================================
//
// Translates SandboxConfig into srt CLI flags for macOS.
// macOS uses sandbox-exec (Seatbelt profiles) for isolation (via srt).
// =============================================================================

import { spawnSync } from "node:child_process";
import type { SandboxConfig } from "../config";
import { sandboxLoggers } from "../logger";

const log = sandboxLoggers.platform;

/**
 * Check if srt is available on this macOS system.
 * Returns the srt command path if available, or null if not found.
 */
export function checkAvailability(): string | null {
  // Check for srt in PATH
  const result = spawnSync("which", ["srt"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.status === 0 && result.stdout?.trim()) {
    const srtPath = result.stdout.trim();
    log.debug(`srt found at: ${srtPath}`);
    return srtPath;
  }

  // Check common npm global install locations
  const npxResult = spawnSync("npx", ["--no", "srt", "--version"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 5000,
  });

  if (npxResult.status === 0) {
    log.debug("srt available via npx");
    return "npx srt";
  }

  log.debug("srt not found on macOS");
  return null;
}

/**
 * Check if sandbox-exec is available on macOS.
 * sandbox-exec is built into macOS, so it should always be present.
 */
export function checkDependencies(): { available: boolean; missing: string[] } {
  const missing: string[] = [];

  // sandbox-exec is built into macOS; verify it exists
  const result = spawnSync("which", ["sandbox-exec"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    missing.push("sandbox-exec (expected built-in on macOS)");
  }

  return {
    available: missing.length === 0,
    missing,
  };
}

/**
 * Build the srt command and arguments for running a command in a sandbox on macOS.
 *
 * The resulting command is: srt --settings <path> <command> [args...]
 * srt handles the macOS-specific sandbox-exec/Seatbelt profile generation internally.
 */
export function buildCommand(
  _config: SandboxConfig,
  settingsPath: string,
  command: string,
  args: string[]
): { cmd: string; args: string[] } {
  const srtArgs = ["--settings", settingsPath, command, ...args];

  return {
    cmd: "srt",
    args: srtArgs,
  };
}
