// =============================================================================
// Event-Driven TUI
// =============================================================================
// Pure event-driven TUI using simple scrollable text logs instead of xterm.
// Much lower memory footprint and simpler architecture.

import type { FSWatcher } from "node:fs";
import { watch } from "node:fs";
import { interjectGenericSession } from "../../agents";
import type { EventHandler, OrchestratorEvent } from "../../core/orchestrator";
import {
  answerQuestion,
  createInterjection,
  listQuestions,
  type Question,
  type QueueEventHandler,
  watchQueue,
} from "../../human-queue";
import { ansi, type BorderState, chalk, getBorderChalk, style } from "../../infra/colors";
import { getProcessStatsBatch } from "../../infra/terminal";
import { loadTasks } from "../../tasks";
import type { AgentPane, QuestionDisplay, TasksSummary, ViewMode } from "./types";

// Maximum lines to keep per pane (prevents unbounded memory growth)
const MAX_OUTPUT_LINES = 2000;

// =============================================================================
// TUI Class
// =============================================================================

export class EventDrivenTUI {
  private panes: Map<string, AgentPane> = new Map();
  private paneOrder: string[] = [];
  private selectedIndex = 0;
  private viewMode: ViewMode = "tiled";
  private cols: number;
  private rows: number;
  private renderScheduled = false;
  private lastRenderedOutput = "";
  private statsUpdateInterval?: ReturnType<typeof setInterval>;
  private isRunning = false;

  // Questions panel state
  private pendingQuestions: QuestionDisplay[] = [];
  private selectedQuestionIndex = 0;
  private showQuestionsPanel = false;
  private answerMode = false;
  private answerInput = "";
  private questionWatcherCleanup?: () => void;

  // Dashboard/tasks summary state
  private tasksFile?: string;
  private tasksWatcher?: FSWatcher;
  private tasksSummary?: TasksSummary;

  constructor() {
    this.cols = process.stdout.columns || 80;
    this.rows = process.stdout.rows || 24;
  }

  /**
   * Set the tasks file path for dashboard summary.
   */
  setTasksFile(tasksFile: string): void {
    this.tasksFile = tasksFile;
  }

  /**
   * Initialize a pane for an agent.
   */
  addPane(agentName: string): void {
    if (this.panes.has(agentName)) return;

    const pane: AgentPane = {
      id: agentName,
      name: agentName,
      status: "idle",
      outputLines: [],
      scrollOffset: 0,
    };

    this.panes.set(agentName, pane);
    this.paneOrder.push(agentName);
  }

  /**
   * Get the event handler that updates TUI state.
   */
  getEventHandler(): EventHandler {
    return (event: OrchestratorEvent) => this.handleEvent(event);
  }

  /**
   * Start the TUI display loop.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Enter alternate screen
    process.stdout.write(ansi.enterAltScreen + ansi.hideCursor + ansi.clearScreen);

    // Set up raw mode for input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on("data", this.handleInput.bind(this));

    // Handle resize
    process.on("SIGWINCH", () => {
      this.cols = process.stdout.columns || 80;
      this.rows = process.stdout.rows || 24;
      this.lastRenderedOutput = ""; // Force full re-render
      this.scheduleRender();
    });

    // Handle exit signals
    const cleanup = () => {
      this.stop();
      process.exit(0);
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    // Start stats updates
    this.statsUpdateInterval = setInterval(() => this.updateStats(), 5000);
    this.updateStats();

    // Start questions watcher
    this.initializeQuestionsWatcher();

    // Start tasks file watcher for dashboard
    this.initializeTasksWatcher();

    // Initial render
    this.render();
  }

  /**
   * Initialize questions watcher and load existing questions.
   */
  private async initializeQuestionsWatcher(): Promise<void> {
    // Load existing pending questions
    try {
      const questions = await listQuestions("pending");
      this.pendingQuestions = questions.map((q) => ({
        id: q.id,
        agentName: q.agentName,
        question: q.question,
        questionType: q.questionType || "open",
        options: q.options,
        createdAt: new Date(q.createdAt),
      }));
      if (this.pendingQuestions.length > 0) {
        this.scheduleRender();
      }
    } catch {
      // Questions directory may not exist yet
    }

    // Watch for changes
    this.questionWatcherCleanup = watchQueue((event) => {
      if (event.type === "question_added" && event.question) {
        // Add if not already present
        if (!this.pendingQuestions.find((q) => q.id === event.questionId)) {
          this.pendingQuestions.push({
            id: event.question.id,
            agentName: event.question.agentName,
            question: event.question.question,
            questionType: event.question.questionType || "open",
            options: event.question.options,
            createdAt: new Date(event.question.createdAt),
          });
        }
      } else if (event.type === "question_answered" || event.type === "question_deleted") {
        this.pendingQuestions = this.pendingQuestions.filter((q) => q.id !== event.questionId);
        // Adjust selected index if needed
        if (this.selectedQuestionIndex >= this.pendingQuestions.length) {
          this.selectedQuestionIndex = Math.max(0, this.pendingQuestions.length - 1);
        }
      }
      this.scheduleRender();
    });
  }

