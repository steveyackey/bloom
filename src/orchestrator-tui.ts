#!/usr/bin/env bun
import { dirname, resolve } from "node:path";
import { Terminal } from "@xterm/headless";
import YAML from "yaml";
import {
  type AgentAvailability,
  checkAllAgentsAvailability,
  getAgentDefaultModel,
  getAgentModels,
  interjectGenericSession,
  listAvailableAgents,
} from "./agents";
import { ansi, type BorderState, CSI, cellBgToAnsi, cellFgToAnsi, chalk, getBorderChalk } from "./colors";
import { consumeTrigger, createInterjection, watchTriggers } from "./human-queue";
import { type Task, type TasksFile, validateTasksFile } from "./task-schema";
import { getProcessStatsBatch, type ProcessStats, spawnTerminal, type TerminalProcess } from "./terminal";
import {
  getDefaultInteractiveAgent,
  getDefaultModel,
  loadUserConfig,
  saveUserConfig,
  setAgentDefaultModel,
  setDefaultInteractiveAgent,
  type UserConfig,
} from "./user-config";

// =============================================================================
// Types
// =============================================================================

/** Configuration for a pane that spawns a subprocess */
interface SubprocessPaneConfig {
  type: "subprocess";
  name: string;
  command: string[];
  cwd: string;
  env?: Record<string, string>;
}

/** Configuration for a pane that runs an internal service */
interface InProcessPaneConfig {
  type: "in-process";
  name: string;
  /** The service function that renders content to the terminal */
  service: InProcessService;
}

/** A service that runs in-process and writes to a terminal */
export interface InProcessService {
  /** Start the service, returns a cleanup function */
  start(write: (data: string) => void, scheduleRender: () => void): () => void;
}

type PaneConfig = SubprocessPaneConfig | InProcessPaneConfig;

// Legacy interface for backwards compatibility
interface AgentConfig {
  name: string;
  command?: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** If set, run this service in-process instead of spawning a subprocess */
  service?: InProcessService;
}

interface Pane {
  id: number;
  proc: TerminalProcess | null;
  config: PaneConfig;
  term: Terminal;
  status: "running" | "stopped" | "error";
  /** If this is a human takeover pane, the name of the original agent pane */
  humanTakeoverSource?: string;
  /** Cleanup function for in-process services */
  cleanup?: () => void;
  /** Latest process stats (CPU/memory) */
  stats?: ProcessStats;
}

type ViewMode = "tiled" | "single";

// =============================================================================
// Orchestrator TUI
// =============================================================================

export class OrchestratorTUI {
  private panes: Pane[] = [];
  private selectedIndex = 0;
  private focusedIndex: number | null = null;
  private viewMode: ViewMode = "tiled";
  private nextId = 1;
  private cols: number;
  private rows: number;
  private renderScheduled = false;
  private paneConfigs: PaneConfig[] = [];
  private stopTriggerWatch?: () => void;
  private lastRenderedOutput = "";
  private statsUpdateInterval?: ReturnType<typeof setInterval>;
  // Agent selection state
  private agentAvailability: Map<string, AgentAvailability> = new Map();
  private currentAgent: string = "claude";
  private currentModel: string | undefined;
  private userConfig: UserConfig | null = null;
  private isShowingSelector = false;

  constructor(configs?: AgentConfig[]) {
    this.cols = process.stdout.columns || 80;
    this.rows = process.stdout.rows || 24;
    if (configs) {
      // Convert legacy AgentConfig to new PaneConfig format
      this.paneConfigs = configs.map((c) => {
        if (c.service) {
          return {
            type: "in-process" as const,
            name: c.name,
            service: c.service,
          };
        }
        return {
          type: "subprocess" as const,
          name: c.name,
          command: c.command || [],
          cwd: c.cwd || process.cwd(),
          env: c.env,
        };
      });
    }
  }

