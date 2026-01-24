// =============================================================================
// Agent Registry
// =============================================================================
//
// Simple registry of supported agent providers. Bloom trusts each agent to
// know its own capabilities - agents inject their own system prompts with
// their features, tools, and limitations.
//
// This registry only tracks:
// - Which agents are supported
// - How to check if agent CLI is available
// - How to list available models
//
// =============================================================================

/**
 * Supported agent names.
 */
export type AgentName = "claude" | "copilot" | "codex" | "goose" | "opencode";

/**
 * List of all registered agent names.
 */
export const REGISTERED_AGENTS: AgentName[] = ["claude", "copilot", "codex", "goose", "opencode"];

/**
 * Get list of all registered agent names.
 * @returns Array of agent names
 */
export function getRegisteredAgentNames(): AgentName[] {
  return [...REGISTERED_AGENTS];
}

/**
 * Check if an agent name is valid/registered.
 * @param name - The name to check
 * @returns true if the agent is registered
 */
export function isValidAgentName(name: string): name is AgentName {
  return REGISTERED_AGENTS.includes(name as AgentName);
}