  /**
   * Initialize tasks file watcher for dashboard summary.
   */
  private initializeTasksWatcher(): void {
    if (!this.tasksFile) return;

    // Initial load
    this.updateTasksSummary();

    // Watch for changes
    this.tasksWatcher = watch(this.tasksFile, { persistent: false }, () => {
      this.updateTasksSummary();
    });
  }

  /**
   * Update tasks summary from the tasks file.
   */
  private async updateTasksSummary(): Promise<void> {
    if (!this.tasksFile) return;

    try {
      const tasksData = await loadTasks(this.tasksFile);
      const tasks = tasksData.tasks || [];

      this.tasksSummary = {
        total: tasks.length,
        done: tasks.filter((t) => t.status === "done" || t.status === "done_pending_merge").length,
        inProgress: tasks.filter((t) => t.status === "in_progress" || t.status === "assigned").length,
        blocked: tasks.filter((t) => t.status === "blocked").length,
        pending: tasks.filter((t) => t.status === "todo" || t.status === "ready_for_agent").length,
      };

      this.scheduleRender();
    } catch {
      // Tasks file may not exist or be invalid
    }
  }

  /**
   * Stop the TUI and restore terminal.
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
    }

    // Clean up question watcher
    if (this.questionWatcherCleanup) {
      this.questionWatcherCleanup();
      this.questionWatcherCleanup = undefined;
    }

    // Clean up tasks watcher
    if (this.tasksWatcher) {
      this.tasksWatcher.close();
      this.tasksWatcher = undefined;
    }

    process.stdout.write(ansi.showCursor + ansi.leaveAltScreen);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  private handleEvent(event: OrchestratorEvent): void {
    switch (event.type) {
      case "agent:started": {
        const pane = this.getOrCreatePane(event.agentName);
        this.appendOutput(pane, style.info(`Agent started (${event.provider}, poll: ${event.pollInterval / 1000}s)`));
        break;
      }

      case "agent:idle": {
        const pane = this.panes.get(event.agentName);
        if (pane && pane.status !== "idle") {
          pane.status = "idle";
          this.scheduleRender();
        }
        break;
      }

      case "agent:output": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          this.appendOutput(pane, event.data, false);
        }
        break;
      }

      case "agent:process_started": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          pane.currentPid = event.pid;
          this.appendOutput(pane, style.muted(`[Process started: PID ${event.pid}]`));
        }
        break;
      }

      case "agent:process_ended": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          pane.currentPid = undefined;
          pane.stats = undefined;
          this.appendOutput(pane, style.muted(`[Process ended: exit ${event.exitCode}]`));
        }
        break;
      }

      case "task:found": {
        const pane = this.getOrCreatePane(event.agentName);
        pane.status = "running";
        pane.currentTaskId = event.taskId;
        pane.currentTaskTitle = event.title;
        this.appendOutput(pane, "");
        this.appendOutput(pane, style.header(`━━━ Task: ${event.taskId} ━━━`));
        this.appendOutput(pane, style.label(event.title));
        if (event.repo) {
          this.appendOutput(pane, style.path(`Repo: ${event.repo}`));
        }
        break;
      }

      case "task:started": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          pane.taskStartTime = Date.now();
          this.appendOutput(pane, style.muted(`Working in: ${event.workingDir}`));
          if (event.resuming) {
            this.appendOutput(pane, style.info("Resuming session..."));
          }
        }
        break;
      }

      case "task:completed": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          pane.status = "completed";
          this.appendOutput(pane, "");
          this.appendOutput(pane, style.success(`✓ Task completed in ${event.duration}s`));
        }
        break;
      }

      case "task:failed": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          pane.status = "failed";
          this.appendOutput(pane, "");
          this.appendOutput(pane, style.error(`✗ Task failed after ${event.duration}s`));
          this.appendOutput(pane, style.error(event.error));
        }
        break;
      }

      case "task:blocked": {
        const pane = this.panes.get(event.agentName);
        if (pane) {
          pane.status = "blocked";
          this.appendOutput(pane, style.warning(`⚠ Task blocked: ${event.reason}`));
        }
        break;
      }

      case "git:pulling":
        this.appendToAgent(event.repo, style.muted(`Pulling latest from ${event.repo}...`));
        break;

      case "git:pulled":
        if (event.error) {
          this.appendToAgent(event.repo, style.warning(`Pull failed: ${event.error}`));
        } else if (event.updated) {
          this.appendToAgent(event.repo, style.success("Updated to latest"));
        }
        break;

      case "worktree:creating":
        this.appendToAgent(event.repo, style.muted(`Creating worktree: ${event.branch}`));
        break;

      case "worktree:created":
        if (!event.success) {
          this.appendToAgent(event.repo, style.error(`Worktree failed: ${event.error}`));
        }
        break;

      case "git:pushing":
        this.broadcastMessage(style.muted(`Pushing ${event.branch}...`));
        break;

      case "git:pushed":
        if (event.success) {
          this.broadcastMessage(style.success(`Pushed ${event.branch}`));
        } else {
          this.broadcastMessage(style.warning(`Push failed: ${event.error}`));
        }
        break;

      case "git:pr_creating":
        this.broadcastMessage(style.muted(`Creating PR: ${event.sourceBranch} → ${event.targetBranch}`));
        break;

      case "git:pr_created":
        if (event.url) {
          this.broadcastMessage(style.success(`PR created: ${event.url}`));
        } else if (event.alreadyExists) {
          this.broadcastMessage(style.info("PR already exists"));
        } else if (event.error) {
          this.broadcastMessage(style.warning(`PR failed: ${event.error}`));
        }
        break;

      case "git:merging":
        this.broadcastMessage(style.muted(`Merging ${event.sourceBranch} → ${event.targetBranch}`));
        break;

      case "git:merged":
        this.broadcastMessage(style.success(`Merged ${event.sourceBranch}`));
        break;

      case "git:merge_conflict":
        this.broadcastMessage(style.warning("Merge conflict - agent resolving..."));
        break;

      case "merge:conflict_resolved":
        if (event.success) {
          this.broadcastMessage(style.success("Conflict resolved"));
        } else {
          this.broadcastMessage(style.error("Conflict resolution failed"));
        }
        break;

      case "error":
        this.broadcastMessage(style.error(`Error: ${event.message}`));
        break;

      case "log":
        // Only show warnings and errors in TUI
        if (event.level === "warn" || event.level === "error") {
          this.broadcastMessage(style[event.level === "warn" ? "warning" : "error"](event.message));
        }
        break;
    }
  }

  private getOrCreatePane(agentName: string): AgentPane {
    let pane = this.panes.get(agentName);
    if (!pane) {
      this.addPane(agentName);
      pane = this.panes.get(agentName)!;
    }
    return pane;
  }

  private appendOutput(pane: AgentPane, text: string, addNewline = true): void {
    // Split into lines, handling ANSI properly
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      if (addNewline || line.length > 0) {
        pane.outputLines.push(line);
      }
    }

    // Trim to max lines
    if (pane.outputLines.length > MAX_OUTPUT_LINES) {
      pane.outputLines = pane.outputLines.slice(-MAX_OUTPUT_LINES);
    }

    // Reset scroll to bottom when new output arrives
    pane.scrollOffset = 0;

    this.scheduleRender();
  }

  private appendToAgent(identifier: string, text: string): void {
    // Try to find a pane that matches (could be agent name or repo name)
    for (const pane of this.panes.values()) {
      if (pane.name === identifier || pane.currentTaskId?.includes(identifier)) {
        this.appendOutput(pane, text);
        return;
      }
    }
    // If no match, broadcast to all
    this.broadcastMessage(text);
  }

  private broadcastMessage(text: string): void {
    for (const pane of this.panes.values()) {
      if (pane.status === "running") {
        this.appendOutput(pane, text);
        return;
      }
    }
    // If no running pane, add to first pane
    const firstPane = this.panes.values().next().value;
    if (firstPane) {
      this.appendOutput(firstPane, text);
    }
  }

  // ===========================================================================
  // Stats Updates
  // ===========================================================================

  private async updateStats(): Promise<void> {
    const pidsToQuery: number[] = [];
    const panesByPid = new Map<number, AgentPane>();

    for (const pane of this.panes.values()) {
      if (pane.currentPid) {
        pidsToQuery.push(pane.currentPid);
        panesByPid.set(pane.currentPid, pane);
      }
    }

    if (pidsToQuery.length === 0) return;

    const statsMap = await getProcessStatsBatch(pidsToQuery);

    let changed = false;
    for (const [pid, pane] of panesByPid) {
      const stats = statsMap.get(pid);
      if (stats) {
        pane.stats = stats;
        changed = true;
      }
    }

    if (changed) {
      this.scheduleRender();
    }
  }

  // ===========================================================================
  // Input Handling
  // ===========================================================================

  private handleInput(data: Buffer): void {
    const str = data.toString();

    // Ctrl+C - exit
    if (str === "\x03") {
      this.stop();
      process.exit(0);
    }

    // Handle answer mode input
    if (this.answerMode) {
      this.handleAnswerModeInput(str);
      return;
    }

    switch (str) {
      case "v":
        // Toggle view mode
        this.viewMode = this.viewMode === "tiled" ? "single" : "tiled";
        this.lastRenderedOutput = ""; // Force full re-render
        this.scheduleRender();
        break;

      case "q":
        this.stop();
        process.exit(0);
        break;

      case "h":
      case "\x1b[D": // Left arrow
        if (this.showQuestionsPanel) {
          // Navigate questions if panel is open
        } else {
          this.navigate("left");
        }
        break;

      case "j":
      case "\x1b[B": // Down arrow
        if (this.showQuestionsPanel && this.pendingQuestions.length > 0) {
          this.selectedQuestionIndex = Math.min(this.selectedQuestionIndex + 1, this.pendingQuestions.length - 1);
          this.scheduleRender();
        } else {
          this.navigate("down");
        }
        break;

      case "k":
      case "\x1b[A": // Up arrow
        if (this.showQuestionsPanel && this.pendingQuestions.length > 0) {
          this.selectedQuestionIndex = Math.max(this.selectedQuestionIndex - 1, 0);
          this.scheduleRender();
        } else {
          this.navigate("up");
        }
        break;

      case "l":
      case "\x1b[C": // Right arrow
        if (this.showQuestionsPanel) {
          // Navigate questions if panel is open
        } else {
          this.navigate("right");
        }
        break;

      case "i":
        // Interject selected agent
        this.interjectSelectedAgent();
        break;

      case "g":
        // Scroll to top
        this.scrollSelectedPane(-Infinity);
        break;

      case "G":
        // Scroll to bottom
        this.scrollSelectedPane(Infinity);
        break;

      case " ":
        // Page down
        this.scrollSelectedPane(this.getContentHeight());
        break;

      case "?":
        // Toggle questions panel visibility
        this.showQuestionsPanel = !this.showQuestionsPanel;
        this.lastRenderedOutput = ""; // Force full re-render
        this.scheduleRender();
        break;

      case "a":
        // Enter answer mode for selected question
        if (this.showQuestionsPanel && this.pendingQuestions.length > 0) {
          this.answerMode = true;
          this.answerInput = "";
          this.lastRenderedOutput = ""; // Force full re-render
          this.scheduleRender();
        }
        break;

      case "y":
        // Quick yes answer for yes/no questions
        if (this.showQuestionsPanel && this.pendingQuestions.length > 0) {
          const q = this.pendingQuestions[this.selectedQuestionIndex];
          if (q && q.questionType === "yes_no") {
            this.submitAnswer("yes");
          }
        }
        break;

      case "n":
        // Quick no answer for yes/no questions (but not if it would conflict with navigation)
        if (this.showQuestionsPanel && this.pendingQuestions.length > 0) {
          const q = this.pendingQuestions[this.selectedQuestionIndex];
          if (q && q.questionType === "yes_no") {
            this.submitAnswer("no");
          }
        }
        break;
    }
  }

  /**
   * Handle input while in answer mode.
   */
  private handleAnswerModeInput(str: string): void {
    if (str === "\x1b" || str === "\x1b\x1b") {
      // Escape - exit answer mode
      this.answerMode = false;
      this.answerInput = "";
      this.scheduleRender();
    } else if (str === "\r" || str === "\n") {
      // Enter - submit answer
      if (this.answerInput.trim()) {
        this.submitAnswer(this.answerInput.trim());
      }
    } else if (str === "\x7f" || str === "\b") {
      // Backspace
      this.answerInput = this.answerInput.slice(0, -1);
      this.scheduleRender();
    } else if (str.length === 1 && str >= " " && str <= "~") {
      // Printable character
      this.answerInput += str;
      this.scheduleRender();
    }
  }