  async start() {
    process.stdout.write(ansi.enterAltScreen + ansi.hideCursor + ansi.clearScreen);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on("data", this.handleInput.bind(this));

    process.on("SIGWINCH", () => {
      this.cols = process.stdout.columns || 80;
      this.rows = process.stdout.rows || 24;
      this.resizeAllPanes();
      this.scheduleRender();
    });

    const cleanup = () => {
      this.cleanup();
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    // Load user config and agent availability
    await this.loadAgentState();

    // Auto-create panes for configured services/agents
    for (const config of this.paneConfigs) {
      this.createPaneFromConfig(config);
    }

    // Watch for interject triggers from CLI/agents
    this.stopTriggerWatch = watchTriggers((trigger) => {
      // Find the pane for this agent and interject it
      const paneIndex = this.panes.findIndex((p) => p.config.name === trigger.agentName);
      const pane = this.panes[paneIndex];
      if (paneIndex !== -1 && pane) {
        pane.term.write(`\r\n[Interject triggered${trigger.reason ? `: ${trigger.reason}` : ""}]\r\n`);
        consumeTrigger(trigger.agentName);
        this.interjectPane(paneIndex);
      }
    });

    // Select first pane (dashboard) after all agents are spawned
    this.selectedIndex = 0;

    // Start periodic stats updates
    this.statsUpdateInterval = setInterval(() => this.updateAllStats(), 5000);
    // Initial stats fetch
    this.updateAllStats();

    this.render();
  }

  private async updateAllStats() {
    // Collect all PIDs that need stats
    const pidsToQuery: number[] = [];
    const panesByPid = new Map<number, Pane>();

    for (const pane of this.panes) {
      if (pane.proc?.pid && pane.status === "running") {
        pidsToQuery.push(pane.proc.pid);
        panesByPid.set(pane.proc.pid, pane);
      }
    }

    // Batch fetch all stats in one call
    const statsMap = await getProcessStatsBatch(pidsToQuery);

    // Update panes with fetched stats
    let changed = false;
    for (const pane of this.panes) {
      if (pane.proc?.pid && pane.status === "running") {
        const stats = statsMap.get(pane.proc.pid);
        if (stats) {
          pane.stats = stats;
          changed = true;
        }
      } else if (pane.stats) {
        pane.stats = undefined;
        changed = true;
      }
    }

    if (changed) {
      this.scheduleRender();
    }
  }

  /**
   * Load agent availability and user configuration.
   */
  private async loadAgentState() {
    // Load user config
    this.userConfig = await loadUserConfig();

    // Set current agent from config
    this.currentAgent = getDefaultInteractiveAgent(this.userConfig);
    this.currentModel = getDefaultModel(this.userConfig, this.currentAgent) ?? getAgentDefaultModel(this.currentAgent);

    // Check agent availability
    this.agentAvailability = await checkAllAgentsAvailability();

    // Refresh availability periodically (every 30 seconds)
    setInterval(async () => {
      this.agentAvailability = await checkAllAgentsAvailability();
      this.scheduleRender();
    }, 30000);
  }

  /**
   * Show agent selector using inquirer.
   * Temporarily exits raw mode to allow inquirer to work.
   */
  private async showAgentSelector() {
    if (this.isShowingSelector) return;
    this.isShowingSelector = true;

    // Check if there are active agent sessions
    const hasActiveSessions = this.panes.some(
      (p) => p.status === "running" && p.config.name !== "dashboard" && p.config.name !== "questions"
    );

    try {
      // Exit raw mode and alternate screen for inquirer
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdout.write(ansi.showCursor + ansi.leaveAltScreen);

      const select = (await import("@inquirer/select")).default;
      const confirm = (await import("@inquirer/confirm")).default;

      // Show confirmation if there are active sessions
      if (hasActiveSessions) {
        const shouldSwitch = await confirm({
          message: "There are active agent sessions. Switching agents will affect new panes only. Continue?",
          default: true,
        });

        if (!shouldSwitch) {
          this.restoreScreen();
          return;
        }
      }

      // Build choices with availability info
      const agents = listAvailableAgents();
      const choices = agents.map((agent) => {
        const availability = this.agentAvailability.get(agent);
        const isAvailable = availability?.available ?? false;
        const isCurrent = agent === this.currentAgent;

        let name: string = agent;
        if (isCurrent) name = `${agent} (current)`;
        if (!isAvailable) {
          name = `${agent} [unavailable: ${availability?.unavailableReason || "unknown"}]`;
        }

        return {
          name,
          value: agent,
          disabled: !isAvailable ? availability?.unavailableReason || "Not available" : false,
        };
      });

      const selectedAgent = await select<string>({
        message: "Select an agent:",
        choices,
        default: this.currentAgent,
      });

      // Update current agent
      this.currentAgent = selectedAgent;
      this.currentModel = getDefaultModel(this.userConfig!, selectedAgent) ?? getAgentDefaultModel(selectedAgent);

      // Save to user config
      await setDefaultInteractiveAgent(selectedAgent);
      this.userConfig = await loadUserConfig();

      // Now show model selector
      await this.showModelSelector();
    } catch {
      // User cancelled or error
    } finally {
      this.restoreScreen();
    }
  }

  /**
   * Show model selector using inquirer.
   */
  private async showModelSelector() {
    try {
      const select = (await import("@inquirer/select")).default;

      const models = getAgentModels(this.currentAgent);
      if (models.length === 0) {
        console.log(chalk.yellow(`No models configured for ${this.currentAgent}`));
        return;
      }

      const choices = models.map((model) => ({
        name: model === this.currentModel ? `${model} (current)` : model,
        value: model,
      }));

      const selectedModel = await select({
        message: `Select a model for ${this.currentAgent}:`,
        choices,
        default: this.currentModel,
      });

      this.currentModel = selectedModel;

      // Save to user config
      await setAgentDefaultModel(this.currentAgent, selectedModel);
      this.userConfig = await loadUserConfig();

      console.log(chalk.green(`\nAgent: ${this.currentAgent}, Model: ${this.currentModel}`));
      console.log(chalk.dim("Press any key to continue..."));

      // Wait for keypress
      await new Promise<void>((resolve) => {
        const handler = () => {
          process.stdin.removeListener("data", handler);
          resolve();
        };
        process.stdin.once("data", handler);
        process.stdin.resume();
      });
    } catch {
      // User cancelled
    }
  }

  /**
   * Show model selector only (keyboard shortcut 'm').
   */
  private async showModelSelectorOnly() {
    if (this.isShowingSelector) return;
    this.isShowingSelector = true;

    try {
      // Exit raw mode and alternate screen for inquirer
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdout.write(ansi.showCursor + ansi.leaveAltScreen);

      await this.showModelSelector();
    } catch {
      // User cancelled or error
    } finally {
      this.restoreScreen();
    }
  }

  /**
   * Restore the TUI screen after showing selector.
   */
  private restoreScreen() {
    this.isShowingSelector = false;
    process.stdout.write(ansi.enterAltScreen + ansi.hideCursor + ansi.clearScreen);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    this.lastRenderedOutput = ""; // Force full re-render
    this.render();
  }

  private cleanup() {
    // Stop stats updates
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
    }

    // Stop watching for triggers
    if (this.stopTriggerWatch) {
      this.stopTriggerWatch();
    }

    this.panes.forEach((p) => {
      try {
        if (p.config.type === "in-process") {
          p.cleanup?.();
        } else {
          p.proc?.kill();
        }
        p.term.dispose();
      } catch {}
    });
    process.stdout.write(ansi.showCursor + ansi.leaveAltScreen);
  }

