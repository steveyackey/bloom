// =============================================================================
// Sandbox Module - Public API
// =============================================================================
//
// Provides sandboxed process execution for agent isolation using
// @anthropic-ai/sandbox-runtime. Supports Linux (bubblewrap + socat) and
// macOS (sandbox-exec) platforms via the library's built-in detection.
//
// Usage:
//   import { createSandboxedSpawn, resolveConfig } from "../sandbox";
//
//   const config = resolveConfig("/path/to/workspace", { enabled: true });
//   const { spawn, sandboxed } = await createSandboxedSpawn(config);
//   const proc = await spawn("claude", ["--print", ...], { cwd: workspace });
// =============================================================================

// Config types and resolution
export type { NetworkPolicy, SandboxConfig, SandboxRuntimeConfigCompat } from "./config";
export { getDefaultConfig, resolveConfig, toSandboxRuntimeConfig } from "./config";

// Executor
export type { SandboxedSpawnFn } from "./executor";
export { createSandboxedSpawn } from "./executor";
// Lifecycle logging
export type {
  FilesystemViolation,
  NetworkViolation,
  PolicyViolation,
  PolicyViolationEvent,
  PolicyViolationType,
  SandboxStartEvent,
  SandboxStopEvent,
} from "./logger";
export {
  createStartEvent,
  createStopEvent,
  getAgentSandboxLogger,
  logPolicyViolation,
  logSandboxCommand,
  logSandboxStart,
  logSandboxStop,
  parseViolationsFromOutput,
  sandboxLogger,
  sandboxLoggers,
} from "./logger";
// Sandbox manager for multi-agent lifecycle
export type { SandboxInstance, SandboxManagerStats } from "./manager";
export { getDefaultSandboxManager, SandboxManager } from "./manager";
