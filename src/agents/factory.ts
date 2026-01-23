// =============================================================================
// Agent Factory - Creates agents based on user configuration
// =============================================================================

import type { AgentConfig, PerAgentConfig } from "../user-config";
import { getAgentConfig, getDefaultAgentName, loadUserConfig } from "../user-config";
import { ClaudeAgentProvider, type ClaudeProviderOptions } from "./claude";
import { ClineAgentProvider, type ClineMode, type ClineProviderOptions } from "./cline";
import type { Agent } from "./core";
import { OpenCodeAgentProvider, type OpenCodeProviderOptions } from "./opencode";

// =============================================================================
// Agent Registry
// =============================================================================

const agentRegistry = {
  claude: ClaudeAgentProvider,
  cline: ClineAgentProvider,
  opencode: OpenCodeAgentProvider,
} as const;

// =============================================================================
// Factory Function
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
 * Falls back to ClaudeAgentProvider if no configuration is present.
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

  // Create provider based on agent name
  switch (agentName) {
    case "claude":
      return createClaudeAgent(isInteractive, model, perAgentConfig);
    case "cline":
      return createClineAgent(isInteractive, model, perAgentConfig);
    case "opencode":
      return createOpenCodeAgent(isInteractive, model, perAgentConfig);
    default:
      // Unknown agent, fall back to Claude
      return createClaudeAgent(isInteractive, model, perAgentConfig);
  }
}

/**
 * Creates a Claude agent with the specified mode and optional model.
 * Applies per-agent configuration if provided.
 */
function createClaudeAgent(
  interactive: boolean,
  model?: string,
  _perAgentConfig?: PerAgentConfig
): ClaudeAgentProvider {
  const options: ClaudeProviderOptions = {
    interactive,
    dangerouslySkipPermissions: true,
    streamOutput: true,
    model: model,
  };

  return new ClaudeAgentProvider(options);
}

/**
 * Creates a Cline agent with the specified mode and optional model.
 * Cline uses task-based session management with Plan/Act modes.
 * Applies per-agent configuration including mode and provider settings.
 */
function createClineAgent(interactive: boolean, model?: string, perAgentConfig?: PerAgentConfig): ClineAgentProvider {
  // Get Cline-specific config
  const clineConfig = perAgentConfig as (PerAgentConfig & { mode?: ClineMode; provider?: string }) | undefined;

  const options: ClineProviderOptions = {
    mode: interactive ? "interactive" : "streaming",
    // Use config mode if provided, otherwise default based on interactive mode
    clineMode: clineConfig?.mode ?? (interactive ? "plan" : "act"),
    // Skip approvals in non-interactive (act) mode
    yolo: !interactive,
    streamOutput: true,
    model: model,
  };

  return new ClineAgentProvider(options);
}

/**
 * Creates an OpenCode agent with the specified mode and optional model.
 * Applies per-agent configuration if provided.
 */
function createOpenCodeAgent(
  interactive: boolean,
  model?: string,
  _perAgentConfig?: PerAgentConfig
): OpenCodeAgentProvider {
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