  private handleInput(data: Buffer) {
    const str = data.toString();

    // Ctrl+B to exit focus
    if (str === "\x02") {
      if (this.focusedIndex !== null) {
        this.focusedIndex = null;
        this.scheduleRender();
      }
      return;
    }

    // When focused, send all input to PTY
    if (this.focusedIndex !== null) {
      const pane = this.panes[this.focusedIndex];
      pane?.proc?.write(str);
      return;
    }

    // Ctrl+C when not focused - exit app
    if (str === "\x03") {
      this.cleanup();
      process.exit(0);
    }

    // Navigation mode
    switch (str) {
      case "n":
        // Create a new agent pane (prompts would be needed, for now create floating)
        this.createPane({
          name: `agent-${this.nextId}`,
          command: ["claude"],
          cwd: process.cwd(),
        });
        break;
      case "r":
        // Restart selected pane
        this.restartPane(this.selectedIndex);
        break;
      case "x":
      case "d":
        // Kill selected pane (don't remove, just stop)
        this.killPane(this.selectedIndex);
        break;
      case "X":
      case "D":
        // Delete pane entirely
        this.deletePane(this.selectedIndex);
        break;
      case "v":
        this.viewMode = this.viewMode === "tiled" ? "single" : "tiled";
        this.resizeAllPanes();
        this.scheduleRender();
        break;
      case "q":
        this.cleanup();
        process.exit(0);
        break;
      case "h":
      case "\x1b[D":
        this.navigate("h");
        break;
      case "j":
      case "\x1b[B":
        this.navigate("j");
        break;
      case "k":
      case "\x1b[A":
        this.navigate("k");
        break;
      case "l":
      case "\x1b[C":
        this.navigate("l");
        break;
      case "\r":
        if (this.panes.length > 0) {
          this.focusedIndex = this.selectedIndex;
          this.scheduleRender();
        }
        break;
      case "i":
        // Interject - mark pane for human takeover
        this.interjectPane(this.selectedIndex);
        break;
      case "a":
        // Open agent selector
        this.showAgentSelector();
        break;
      case "m":
        // Open model selector
        this.showModelSelectorOnly();
        break;
    }
  }

