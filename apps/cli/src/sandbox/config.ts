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
 * Maps to srt's JSON settings format:
 * - filesystem.allowWrite → writablePaths
 * - filesystem.denyRead → denyReadPaths
 * - network.allowedDomains → allowedDomains (when networkPolicy is "allow-list")
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

/**
 * Generate the srt settings JSON object from a SandboxConfig.
 *
 * srt expects a settings file with this structure:
 * {
 *   "filesystem": { "denyRead": [...], "allowWrite": [...] },
 *   "network": { "allowedDomains": [...] }
 * }
 */
export function toSrtSettings(config: SandboxConfig): SrtSettings {
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
      // srt doesn't have a "disable network filtering" mode,
      // but an empty config with no --unshare-net flag would work.
      // For now, allow everything by using a wildcard-like approach.
      // The platform backend handles this case.
      allowedDomains = [];
      break;
    case "monitor":
      // Future: same as disabled but with logging
      allowedDomains = [];
      break;
  }

  return {
    filesystem: {
      denyRead: [...config.denyReadPaths],
      allowWrite,
    },
    network: {
      allowedDomains,
    },
  };
}

// =============================================================================
// srt Settings Type
// =============================================================================

export interface SrtSettings {
  filesystem: {
    denyRead: string[];
    allowWrite: string[];
  };
  network: {
    allowedDomains: string[];
  };
}
