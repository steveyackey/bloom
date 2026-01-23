// =============================================================================
// Agent Providers - Re-exports
// =============================================================================

// Core interface and types
export * from "./core";

// Claude provider with session management utilities
export { ClaudeAgentProvider, getActiveSession, interjectSession } from "./claude";
export type { ClaudeProviderOptions, RunningSession, StreamEvent } from "./claude";

// OpenCode provider
export { OpenCodeAgentProvider } from "./opencode";
export type { OpenCodeProviderOptions } from "./opencode";
