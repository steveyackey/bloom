// =============================================================================
// Sandbox Module - Public API
// =============================================================================
//
// Provides sandboxed process execution for agent isolation using srt
// (Anthropic sandbox-runtime). Supports Linux (bubblewrap + socat) and
// macOS (sandbox-exec) platforms.
//
// Usage:
//   import { createSandboxedSpawn, resolveConfig } from "../sandbox";
//
//   const config = resolveConfig("/path/to/workspace", { enabled: true });
//   const { spawn, sandboxed } = createSandboxedSpawn(config);
//   const proc = spawn("claude", ["--print", ...], { cwd: workspace });
// =============================================================================

// Config types and resolution
export type { NetworkPolicy, SandboxConfig, SrtSettings } from "./config";
export { getDefaultConfig, resolveConfig, toSrtSettings } from "./config";

// Executor
export type { SandboxedSpawnFn, SandboxedSpawnOptions } from "./executor";
export { createSandboxedSpawn } from "./executor";
// Sandbox manager for multi-agent lifecycle
export type { SandboxInstance, SandboxManagerStats } from "./manager";
export { cleanupSandboxTempFiles, getDefaultSandboxManager, SandboxManager } from "./manager";
// Platform detection
export type { PlatformBackend, PlatformInfo } from "./platforms";
export { detectPlatform, getPlatformBackend } from "./platforms";