  private navigate(dir: "h" | "j" | "k" | "l") {
    if (this.panes.length === 0) return;

    const count = this.panes.length;

    if (this.viewMode === "single") {
      // In single view: h/l switch panes, j/k scroll content
      if (dir === "h") {
        this.selectedIndex = (this.selectedIndex - 1 + count) % count;
      } else if (dir === "l") {
        this.selectedIndex = (this.selectedIndex + 1) % count;
      } else if (dir === "j" || dir === "k") {
        // Scroll the terminal buffer
        const pane = this.panes[this.selectedIndex];
        if (pane) {
          const scrollAmount = 3; // Lines to scroll per keypress
          if (dir === "j") {
            // Scroll down
            pane.term.scrollLines(scrollAmount);
          } else {
            // Scroll up
            pane.term.scrollLines(-scrollAmount);
          }
        }
      }
    } else {
      const tilesPerRow = Math.ceil(Math.sqrt(count));
      const currentRow = Math.floor(this.selectedIndex / tilesPerRow);
      const currentCol = this.selectedIndex % tilesPerRow;
      let newIndex = this.selectedIndex;

      if (dir === "h") {
        newIndex = currentRow * tilesPerRow + ((currentCol - 1 + tilesPerRow) % tilesPerRow);
      } else if (dir === "l") {
        newIndex = currentRow * tilesPerRow + ((currentCol + 1) % tilesPerRow);
      } else if (dir === "k") {
        const totalRows = Math.ceil(count / tilesPerRow);
        newIndex = ((currentRow - 1 + totalRows) % totalRows) * tilesPerRow + currentCol;
      } else if (dir === "j") {
        const totalRows = Math.ceil(count / tilesPerRow);
        newIndex = ((currentRow + 1) % totalRows) * tilesPerRow + currentCol;
      }

      if (newIndex < count) {
        this.selectedIndex = newIndex;
      }
    }
    this.scheduleRender();
  }

  private getPaneSize(): { cols: number; rows: number } {
    const count = this.panes.length || 1;
    const availableHeight = this.rows - 2;

    if (this.viewMode === "single") {
      return { cols: this.cols - 2, rows: availableHeight - 2 };
    }

    const tilesPerRow = Math.ceil(Math.sqrt(count));
    const tilesPerCol = Math.ceil(count / tilesPerRow);

    return {
      cols: Math.floor(this.cols / tilesPerRow) - 2,
      rows: Math.floor(availableHeight / tilesPerCol) - 2,
    };
  }

  private getPaneRegion(index: number): { x: number; y: number; w: number; h: number } {
    const count = this.panes.length;
    const availableHeight = this.rows - 2;

    if (this.viewMode === "single") {
      return { x: 0, y: 2, w: this.cols, h: availableHeight };
    }

    const tilesPerRow = Math.ceil(Math.sqrt(count));
    const tilesPerCol = Math.ceil(count / tilesPerRow);
    const tileW = Math.floor(this.cols / tilesPerRow);
    const tileH = Math.floor(availableHeight / tilesPerCol);
    const row = Math.floor(index / tilesPerRow);
    const col = index % tilesPerRow;

    return { x: col * tileW, y: 2 + row * tileH, w: tileW, h: tileH };
  }

  private resizeAllPanes() {
    const size = this.getPaneSize();
    const cols = Math.max(20, size.cols);
    const rows = Math.max(5, size.rows);

    this.panes.forEach((pane) => {
      pane.term.resize(cols, rows);
      pane.proc?.resize(cols, rows);
    });
  }

