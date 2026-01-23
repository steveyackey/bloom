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

// Claude provider with session management utilities
export type { ClaudeProviderOptions, RunningSession, StreamEvent } from "./claude";
export { ClaudeAgentProvider, getActiveSession, interjectSession } from "./claude";

// Cline provider with session management utilities
export type { ClineMode, ClineProviderOptions, ClineRunningSession, ClineStreamEvent } from "./cline";
export { ClineAgentProvider, getActiveClineSession, interjectClineSession } from "./cline";

// Codex provider with session management and fork utilities
export type {
  CodexApprovalMode,
  CodexProviderOptions,
  CodexRunningSession,
  CodexStreamEvent,
  ForkResult,
} from "./codex";
export { CodexAgentProvider, forkCodexSession, getActiveCodexSession, interjectCodexSession } from "./codex";

// Copilot provider with session management utilities
export type { CopilotProviderOptions, CopilotRunningSession, CopilotStreamEvent } from "./copilot";
export { CopilotAgentProvider, getCopilotActiveSession, interjectCopilotSession } from "./copilot";
// Core interface and types
export * from "./core";
// Agent factory
export {
  type AgentMode,
  createAgent,
  createAgentByName,
  getAgentCapabilities as getAgentCapabilitiesFromFactory,
  getRegisteredAgents,
  isAgentRegistered,
  listAvailableAgents,
} from "./factory";
// OpenCode provider
export type { OpenCodeProviderOptions } from "./opencode";
export { OpenCodeAgentProvider } from "./opencode";