  /**
   * Submit an answer to the selected question.
   */
  private async submitAnswer(answer: string): Promise<void> {
    if (this.pendingQuestions.length === 0) return;

    const q = this.pendingQuestions[this.selectedQuestionIndex];
    if (!q) return;

    try {
      await answerQuestion(q.id, answer);
      // The question will be removed via the watcher
    } catch {
      // Handle error silently - the watcher will update state
    }

    this.answerMode = false;
    this.answerInput = "";
    this.scheduleRender();
  }

  private navigate(dir: "up" | "down" | "left" | "right"): void {
    if (this.paneOrder.length === 0) return;

    const count = this.paneOrder.length;

    if (this.viewMode === "single") {
      // In single view: left/right switch panes, up/down scroll
      if (dir === "left") {
        this.selectedIndex = (this.selectedIndex - 1 + count) % count;
        this.scheduleRender();
      } else if (dir === "right") {
        this.selectedIndex = (this.selectedIndex + 1) % count;
        this.scheduleRender();
      } else if (dir === "up") {
        this.scrollSelectedPane(-3);
      } else if (dir === "down") {
        this.scrollSelectedPane(3);
      }
    } else {
      // In tiled view: hjkl navigates between panes
      const tilesPerRow = Math.ceil(Math.sqrt(count));
      const currentRow = Math.floor(this.selectedIndex / tilesPerRow);
      const currentCol = this.selectedIndex % tilesPerRow;
      let newIndex = this.selectedIndex;

      if (dir === "left") {
        newIndex = currentRow * tilesPerRow + ((currentCol - 1 + tilesPerRow) % tilesPerRow);
      } else if (dir === "right") {
        newIndex = currentRow * tilesPerRow + ((currentCol + 1) % tilesPerRow);
      } else if (dir === "up") {
        const totalRows = Math.ceil(count / tilesPerRow);
        newIndex = ((currentRow - 1 + totalRows) % totalRows) * tilesPerRow + currentCol;
      } else if (dir === "down") {
        const totalRows = Math.ceil(count / tilesPerRow);
        newIndex = ((currentRow + 1) % totalRows) * tilesPerRow + currentCol;
      }

      if (newIndex < count && newIndex !== this.selectedIndex) {
        this.selectedIndex = newIndex;
        this.scheduleRender();
      }
    }
  }

