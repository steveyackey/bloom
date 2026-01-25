// =============================================================================
// Agent Factory - Creates agents based on user configuration
// =============================================================================

import type { AgentConfig } from "../user-config";
import { getAgentConfig, getDefaultAgentName, loadUserConfig } from "../user-config";
import type { Agent } from "./core";
import { GenericAgentProvider } from "./generic-provider";
import { getAgentDefinition, getRegisteredAgentNames, isValidAgentName } from "./loader";

// =============================================================================
// Type Definitions
// =============================================================================

export type AgentMode = "interactive" | "nonInteractive";

/**
 * Options for creating an agent.
 */
export interface CreateAgentOptions {
  /** Override the agent name (ignores config default) */
  agentName?: string;
  /** Override the model (ignores per-agent config) */
  model?: string;
}

// =============================================================================
// Core Factory Functions
// =============================================================================

/**
 * Creates an agent by name with the specified mode settings.
 * All agents are created using the GenericAgentProvider with schema-based definitions.
 *
 * @param agentName - The name of the agent to create
 * @param isInteractive - Whether to create the agent in interactive mode
 * @param model - Optional model override
 * @returns A configured Agent instance
 * @throws Error if agent name is invalid
 *
 * @example
 * ```ts
 * const agent = createAgentByName("claude", true);
 * const agent = createAgentByName("opencode", false, "anthropic/claude-sonnet-4");
 * const agent = createAgentByName("custom-agent", false);
 * ```
 */
export function createAgentByName(agentName: string, isInteractive: boolean, model?: string): Agent {
  // Validate agent name
  if (!isValidAgentName(agentName)) {
    const available = listAvailableAgents().join(", ");
    throw new Error(`Unknown agent '${agentName}'. Available: ${available}`);
  }

  return createGenericAgent(agentName, isInteractive, model);
}

/**
 * Creates an agent based on user configuration.
 *
 * @param mode - The mode to create the agent for ('interactive' or 'nonInteractive')
 * @param options - Optional overrides for agent name and model
 * @returns A configured Agent instance
 *
 * Configuration is read from ~/.bloom/config.yaml.
 *
 * New configuration format (agent section):
 * ```yaml
 * agent:
 *   default: claude
 *   timeout: 600
 *   claude:
 *     model: sonnet
 *   opencode:
 *     model: claude-sonnet-4  # REQUIRED
 * ```
 *
 * Legacy format (still supported):
 * ```yaml
 * interactiveAgent: { agent: 'claude', model?: 'opus' }
 * nonInteractiveAgent: { agent: 'opencode', model?: 'gpt-4' }
 * ```
 *
 * Falls back to claude if no configuration is present.
 */
export async function createAgent(mode: AgentMode, options: CreateAgentOptions = {}): Promise<Agent> {
  const userConfig = await loadUserConfig();

  // Determine agent name: options override > new config > legacy config > default
  let agentName: string;
  let model: string | undefined = options.model;

  if (options.agentName) {
    // Explicit override
    agentName = options.agentName;
  } else if (userConfig.agent) {
    // New config format: use default agent
    agentName = getDefaultAgentName(userConfig);
  } else {
    // Legacy config format
    const legacyConfig: AgentConfig | undefined =
      mode === "interactive" ? userConfig.interactiveAgent : userConfig.nonInteractiveAgent;
    agentName = legacyConfig?.agent ?? "claude";
    if (!model) {
      model = legacyConfig?.model;
    }
  }

  // Get per-agent configuration
  const perAgentConfig = getAgentConfig(userConfig, agentName);

  // Use per-agent model if not overridden
  if (!model && perAgentConfig?.model) {
    model = perAgentConfig.model;
  }

  const isInteractive = mode === "interactive";

  return createAgentByName(agentName, isInteractive, model);
}

// =============================================================================
// Agent Query Functions
// =============================================================================

/**
 * Get the list of all available agent names.
 * This returns all agents that can be instantiated by the factory,
 * including both built-in and custom agents.
 *
 * @returns Array of agent names
 *
 * @example
 * ```ts
 * const agents = listAvailableAgents();
 * // Returns: ["claude", "copilot", "codex", "goose", "opencode", "test", ...custom agents]
 * ```
 */
export function listAvailableAgents(): string[] {
  return getRegisteredAgentNames();
}

/**
 * Get the list of registered agent names.
 * @deprecated Use listAvailableAgents() instead for clearer semantics.
 */
export function getRegisteredAgents(): string[] {
  return getRegisteredAgentNames();
}

/**
 * Check if an agent is registered.
 * @deprecated Use isValidAgentName() from loader module instead.
 */
export function isAgentRegistered(name: string): boolean {
  return isValidAgentName(name);
}

// =============================================================================
// Agent Factory Helpers
// =============================================================================

/**
 * Creates an agent using the schema-driven GenericAgentProvider.
 * All agents (built-in and custom) use this unified approach.
 */
function createGenericAgent(agentName: string, interactive: boolean, model?: string): GenericAgentProvider {
  const definition = getAgentDefinition(agentName);
  if (!definition) {
    throw new Error(`Agent definition not found: ${agentName}`);
  }

  return new GenericAgentProvider({
    definition,
    mode: interactive ? "interactive" : "streaming",
    streamOutput: true,
    model,
  });
}
