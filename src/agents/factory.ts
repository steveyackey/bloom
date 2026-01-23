// =============================================================================
// Agent Factory - Creates agents based on user configuration
// =============================================================================

import type { AgentConfig } from "../user-config";
import { loadUserConfig } from "../user-config";
import {
  type AgentCapabilities,
  type AgentName,
  getAgentCapabilities as getCapabilities,
  isValidAgentName,
} from "./capabilities";
import { ClaudeAgentProvider, type ClaudeProviderOptions } from "./claude";
import { ClineAgentProvider, type ClineProviderOptions } from "./cline";
import { CodexAgentProvider, type CodexProviderOptions } from "./codex";
import { CopilotAgentProvider, type CopilotProviderOptions } from "./copilot";
import type { Agent } from "./core";
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
  copilot: CopilotAgentProvider,
  codex: CodexAgentProvider,
  cline: ClineAgentProvider,
  opencode: OpenCodeAgentProvider,
} as const;

// =============================================================================
// Type Definitions
// =============================================================================

export type AgentMode = "interactive" | "nonInteractive";

// =============================================================================
// Core Factory Functions
// =============================================================================

/**
 * Creates an agent by name with the specified mode settings.
 *
 * @param agentName - The name of the agent to create (claude, copilot, codex, cline, opencode)
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
    case "copilot":
      return createCopilotAgent(isInteractive, model);
    case "codex":
      return createCodexAgent(isInteractive, model);
    case "cline":
      return createClineAgent(isInteractive, model);
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

  // Fall back to claude if no config (default agent)
  const agentName = agentConfig?.agent ?? "claude";
  const model = agentConfig?.model;

  const isInteractive = mode === "interactive";

  return createAgentByName(agentName, isInteractive, model);
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
 * // Returns: ["claude", "copilot", "codex", "cline", "opencode"]
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
 * Creates a Copilot agent with the specified mode and optional model.
 * Copilot supports multiple models (Claude, GPT, Gemini) and has
 * native GitHub MCP integration.
 */
function createCopilotAgent(interactive: boolean, model?: string): CopilotAgentProvider {
  const options: CopilotProviderOptions = {
    mode: interactive ? "interactive" : "streaming",
    autoApprove: !interactive,
    streamOutput: true,
    model: model,
  };

  return new CopilotAgentProvider(options);
}

/**
 * Creates a Codex agent with the specified mode and optional model.
 * Codex supports session forking and structured output via JSON schemas.
 */
function createCodexAgent(interactive: boolean, model?: string): CodexAgentProvider {
  const options: CodexProviderOptions = {
    mode: interactive ? "interactive" : "streaming",
    fullAuto: !interactive,
    streamOutput: true,
    model: model,
  };

  return new CodexAgentProvider(options);
}

/**
 * Creates a Cline agent with the specified mode and optional model.
 * Cline uses task-based session management with Plan/Act modes.
 */
function createClineAgent(interactive: boolean, model?: string): ClineAgentProvider {
  const options: ClineProviderOptions = {
    mode: interactive ? "interactive" : "streaming",
    // Act mode for autonomous execution, Plan mode for interactive review
    clineMode: interactive ? "plan" : "act",
    // Skip approvals in non-interactive (act) mode
    yolo: !interactive,
    streamOutput: true,
    model: model,
  };

  return new ClineAgentProvider(options);
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
