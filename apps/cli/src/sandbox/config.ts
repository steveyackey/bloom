// =============================================================================
// Sandbox Configuration Resolution
// =============================================================================
//
// Merges default sandbox config with user-provided overrides.
// Default policy: sandbox disabled, deny-all network, no extra mounts.
// =============================================================================

import { sandboxLoggers } from "./logger";

const log = sandboxLoggers.config;

// =============================================================================
// Types
// =============================================================================

/**
 * Network policy for the sandbox.
 * - "deny-all": No network access (default)
 * - "allow-list": Only specified domains are reachable
 * - "monitor": Network is available but logged (future)
 * - "disabled": No network restrictions
 */
export type NetworkPolicy = "deny-all" | "allow-list" | "monitor" | "disabled";

/**
 * Sandbox configuration controlling isolation behavior.
 *
 * Maps to @anthropic-ai/sandbox-runtime's SandboxRuntimeConfig:
 * - filesystem.allowWrite -> writablePaths + workspacePath
 * - filesystem.denyRead -> denyReadPaths
 * - network.allowedDomains -> allowedDomains (when networkPolicy is "allow-list")
 * - network.deniedDomains -> [] (reserved for future use)
 * - filesystem.denyWrite -> [] (reserved for future use)
 */
export interface SandboxConfig {
  /** Whether sandboxing is active. Default: false */
  enabled: boolean;

  /** Workspace path the agent operates in (always writable) */
  workspacePath: string;

  /** Network policy. Default: "deny-all" */
  networkPolicy: NetworkPolicy;

  /** Domains to allow when networkPolicy is "allow-list" */
  allowedDomains: string[];

  /** Additional filesystem paths to mount as writable */
  writablePaths: string[];

  /** Filesystem paths to deny read access to */
  denyReadPaths: string[];

  /** Maximum number of processes (0 = no limit). Reserved for future use. */
  processLimit: number;
}

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_DENY_READ_PATHS = ["~/.ssh", "~/.aws", "~/.gnupg"];

export function getDefaultConfig(workspacePath: string): SandboxConfig {
  return {
    enabled: false,
    workspacePath,
    networkPolicy: "deny-all",
    allowedDomains: [],
    writablePaths: [],
    denyReadPaths: [...DEFAULT_DENY_READ_PATHS],
    processLimit: 0,
  };
}

// =============================================================================
// Resolution
// =============================================================================

/**
 * Merge default sandbox config with user-provided overrides.
 *
 * User overrides are applied on top of defaults. Array fields (allowedDomains,
 * writablePaths, denyReadPaths) are replaced, not merged, to give the user
 * full control over the final list.
 */
export function resolveConfig(workspacePath: string, overrides?: Partial<SandboxConfig>): SandboxConfig {
  const defaults = getDefaultConfig(workspacePath);

  if (!overrides) {
    log.debug("No overrides provided, using defaults");
    return defaults;
  }

  const resolved: SandboxConfig = {
    enabled: overrides.enabled ?? defaults.enabled,
    workspacePath: overrides.workspacePath ?? defaults.workspacePath,
    networkPolicy: overrides.networkPolicy ?? defaults.networkPolicy,
    allowedDomains: overrides.allowedDomains ?? defaults.allowedDomains,
    writablePaths: overrides.writablePaths ?? defaults.writablePaths,
    denyReadPaths: overrides.denyReadPaths ?? defaults.denyReadPaths,
    processLimit: overrides.processLimit ?? defaults.processLimit,
  };

  log.debug(
    `Resolved config: enabled=${resolved.enabled}, network=${resolved.networkPolicy}, ` +
      `writablePaths=${resolved.writablePaths.length}, denyRead=${resolved.denyReadPaths.length}`
  );

  return resolved;
}

// =============================================================================
// Library-Compatible Config
// =============================================================================

/**
 * Shape-compatible with @anthropic-ai/sandbox-runtime's SandboxRuntimeConfig.
 * Defined locally to avoid requiring the library at type-check time.
 */
export interface SandboxRuntimeConfigCompat {
  filesystem?: {
    denyRead?: string[];
    allowWrite?: string[];
    denyWrite?: string[];
  };
  network?: {
    allowedDomains?: string[];
    deniedDomains?: string[];
  };
}

/**
 * Convert a SandboxConfig to the library's SandboxRuntimeConfig shape.
 *
 * This replaces the old toSrtSettings() function. Instead of writing
 * JSON to a temp file for the CLI, we pass this config object directly
 * to SandboxManager.initialize().
 */
export function toSandboxRuntimeConfig(config: SandboxConfig): SandboxRuntimeConfigCompat {
  const allowWrite = [config.workspacePath, ...config.writablePaths];

  let allowedDomains: string[];
  switch (config.networkPolicy) {
    case "deny-all":
      allowedDomains = [];
      break;
    case "allow-list":
      allowedDomains = [...config.allowedDomains];
      break;
    case "disabled":
      // Empty allowedDomains with no network restrictions.
      // The library treats undefined network config as unrestricted.
      allowedDomains = [];
      break;
    case "monitor":
      // Future: same as disabled but with logging
      allowedDomains = [];
      break;
  }

  const result: SandboxRuntimeConfigCompat = {
    filesystem: {
      denyRead: [...config.denyReadPaths],
      allowWrite,
      denyWrite: [],
    },
    network: {
      allowedDomains,
      deniedDomains: [],
    },
  };

  // For "disabled" network policy, omit network config entirely
  // so the library doesn't apply any network restrictions
  if (config.networkPolicy === "disabled" || config.networkPolicy === "monitor") {
    result.network = undefined;
  }

  return result;
}
