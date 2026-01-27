// =============================================================================
// Agent Registry (Re-exports from Loader)
// =============================================================================
//
// This module provides backward compatibility with the old capabilities API.
// The actual agent registry is now in loader.ts which supports both built-in
// and custom agents defined via YAML schema.
//
// =============================================================================

/**
 * Built-in agent names.
 * Note: Custom agents can also be registered via user config.
 */
export type BuiltinAgentName = "claude" | "copilot" | "codex" | "goose" | "opencode" | "cursor" | "test";

/**
 * Agent name type - can be a built-in agent or a custom agent name.
 */
export type AgentName = BuiltinAgentName | string;

/**
 * List of built-in agent names (for backward compatibility).
 * Use getRegisteredAgentNames() to include custom agents.
 */
export const REGISTERED_AGENTS: BuiltinAgentName[] = [
  "claude",
  "copilot",
  "codex",
  "goose",
  "opencode",
  "cursor",
  "test",
];

// Re-export from loader for convenience
export {
  checkAgentAvailability,
  getAgentDefinition,
  getAgentVersion,
  getRegisteredAgentNames,
  isBuiltinAgent,
  isValidAgentName,
  listAgentModels,
  loadCustomAgents,
  validateAgentDefinition,
} from "./loader";
