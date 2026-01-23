// =============================================================================
// Agent Availability Checking
// =============================================================================
//
// Utilities for checking if agent CLIs are available on the system.
// Used by TUI to show agent availability status.
// =============================================================================

import { spawn } from "node:child_process";
import { getRegisteredAgents } from "./factory";

// =============================================================================
// Types
// =============================================================================

/**
 * Information about an agent's availability status.
 */
export interface AgentAvailability {
  /** Agent name (e.g., 'claude', 'cline', 'opencode') */
  name: string;
  /** Whether the agent CLI is available */
  available: boolean;
  /** If unavailable, the reason why */
  unavailableReason?: string;
  /** Supported models for this agent (if available) */
  models: string[];
  /** Default model for this agent */
  defaultModel?: string;
}

// =============================================================================
// Agent CLI Commands
// =============================================================================

/**
 * Map of agent names to their CLI check configuration.
 */
const agentCliConfig: Record<string, { command: string; checkArgs: string[] }> = {
  claude: { command: "claude", checkArgs: ["--version"] },
  cline: { command: "cline", checkArgs: ["--version"] },
  opencode: { command: "opencode", checkArgs: ["--version"] },
};

/**
 * Agent models configuration.
 * Each agent has a list of supported models and a default.
 */
const agentModels: Record<string, { models: string[]; default?: string }> = {
  claude: {
    models: [
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
    ],
    default: "claude-sonnet-4-20250514",
  },
  cline: {
    // Cline uses VS Code settings for model selection, these are common options
    models: ["claude-3.5-sonnet", "gpt-4", "gpt-4-turbo", "claude-3-opus"],
    default: "claude-3.5-sonnet",
  },
  opencode: {
    // OpenCode requires explicit model selection in provider/model format
    models: ["opencode/grok-code", "anthropic/claude-3.5-sonnet", "openai/gpt-4"],
    default: "opencode/grok-code",
  },
};

// =============================================================================
// Availability Checking
// =============================================================================

/**
 * Check if a specific CLI command is available on the system.
 */
async function checkCliAvailable(command: string, args: string[]): Promise<{ available: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        resolve({
          available: false,
          reason: `CLI not found: ${command}`,
        });
      } else {
        resolve({
          available: false,
          reason: `Error checking CLI: ${error.message}`,
        });
      }
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ available: true });
      } else {
        // For Cline, check if it's a gRPC service issue
        if (command === "cline" && (stderr.includes("gRPC") || stderr.includes("ECONNREFUSED"))) {
          resolve({
            available: false,
            reason: "Cline Core service not running",
          });
        } else {
          resolve({
            available: false,
            reason: stderr.trim() || `CLI exited with code ${code}`,
          });
        }
      }
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      try {
        proc.kill();
      } catch {}
      resolve({
        available: false,
        reason: "CLI check timed out",
      });
    }, 5000);
  });
}

/**
 * Check availability of a single agent.
 */
export async function checkAgentAvailability(agentName: string): Promise<AgentAvailability> {
  const config = agentCliConfig[agentName];
  const modelConfig = agentModels[agentName];

  if (!config) {
    return {
      name: agentName,
      available: false,
      unavailableReason: "Unknown agent",
      models: [],
    };
  }

  const result = await checkCliAvailable(config.command, config.checkArgs);

  return {
    name: agentName,
    available: result.available,
    unavailableReason: result.reason,
    models: modelConfig?.models ?? [],
    defaultModel: modelConfig?.default,
  };
}

/**
 * Check availability of all registered agents.
 * Returns a map of agent name to availability info.
 */
export async function checkAllAgentsAvailability(): Promise<Map<string, AgentAvailability>> {
  const agents = getRegisteredAgents();
  const results = new Map<string, AgentAvailability>();

  // Check all agents in parallel
  const checks = await Promise.all(agents.map((agent) => checkAgentAvailability(agent)));

  for (const check of checks) {
    results.set(check.name, check);
  }

  return results;
}

/**
 * Get supported models for an agent.
 */
export function getAgentModels(agentName: string): string[] {
  return agentModels[agentName]?.models ?? [];
}

/**
 * Get default model for an agent.
 */
export function getAgentDefaultModel(agentName: string): string | undefined {
  return agentModels[agentName]?.default;
}