  private createPaneFromConfig(config: PaneConfig) {
    const id = this.nextId++;
    const size = this.getPaneSize();
    const cols = Math.max(20, size.cols);
    const rows = Math.max(5, size.rows);

    const term = new Terminal({ cols, rows, allowProposedApi: true });

    const pane: Pane = {
      id,
      proc: null,
      config,
      term,
      status: "stopped",
    };

    this.panes.push(pane);
    this.selectedIndex = this.panes.length - 1;
    this.resizeAllPanes();

    // Start the process or service
    if (config.type === "in-process") {
      this.startInProcessService(pane);
    } else {
      this.startPaneProcess(pane);
    }
    this.scheduleRender();
  }

  /** Legacy method for creating ad-hoc panes (e.g., human takeover) */
  private createPane(config: { name: string; command: string[]; cwd: string; env?: Record<string, string> }) {
    const paneConfig: SubprocessPaneConfig = {
      type: "subprocess",
      name: config.name,
      command: config.command,
      cwd: config.cwd,
      env: config.env,
    };
    this.createPaneFromConfig(paneConfig);
  }

  private startInProcessService(pane: Pane) {
    if (pane.config.type !== "in-process") return;

    const write = (data: string) => {
      pane.term.write(data, () => this.scheduleRender());
    };

    try {
      pane.cleanup = pane.config.service.start(write, () => this.scheduleRender());
      pane.status = "running";
    } catch (err) {
      pane.status = "error";
      pane.term.write(`Error starting service: ${err}\r\n`);
    }
  }

  private async startPaneProcess(pane: Pane) {
    if (pane.config.type !== "subprocess") return;

    const size = this.getPaneSize();
    const cols = Math.max(20, size.cols);
    const rows = Math.max(5, size.rows);
    const config = pane.config;

    try {
      const proc = await spawnTerminal(config.command, {
        cwd: config.cwd,
        env: config.env,
        cols,
        rows,
        onData: (text) => {
          pane.term.write(text, () => this.scheduleRender());
        },
        onExit: (code) => {
          // Ignore if this process was replaced by a restart
          if (pane.proc !== proc) return;

          pane.status = code === 0 ? "stopped" : "error";
          pane.term.write(`\r\n[Process exited with code ${code}]\r\n`);

          // Auto-restart source agent if this was a human takeover pane
          if (pane.humanTakeoverSource) {
            pane.term.write(`\r\n[Closing human pane and resuming agent...]\r\n`);
            // Use setImmediate to avoid issues with the current call stack
            setImmediate(() => {
              const paneIndex = this.panes.indexOf(pane);
              if (paneIndex !== -1) {
                this.deletePane(paneIndex);
              }
            });
          }

          this.scheduleRender();
        },
      });

      pane.proc = proc;
      pane.status = "running";
    } catch (err) {
      pane.status = "error";
      pane.term.write(`Error starting process: ${err}\r\n`);
    }
  }

  private killPane(index: number) {
    const pane = this.panes[index];
    if (!pane) return;

    try {
      if (pane.config.type === "in-process") {
        pane.cleanup?.();
        pane.cleanup = undefined;
        pane.term.write("\r\n[Service stopped]\r\n");
      } else {
        pane.proc?.kill();
        pane.proc = null;
        pane.term.write("\r\n[Process killed]\r\n");
      }
      pane.status = "stopped";
    } catch {}
    this.scheduleRender();
  }

  private restartPane(index: number) {
    const pane = this.panes[index];
    if (!pane) return;

    // Kill existing process/service
    try {
      if (pane.config.type === "in-process") {
        pane.cleanup?.();
        pane.cleanup = undefined;
      } else {
        pane.proc?.kill();
        pane.proc = null;
      }
    } catch {}

    // Clear terminal
    pane.term.clear();
    pane.term.write(`[Restarting ${pane.config.name}...]\r\n\r\n`);

    // Start new process/service
    if (pane.config.type === "in-process") {
      this.startInProcessService(pane);
    } else {
      this.startPaneProcess(pane);
    }
    this.scheduleRender();
  }

