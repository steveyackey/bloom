// =============================================================================
// Agent Providers - Re-exports
// =============================================================================

// Agent availability checking
export type { AgentAvailability } from "./availability";
export {
  checkAgentAvailability,
  checkAllAgentsAvailability,
  getAgentDefaultModel,
  getAgentModels,
} from "./availability";
// Agent registry
export type { AgentName } from "./capabilities";
export { getRegisteredAgentNames, isValidAgentName, REGISTERED_AGENTS } from "./capabilities";

// Claude provider with session management utilities
export type { ClaudeProviderOptions, RunningSession, StreamEvent } from "./claude";
export { ClaudeAgentProvider, getActiveSession, interjectSession } from "./claude";

// Codex provider with session management and fork utilities
export type {
  CodexApprovalPolicy,
  CodexProviderOptions,
  CodexRunningSession,
  CodexSandboxMode,
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
  getRegisteredAgents,
  isAgentRegistered,
  listAvailableAgents,
} from "./factory";
// Goose provider with session management utilities
export type { GooseProviderOptions, GooseRunningSession, GooseStreamEvent } from "./goose";
export { GooseAgentProvider, getActiveGooseSession, interjectGooseSession } from "./goose";
// OpenCode provider
export type { OpenCodeProviderOptions } from "./opencode";
export { OpenCodeAgentProvider } from "./opencode";
