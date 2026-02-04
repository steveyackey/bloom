// =============================================================================
// Linux Platform Backend
// =============================================================================
//
// Translates SandboxConfig into srt CLI flags for Linux.
// Linux uses bubblewrap + socat for isolation (via srt).
// =============================================================================

import { spawnSync } from "node:child_process";
import type { SandboxConfig } from "../config";
import { sandboxLoggers } from "../logger";

const log = sandboxLoggers.platform;

/**
 * Check if srt is available on this Linux system.
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

  log.debug("srt not found on Linux");
  return null;
}

/**
 * Check if bubblewrap (bwrap) is available, which srt requires on Linux.
 */
export function checkDependencies(): { available: boolean; missing: string[] } {
  const missing: string[] = [];

  const bwrapResult = spawnSync("which", ["bwrap"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (bwrapResult.status !== 0) {
    missing.push("bubblewrap (bwrap)");
  }

  const socatResult = spawnSync("which", ["socat"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (socatResult.status !== 0) {
    missing.push("socat");
  }

  return {
    available: missing.length === 0,
    missing,
  };
}

/**
 * Build the srt command and arguments for running a command in a sandbox on Linux.
 *
 * The resulting command is: srt --settings <path> <command> [args...]
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