  private deletePane(index: number) {
    const pane = this.panes[index];
    if (!pane) return;

    // Check if this is a human takeover pane - need to auto-restart the source agent
    const sourceAgentName = pane.humanTakeoverSource;

    try {
      if (pane.config.type === "in-process") {
        pane.cleanup?.();
      } else {
        pane.proc?.kill();
      }
      pane.term.dispose();
    } catch {}

    this.panes.splice(index, 1);

    if (this.selectedIndex >= this.panes.length) {
      this.selectedIndex = Math.max(0, this.panes.length - 1);
    }
    if (this.focusedIndex !== null && this.focusedIndex >= this.panes.length) {
      this.focusedIndex = null;
    }

    // Auto-restart the source agent pane if this was a human takeover
    if (sourceAgentName) {
      this.autoRestartAgent(sourceAgentName);
    }

    this.resizeAllPanes();
    this.scheduleRender();
  }

  /**
   * Auto-restart an agent pane after human takeover completes.
   */
  private autoRestartAgent(agentName: string) {
    const agentPaneIndex = this.panes.findIndex((p) => p.config.name === agentName);
    const agentPane = this.panes[agentPaneIndex];
    if (agentPaneIndex === -1 || !agentPane) return;

    agentPane.term.write(`\r\n━━━ HUMAN TAKEOVER COMPLETE ━━━\r\n`);
    agentPane.term.write(`Auto-resuming agent...\r\n\r\n`);

    this.restartPane(agentPaneIndex);
  }

  private async interjectPane(index: number) {
    const pane = this.panes[index];
    if (!pane) return;

    // Skip in-process panes and non-agent panes (dashboard, questions)
    if (pane.config.type === "in-process" || pane.config.name === "dashboard" || pane.config.name === "questions") {
      pane.term.write(`\r\n[Cannot interject this pane]\r\n`);
      this.scheduleRender();
      return;
    }

    // Try to interject the agent session
    const session = interjectGenericSession(pane.config.name);
    const workingDir =
      session?.workingDirectory || (pane.config.type === "subprocess" ? pane.config.cwd : process.cwd());

    // Create interjection record
    const interjectionId = await createInterjection(pane.config.name, {
      taskId: session?.taskId,
      sessionId: session?.sessionId,
      workingDirectory: workingDir,
      reason: "Human interjection from TUI",
    });

    // Kill the original agent process
    try {
      pane.proc?.kill();
      pane.proc = null;
      pane.status = "stopped";
    } catch {}

    // Show interjection message in original pane
    pane.term.write(`\r\n━━━ INTERJECTED ━━━\r\n`);
    pane.term.write(`Session moved to new pane. Press "r" to restart agent later.\r\n`);

    // Build command for interactive session
    const interactiveCmd: string[] = ["claude"];
    if (session?.sessionId) {
      interactiveCmd.push("--resume", session.sessionId);
    }

    // Create new pane with interactive Claude session
    const interactivePaneName = `human:${pane.config.name}`;
    this.createPane({
      name: interactivePaneName,
      command: interactiveCmd,
      cwd: workingDir,
    });

    // Find the new pane and focus it
    const newPaneIndex = this.panes.length - 1;
    this.selectedIndex = newPaneIndex;
    this.focusedIndex = newPaneIndex;

    // Track the source agent for auto-restart and write context info
    const newPane = this.panes[newPaneIndex];
    if (newPane) {
      // Mark this as a human takeover pane so we can auto-restart the agent when done
      newPane.humanTakeoverSource = pane.config.name;

      newPane.term.write(`━━━ HUMAN TAKEOVER: ${pane.config.name} ━━━\r\n`);
      newPane.term.write(`Interjection ID: ${interjectionId}\r\n`);
      if (session?.taskId) {
        newPane.term.write(`Task: ${session.taskId}\r\n`);
      }
      newPane.term.write(`Dir: ${workingDir}\r\n`);
      if (session?.sessionId) {
        newPane.term.write(`Resuming session: ${session.sessionId}\r\n`);
      }
      newPane.term.write(`\r\nWhen you exit Claude, the agent will auto-resume.\r\n`);
      newPane.term.write(`Press Ctrl+B to exit focus mode, then "X" to close pane.\r\n\r\n`);
    }

    this.scheduleRender();
  }

