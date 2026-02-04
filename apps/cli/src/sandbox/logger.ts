// =============================================================================
// Sandbox Lifecycle Event Logging
// =============================================================================
//
// Provides structured logging for sandbox lifecycle events using Bloom's
// existing logger infrastructure. Logs sandbox start/stop events and policy
// violations with consistent formatting.
//
// Log levels:
// - info: Sandbox start/stop events
// - warn: Policy violations (blocked filesystem access, blocked network requests)
// - debug: Detailed sandbox command construction
// =============================================================================

import { createLogger, type Logger } from "../infra/logger";
import type { NetworkPolicy, SandboxConfig } from "./config";

// =============================================================================
// Logger Setup
// =============================================================================

export const sandboxLogger = createLogger("sandbox");

export const sandboxLoggers = {
  config: sandboxLogger.child("config"),
  executor: sandboxLogger.child("executor"),
  platform: sandboxLogger.child("platform"),
  lifecycle: sandboxLogger.child("lifecycle"),
  violations: sandboxLogger.child("violations"),
};

// =============================================================================
// Types
// =============================================================================

/**
 * Data logged when a sandbox starts.
 */
export interface SandboxStartEvent {
  /** Name of the agent running in the sandbox */
  agentName: string;
  /** Workspace path the sandbox operates in */
  workspacePath: string;
  /** Network policy applied to the sandbox */
  networkPolicy: NetworkPolicy;
  /** Whether sandbox is actually active (srt available and enabled) */
  sandboxed: boolean;
  /** Version of the sandbox tool (srt), if available */
  srtVersion?: string;
  /** Additional writable paths configured */
  writablePaths: string[];
  /** Paths denied read access */
  denyReadPaths: string[];
}

/**
 * Data logged when a sandbox stops.
 */
export interface SandboxStopEvent {
  /** Name of the agent that was running */
  agentName: string;
  /** Exit code of the sandboxed process (null if killed) */
  exitCode: number | null;
  /** Duration in milliseconds the sandbox was active */
  durationMs: number;
  /** Whether the process was killed (SIGTERM/SIGKILL) */
  killed: boolean;
}

/**
 * Types of policy violations that can be logged.
 */
export type PolicyViolationType = "filesystem" | "network";

/**
 * A blocked filesystem access attempt.
 */
export interface FilesystemViolation {
  type: "filesystem";
  /** The path that was blocked */
  path: string;
  /** The operation that was attempted (read, write, execute) */
  operation: "read" | "write" | "execute";
  /** Why the access was blocked */
  reason: string;
}

/**
 * A blocked network request.
 */
export interface NetworkViolation {
  type: "network";
  /** Destination host that was blocked */
  host: string;
  /** Destination port (if available) */
  port?: number;
  /** Protocol (tcp, udp, etc.) */
  protocol?: string;
  /** Why the request was blocked */
  reason: string;
}

export type PolicyViolation = FilesystemViolation | NetworkViolation;

/**
 * Event logged when a policy violation occurs.
 */
export interface PolicyViolationEvent {
  /** Name of the agent that triggered the violation */
  agentName: string;
  /** The violation details */
  violation: PolicyViolation;
  /** Timestamp when the violation occurred */
  timestamp: number;
}

// =============================================================================
// Logging Functions
// =============================================================================

const lifecycleLog = sandboxLoggers.lifecycle;
const violationsLog = sandboxLoggers.violations;

/**
 * Log a sandbox start event.
 *
 * Uses info level for the main message, debug level for detailed config.
 *
 * @param event - The sandbox start event data
 */
export function logSandboxStart(event: SandboxStartEvent): void {
  const { agentName, workspacePath, networkPolicy, sandboxed, srtVersion } = event;

  // Main start message at info level
  lifecycleLog.info(
    `Sandbox started for agent "${agentName}": ` +
      `sandboxed=${sandboxed}, workspace=${workspacePath}, network=${networkPolicy}` +
      (srtVersion ? `, srt=${srtVersion}` : "")
  );

  // Detailed config at debug level
  lifecycleLog.debug(`Sandbox config for "${agentName}":`, {
    workspacePath,
    networkPolicy,
    sandboxed,
    srtVersion,
    writablePaths: event.writablePaths,
    denyReadPaths: event.denyReadPaths,
  });
}

/**
 * Log a sandbox stop event.
 *
 * Uses info level for normal exits, warn level for abnormal exits.
 *
 * @param event - The sandbox stop event data
 */
export function logSandboxStop(event: SandboxStopEvent): void {
  const { agentName, exitCode, durationMs, killed } = event;
  const durationSec = (durationMs / 1000).toFixed(2);

  if (killed) {
    lifecycleLog.warn(`Sandbox stopped for agent "${agentName}": killed=true, duration=${durationSec}s`);
  } else if (exitCode !== 0 && exitCode !== null) {
    lifecycleLog.warn(`Sandbox stopped for agent "${agentName}": exitCode=${exitCode}, duration=${durationSec}s`);
  } else {
    lifecycleLog.info(
      `Sandbox stopped for agent "${agentName}": exitCode=${exitCode ?? "null"}, duration=${durationSec}s`
    );
  }
}