  private scrollSelectedPane(delta: number): void {
    const paneId = this.paneOrder[this.selectedIndex];
    if (!paneId) return;

    const pane = this.panes.get(paneId);
    if (!pane) return;

    const maxScroll = Math.max(0, pane.outputLines.length - this.getContentHeight());

    if (delta === -Infinity) {
      pane.scrollOffset = maxScroll;
    } else if (delta === Infinity) {
      pane.scrollOffset = 0;
    } else {
      pane.scrollOffset = Math.max(0, Math.min(maxScroll, pane.scrollOffset - delta));
    }

    this.scheduleRender();
  }

  private getContentHeight(): number {
    const availableHeight = this.rows - 2; // Header
    if (this.viewMode === "single") {
      return availableHeight - 2; // Border
    }
    const count = Math.max(1, this.paneOrder.length);
    const tilesPerCol = Math.ceil(count / Math.ceil(Math.sqrt(count)));
    return Math.floor(availableHeight / tilesPerCol) - 2;
  }

  private async interjectSelectedAgent(): Promise<void> {
    const paneId = this.paneOrder[this.selectedIndex];
    if (!paneId) return;

    const pane = this.panes.get(paneId);
    if (!pane || pane.status !== "running") {
      this.appendOutput(pane!, style.warning("Cannot interject - agent not running"));
      return;
    }

    // Try to interject the agent session
    const session = interjectGenericSession(pane.name);

    // Create interjection record
    await createInterjection(pane.name, {
      taskId: pane.currentTaskId,
      sessionId: session?.sessionId,
      workingDirectory: session?.workingDirectory ?? process.cwd(),
      reason: "User interjection from TUI",
    });

    pane.status = "idle";
    pane.currentPid = undefined;
    pane.stats = undefined;

    this.appendOutput(pane, "");
    this.appendOutput(pane, style.warning("━━━ INTERJECTED ━━━"));
    this.appendOutput(pane, style.info("Agent will resume on next poll cycle."));
    this.appendOutput(pane, style.muted("Session preserved for continuation."));
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  private scheduleRender(): void {
    if (this.renderScheduled || !this.isRunning) return;
    this.renderScheduled = true;
    setImmediate(() => {
      this.renderScheduled = false;
      this.render();
    });
  }

  private render(): void {
    if (!this.isRunning) return;

    let output = "";

    // Move cursor home without clearing
    output += `${ansi.hideCursor}\x1b[H`;

    // Render header
    output += this.renderHeader();

    // Render separator
    output += ansi.moveTo(2, 1);
    output += "─".repeat(this.cols);

    // Render panes
    if (this.paneOrder.length === 0) {
      output += this.renderEmptyState();
    } else if (this.viewMode === "single") {
      output += this.renderSinglePane();
    } else {
      output += this.renderTiledPanes();
    }

    // Render questions panel if visible
    if (this.showQuestionsPanel && this.pendingQuestions.length > 0) {
      output += this.renderQuestionsPanel();
    }

    // Only write if changed
    if (output !== this.lastRenderedOutput) {
      this.lastRenderedOutput = output;
      process.stdout.write(output);
    }
  }

  private renderHeader(): string {
    const title = chalk.bold.cyan(" Bloom TUI");
    const viewInfo = chalk.gray(` ${this.viewMode}`);

    // Count agents
    const runningCount = [...this.panes.values()].filter((p) => p.status === "running").length;
    const agentCount = chalk.green(`${runningCount}/${this.paneOrder.length}`);

    // Aggregate stats
    let totalCpu = 0;
    let totalMem = 0;
    for (const pane of this.panes.values()) {
      if (pane.stats) {
        totalCpu += pane.stats.cpu;
        totalMem += pane.stats.memory;
      }
    }
    const statsText =
      totalCpu > 0 || totalMem > 0 ? chalk.dim(` [${totalCpu.toFixed(1)}% ${totalMem.toFixed(0)}MB]`) : "";

    // Task summary
    let tasksText = "";
    if (this.tasksSummary) {
      const { done, total, inProgress, blocked } = this.tasksSummary;
      tasksText = ` ${chalk.dim("|")} ${chalk.blue("Tasks:")} ${chalk.green(String(done))}/${total}`;
      if (inProgress > 0) tasksText += chalk.cyan(` ${inProgress}▶`);
      if (blocked > 0) tasksText += chalk.red(` ${blocked}✗`);
    }

    // Questions indicator
    let questionsText = "";
    if (this.pendingQuestions.length > 0) {
      questionsText = ` ${chalk.dim("|")} ${chalk.yellow(`?:${this.pendingQuestions.length}`)}`;
    }

    const keys = chalk.dim("v:view ?:questions hjkl:nav i:interject q:quit");

    const header = `${title} ${chalk.dim("|")} ${viewInfo} ${chalk.dim("|")} ${chalk.yellow("Agents:")} ${agentCount}${statsText}${tasksText}${questionsText} ${chalk.dim("|")} ${keys}`;

    // Pad to full width
    const visibleLen = this.stripAnsi(header).length;
    return header + " ".repeat(Math.max(0, this.cols - visibleLen));
  }

  /**
   * Render the questions panel at the bottom of the screen.
   */
  private renderQuestionsPanel(): string {
    let output = "";

    // Calculate panel size
    const maxQuestions = Math.min(5, this.pendingQuestions.length);
    const panelHeight = maxQuestions + 4; // Questions + header + footer + borders
    const panelStartRow = this.rows - panelHeight;

    // Draw separator line
    output += ansi.moveTo(panelStartRow, 1);
    output += chalk.yellow("═".repeat(this.cols));

    // Header
    output += ansi.moveTo(panelStartRow + 1, 1);
    const headerText = chalk.bold.yellow(` Pending Questions (${this.pendingQuestions.length})`);
    output += headerText;
    output += " ".repeat(Math.max(0, this.cols - this.stripAnsi(headerText).length));

    // Questions list
    for (let i = 0; i < maxQuestions; i++) {
      const q = this.pendingQuestions[i];
      if (!q) continue;

      const row = panelStartRow + 2 + i;
      output += ansi.moveTo(row, 1);

      const selected = i === this.selectedQuestionIndex;
      const prefix = selected ? chalk.cyan("▶ ") : "  ";
      const typeIndicator =
        q.questionType === "yes_no"
          ? chalk.magenta("[Y/N]")
          : q.questionType === "choice"
            ? chalk.blue("[choice]")
            : chalk.gray("[open]");

      // Truncate question to fit
      const agentPart = chalk.dim(`[${q.agentName}]`);
      const questionMaxLen = this.cols - 25;
      let questionText = q.question.replace(/\n/g, " ");
      if (questionText.length > questionMaxLen) {
        questionText = questionText.slice(0, questionMaxLen - 3) + "...";
      }

      const line = `${prefix}${typeIndicator} ${agentPart} ${questionText}`;
      output += line;
      output += " ".repeat(Math.max(0, this.cols - this.stripAnsi(line).length));
    }

    // Footer with help text
    output += ansi.moveTo(panelStartRow + 2 + maxQuestions, 1);
    let footerText: string;
    if (this.answerMode) {
      footerText = chalk.cyan(` Answer: ${this.answerInput}█`) + chalk.dim(" (Enter to submit, Esc to cancel)");
    } else {
      const selectedQ = this.pendingQuestions[this.selectedQuestionIndex];
      if (selectedQ?.questionType === "yes_no") {
        footerText = chalk.dim(" j/k:navigate  y:yes  n:no  a:custom answer  ?:close");
      } else {
        footerText = chalk.dim(" j/k:navigate  a:answer  ?:close");
      }
    }
    output += footerText;
    output += " ".repeat(Math.max(0, this.cols - this.stripAnsi(footerText).length));

    return output;
  }

  private renderEmptyState(): string {
    let output = "";
    const blankLine = " ".repeat(this.cols);
    for (let row = 3; row <= this.rows; row++) {
      output += ansi.moveTo(row, 1) + blankLine;
    }
    const msg = chalk.dim("No agents configured. Waiting for work...");
    const x = Math.floor((this.cols - 40) / 2);
    const y = Math.floor(this.rows / 2);
    output += `${ansi.moveTo(y, x)}${msg}`;
    return output;
  }

  private renderSinglePane(): string {
    const paneId = this.paneOrder[this.selectedIndex];
    if (!paneId) return this.renderEmptyState();

    const pane = this.panes.get(paneId);
    if (!pane) return this.renderEmptyState();

    const region = { x: 0, y: 2, w: this.cols, h: this.rows - 2 };
    return this.renderPane(pane, region, true);
  }

  private renderTiledPanes(): string {
    let output = "";
    const count = this.paneOrder.length;
    const tilesPerRow = Math.ceil(Math.sqrt(count));
    const tilesPerCol = Math.ceil(count / tilesPerRow);
    const availableHeight = this.rows - 2;
    const tileW = Math.floor(this.cols / tilesPerRow);
    const tileH = Math.floor(availableHeight / tilesPerCol);

    for (let i = 0; i < count; i++) {
      const paneId = this.paneOrder[i];
      if (!paneId) continue;

      const pane = this.panes.get(paneId);
      if (!pane) continue;

      const row = Math.floor(i / tilesPerRow);
      const col = i % tilesPerRow;
      const region = {
        x: col * tileW,
        y: 2 + row * tileH,
        w: tileW,
        h: tileH,
      };

      output += this.renderPane(pane, region, i === this.selectedIndex);
    }

    return output;
  }

  private renderPane(
    pane: AgentPane,
    region: { x: number; y: number; w: number; h: number },
    isSelected: boolean
  ): string {
    let output = "";

    // Determine border style
    let borderState: BorderState = "default";
    if (pane.status === "failed" || pane.status === "blocked") {
      borderState = "error";
    } else if (isSelected) {
      borderState = "selected";
    } else if (pane.status === "running") {
      borderState = "running";
    }
    const border = getBorderChalk(borderState);

    // Status icon
    const statusIcon =
      pane.status === "running"
        ? chalk.green("●")
        : pane.status === "completed"
          ? chalk.green("✓")
          : pane.status === "failed" || pane.status === "blocked"
            ? chalk.red("✗")
            : chalk.gray("○");

    // Stats text
    let statsText = "";
    if (pane.stats) {
      statsText = chalk.dim(` [${pane.stats.cpu}% ${pane.stats.memory}MB]`);
    }

    // Build title
    const nameStyled = border.bold(pane.name);
    const titleContent = `─ ${statusIcon} ${nameStyled}${statsText} `;
    const titleVisibleLen =
      4 +
      pane.name.length +
      (pane.stats ? 3 + String(pane.stats.cpu).length + 2 + String(pane.stats.memory).length + 3 : 0);
    const remainingWidth = region.w - titleVisibleLen - 2;

    // Top border
    output += ansi.moveTo(region.y, region.x + 1);
    output += border(`╭${titleContent}${"─".repeat(Math.max(0, remainingWidth))}╮`);

    // Content area
    const contentH = region.h - 2;
    const contentW = region.w - 2;
    const startLine = Math.max(0, pane.outputLines.length - contentH - pane.scrollOffset);

    for (let row = 0; row < contentH; row++) {
      output += ansi.moveTo(region.y + 1 + row, region.x + 1);
      output += border("│");

      const lineIndex = startLine + row;
      let lineContent = pane.outputLines[lineIndex] || "";

      // Truncate to fit (accounting for ANSI codes is complex, so we do simple truncation)
      const visibleLen = this.stripAnsi(lineContent).length;
      if (visibleLen > contentW) {
        // Simple truncation - may break ANSI codes but usually acceptable
        lineContent = lineContent.slice(0, contentW + (lineContent.length - visibleLen));
      }

      output += lineContent;

      // Pad remaining space
      const linePadding = contentW - this.stripAnsi(lineContent).length;
      if (linePadding > 0) {
        output += " ".repeat(linePadding);
      }

      output += border("│");
    }

    // Bottom border
    output += ansi.moveTo(region.y + region.h - 1, region.x + 1);
    output += border(`╰${"─".repeat(region.w - 2)}╯`);

    return output;
  }

  private stripAnsi(str: string): string {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require control chars
    return str.replace(/\x1b\[[0-9;]*m/g, "");
  }
}
