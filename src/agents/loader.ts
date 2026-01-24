/**
 * Agent Loader
 *
 * Loads and merges agent definitions from built-in sources and user config.
 * Provides a unified registry of all available agents.
 */

import { createLogger } from "../logger";
import { BUILTIN_AGENTS } from "./builtin-agents";
import type { AgentDefinition } from "./schema";
import { AgentDefinitionSchema } from "./schema";

const logger = createLogger("agent-loader");

// =============================================================================
// Agent Registry
// =============================================================================

/**
 * Merged agent registry (built-in + user custom agents)
 */
let agentRegistry: Record<string, AgentDefinition> = { ...BUILTIN_AGENTS };

/**
 * Get the merged agent registry
 */
export function getAgentRegistry(): Record<string, AgentDefinition> {
  return agentRegistry;
}

/**
 * Get an agent definition by name
 */
export function getAgentDefinition(name: string): AgentDefinition | undefined {
  return agentRegistry[name];
}

/**
 * Get all registered agent names
 */
export function getRegisteredAgentNames(): string[] {
  return Object.keys(agentRegistry);
}

/**
 * Check if an agent name is valid (registered)
 */
export function isValidAgentName(name: string): boolean {
  return name in agentRegistry;
}

/**
 * Check if an agent is a built-in agent
 */
export function isBuiltinAgent(name: string): boolean {
  return name in BUILTIN_AGENTS;
}

// =============================================================================
// Agent Loading
// =============================================================================

/**
 * Load custom agents from user config and merge with built-in agents.
 *
 * @param customAgents - Custom agent definitions from user config
 */
export function loadCustomAgents(customAgents: Record<string, unknown>): void {
  for (const [name, definition] of Object.entries(customAgents)) {
    const parsed = AgentDefinitionSchema.safeParse(definition);
    if (parsed.success) {
      logger.info(`Loaded custom agent: ${name}`);
      agentRegistry[name] = parsed.data;
    } else {
      logger.warn(`Invalid custom agent definition for '${name}':`, parsed.error.message);
    }
  }
}

/**
 * Reset the agent registry to only built-in agents.
 * Useful for testing.
 */
export function resetAgentRegistry(): void {
  agentRegistry = { ...BUILTIN_AGENTS };
}

/**
 * Override or add a single agent definition.
 * Useful for testing or runtime customization.
 */
export function registerAgent(name: string, definition: AgentDefinition): void {
  agentRegistry[name] = definition;
}

// =============================================================================
// Validation
// =============================================================================

export interface AgentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate an agent definition
 */
export function validateAgentDefinition(definition: unknown): AgentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Parse with Zod
  const parsed = AgentDefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    return { valid: false, errors, warnings };
  }

  const def = parsed.data;

  // Check for recommended fields
  if (!def.docs) {
    warnings.push("No documentation URL provided");
  }

  if (!def.flags.approval_bypass?.length) {
    warnings.push("No approval bypass flag - agent may require user interaction in streaming mode");
  }

  if (!def.flags.model?.length) {
    warnings.push("No model selection flag - cannot override model");
  }

  if (!def.flags.resume?.length) {
    warnings.push("No session resume flag - cannot resume sessions");
  }

  return { valid: true, errors, warnings };
}

/**
 * Validate all registered agents
 */
export function validateAllAgents(): Record<string, AgentValidationResult> {
  const results: Record<string, AgentValidationResult> = {};

  for (const [name, definition] of Object.entries(agentRegistry)) {
    results[name] = validateAgentDefinition(definition);
  }

  return results;
}

// =============================================================================
// CLI Availability
// =============================================================================

/**
 * Check if an agent's CLI is available
 */
export async function checkAgentAvailability(name: string): Promise<boolean> {
  const definition = getAgentDefinition(name);
  if (!definition) {
    return false;
  }

  try {
    const args = definition.version;
    const result = Bun.spawnSync([definition.command, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Check availability of all registered agents
 */
export async function checkAllAgentAvailability(): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  for (const name of getRegisteredAgentNames()) {
    results[name] = await checkAgentAvailability(name);
  }

  return results;
}

/**
 * Get agent version string
 */
export async function getAgentVersion(name: string): Promise<string | null> {
  const definition = getAgentDefinition(name);
  if (!definition) {
    return null;
  }

  try {
    const args = definition.version;
    const result = Bun.spawnSync([definition.command, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    if (result.exitCode === 0) {
      return result.stdout.toString().trim().split("\n")[0] || null;
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// Model Discovery
// =============================================================================

/**
 * List available models for an agent (if supported)
 */
export async function listAgentModels(name: string): Promise<string[] | null> {
  const definition = getAgentDefinition(name);
  if (!definition || !definition.models_command) {
    return null;
  }

  try {
    const result = Bun.spawnSync([definition.command, ...definition.models_command], {
      stdout: "pipe",
      stderr: "pipe",
    });

    if (result.exitCode === 0) {
      const output = result.stdout.toString().trim();
      // Try to parse as lines
      return output.split("\n").filter((line) => line.trim());
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export { BUILTIN_AGENTS, getBuiltinAgent, getBuiltinAgentNames } from "./builtin-agents";
export type { AgentDefinition } from "./schema";
