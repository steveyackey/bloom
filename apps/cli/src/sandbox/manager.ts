// =============================================================================
// Sandbox Manager
// =============================================================================
//
// Manages sandbox instances for multiple concurrent agents. Each agent gets
// its own isolated sandbox instance with independent configuration and
// lifecycle management.
//
// Responsibilities:
// - Creates and tracks per-agent sandbox instances
// - Ensures cleanup on normal exit, crashes, and signals (SIGTERM, SIGINT)
// - Provides resource usage tracking for concurrent sandboxes
// =============================================================================

import type { ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig, type SandboxConfig } from "./config";
import { createSandboxedSpawn, type SandboxedSpawnFn } from "./executor";
import { sandboxLoggers } from "./logger";

const log = sandboxLoggers.executor;

// =============================================================================
// Types
// =============================================================================

export interface SandboxInstance {
  /** Unique agent identifier */
  agentName: string;
  /** Sandbox configuration for this agent */
  config: SandboxConfig;
  /** The sandboxed spawn function */
  spawn: SandboxedSpawnFn;
  /** Whether the sandbox is actually active (srt available) */
  sandboxed: boolean;
  /** Tracked child processes spawned through this instance */
  processes: Set<ChildProcess>;
  /** When this instance was created */
  createdAt: number;
}

export interface SandboxManagerStats {
  /** Number of active sandbox instances */
  activeInstances: number;
  /** Number of tracked child processes across all instances */
  activeProcesses: number;
  /** Agent names with active instances */
  agents: string[];
}

// =============================================================================
// Sandbox Manager
// =============================================================================

export class SandboxManager {
  private instances = new Map<string, SandboxInstance>();
  private cleanupRegistered = false;

  /**
   * Create a sandbox instance for an agent. Each agent gets its own
   * isolated sandbox with independent configuration.
   *
   * If an instance already exists for this agent, it is cleaned up first.
   */
  createInstance(agentName: string, workspacePath: string, overrides?: Partial<SandboxConfig>): SandboxInstance {
    // Clean up existing instance for this agent if present
    if (this.instances.has(agentName)) {
      log.debug(`Replacing existing sandbox instance for agent: ${agentName}`);
      this.destroyInstance(agentName);
    }

    const config = resolveConfig(workspacePath, overrides);
    const { spawn: rawSpawn, sandboxed } = createSandboxedSpawn(config);

    // Wrap spawn to track child processes for cleanup
    const instance: SandboxInstance = {
      agentName,
      config,
      spawn: () => {
        throw new Error("not initialized");
      },
      sandboxed,
      processes: new Set(),
      createdAt: Date.now(),
    };

    const trackedSpawn: SandboxedSpawnFn = (command, args, options) => {
      const proc = rawSpawn(command, args, options);
      instance.processes.add(proc);

      // Auto-remove from tracking when process exits
      const cleanup = () => {
        instance.processes.delete(proc);
      };
      proc.on("close", cleanup);
      proc.on("error", cleanup);

      return proc;
    };

    instance.spawn = trackedSpawn;
    this.instances.set(agentName, instance);

    // Register process cleanup handlers on first instance creation
    if (!this.cleanupRegistered) {
      this.registerCleanupHandlers();
    }

    log.info(
      `Created sandbox instance for agent "${agentName}": ` + `sandboxed=${sandboxed}, workspace=${workspacePath}`
    );

    return instance;
  }

  /**
   * Get an existing sandbox instance for an agent.
   */
  getInstance(agentName: string): SandboxInstance | undefined {
    return this.instances.get(agentName);
  }

  /**
   * Destroy a sandbox instance, killing all tracked processes.
   */
  destroyInstance(agentName: string): boolean {
    const instance = this.instances.get(agentName);
    if (!instance) {
      return false;
    }

    this.cleanupInstance(instance);
    this.instances.delete(agentName);
    log.info(`Destroyed sandbox instance for agent "${agentName}"`);
    return true;
  }

  /**
   * Destroy all sandbox instances and kill all tracked processes.
   */
  destroyAll(): void {
    if (this.instances.size === 0) return;

    log.info(`Destroying all ${this.instances.size} sandbox instances`);
    for (const instance of this.instances.values()) {
      this.cleanupInstance(instance);
    }
    this.instances.clear();
  }

  /**
   * Get statistics about active sandbox instances.
   */
  getStats(): SandboxManagerStats {
    let activeProcesses = 0;
    const agents: string[] = [];

    for (const [name, instance] of this.instances) {
      agents.push(name);
      activeProcesses += instance.processes.size;
    }

    return {
      activeInstances: this.instances.size,
      activeProcesses,
      agents,
    };
  }

  /**
   * Check if a specific agent has an active sandbox instance.
   */
  hasInstance(agentName: string): boolean {
    return this.instances.has(agentName);
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private cleanupInstance(instance: SandboxInstance): void {
    for (const proc of instance.processes) {
      try {
        if (!proc.killed && proc.exitCode === null) {
          proc.kill("SIGTERM");
          // Give process a moment to clean up, then force kill
          setTimeout(() => {
            try {
              if (!proc.killed && proc.exitCode === null) {
                proc.kill("SIGKILL");
              }
            } catch {
              // Process already exited
            }
          }, 5000);
        }
      } catch {
        // Process already exited
      }
    }
    instance.processes.clear();
  }

  private registerCleanupHandlers(): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;

    const cleanup = (signal: string) => {
      log.info(`Received ${signal}, cleaning up ${this.instances.size} sandbox instances`);
      this.destroyAll();
    };

    // Handle graceful shutdown signals
    process.on("SIGTERM", () => {
      cleanup("SIGTERM");
      // Re-raise to allow default handler
      process.exit(128 + 15);
    });

    process.on("SIGINT", () => {
      cleanup("SIGINT");
      // Re-raise to allow default handler
      process.exit(128 + 2);
    });

    // Handle uncaught exceptions - clean up before crashing
    process.on("uncaughtException", (err) => {
      log.error(`Uncaught exception, cleaning up sandboxes: ${err.message}`);
      cleanup("uncaughtException");
      // Re-throw to preserve default behavior
      throw err;
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason) => {
      log.error(`Unhandled rejection, cleaning up sandboxes: ${reason}`);
      cleanup("unhandledRejection");
    });

    // Handle normal process exit
    process.on("beforeExit", () => {
      cleanup("beforeExit");
    });
  }
}

// =============================================================================
// Singleton
// =============================================================================

let defaultManager: SandboxManager | undefined;

/**
 * Get the default SandboxManager singleton.
 * Use this for production; tests should create their own instances.
 */
export function getDefaultSandboxManager(): SandboxManager {
  if (!defaultManager) {
    defaultManager = new SandboxManager();
  }
  return defaultManager;
}

/**
 * Clean up sandbox temp files from /tmp/bloom-sandbox/.
 * Called during graceful shutdown.
 */
export function cleanupSandboxTempFiles(): void {
  try {
    const dir = join(tmpdir(), "bloom-sandbox");
    rmSync(dir, { recursive: true, force: true });
    log.debug("Cleaned up sandbox temp directory");
  } catch {
    // Temp dir may not exist or be already cleaned
  }
}
