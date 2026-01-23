// =============================================================================
// Agent Providers - Re-exports
// =============================================================================

// Agent capability registry
export type { AgentCapabilities, AgentCapabilityName, AgentName } from "./capabilities";
export {
  agentCapabilities,
  getAgentCapabilities,
  getRegisteredAgentNames,
  hasCapability,
  isValidAgentName,
} from "./capabilities";
export type { ClaudeProviderOptions, RunningSession, StreamEvent } from "./claude";
// Claude provider with session management utilities
export { ClaudeAgentProvider, getActiveSession, interjectSession } from "./claude";
// Codex provider with session management and fork utilities
export type {
  CodexApprovalMode,
  CodexProviderOptions,
  CodexRunningSession,
  CodexStreamEvent,
  ForkResult,
} from "./codex";
export { CodexAgentProvider, forkCodexSession, getActiveCodexSession, interjectCodexSession } from "./codex";
// Core interface and types
export * from "./core";
// Agent factory
export { type AgentMode, createAgent, getRegisteredAgents, isAgentRegistered } from "./factory";
export type { OpenCodeProviderOptions } from "./opencode";
// OpenCode provider
export { OpenCodeAgentProvider } from "./opencode";
