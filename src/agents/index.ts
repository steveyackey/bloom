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

// Generic provider for all agents
export type { GenericProviderOptions, GenericRunningSession } from "./generic-provider";
export { GenericAgentProvider, getActiveGenericSession, interjectGenericSession } from "./generic-provider";

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

// Agent schema and definitions
export type { AgentDefinition, EnvConfig, ModeConfig, OutputConfig, PromptStyle } from "./schema";
export { AgentDefinitionSchema, parseAgentDefinition, safeParseAgentDefinition } from "./schema";
