// =============================================================================
// Event-Driven TUI
// =============================================================================
// Pure event-driven TUI using simple scrollable text logs instead of xterm.
// Much lower memory footprint and simpler architecture.

import type { FSWatcher } from "node:fs";
import { watch } from "node:fs";
import { interjectGenericSession } from "../../agents";
import type { EventHandler, OrchestratorEvent } from "../../core/orchestrator";
import { answerQuestion, createInterjection, listQuestions, watchQueue } from "../../human-queue";
import { ansi, type BorderState, chalk, getBorderChalk, style } from "../../infra/colors";
import { getProcessStatsBatch } from "../../infra/terminal";
import type { Task } from "../../task-schema";
import { loadTasks } from "../../tasks";
import type { AgentPane, PaneType, QuestionDisplay, TasksSummary, ViewMode } from "./types";

// Maximum lines to keep per pane (prevents unbounded memory growth)
const MAX_OUTPUT_LINES = 2000;

/**
 * Extract tool name from various agent event formats.
 * - Claude/standard: { tool_name: "Read" } or { name: "Read" }
 * - Cursor: { tool_call: { readToolCall: { args: {...} } } } → "read"
 */
function extractToolName(event: Record<string, unknown>): string {
  if (event.tool_name) return event.tool_name as string;
  if (event.name) return event.name as string;

  const toolCall = event.tool_call as Record<string, unknown> | undefined;
  if (toolCall && typeof toolCall === "object") {
    const key = Object.keys(toolCall)[0];
    if (key) {
      return key.replace(/ToolCall$/i, "");
    }
  }

  return "unknown";
}

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

  // Questions state
  private pendingQuestions: QuestionDisplay[] = [];
  private selectedQuestionIndex = 0;
  private answerMode = false;
  private answerInput = "";
  private questionWatcherCleanup?: () => void;

  // Interject mode state
  private interjectMode = false;
  private interjectInput = "";

  // Dashboard/tasks summary state
  private tasksFile?: string;
  private tasksWatcher?: FSWatcher;
  private tasksSummary?: TasksSummary;
  private tasksList: Task[] = [];

  // Special pane IDs
  private static readonly DASHBOARD_PANE_ID = "__dashboard__";
  private static readonly QUESTIONS_PANE_ID = "__questions__";

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
  addPane(agentName: string, paneType: PaneType = "agent"): void {
    if (this.panes.has(agentName)) return;

    const pane: AgentPane = {
      id: agentName,
      name: agentName,
      paneType,
      status: "idle",
      outputLines: [],
      scrollOffset: 0,
    };

    this.panes.set(agentName, pane);
    this.paneOrder.push(agentName);
  }

  /**
   * Add the dashboard and questions panes at the front of the pane order.
   * Dashboard is first (index 0) and focused by default.
   * Questions is second (index 1).
   */
  addSpecialPanes(): void {
    // Create dashboard pane
    const dashboardPane: AgentPane = {
      id: EventDrivenTUI.DASHBOARD_PANE_ID,
      name: "Dashboard",
      paneType: "dashboard",
      status: "running",
      outputLines: [],
      scrollOffset: 0,
    };
    this.panes.set(EventDrivenTUI.DASHBOARD_PANE_ID, dashboardPane);

    // Create questions pane
    const questionsPane: AgentPane = {
      id: EventDrivenTUI.QUESTIONS_PANE_ID,
      name: "Questions",
      paneType: "questions",
      status: "idle",
      outputLines: [],
      scrollOffset: 0,
    };
    this.panes.set(EventDrivenTUI.QUESTIONS_PANE_ID, questionsPane);

    // Insert at the front of pane order (dashboard first, then questions)
    this.paneOrder.unshift(EventDrivenTUI.QUESTIONS_PANE_ID);
    this.paneOrder.unshift(EventDrivenTUI.DASHBOARD_PANE_ID);

    // Focus dashboard by default (index 0)
    this.selectedIndex = 0;
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
      this.updateQuestionsPane();
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

      this.tasksList = tasks;
      this.tasksSummary = {
        total: tasks.length,
        done: tasks.filter((t) => t.status === "done" || t.status === "done_pending_merge").length,
        inProgress: tasks.filter((t) => t.status === "in_progress" || t.status === "assigned").length,
        blocked: tasks.filter((t) => t.status === "blocked").length,
        pending: tasks.filter((t) => t.status === "todo" || t.status === "ready_for_agent").length,
      };

      // Update dashboard pane status
      const dashboardPane = this.panes.get(EventDrivenTUI.DASHBOARD_PANE_ID);
      if (dashboardPane) {
        dashboardPane.status = this.tasksSummary.inProgress > 0 ? "running" : "idle";
      }

      this.scheduleRender();
    } catch {
      // Tasks file may not exist or be invalid
    }
  }

  /**
   * Update questions pane status.
   */
  private updateQuestionsPane(): void {
    const questionsPane = this.panes.get(EventDrivenTUI.QUESTIONS_PANE_ID);
    if (questionsPane) {
      questionsPane.status = this.pendingQuestions.length > 0 ? "running" : "idle";
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
          // Filter out raw JSON streaming events - only show human-readable content
          const filteredOutput = this.filterAgentOutput(event.data);
          if (filteredOutput) {
            this.appendOutput(pane, filteredOutput, false);
          }
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

  /**
   * Format a timestamp for log output.
   */
  private formatTimestamp(): string {
    const now = new Date();
    return chalk.dim(
      `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`
    );
  }

  /**
   * Word wrap text to fit within a given width.
   */
  private wordWrap(text: string, maxWidth: number): string[] {
    if (maxWidth <= 0) return [text];

    const lines: string[] = [];
    const words = text.split(/(\s+)/); // Keep whitespace as separate tokens
    let currentLine = "";
    let currentVisibleLen = 0;

    for (const word of words) {
      const wordVisibleLen = this.stripAnsi(word).length;

      if (currentVisibleLen + wordVisibleLen <= maxWidth) {
        currentLine += word;
        currentVisibleLen += wordVisibleLen;
      } else if (wordVisibleLen > maxWidth) {
        // Word is longer than max width, need to break it
        if (currentLine) {
          lines.push(currentLine);
          currentLine = "";
          currentVisibleLen = 0;
        }
        // Break the long word
        let remaining = word;
        while (this.stripAnsi(remaining).length > maxWidth) {
          lines.push(remaining.slice(0, maxWidth));
          remaining = remaining.slice(maxWidth);
        }
        currentLine = remaining;
        currentVisibleLen = this.stripAnsi(remaining).length;
      } else {
        // Start new line
        if (currentLine.trim()) {
          lines.push(currentLine);
        }
        currentLine = word.trimStart();
        currentVisibleLen = this.stripAnsi(currentLine).length;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [""];
  }

  private appendOutput(pane: AgentPane, text: string, addNewline = true, includeTimestamp = false): void {
    // Split into lines, handling ANSI properly
    const lines = text.split(/\r?\n/);

    // Calculate available width for wrapping (pane width minus borders and padding)
    const paneWidth = this.getPaneContentWidth();

    for (const line of lines) {
      if (addNewline || line.length > 0) {
        // Add timestamp prefix if requested
        let prefixedLine = line;
        if (includeTimestamp && line.trim()) {
          prefixedLine = `${this.formatTimestamp()} ${line}`;
        }

        // Word wrap if needed
        if (paneWidth > 20) {
          const wrappedLines = this.wordWrap(prefixedLine, paneWidth);
          for (const wrappedLine of wrappedLines) {
            pane.outputLines.push(wrappedLine);
          }
        } else {
          pane.outputLines.push(prefixedLine);
        }
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

  /**
   * Get the content width of a pane for word wrapping.
   */
  private getPaneContentWidth(): number {
    const count = Math.max(1, this.paneOrder.length);
    if (this.viewMode === "single") {
      return this.cols - 4; // Account for borders
    }
    const tilesPerRow = Math.ceil(Math.sqrt(count));
    const tileW = Math.floor(this.cols / tilesPerRow);
    return tileW - 4; // Account for borders
  }

  /**
   * Filter agent output to show only human-readable content.
   * Handles streaming JSON events from multiple agent formats:
   * - Claude API: {"type": "assistant", "message": {"content": [...]}}
   * - Claude streaming: {"type": "content_block_delta", "delta": {"text": "..."}}
   * - OpenCode: {"type": "...", "part": {"type": "text|tool|step-finish|error", ...}}
   * - Copilot/Goose: {"type": "tool_use|tool_result|result", ...}
   */
  private filterAgentOutput(data: string): string {
    // Split by lines and filter each line
    const lines = data.split(/\r?\n/);
    const filteredLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        filteredLines.push("");
        continue;
      }

      // Handle raw JSON streaming events
      if (trimmed.startsWith('{"type":')) {
        try {
          const parsed = JSON.parse(trimmed);
          const eventType = parsed.type as string | undefined;

          // Handle OpenCode's nested part structure
          const part = parsed.part as Record<string, unknown> | undefined;
          if (part) {
            const partType = part.type as string | undefined;

            switch (partType) {
              case "text": {
                const text = part.text as string | undefined;
                if (text) {
                  filteredLines.push(text);
                }
                break;
              }

              case "tool": {
                const toolName = part.tool as string | undefined;
                const state = part.state as { title?: string } | undefined;
                const title = state?.title;
                const displayName = title || toolName || "unknown";
                filteredLines.push(chalk.cyan(`[tool: ${displayName}]`));
                break;
              }

              case "step-finish": {
                const cost = part.cost as number | undefined;
                const tokens = part.tokens as { input?: number; output?: number; reasoning?: number } | undefined;

                const parts: string[] = [];
                if (tokens) {
                  const totalTokens = (tokens.input || 0) + (tokens.output || 0) + (tokens.reasoning || 0);
                  if (totalTokens > 0) {
                    parts.push(chalk.dim(`[tokens: ${totalTokens}]`));
                  }
                }
                if (cost !== undefined && cost > 0) {
                  parts.push(`[cost: $${cost.toFixed(4)}]`);
                }
                if (parts.length > 0) {
                  filteredLines.push(parts.join(" "));
                }
                break;
              }

              case "error": {
                const errorMessage = (part.error as string) || (part.message as string) || "unknown error";
                filteredLines.push(chalk.red(`[ERROR: ${errorMessage}]`));
                break;
              }

              // step-start and other types are intentionally skipped to reduce noise
            }
            continue;
          }

          // Handle events by type (Claude, Copilot, Goose, etc.)
          switch (eventType) {
            case "assistant":
            case "message": {
              // Direct string content
              if (typeof parsed.content === "string") {
                filteredLines.push(parsed.content);
              }
              // Message with content array (Claude API)
              const message = parsed.message as
                | { content?: Array<{ type: string; text?: string }> | string }
                | undefined;
              if (message?.content) {
                if (typeof message.content === "string") {
                  filteredLines.push(message.content);
                } else if (Array.isArray(message.content)) {
                  for (const block of message.content) {
                    if (block.type === "text" && block.text) {
                      filteredLines.push(block.text);
                    }
                  }
                }
              }
              break;
            }

            case "content_block_delta": {
              // Claude streaming text deltas
              const delta = parsed.delta as { type?: string; text?: string } | undefined;
              if (delta?.type === "text_delta" && delta.text) {
                filteredLines.push(delta.text);
              }
              break;
            }

            case "text": {
              // Simple text event
              const text = parsed.text as string | undefined;
              if (text) {
                filteredLines.push(text);
              }
              break;
            }

            case "tool_use":
            case "tool_call": {
              // Cursor sends subtype "completed" for tool results
              const subtype = parsed.subtype as string | undefined;
              if (subtype === "completed") {
                const content = parsed.content as string | undefined;
                if (content) {
                  const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
                  filteredLines.push(chalk.dim(truncated));
                } else {
                  filteredLines.push(chalk.dim("[result]"));
                }
                break;
              }
              const toolName = extractToolName(parsed);
              filteredLines.push(chalk.cyan(`[tool: ${toolName}]`));
              break;
            }

            case "tool_result":
            case "tool_response": {
              const content = parsed.content as string | undefined;
              if (content) {
                const truncated = content.length > 200 ? `${content.slice(0, 200)}...` : content;
                filteredLines.push(chalk.dim(truncated));
              } else {
                filteredLines.push(chalk.dim("[result]"));
              }
              break;
            }

            case "result":
            case "done":
            case "finish":
            case "complete": {
              // Completion events with cost/duration
              const cost = (parsed.total_cost_usd ?? parsed.cost_usd) as number | undefined;
              const duration = parsed.duration_ms as number | undefined;
              const parts: string[] = [];
              if (cost !== undefined) {
                parts.push(`[cost: $${cost.toFixed(4)}]`);
              }
              if (duration !== undefined) {
                parts.push(`[duration: ${(duration / 1000).toFixed(1)}s]`);
              }
              if (parts.length > 0) {
                filteredLines.push(parts.join(" "));
              }
              break;
            }

            case "error": {
              const errorObj = parsed.error as { message?: string } | undefined;
              const errorMessage =
                errorObj?.message || (parsed.content as string) || (parsed.message as string) || "unknown";
              filteredLines.push(chalk.red(`[ERROR: ${errorMessage}]`));
              break;
            }

            case "system": {
              // System init events
              const subtype = parsed.subtype as string | undefined;
              if (subtype === "init") {
                const parts: string[] = [];
                if (parsed.session_id) {
                  parts.push(`[session: ${parsed.session_id}]`);
                }
                if (parsed.model) {
                  parts.push(`[model: ${parsed.model}]`);
                }
                if (parts.length > 0) {
                  filteredLines.push(chalk.dim(parts.join(" ")));
                }
              }
              break;
            }

            case "session": {
              // Session ID events
              const sessionId = parsed.session_id || parsed.sessionID || parsed.id;
              if (sessionId) {
                filteredLines.push(chalk.dim(`[session: ${sessionId}]`));
              }
              break;
            }

            // Skip user, system messages without init, and other metadata events
          }
        } catch {
          // If JSON parsing fails, skip the line
        }
        continue;
      }

      // Skip lines that look like partial JSON
      if (trimmed.startsWith("{") && trimmed.includes('"type"')) {
        continue;
      }

      // Keep all other output (tool results, errors, etc.)
      filteredLines.push(line);
    }

    return filteredLines.join("\n");
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

    // Handle interject mode input
    if (this.interjectMode) {
      this.handleInterjectModeInput(str);
      return;
    }

    // Check if questions pane is selected
    const isQuestionsPaneSelected = this.isQuestionsPaneSelected();

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
        this.navigate("left");
        break;

      case "j":
      case "\x1b[B": // Down arrow
        if (isQuestionsPaneSelected && this.pendingQuestions.length > 0) {
          this.selectedQuestionIndex = Math.min(this.selectedQuestionIndex + 1, this.pendingQuestions.length - 1);
          this.scheduleRender();
        } else {
          this.navigate("down");
        }
        break;

      case "k":
      case "\x1b[A": // Up arrow
        if (isQuestionsPaneSelected && this.pendingQuestions.length > 0) {
          this.selectedQuestionIndex = Math.max(this.selectedQuestionIndex - 1, 0);
          this.scheduleRender();
        } else {
          this.navigate("up");
        }
        break;

      case "l":
      case "\x1b[C": // Right arrow
        this.navigate("right");
        break;

      case "i":
        // Enter interject mode for selected agent
        this.enterInterjectMode();
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

      case "a":
        // Enter answer mode for selected question (when questions pane is selected)
        if (isQuestionsPaneSelected && this.pendingQuestions.length > 0) {
          this.answerMode = true;
          this.answerInput = "";
          this.lastRenderedOutput = ""; // Force full re-render
          this.scheduleRender();
        }
        break;

      case "y":
        // Quick yes answer for yes/no questions
        if (isQuestionsPaneSelected && this.pendingQuestions.length > 0) {
          const q = this.pendingQuestions[this.selectedQuestionIndex];
          if (q && q.questionType === "yes_no") {
            this.submitAnswer("yes");
          }
        }
        break;

      case "n":
        // Quick no answer for yes/no questions (when questions pane selected)
        if (isQuestionsPaneSelected && this.pendingQuestions.length > 0) {
          const q = this.pendingQuestions[this.selectedQuestionIndex];
          if (q && q.questionType === "yes_no") {
            this.submitAnswer("no");
          }
        }
        break;
    }
  }

  /**
   * Check if the questions pane is currently selected.
   */
  private isQuestionsPaneSelected(): boolean {
    const selectedPaneId = this.paneOrder[this.selectedIndex];
    return selectedPaneId === EventDrivenTUI.QUESTIONS_PANE_ID;
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

  /**
   * Enter interject mode for the selected agent pane.
   */
  private enterInterjectMode(): void {
    const paneId = this.paneOrder[this.selectedIndex];
    if (!paneId) return;

    const pane = this.panes.get(paneId);
    if (!pane) return;

    // Only allow interjecting agent panes that are running
    if (pane.paneType !== "agent" || pane.status !== "running") {
      this.appendOutput(pane, style.warning("Cannot interject - agent not running"));
      return;
    }

    this.interjectMode = true;
    this.interjectInput = "";
    this.lastRenderedOutput = ""; // Force full re-render
    this.scheduleRender();
  }

  /**
   * Handle input while in interject mode.
   */
  private handleInterjectModeInput(str: string): void {
    if (str === "\x1b" || str === "\x1b\x1b") {
      // Escape - exit interject mode
      this.interjectMode = false;
      this.interjectInput = "";
      this.scheduleRender();
    } else if (str === "\r" || str === "\n") {
      // Enter - submit interject message
      if (this.interjectInput.trim()) {
        this.submitInterject(this.interjectInput.trim());
      }
    } else if (str === "\x7f" || str === "\b") {
      // Backspace
      this.interjectInput = this.interjectInput.slice(0, -1);
      this.scheduleRender();
    } else if (str.length === 1 && str >= " " && str <= "~") {
      // Printable character
      this.interjectInput += str;
      this.scheduleRender();
    }
  }

  /**
   * Submit an interject message to the selected agent.
   */
  private async submitInterject(message: string): Promise<void> {
    const paneId = this.paneOrder[this.selectedIndex];
    if (!paneId) return;

    const pane = this.panes.get(paneId);
    if (!pane || pane.paneType !== "agent") return;

    // Get the session before stopping
    const session = interjectGenericSession(pane.name);

    // Create interjection record with the user's message
    await createInterjection(pane.name, {
      taskId: pane.currentTaskId,
      sessionId: session?.sessionId,
      workingDirectory: session?.workingDirectory ?? process.cwd(),
      reason: message,
    });

    pane.status = "idle";
    pane.currentPid = undefined;
    pane.stats = undefined;

    this.appendOutput(pane, "");
    this.appendOutput(pane, style.warning("━━━ INTERJECTED ━━━"));
    this.appendOutput(pane, style.info(`Message: ${message}`));
    this.appendOutput(pane, style.muted("Agent will resume on next poll cycle with your message."));

    this.interjectMode = false;
    this.interjectInput = "";
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
    // Dispatch to specialized renderers based on pane type
    if (pane.paneType === "dashboard") {
      return this.renderDashboardPane(pane, region, isSelected);
    }
    if (pane.paneType === "questions") {
      return this.renderQuestionsPaneContent(pane, region, isSelected);
    }
    return this.renderAgentPane(pane, region, isSelected);
  }

  /**
   * Render an agent pane with scrollable output.
   */
  private renderAgentPane(
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

    // Content area - reserve space for interject input if active
    const showInterjectInput = isSelected && this.interjectMode;
    const inputLines = showInterjectInput ? 3 : 0; // Input prompt + input line + help text
    const contentH = region.h - 2 - inputLines;
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

    // Render interject input box if active
    if (showInterjectInput) {
      // Separator line
      output += ansi.moveTo(region.y + 1 + contentH, region.x + 1);
      output += border("│");
      output += chalk.yellow("─".repeat(contentW));
      output += border("│");

      // Input line with cursor
      output += ansi.moveTo(region.y + 2 + contentH, region.x + 1);
      output += border("│");
      const inputPrefix = chalk.yellow(" Interject: ");
      const prefixLen = 12; // " Interject: " visible length
      const maxInputLen = contentW - prefixLen - 1; // -1 for cursor
      const displayInput =
        this.interjectInput.length > maxInputLen ? this.interjectInput.slice(-maxInputLen) : this.interjectInput;
      const inputLine = `${inputPrefix}${displayInput}${chalk.inverse(" ")}`;
      output += inputLine;
      const inputPadding = contentW - prefixLen - displayInput.length - 1;
      if (inputPadding > 0) {
        output += " ".repeat(inputPadding);
      }
      output += border("│");

      // Help text
      output += ansi.moveTo(region.y + 3 + contentH, region.x + 1);
      output += border("│");
      const helpText = chalk.dim(" Enter:send  Esc:cancel");
      output += helpText;
      const helpPadding = contentW - 24;
      if (helpPadding > 0) {
        output += " ".repeat(helpPadding);
      }
      output += border("│");
    }

    // Bottom border
    output += ansi.moveTo(region.y + region.h - 1, region.x + 1);
    output += border(`╰${"─".repeat(region.w - 2)}╯`);

    return output;
  }

  /**
   * Render the dashboard pane showing task list with progress, agents, and phases.
   */
  private renderDashboardPane(
    pane: AgentPane,
    region: { x: number; y: number; w: number; h: number },
    isSelected: boolean
  ): string {
    let output = "";

    const borderState: BorderState = isSelected ? "selected" : "default";
    const border = getBorderChalk(borderState);

    // Calculate progress
    const allTasks = this.collectAllTasks(this.tasksList);
    const total = allTasks.length;
    const doneCount = allTasks.filter((t) => t.status === "done" || t.status === "done_pending_merge").length;
    const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    // Summary text for title with progress
    const progressText = total > 0 ? chalk.green(`${progress}%`) : "";

    // Build title
    const nameStyled = border.bold(chalk.blue("📋 Dashboard"));
    const titleContent = `─ ${nameStyled} ${progressText} `;
    const titleVisibleLen = 16 + (progress > 0 ? String(progress).length + 1 : 0);
    const remainingWidth = region.w - titleVisibleLen - 2;

    // Top border
    output += ansi.moveTo(region.y, region.x + 1);
    output += border(`╭${titleContent}${"─".repeat(Math.max(0, remainingWidth))}╮`);

    // Content area
    const contentH = region.h - 2;
    const contentW = region.w - 2;

    // Build dashboard content lines
    const dashLines: string[] = [];

    if (this.tasksList.length === 0) {
      dashLines.push(chalk.dim(" No tasks loaded"));
    } else {
      // Progress bar
      const barWidth = Math.min(20, contentW - 15);
      const filledCount = Math.floor((progress / 100) * barWidth);
      const progressBar = chalk.green("█".repeat(filledCount)) + chalk.gray("░".repeat(barWidth - filledCount));
      dashLines.push(` [${progressBar}] ${chalk.bold.green(`${progress}%`)} ${chalk.dim(`(${doneCount}/${total})`)}`);

      // Status summary line
      const summary = this.tasksSummary;
      if (summary) {
        dashLines.push(
          ` ${chalk.cyan(summary.inProgress)}▶ ${chalk.yellow(summary.pending)}○ ${chalk.red(summary.blocked)}✗`
        );
      }
      dashLines.push("");

      // Active agents
      const activeAgents = this.getActiveAgents();
      if (activeAgents.size > 0) {
        dashLines.push(chalk.bold(" Agents:"));
        for (const [agent, tasks] of activeAgents) {
          const taskIds = tasks.map((t) => chalk.yellow(t.id)).join(", ");
          const line = `  ${chalk.cyan(agent)}: ${taskIds}`;
          dashLines.push(line.length > contentW ? `${line.slice(0, contentW - 3)}...` : line);
        }
        dashLines.push("");
      }

      // Tasks by phase
      const byPhase = Map.groupBy(this.tasksList, (t) => t.phase ?? 0);
      for (const [phase, tasks] of [...byPhase.entries()].sort((a, b) => a[0] - b[0])) {
        if (!tasks) continue;
        dashLines.push(chalk.bold.magenta(` Phase ${phase}:`));

        for (const task of tasks) {
          const icon = this.getTaskStatusIcon(task.status);
          const agent = task.agent_name ? chalk.dim(` (${task.agent_name})`) : "";
          const stepsInfo =
            task.steps && task.steps.length > 0
              ? chalk.dim(` [${task.steps.filter((s) => s.status === "done").length}/${task.steps.length}]`)
              : "";
          const maxTitleLen = contentW - 10 - (task.agent_name?.length || 0) - (stepsInfo ? 8 : 0);
          const title = task.title.length > maxTitleLen ? `${task.title.slice(0, maxTitleLen - 3)}...` : task.title;
          dashLines.push(`  ${icon} ${title}${agent}${stepsInfo}`);

          // Steps (show only if task is in progress)
          if (task.steps && task.steps.length > 0 && (task.status === "in_progress" || task.status === "assigned")) {
            for (const step of task.steps) {
              const stepIcon = this.getStepStatusIcon(step.status);
              const stepMaxLen = contentW - 16;
              const stepInstr =
                step.instruction.length > stepMaxLen
                  ? `${step.instruction.slice(0, stepMaxLen - 3)}...`
                  : step.instruction;
              dashLines.push(`      ${stepIcon} ${chalk.dim(stepInstr)}`);
            }
          }

          // Subtasks
          for (const sub of task.subtasks || []) {
            const subIcon = this.getTaskStatusIcon(sub.status);
            const subAgent = sub.agent_name ? chalk.dim(` (${sub.agent_name})`) : "";
            const subStepsInfo =
              sub.steps && sub.steps.length > 0
                ? chalk.dim(` [${sub.steps.filter((s) => s.status === "done").length}/${sub.steps.length}]`)
                : "";
            const subMaxLen = contentW - 13 - (sub.agent_name?.length || 0) - (subStepsInfo ? 8 : 0);
            const subTitle = sub.title.length > subMaxLen ? `${sub.title.slice(0, subMaxLen - 3)}...` : sub.title;
            dashLines.push(`    ${subIcon} ${subTitle}${subAgent}${subStepsInfo}`);

            // Subtask steps (show only if subtask is in progress)
            if (sub.steps && sub.steps.length > 0 && (sub.status === "in_progress" || sub.status === "assigned")) {
              for (const step of sub.steps) {
                const stepIcon = this.getStepStatusIcon(step.status);
                const stepMaxLen = contentW - 19;
                const stepInstr =
                  step.instruction.length > stepMaxLen
                    ? `${step.instruction.slice(0, stepMaxLen - 3)}...`
                    : step.instruction;
                dashLines.push(`        ${stepIcon} ${chalk.dim(stepInstr)}`);
              }
            }
          }
        }
      }
    }

    // Render content with scrolling
    const startLine = Math.max(0, pane.scrollOffset);
    const maxStartLine = Math.max(0, dashLines.length - contentH);
    const actualStartLine = Math.min(startLine, maxStartLine);

    for (let row = 0; row < contentH; row++) {
      output += ansi.moveTo(region.y + 1 + row, region.x + 1);
      output += border("│");

      const lineIndex = actualStartLine + row;
      let lineContent = dashLines[lineIndex] || "";

      const visibleLen = this.stripAnsi(lineContent).length;
      if (visibleLen > contentW) {
        lineContent = lineContent.slice(0, contentW + (lineContent.length - visibleLen));
      }

      output += lineContent;

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

  /**
   * Collect all tasks including subtasks recursively.
   */
  private collectAllTasks(tasks: Task[]): Task[] {
    const all: Task[] = [];
    for (const task of tasks) {
      all.push(task);
      if (task.subtasks) {
        all.push(...this.collectAllTasks(task.subtasks));
      }
    }
    return all;
  }

  /**
   * Get map of active agents to their tasks.
   */
  private getActiveAgents(): Map<string, Task[]> {
    const agents = new Map<string, Task[]>();

    const collectActive = (tasks: Task[]) => {
      for (const task of tasks) {
        if (task.agent_name && (task.status === "in_progress" || task.status === "assigned")) {
          const existing = agents.get(task.agent_name) || [];
          existing.push(task);
          agents.set(task.agent_name, existing);
        }
        if (task.subtasks) {
          collectActive(task.subtasks);
        }
      }
    };

    collectActive(this.tasksList);
    return agents;
  }

  /**
   * Get status icon for a task.
   */
  private getTaskStatusIcon(status: string): string {
    switch (status) {
      case "done":
      case "done_pending_merge":
        return chalk.green("✓");
      case "in_progress":
      case "assigned":
        return chalk.cyan("▶");
      case "blocked":
        return chalk.red("✗");
      case "ready_for_agent":
        return chalk.yellow("●");
      default:
        return chalk.gray("○");
    }
  }

  /**
   * Get status icon for a step.
   */
  private getStepStatusIcon(status: string): string {
    switch (status) {
      case "done":
        return chalk.green("·");
      case "in_progress":
        return chalk.cyan("›");
      default:
        return chalk.gray("·");
    }
  }

  /**
   * Render the questions pane showing pending questions.
   */
  private renderQuestionsPaneContent(
    pane: AgentPane,
    region: { x: number; y: number; w: number; h: number },
    isSelected: boolean
  ): string {
    let output = "";

    const hasQuestions = this.pendingQuestions.length > 0;
    const borderState: BorderState = isSelected ? "selected" : hasQuestions ? "running" : "default";
    const border = getBorderChalk(borderState);

    // Build title
    const countText = hasQuestions ? chalk.yellow(` (${this.pendingQuestions.length})`) : "";
    const nameStyled = border.bold(chalk.yellow("❓ Questions"));
    const titleContent = `─ ${nameStyled}${countText} `;
    const titleVisibleLen = 15 + (hasQuestions ? String(this.pendingQuestions.length).length + 3 : 0);
    const remainingWidth = region.w - titleVisibleLen - 2;

    // Top border
    output += ansi.moveTo(region.y, region.x + 1);
    output += border(`╭${titleContent}${"─".repeat(Math.max(0, remainingWidth))}╮`);

    // Content area
    const contentH = region.h - 2;
    const contentW = region.w - 2;

    // Build question lines
    const questionLines: string[] = [];

    if (!hasQuestions) {
      questionLines.push(chalk.dim("  No pending questions"));
    } else {
      for (let i = 0; i < this.pendingQuestions.length; i++) {
        const q = this.pendingQuestions[i];
        if (!q) continue;

        const selected = isSelected && i === this.selectedQuestionIndex;
        const prefix = selected ? chalk.cyan("▶ ") : "  ";
        const typeIcon =
          q.questionType === "yes_no"
            ? chalk.magenta("[Y/N]")
            : q.questionType === "choice"
              ? chalk.blue("[?]")
              : chalk.gray("[...]");
        const agentPart = chalk.dim(`[${q.agentName}]`);
        const questionText = q.question.replace(/\n/g, " ");
        const maxLen = contentW - 20;
        const truncated = questionText.length > maxLen ? `${questionText.slice(0, maxLen - 3)}...` : questionText;
        questionLines.push(`${prefix}${typeIcon} ${agentPart} ${truncated}`);
      }

      // Add help text at bottom if selected
      if (isSelected) {
        questionLines.push("");
        if (this.answerMode) {
          questionLines.push(chalk.cyan(`  Answer: ${this.answerInput}█`));
          questionLines.push(chalk.dim("  Enter:submit  Esc:cancel"));
        } else {
          const selectedQ = this.pendingQuestions[this.selectedQuestionIndex];
          if (selectedQ?.questionType === "yes_no") {
            questionLines.push(chalk.dim("  y:yes  n:no  a:custom  j/k:nav"));
          } else {
            questionLines.push(chalk.dim("  a:answer  j/k:navigate"));
          }
        }
      }
    }

    // Render content
    const startLine = Math.max(0, questionLines.length - contentH - pane.scrollOffset);
    for (let row = 0; row < contentH; row++) {
      output += ansi.moveTo(region.y + 1 + row, region.x + 1);
      output += border("│");

      const lineIndex = startLine + row;
      let lineContent = questionLines[lineIndex] || "";

      const visibleLen = this.stripAnsi(lineContent).length;
      if (visibleLen > contentW) {
        lineContent = lineContent.slice(0, contentW + (lineContent.length - visibleLen));
      }

      output += lineContent;

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