  private scheduleRender() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    setImmediate(() => {
      this.renderScheduled = false;
      this.render();
    });
  }

  private render() {
    // Build the entire output in memory first (double-buffering)
    let output = "";

    // Position cursor at home without clearing (reduces flicker)
    output += `${ansi.hideCursor}${CSI}H`;

    // Header with chalk styling
    const title = chalk.bold.cyan(" Bloom");
    const viewInfo = chalk.gray(` ${this.viewMode}`);
    // Count only actual agents (exclude dashboard and questions panes)
    const agentPanes = this.panes.filter((p) => p.config.name !== "dashboard" && p.config.name !== "questions");
    const activeAgents = agentPanes.filter((p) => p.status === "running").length;
    const agentCount = chalk.green(`${activeAgents}/${agentPanes.length}`);

    // Current agent and model in status bar
    const agentAvail = this.agentAvailability.get(this.currentAgent);
    const agentStatus = agentAvail?.available ? chalk.green(this.currentAgent) : chalk.red(this.currentAgent);
    const modelDisplay = this.currentModel ? chalk.cyan(this.currentModel) : chalk.dim("default");
    const agentInfo = `${agentStatus}/${modelDisplay}`;

    const keys = chalk.dim("a:agent m:model n:new r:restart x:kill i:interject v:view hjkl:nav Enter:focus q:quit");
    const header = `${title} ${chalk.dim("|")} ${viewInfo} ${chalk.dim("|")} ${chalk.yellow("Panes:")} ${agentCount} ${chalk.dim("|")} ${chalk.yellow("Agent:")} ${agentInfo} ${chalk.dim("|")} ${keys}`;
    // Pad to full width to overwrite any previous content
    output += header + " ".repeat(Math.max(0, this.cols - this.stripAnsi(header).length));

    // Separator
    output += ansi.moveTo(2, 1);
    output += "─".repeat(this.cols);

    if (this.panes.length === 0) {
      // Clear content area
      const blankLine = " ".repeat(this.cols);
      for (let row = 3; row <= this.rows; row++) {
        output += ansi.moveTo(row, 1) + blankLine;
      }
      const msg = chalk.dim("No agents configured. Press ") + chalk.yellow("n") + chalk.dim(" to create a new agent.");
      const x = Math.floor((this.cols - 50) / 2); // Approximate visible length
      const y = Math.floor(this.rows / 2);
      output += `${ansi.moveTo(y, x)}${msg}`;
    } else {
      const indicesToRender = this.viewMode === "single" ? [this.selectedIndex] : this.panes.map((_, i) => i);

      for (const idx of indicesToRender) {
        output += this.renderPane(idx);
      }
    }

    // Only write if output changed (reduces unnecessary redraws)
    if (output !== this.lastRenderedOutput) {
      this.lastRenderedOutput = output;
      process.stdout.write(output);
    }
  }

  /** Strip ANSI codes from a string to get visible length */
  private stripAnsi(str: string): string {
    // Match ESC [ followed by any number of digits/semicolons, then 'm'
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require control chars
    return str.replace(/\x1b\[[0-9;]*m/g, "");
  }

  private renderPane(index: number): string {
    const pane = this.panes[index];
    if (!pane) return "";

    const region = this.getPaneRegion(index);
    const isFocused = index === this.focusedIndex;
    const isSelected = index === this.selectedIndex && this.focusedIndex === null;

    // Get chalk function for border based on status and selection
    let borderState: BorderState = "default";
    if (pane.status === "error") {
      borderState = "error";
    } else if (isFocused) {
      borderState = "focused";
    } else if (isSelected) {
      borderState = "selected";
    } else if (pane.status === "running") {
      borderState = "running";
    }
    const border = getBorderChalk(borderState);

    let output = "";

    // Status indicator with chalk colors
    const statusIcon =
      pane.status === "running" ? chalk.green("●") : pane.status === "error" ? chalk.red("✗") : chalk.gray("○");
    const focusStatus = isFocused ? chalk.cyan(" (focused)") : isSelected ? chalk.yellow(" (selected)") : "";
    const nameStyled = border.bold(pane.config.name);

    // Add CPU/memory stats if available
    let statsText = "";
    let statsVisibleLen = 0;
    if (pane.stats) {
      statsText = chalk.dim(` [${pane.stats.cpu}% ${pane.stats.memory}MB]`);
      // Approximate visible length: " [X.X% X.XMB]"
      statsVisibleLen = 3 + String(pane.stats.cpu).length + 2 + String(pane.stats.memory).length + 3;
    }

    const titleText = `─ ${statusIcon} ${nameStyled}${focusStatus}${statsText} `;
    const titleVisibleLen = 4 + pane.config.name.length + (isFocused ? 10 : isSelected ? 11 : 0) + statsVisibleLen;
    const remainingWidth = region.w - titleVisibleLen - 2;

    output += ansi.moveTo(region.y, region.x + 1);
    output += border(`╭${titleText}${"─".repeat(Math.max(0, remainingWidth))}╮`);

    // Content from xterm buffer
    const contentH = region.h - 2;
    const contentW = region.w - 2;
    const buffer = pane.term.buffer.active;
    const viewportY = buffer.viewportY;

    for (let row = 0; row < contentH; row++) {
      output += ansi.moveTo(region.y + 1 + row, region.x + 1);
      output += border("│");

      const line = buffer.getLine(viewportY + row);
      let colsRendered = 0;

      if (line) {
        for (let col = 0; col < contentW && colsRendered < contentW; col++) {
          const cell = line.getCell(col);
          if (cell) {
            const width = cell.getWidth();
            if (width === 0) continue;

            const char = cell.getChars() || " ";
            let cellOutput = "";

            if (cell.isBold()) cellOutput += ansi.bold;
            if (cell.isDim()) cellOutput += ansi.dim;
            if (cell.isItalic()) cellOutput += ansi.italic;
            if (cell.isUnderline()) cellOutput += ansi.underline;
            if (cell.isInverse()) cellOutput += ansi.inverse;
            if (cell.isStrikethrough()) cellOutput += ansi.strikethrough;

            cellOutput += cellFgToAnsi(cell);
            cellOutput += cellBgToAnsi(cell);
            cellOutput += char;
            cellOutput += ansi.reset;
            output += cellOutput;
            colsRendered += width;
          } else {
            output += " ";
            colsRendered++;
          }
        }
      }

      if (colsRendered < contentW) {
        output += " ".repeat(contentW - colsRendered);
      }

      output += border("│");
    }

    // Bottom border
    output += ansi.moveTo(region.y + region.h - 1, region.x + 1);
    output += border(`╰${"─".repeat(region.w - 2)}╯`);

    return output;
  }
}

