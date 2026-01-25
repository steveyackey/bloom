// =============================================================================
// TUI Adapter - Public API
// =============================================================================
// Event-driven TUI adapter for displaying multiple agents in a terminal.

export { EventDrivenTUI } from "./tui";
export type { AgentPane, TUIConfig, ViewMode } from "./types";

import { runAgentWorkLoop, type WorkLoopOptions } from "../../core/orchestrator";
import { EventDrivenTUI } from "./tui";
import type { TUIConfig } from "./types";

/**
 * Run multiple agents with the TUI display.
 *
 * @param config - TUI configuration
 */
export async function runAgentWorkLoopTUI(config: TUIConfig): Promise<void> {
  const tui = new EventDrivenTUI();

  // Add panes for each agent
  for (const agentName of config.agents) {
    tui.addPane(agentName);
  }

  // Add dashboard and questions panes
  tui.addSpecialPanes();

  // Set tasks file for dashboard summary
  tui.setTasksFile(config.tasksFile);

  // Start the TUI
  tui.start();

  // Get the event handler
  const eventHandler = tui.getEventHandler();

  // Create work loop options
  const options: WorkLoopOptions = {
    tasksFile: config.tasksFile,
    bloomDir: config.bloomDir,
    reposDir: config.reposDir,
    pollIntervalMs: config.pollIntervalMs,
    agentProviderOverride: config.agentProviderOverride,
    streamOutput: false, // Output goes through event handler, not stdout
  };

  // Run work loops for all agents concurrently
  const workLoops = config.agents.map((agentName) => runAgentWorkLoop(agentName, options, eventHandler));

  // Wait for all work loops (they run forever until interrupted)
  await Promise.all(workLoops);
}
