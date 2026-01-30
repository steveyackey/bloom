// =============================================================================
// CLI Adapter - Public API
// =============================================================================
// This adapter provides CLI-specific implementations that subscribe to
// orchestrator events and output to the console.

export { createCLIEventHandler } from "./event-handler";

import { runAgentWorkLoop, type WorkLoopOptions } from "../../core/orchestrator";
import { createCLIEventHandler } from "./event-handler";

/**
 * Run the agent work loop with CLI console output.
 * This is the main entry point for CLI-based agent execution.
 *
 * @param agentName - The name of the agent
 * @param options - Work loop configuration
 */
export async function runAgentWorkLoopCLI(agentName: string, options: WorkLoopOptions): Promise<void> {
  const eventHandler = createCLIEventHandler(agentName);
  await runAgentWorkLoop(agentName, options, eventHandler);
}