// =============================================================================
// Task File Helpers
// =============================================================================

async function loadTasks(filePath: string): Promise<TasksFile> {
  const content = await Bun.file(filePath).text();
  const parsed = YAML.parse(content);
  return validateTasksFile(parsed);
}

function getAllAgents(tasks: Task[]): Set<string> {
  const agents = new Set<string>();
  function collect(taskList: Task[]) {
    for (const task of taskList) {
      if (task.agent_name) agents.add(task.agent_name);
      collect(task.subtasks);
    }
  }
  collect(tasks);
  return agents;
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  let tasksFile = "tasks.yaml";

  // Parse -f flag
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-f" || args[i] === "--file") {
      tasksFile = args[i + 1] || tasksFile;
      break;
    }
  }

  const tasksPath = resolve(tasksFile);
  const projectDir = dirname(tasksPath);

  // Load agents from tasks file
  let agentConfigs: AgentConfig[] = [];

  try {
    const tasks = await loadTasks(tasksPath);
    const agents = getAllAgents(tasks.tasks);

    // Create config for each agent
    for (const agentName of [...agents].sort()) {
      const cmd = ["bloom"];
      if (tasksFile !== "tasks.yaml") cmd.push("-f", tasksPath);
      cmd.push("agent", "run", agentName);
      agentConfigs.push({
        name: agentName,
        command: cmd,
        cwd: projectDir,
      });
    }

    // Add floating agent
    const floatingCmd = ["bloom"];
    if (tasksFile !== "tasks.yaml") floatingCmd.push("-f", tasksPath);
    floatingCmd.push("agent", "run", "floating");
    agentConfigs.push({
      name: "floating",
      command: floatingCmd,
      cwd: projectDir,
    });

    // Add dashboard pane
    const dashboardCmd = ["bloom"];
    if (tasksFile !== "tasks.yaml") dashboardCmd.push("-f", tasksPath);
    dashboardCmd.push("dashboard");
    agentConfigs.unshift({
      name: "dashboard",
      command: dashboardCmd,
      cwd: projectDir,
    });
  } catch (_err) {
    console.log(`Note: Could not load ${tasksFile}, starting with dashboard only`);
    agentConfigs = [
      {
        name: "dashboard",
        command: ["bloom", "dashboard"],
        cwd: projectDir,
      },
    ];
  }

  const tui = new OrchestratorTUI(agentConfigs);
  await tui.start();
}

// Only run main() if this file is executed directly, not when imported
if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
