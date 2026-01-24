// =============================================================================
// Agent Factory - Creates agents based on user configuration
// =============================================================================

import type { AgentConfig, PerAgentConfig } from "../user-config";
import { getAgentConfig, getDefaultAgentName, loadUserConfig } from "../user-config";
import {
  type AgentCapabilities,
  type AgentName,
  getAgentCapabilities as getCapabilities,
  isValidAgentName,
} from "./capabilities";
import { ClaudeAgentProvider, type ClaudeProviderOptions } from "./claude";
import { CodexAgentProvider, type CodexProviderOptions } from "./codex";
import { CopilotAgentProvider, type CopilotProviderOptions } from "./copilot";
import type { Agent } from "./core";
import { GooseAgentProvider, type GooseProviderOptions } from "./goose";
import { OpenCodeAgentProvider, type OpenCodeProviderOptions } from "./opencode";

// =============================================================================
// Agent Registry
// =============================================================================

/**
 * Registry of all available agent providers.
 * Each agent has a provider class that implements the Agent interface.
 */
const agentRegistry = {
  claude: ClaudeAgentProvider,
  codex: CodexAgentProvider,
  copilot: CopilotAgentProvider,
  goose: GooseAgentProvider,
  opencode: OpenCodeAgentProvider,
} as const;

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
 *
 * @param agentName - The name of the agent to create (claude, copilot, codex, goose, opencode)
 * @param isInteractive - Whether to create the agent in interactive mode
 * @param model - Optional model override
 * @returns A configured Agent instance
 * @throws Error if agent name is invalid
 *
 * @example
 * ```ts
 * const agent = createAgentByName("claude", true);
 * const agent = createAgentByName("opencode", false, "anthropic/claude-sonnet-4");
 * ```
 */
export function createAgentByName(agentName: string, isInteractive: boolean, model?: string): Agent {
  // Validate agent name
  if (!isValidAgentName(agentName)) {
    const available = listAvailableAgents().join(", ");
    throw new Error(`Unknown agent '${agentName}'. Available: ${available}`);
  }

  // Create the appropriate agent
  switch (agentName) {
    case "claude":
      return createClaudeAgent(isInteractive, model);
    case "codex":
      return createCodexAgent(isInteractive, model);
    case "copilot":
      return createCopilotAgent(isInteractive, model);
    case "goose":
      return createGooseAgent(isInteractive, model);
    case "opencode":
      return createOpenCodeAgent(isInteractive, model);
    default:
      // This should never happen due to isValidAgentName check above
      throw new Error(`Unknown agent '${agentName}'. Available: ${listAvailableAgents().join(", ")}`);
  }
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
    case "codex":
      return createCodexAgent(isInteractive, model);
    case "copilot":
      return createCopilotAgent(isInteractive, model);
    case "goose":
      return createGooseAgent(isInteractive, model);
    case "opencode":
      return createOpenCodeAgent(isInteractive, model, perAgentConfig);
    default:
      // Unknown agent, fall back to Claude
      return createClaudeAgent(isInteractive, model, perAgentConfig);
  }
}

// =============================================================================
// Agent Query Functions
// =============================================================================

/**
 * Get the list of all available agent names.
 * This returns all agents that can be instantiated by the factory.
 *
 * @returns Array of agent names
 *
 * @example
 * ```ts
 * const agents = listAvailableAgents();
 * // Returns: ["claude", "copilot", "codex", "goose", "opencode"]
 * ```
 */
export function listAvailableAgents(): AgentName[] {
  return Object.keys(agentRegistry) as AgentName[];
}

/**
 * Get capabilities for a specific agent without instantiating it.
 * This is useful for determining what features an agent supports
 * before creating an instance.
 *
 * @param agentName - The name of the agent
 * @returns The agent's capabilities, or undefined if agent not found
 *
 * @example
 * ```ts
 * const caps = getAgentCapabilities("claude");
 * if (caps?.supportsSessionResume) {
 *   // Agent supports resuming sessions
 * }
 * ```
 */
export function getAgentCapabilities(agentName: string): AgentCapabilities | undefined {
  return getCapabilities(agentName);
}

/**
 * Get the list of registered agent names.
 * @deprecated Use listAvailableAgents() instead for clearer semantics.
 */
export function getRegisteredAgents(): string[] {
  return Object.keys(agentRegistry);
}

/**
 * Check if an agent is registered.
 * @deprecated Use isValidAgentName() from capabilities module instead.
 */
export function isAgentRegistered(name: string): boolean {
  return name in agentRegistry;
}

// =============================================================================
// Agent Factory Helpers
// =============================================================================

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
 * Creates a Codex agent with the specified mode and optional model.
 * Codex supports session forking and sandbox control.
 */
function createCodexAgent(interactive: boolean, model?: string): CodexAgentProvider {
  const options: CodexProviderOptions = {
    interactive,
    // dangerouslyBypassApprovalsAndSandbox defaults to true (matches Claude's behavior)
    streamOutput: true,
    model: model,
  };

  return new CodexAgentProvider(options);
}

/**
 * Creates a Copilot agent with the specified mode and optional model.
 * Copilot supports multiple models (Claude, GPT, Gemini) and has
 * native GitHub MCP integration.
 */
function createCopilotAgent(interactive: boolean, model?: string): CopilotAgentProvider {
  const options: CopilotProviderOptions = {
    interactive,
    allowAllTools: true,
    streamOutput: true,
    model: model,
  };

  return new CopilotAgentProvider(options);
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
 * Creates a Goose agent with the specified mode and optional model.
 * Goose is Block's open-source AI agent with extensible MCP support.
 */
function createGooseAgent(interactive: boolean, model?: string): GooseAgentProvider {
  const options: GooseProviderOptions = {
    interactive,
    streamOutput: true,
    model: model,
  };

  return new GooseAgentProvider(options);
}
