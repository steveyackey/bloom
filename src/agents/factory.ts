// =============================================================================
// Agent Factory - Creates agents based on user configuration
// =============================================================================

import type { AgentConfig } from "../user-config";
import { loadUserConfig } from "../user-config";
import { ClaudeAgentProvider, type ClaudeProviderOptions } from "./claude";
import type { Agent } from "./core";
import { OpenCodeAgentProvider, type OpenCodeProviderOptions } from "./opencode";

// =============================================================================
// Agent Registry
// =============================================================================

const agentRegistry = {
  claude: ClaudeAgentProvider,
  opencode: OpenCodeAgentProvider,
} as const;

// =============================================================================
// Factory Function
// =============================================================================

export type AgentMode = "interactive" | "nonInteractive";

/**
 * Creates an agent based on user configuration.
 *
 * @param mode - The mode to create the agent for ('interactive' or 'nonInteractive')
 * @returns A configured Agent instance
 *
 * Configuration is read from ~/.bloom/config.yaml:
 * - interactiveAgent: { agent: 'claude', model?: 'opus' }
 * - nonInteractiveAgent: { agent: 'opencode', model?: 'gpt-4' }
 *
 * Falls back to ClaudeAgentProvider if no configuration is present.
 */
export async function createAgent(mode: AgentMode): Promise<Agent> {
  const userConfig = await loadUserConfig();

  // Get agent config for the specified mode
  const agentConfig: AgentConfig | undefined =
    mode === "interactive" ? userConfig.interactiveAgent : userConfig.nonInteractiveAgent;

  // Fall back to claude if no config
  const agentName = agentConfig?.agent ?? "claude";
  const model = agentConfig?.model;

  const isInteractive = mode === "interactive";

  // Create provider based on agent name
  switch (agentName) {
    case "claude":
      return createClaudeAgent(isInteractive, model);
    case "opencode":
      return createOpenCodeAgent(isInteractive, model);
    default:
      // Unknown agent, fall back to Claude
      return createClaudeAgent(isInteractive, model);
  }
}

/**
 * Creates a Claude agent with the specified mode and optional model.
 */
function createClaudeAgent(interactive: boolean, model?: string): ClaudeAgentProvider {
  const options: ClaudeProviderOptions = {
    interactive,
    dangerouslySkipPermissions: true,
    streamOutput: true,
  };

  // Note: ClaudeAgentProvider doesn't currently support model selection
  // The model parameter is captured for future use when Claude CLI supports it
  if (model) {
    // Model support to be added when ClaudeAgentProvider supports it
  }

  return new ClaudeAgentProvider(options);
}

/**
 * Creates an OpenCode agent with the specified mode and optional model.
 */
function createOpenCodeAgent(interactive: boolean, model?: string): OpenCodeAgentProvider {
  const options: OpenCodeProviderOptions = {
    interactive,
    autoApprove: true,
    streamOutput: true,
    model: model,
  };

  return new OpenCodeAgentProvider(options);
}

/**
 * Get the list of registered agent names.
 */
export function getRegisteredAgents(): string[] {
  return Object.keys(agentRegistry);
}

/**
 * Check if an agent is registered.
 */
export function isAgentRegistered(name: string): boolean {
  return name in agentRegistry;
}
