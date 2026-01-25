// =============================================================================
// Agent Providers - Re-exports
// =============================================================================

// Agent availability checking
export type { AgentAvailability } from "./availability";
export {
  checkAgentAvailability as checkAgentAvailabilityLegacy,
  checkAllAgentsAvailability,
  getAgentDefaultModel,
  getAgentModels,
} from "./availability";
// Built-in agents
export { BUILTIN_AGENTS, getBuiltinAgent, getBuiltinAgentNames } from "./builtin-agents";
// Agent registry types (backward compatibility)
export type { AgentName, BuiltinAgentName } from "./capabilities";
export { REGISTERED_AGENTS } from "./capabilities";
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
// Generic provider for custom agents
export type { GenericProviderOptions, GenericRunningSession } from "./generic-provider";
export { GenericAgentProvider, getActiveGenericSession, interjectGenericSession } from "./generic-provider";
// Goose provider with session management utilities
export type { GooseProviderOptions, GooseRunningSession, GooseStreamEvent } from "./goose";
export { GooseAgentProvider, getActiveGooseSession, interjectGooseSession } from "./goose";
// Agent loader and registry
export {
  checkAgentAvailability,
  checkAllAgentAvailability,
  getAgentDefinition,
  getAgentRegistry,
  getAgentVersion,
  getRegisteredAgentNames,
  isBuiltinAgent,
  isValidAgentName,
  listAgentModels,
  loadCustomAgents,
  registerAgent,
  resetAgentRegistry,
  validateAgentDefinition,
  validateAllAgents,
} from "./loader";
// OpenCode provider
export type { OpenCodeProviderOptions } from "./opencode";
export { OpenCodeAgentProvider } from "./opencode";
// Agent schema and definitions
export type { AgentDefinition, EnvConfig, ModeConfig, OutputConfig, PromptStyle } from "./schema";
export { AgentDefinitionSchema, parseAgentDefinition, safeParseAgentDefinition } from "./schema";
