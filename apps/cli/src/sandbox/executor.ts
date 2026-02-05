// =============================================================================
// Sandbox Executor
// =============================================================================
//
// Wraps spawn() with sandbox isolation using @anthropic-ai/sandbox-runtime.
// When sandbox is enabled and the library is available, the agent command is
// wrapped via SandboxManager.wrapWithSandbox(). When the library is not
// available, falls back to unsandboxed execution with a warning.
// =============================================================================

import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import { type SandboxConfig, toSandboxRuntimeConfig } from "./config";
import { sandboxLoggers } from "./logger";

const log = sandboxLoggers.executor;

// =============================================================================
// Types
// =============================================================================

/**
 * A spawn function that wraps the command with sandbox isolation.
 * Returns a Promise<ChildProcess> because sandbox wrapping is async.
 */
export type SandboxedSpawnFn = (command: string, args: string[], options?: SpawnOptions) => Promise<ChildProcess>;

// =============================================================================
// Shell Escaping
// =============================================================================

/**
 * Escape a string for safe inclusion in a shell command.
 * Wraps in single quotes and escapes any embedded single quotes.
 */
function shellEscape(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Passthrough spawn that delegates directly to node:child_process.spawn.
 * Wrapped in a Promise for type compatibility with SandboxedSpawnFn.
 */
const passthroughSpawn: SandboxedSpawnFn = async (command, args, options) => spawn(command, args, options ?? {});

// =============================================================================
// Sandboxed Spawn Factory
// =============================================================================

/**
 * Create a spawn function that wraps commands with sandbox isolation.
 *
 * When sandbox is enabled and @anthropic-ai/sandbox-runtime is available,
 * the returned function will:
 * 1. Initialize the SandboxManager with the resolved config
 * 2. Per-spawn: build a command string and call SandboxManager.wrapWithSandbox()
 * 3. Spawn the wrapped command via `sh -c`
 *
 * When sandbox is not enabled or the library is not available, the returned
 * function spawns the command directly (unsandboxed).
 *
 * @returns An object with the spawn function and whether sandboxing is active
 */
export async function createSandboxedSpawn(config: SandboxConfig): Promise<{
  spawn: SandboxedSpawnFn;
  sandboxed: boolean;
}> {
  if (!config.enabled) {
    log.debug("Sandbox not enabled, using passthrough spawn");
    return {
      spawn: passthroughSpawn,
      sandboxed: false,
    };
  }

  // Sandbox is enabled — try to load the library
  let SandboxManager: typeof import("@anthropic-ai/sandbox-runtime").SandboxManager;

  try {
    const lib = await import("@anthropic-ai/sandbox-runtime");
    SandboxManager = lib.SandboxManager;
  } catch {
    log.warn("Sandbox enabled but @anthropic-ai/sandbox-runtime is not installed. Running unsandboxed.");
    log.warn("Install: npm install -g @anthropic-ai/sandbox-runtime");
    return {
      spawn: passthroughSpawn,
      sandboxed: false,
    };
  }

  // Check platform support
  if (!SandboxManager.isSupportedPlatform()) {
    log.warn("Sandbox not supported on this platform. Running unsandboxed.");
    return {
      spawn: passthroughSpawn,
      sandboxed: false,
    };
  }

  // Check dependencies (bubblewrap, socat on Linux; sandbox-exec on macOS)
  try {
    await SandboxManager.checkDependencies();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Sandbox dependencies missing: ${msg}. Running unsandboxed.`);
    return {
      spawn: passthroughSpawn,
      sandboxed: false,
    };
  }

  // Initialize the sandbox manager with our config
  const runtimeConfig = toSandboxRuntimeConfig(config);
  try {
    await SandboxManager.initialize(runtimeConfig);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Sandbox initialization failed: ${msg}. Running unsandboxed.`);
    return {
      spawn: passthroughSpawn,
      sandboxed: false,
    };
  }

  log.info(`Sandbox active: workspace=${config.workspacePath}`);

  const sandboxedSpawn: SandboxedSpawnFn = async (command, args, options) => {
    // Build the full command string with proper escaping
    const fullCmd = [command, ...args].map(shellEscape).join(" ");

    log.debug(`Wrapping command: ${fullCmd}`);

    const wrappedCmd = await SandboxManager.wrapWithSandbox(fullCmd);

    log.debug(`Spawning sandboxed: sh -c ${wrappedCmd}`);

    return spawn("sh", ["-c", wrappedCmd], options ?? {});
  };

  return {
    spawn: sandboxedSpawn,
    sandboxed: true,
  };
}
