#!/usr/bin/env bun
import { join, resolve } from "node:path";
import { Terminal } from "@xterm/headless";
import YAML from "yaml";
import { interjectSession } from "./agents";
import { ansi, CSI, cellBgToAnsi, cellFgToAnsi, getBorderColor, semantic } from "./colors";
import { createInterjection } from "./human-queue";
import { type Task, type TasksFile, validateTasksFile } from "./task-schema";
import { spawnTerminal, type TerminalProcess } from "./terminal";

// =============================================================================
// Types
// =============================================================================

interface AgentConfig {
  name: string;
  command: string[];
  cwd: string;
  env?: Record<string, string>;
}

interface Pane {
  id: number;
  proc: TerminalProcess | null;
  config: AgentConfig;
  term: Terminal;
  status: "running" | "stopped" | "error";
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
  private agentConfigs: AgentConfig[] = [];

  constructor(configs?: AgentConfig[]) {
    this.cols = process.stdout.columns || 80;
    this.rows = process.stdout.rows || 24;
    if (configs) {
      this.agentConfigs = configs;
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

    // Auto-create panes for configured agents
    for (const config of this.agentConfigs) {
      this.createPane(config);
    }

    this.render();
  }

  private cleanup() {
    this.panes.forEach((p) => {
      try {
        p.proc?.kill();
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
    }
  }

  private navigate(dir: "h" | "j" | "k" | "l") {
    if (this.panes.length === 0) return;

    const count = this.panes.length;

    if (this.viewMode === "single") {
      if (dir === "h" || dir === "k") {
        this.selectedIndex = (this.selectedIndex - 1 + count) % count;
      } else {
        this.selectedIndex = (this.selectedIndex + 1) % count;
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

  private createPane(config: AgentConfig) {
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

    // Start the process
    this.startPaneProcess(pane);
    this.scheduleRender();
  }

  private async startPaneProcess(pane: Pane) {
    const size = this.getPaneSize();
    const cols = Math.max(20, size.cols);
    const rows = Math.max(5, size.rows);

    try {
      const proc = await spawnTerminal(pane.config.command, {
        cwd: pane.config.cwd,
        env: pane.config.env,
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
      pane.proc?.kill();
      pane.proc = null;
      pane.status = "stopped";
      pane.term.write("\r\n[Process killed]\r\n");
    } catch {}
    this.scheduleRender();
  }

  private restartPane(index: number) {
    const pane = this.panes[index];
    if (!pane) return;

    // Kill existing process
    try {
      pane.proc?.kill();
      pane.proc = null;
    } catch {}

    // Clear terminal
    pane.term.clear();
    pane.term.write(`[Restarting ${pane.config.name}...]\r\n\r\n`);

    // Start new process
    this.startPaneProcess(pane);
    this.scheduleRender();
  }

  private deletePane(index: number) {
    const pane = this.panes[index];
    if (!pane) return;

    try {
      pane.proc?.kill();
      pane.term.dispose();
    } catch {}

    this.panes.splice(index, 1);

    if (this.selectedIndex >= this.panes.length) {
      this.selectedIndex = Math.max(0, this.panes.length - 1);
    }
    if (this.focusedIndex !== null && this.focusedIndex >= this.panes.length) {
      this.focusedIndex = null;
    }

    this.resizeAllPanes();
    this.scheduleRender();
  }

  private async interjectPane(index: number) {
    const pane = this.panes[index];
    if (!pane) return;

    // Skip non-agent panes (dashboard, questions)
    if (pane.config.name === "dashboard" || pane.config.name === "questions") {
      pane.term.write(`\r\n${semantic.warning}[Cannot interject this pane]${ansi.reset}\r\n`);
      this.scheduleRender();
      return;
    }

    // Try to interject the agent session
    const session = interjectSession(pane.config.name);
    const workingDir = session?.workingDirectory || pane.config.cwd;

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
    pane.term.write(`\r\n${semantic.warning}━━━ INTERJECTED ━━━${ansi.reset}\r\n`);
    pane.term.write(`${semantic.muted}Session moved to new pane. Press "r" to restart agent later.${ansi.reset}\r\n`);

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

    // Write context info to the new pane
    const newPane = this.panes[newPaneIndex];
    if (newPane) {
      newPane.term.write(`${semantic.warning}━━━ HUMAN TAKEOVER: ${pane.config.name} ━━━${ansi.reset}\r\n`);
      newPane.term.write(`${semantic.muted}Interjection ID: ${interjectionId}${ansi.reset}\r\n`);
      if (session?.taskId) {
        newPane.term.write(`${semantic.muted}Task: ${session.taskId}${ansi.reset}\r\n`);
      }
      newPane.term.write(`${semantic.muted}Dir: ${workingDir}${ansi.reset}\r\n`);
      if (session?.sessionId) {
        newPane.term.write(`${semantic.muted}Resuming session: ${session.sessionId}${ansi.reset}\r\n`);
      }
      newPane.term.write(`${semantic.muted}Ctrl+B to exit focus, "X" to close when done${ansi.reset}\r\n\r\n`);
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
    // Full clear: reset, home, clear screen, clear scrollback, hide cursor
    let output = `${ansi.reset + ansi.hideCursor}${CSI}H${CSI}2J${CSI}3J`;

    // Fill entire screen with spaces to ensure complete clear
    const blankLine = " ".repeat(this.cols);
    for (let row = 1; row <= this.rows; row++) {
      output += ansi.moveTo(row, 1) + blankLine;
    }

    // Header
    output += ansi.moveTo(1, 1);
    output += `${semantic.header.bg}${semantic.header.fg}${semantic.header.style}`;
    const header = ` Bloom Orchestrator | View: ${this.viewMode} | Agents: ${this.panes.length} | n:new r:restart x:kill X:delete i:interject v:view hjkl:nav Enter:focus ^B:back q:quit `;
    output += header.padEnd(this.cols);
    output += ansi.reset;

    // Separator
    output += ansi.moveTo(2, 1);
    output += `${semantic.separator}${"─".repeat(this.cols)}${ansi.reset}`;

    if (this.panes.length === 0) {
      const msg = "No agents configured. Press 'n' to create a new agent.";
      const x = Math.floor((this.cols - msg.length) / 2);
      const y = Math.floor(this.rows / 2);
      output += `${ansi.moveTo(y, x)}${semantic.warning}${msg}${ansi.reset}`;
    } else {
      const indicesToRender = this.viewMode === "single" ? [this.selectedIndex] : this.panes.map((_, i) => i);

      for (const idx of indicesToRender) {
        output += this.renderPane(idx);
      }
    }

    process.stdout.write(output);
  }

  private renderPane(index: number): string {
    const pane = this.panes[index];
    if (!pane) return "";

    const region = this.getPaneRegion(index);
    const isFocused = index === this.focusedIndex;
    const isSelected = index === this.selectedIndex && this.focusedIndex === null;

    // Color based on status and selection
    let borderColor = getBorderColor("default");
    if (pane.status === "error") {
      borderColor = getBorderColor("error");
    } else if (isFocused) {
      borderColor = getBorderColor("focused");
    } else if (isSelected) {
      borderColor = getBorderColor("selected");
    } else if (pane.status === "running") {
      borderColor = getBorderColor("running");
    }

    let output = "";

    // Status indicator
    const statusIcon = pane.status === "running" ? "●" : pane.status === "error" ? "✗" : "○";
    const focusStatus = isFocused ? " (focused)" : isSelected ? " (selected)" : "";
    const titleText = `─ ${statusIcon} ${pane.config.name}${focusStatus} `;
    const remainingWidth = region.w - titleText.length - 2;

    output += ansi.moveTo(region.y, region.x + 1);
    output += `${CSI}${borderColor}m`;
    output += `╭${titleText}${"─".repeat(Math.max(0, remainingWidth))}╮`;

    // Content from xterm buffer
    const contentH = region.h - 2;
    const contentW = region.w - 2;
    const buffer = pane.term.buffer.active;
    const viewportY = buffer.viewportY;

    for (let row = 0; row < contentH; row++) {
      output += ansi.moveTo(region.y + 1 + row, region.x + 1);
      output += `${CSI}${borderColor}m│${ansi.reset}`;

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

      output += `${CSI}${borderColor}m│${ansi.reset}`;
    }

    // Bottom border
    output += ansi.moveTo(region.y + region.h - 1, region.x + 1);
    output += `${CSI}${borderColor}m`;
    output += `╰${"─".repeat(region.w - 2)}╯`;
    output += ansi.reset;

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

  const BLOOM_DIR = resolve(import.meta.dirname ?? ".");
  const tasksPath = resolve(tasksFile);

  // Load agents from tasks file
  let agentConfigs: AgentConfig[] = [];

  try {
    const tasks = await loadTasks(tasksPath);
    const agents = getAllAgents(tasks.tasks);

    // Create config for each agent
    for (const agentName of [...agents].sort()) {
      const fileArg = tasksFile !== "tasks.yaml" ? `-f "${tasksPath}"` : "";
      agentConfigs.push({
        name: agentName,
        command: ["bun", join(BLOOM_DIR, "index.ts"), fileArg, "agent", "run", agentName].filter(Boolean),
        cwd: BLOOM_DIR,
      });
    }

    // Add floating agent
    const fileArg = tasksFile !== "tasks.yaml" ? `-f "${tasksPath}"` : "";
    agentConfigs.push({
      name: "floating",
      command: ["bun", join(BLOOM_DIR, "index.ts"), fileArg, "agent", "run", "floating"].filter(Boolean),
      cwd: BLOOM_DIR,
    });

    // Add dashboard pane
    agentConfigs.unshift({
      name: "dashboard",
      command: ["bun", join(BLOOM_DIR, "task-cli.ts"), fileArg, "dashboard"].filter(Boolean),
      cwd: BLOOM_DIR,
    });
  } catch (_err) {
    console.log(`Note: Could not load ${tasksFile}, starting with dashboard only`);
    agentConfigs = [
      {
        name: "dashboard",
        command: ["bun", join(BLOOM_DIR, "task-cli.ts"), "dashboard"],
        cwd: BLOOM_DIR,
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
