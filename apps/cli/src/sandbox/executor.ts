// =============================================================================
// Sandbox Executor
// =============================================================================
//
// Wraps spawn() with sandbox command prefixing. When sandbox is enabled and
// available, the agent command is prefixed with `srt --settings <path>`.
// When sandbox is not available, falls back to unsandboxed execution with a warning.
// =============================================================================

import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SandboxConfig, toSrtSettings } from "./config";
import { sandboxLoggers } from "./logger";
import { detectPlatform, getPlatformBackend, type PlatformInfo } from "./platforms";

const log = sandboxLoggers.executor;

// =============================================================================
// Types
// =============================================================================

export interface SandboxedSpawnOptions extends SpawnOptions {
  /** Override platform detection (for testing) */
  platformOverride?: PlatformInfo;
}

/**
 * A spawn function that wraps the command with sandbox isolation.
 * Has the same signature as node:child_process spawn, but prefixes
 * the command with srt when sandboxing is active.
 */
export type SandboxedSpawnFn = (command: string, args: string[], options?: SandboxedSpawnOptions) => ChildProcess;

// =============================================================================
// Settings File Management
// =============================================================================

let settingsCounter = 0;

/**
 * Write srt settings to a temporary file and return the path.
 */
function writeSettingsFile(config: SandboxConfig): string {
  const settings = toSrtSettings(config);
  const dir = join(tmpdir(), "bloom-sandbox");
  mkdirSync(dir, { recursive: true });

  const filename = `sandbox-${process.pid}-${++settingsCounter}.json`;
  const settingsPath = join(dir, filename);
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  log.debug(`Settings written to ${settingsPath}`);
  return settingsPath;
}

// =============================================================================
// Platform Detection Re-export
// =============================================================================

export { detectPlatform, type PlatformInfo } from "./platforms";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Passthrough spawn that delegates directly to node:child_process.spawn.
 */
const passthroughSpawn: SandboxedSpawnFn = (command, args, options) => spawn(command, args, options ?? {});

// =============================================================================
// Sandboxed Spawn Factory
// =============================================================================

/**
 * Create a spawn function that wraps commands with sandbox isolation.
 *
 * When sandbox is enabled and srt is available, the returned function will:
 * 1. Write the sandbox config as an srt settings file
 * 2. Prefix the command with `srt --settings <path>`
 * 3. Spawn the wrapped command
 *
 * When sandbox is not enabled or srt is not available, the returned function
 * spawns the command directly (unsandboxed).
 *
 * @returns An object with the spawn function and whether sandboxing is active
 */
export function createSandboxedSpawn(config: SandboxConfig): {
  spawn: SandboxedSpawnFn;
  sandboxed: boolean;
} {
  if (!config.enabled) {
    const platform = detectPlatform();
    const backend = getPlatformBackend(platform);
    const srtAvailable = backend ? backend.checkAvailability() !== null : false;

    if (srtAvailable) {
      log.debug("Sandbox is available but not enabled. Set sandbox.enabled=true in ~/.bloom/config.yaml to activate.");
    }

    return {
      spawn: passthroughSpawn,
      sandboxed: false,
    };
  }

  // Sandbox is enabled — check platform and availability
  const platform = detectPlatform();
  const backend = getPlatformBackend(platform);

  if (!backend) {
    log.warn(`Sandbox not supported on platform: ${platform.os}/${platform.arch}. Running unsandboxed.`);
    return {
      spawn: passthroughSpawn,
      sandboxed: false,
    };
  }

  // Check srt availability
  const srtPath = backend.checkAvailability();
  if (!srtPath) {
    log.warn("Sandbox enabled but srt is not installed. Running unsandboxed.");
    log.warn("Install srt: npm install -g @anthropic-ai/sandbox-runtime");
    return {
      spawn: passthroughSpawn,
      sandboxed: false,
    };
  }

  // Check platform-specific dependencies
  const deps = backend.checkDependencies();
  if (!deps.available) {
    log.warn(`Sandbox dependencies missing: ${deps.missing.join(", ")}. Running unsandboxed.`);
    return {
      spawn: passthroughSpawn,
      sandboxed: false,
    };
  }

  // Write settings file once (reused for all spawns from this factory)
  const settingsPath = writeSettingsFile(config);

  log.info(`Sandbox active: platform=${platform.os}, settings=${settingsPath}`);

  const sandboxedSpawn: SandboxedSpawnFn = (command, args, options) => {
    const { cmd, args: sandboxArgs } = backend.buildCommand(config, settingsPath, command, args);

    log.debug(`Spawning sandboxed: ${cmd} ${sandboxArgs.join(" ")}`);

    return spawn(cmd, sandboxArgs, options ?? {});
  };

  return {
    spawn: sandboxedSpawn,
    sandboxed: true,
  };
}