/**
 * Log a policy violation.
 *
 * Uses warn level for all violations.
 *
 * @param event - The policy violation event data
 */
export function logPolicyViolation(event: PolicyViolationEvent): void {
  const { agentName, violation } = event;

  if (violation.type === "filesystem") {
    violationsLog.warn(
      `Filesystem access blocked for agent "${agentName}": ` +
        `path=${violation.path}, operation=${violation.operation}, reason=${violation.reason}`
    );
  } else if (violation.type === "network") {
    const portStr = violation.port !== undefined ? `:${violation.port}` : "";
    const protoStr = violation.protocol ? ` (${violation.protocol})` : "";
    violationsLog.warn(
      `Network request blocked for agent "${agentName}": ` +
        `host=${violation.host}${portStr}${protoStr}, reason=${violation.reason}`
    );
  }
}

/**
 * Log detailed sandbox command construction at debug level.
 *
 * @param agentName - Name of the agent
 * @param command - The command being wrapped
 * @param args - Command arguments
 * @param sandboxCmd - The final sandboxed command
 * @param sandboxArgs - The final sandboxed arguments
 */
export function logSandboxCommand(
  agentName: string,
  command: string,
  args: string[],
  sandboxCmd: string,
  sandboxArgs: string[]
): void {
  sandboxLoggers.executor.debug(
    `Building sandbox command for agent "${agentName}": ` + `original=${command} ${args.join(" ")}`
  );
  sandboxLoggers.executor.debug(
    `Sandboxed command for agent "${agentName}": ` + `${sandboxCmd} ${sandboxArgs.join(" ")}`
  );
}

// =============================================================================
// Violation Parsing
// =============================================================================

/**
 * Parse sandbox tool (srt) output for policy violations.
 *
 * srt reports violations in its stderr output. This function parses
 * common violation patterns and returns structured violation events.
 *
 * @param agentName - Name of the agent
 * @param output - The stderr output from srt
 * @returns Array of parsed policy violation events
 */
export function parseViolationsFromOutput(agentName: string, output: string): PolicyViolationEvent[] {
  const violations: PolicyViolationEvent[] = [];
  const timestamp = Date.now();

  // Parse filesystem violations
  // Example srt output: "BLOCKED: read access to /etc/passwd"
  const fsBlockedRegex = /BLOCKED:\s*(read|write|execute)\s*access\s*to\s*(.+)/gi;
  let fsMatch = fsBlockedRegex.exec(output);

  while (fsMatch !== null) {
    violations.push({
      agentName,
      timestamp,
      violation: {
        type: "filesystem",
        operation: fsMatch[1]!.toLowerCase() as "read" | "write" | "execute",
        path: fsMatch[2]!.trim(),
        reason: "Policy denied access",
      },
    });
    fsMatch = fsBlockedRegex.exec(output);
  }

  // Parse network violations
  // Example srt output: "BLOCKED: network connection to github.com:443"
  const netBlockedRegex = /BLOCKED:\s*network\s*(?:connection|request)\s*to\s*([^:\s]+)(?::(\d+))?(?:\s*\((\w+)\))?/gi;
  let netMatch = netBlockedRegex.exec(output);

  while (netMatch !== null) {
    violations.push({
      agentName,
      timestamp,
      violation: {
        type: "network",
        host: netMatch[1]!.trim(),
        port: netMatch[2] ? parseInt(netMatch[2], 10) : undefined,
        protocol: netMatch[3] || undefined,
        reason: "Policy denied network access",
      },
    });
    netMatch = netBlockedRegex.exec(output);
  }

  return violations;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a sandbox start event from a SandboxConfig.
 *
 * @param agentName - Name of the agent
 * @param config - The sandbox configuration
 * @param sandboxed - Whether the sandbox is actually active
 * @param srtVersion - Optional srt version string
 * @returns A SandboxStartEvent
 */
export function createStartEvent(
  agentName: string,
  config: SandboxConfig,
  sandboxed: boolean,
  srtVersion?: string
): SandboxStartEvent {
  return {
    agentName,
    workspacePath: config.workspacePath,
    networkPolicy: config.networkPolicy,
    sandboxed,
    srtVersion,
    writablePaths: config.writablePaths,
    denyReadPaths: config.denyReadPaths,
  };
}

/**
 * Create a sandbox stop event.
 *
 * @param agentName - Name of the agent
 * @param exitCode - Exit code of the process
 * @param startTime - When the sandbox started (Date.now() value)
 * @param killed - Whether the process was killed
 * @returns A SandboxStopEvent
 */
export function createStopEvent(
  agentName: string,
  exitCode: number | null,
  startTime: number,
  killed: boolean
): SandboxStopEvent {
  return {
    agentName,
    exitCode,
    durationMs: Date.now() - startTime,
    killed,
  };
}

/**
 * Get a child logger for a specific agent's sandbox.
 *
 * @param agentName - Name of the agent
 * @returns A logger with the agent name in the context
 */
export function getAgentSandboxLogger(agentName: string): Logger {
  return sandboxLogger.child(agentName);
}
