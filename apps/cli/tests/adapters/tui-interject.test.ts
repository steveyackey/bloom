/**
 * TUI Interject Mode Tests
 *
 * Tests the interject feature that allows users to:
 * 1. Press <i> to enter interject mode for a running agent
 * 2. Type a message
 * 3. Submit the message to stop and interject the agent
 */

import { beforeEach, describe, expect, test } from "bun:test";
import type { AgentPane } from "../../src/adapters/tui/types";

/**
 * Test implementation that mirrors the interject mode logic from EventDrivenTUI.
 * This isolates the interject handling from terminal rendering.
 */
class TestInterjectTUI {
  private panes: Map<string, AgentPane> = new Map();
  private paneOrder: string[] = [];
  private selectedIndex = 0;

  // Interject mode state
  private interjectMode = false;
  private interjectInput = "";

  // Track interjection calls for testing
  public interjectCalls: Array<{ agentName: string; message: string }> = [];
  public appendedOutput: Array<{ paneId: string; text: string }> = [];

  addPane(agentName: string, status: AgentPane["status"] = "idle"): void {
    if (this.panes.has(agentName)) return;

    const pane: AgentPane = {
      id: agentName,
      name: agentName,
      paneType: "agent",
      status,
      outputLines: [],
      scrollOffset: 0,
    };

    this.panes.set(agentName, pane);
    this.paneOrder.push(agentName);
  }

  getPane(agentName: string): AgentPane | undefined {
    return this.panes.get(agentName);
  }

  setSelectedIndex(index: number): void {
    this.selectedIndex = index;
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  isInterjectModeActive(): boolean {
    return this.interjectMode;
  }

  getInterjectInput(): string {
    return this.interjectInput;
  }

  private appendOutput(pane: AgentPane, text: string): void {
    pane.outputLines.push(text);
    this.appendedOutput.push({ paneId: pane.id, text });
  }

  /**
   * Enter interject mode for the selected agent pane.
   */
  enterInterjectMode(): void {
    const paneId = this.paneOrder[this.selectedIndex];
    if (!paneId) return;

    const pane = this.panes.get(paneId);
    if (!pane) return;

    // Only allow interjecting agent panes that are running
    if (pane.paneType !== "agent" || pane.status !== "running") {
      this.appendOutput(pane, "Cannot interject - agent not running");
      return;
    }

    this.interjectMode = true;
    this.interjectInput = "";
  }

  /**
   * Handle input while in interject mode.
   */
  handleInterjectModeInput(str: string): void {
    if (str === "\x1b" || str === "\x1b\x1b") {
      // Escape - exit interject mode
      this.interjectMode = false;
      this.interjectInput = "";
    } else if (str === "\r" || str === "\n") {
      // Enter - submit interject message
      if (this.interjectInput.trim()) {
        this.submitInterject(this.interjectInput.trim());
      }
    } else if (str === "\x7f" || str === "\b") {
      // Backspace
      this.interjectInput = this.interjectInput.slice(0, -1);
    } else if (str.length === 1 && str >= " " && str <= "~") {
      // Printable character
      this.interjectInput += str;
    }
  }

  /**
   * Submit an interject message to the selected agent.
   */
  private submitInterject(message: string): void {
    const paneId = this.paneOrder[this.selectedIndex];
    if (!paneId) return;

    const pane = this.panes.get(paneId);
    if (!pane || pane.paneType !== "agent") return;

    // Record the interjection call for testing
    this.interjectCalls.push({ agentName: pane.name, message });

    // Update pane state (simulating what the real TUI does)
    pane.status = "idle";
    pane.currentPid = undefined;
    pane.stats = undefined;

    this.appendOutput(pane, "━━━ INTERJECTED ━━━");
    this.appendOutput(pane, `Message: ${message}`);
    this.appendOutput(pane, "Agent will resume on next poll cycle with your message.");

    this.interjectMode = false;
    this.interjectInput = "";
  }

  /**
   * Simulate key input handling like the real TUI does.
   */
  handleInput(str: string): void {
    // Handle interject mode input
    if (this.interjectMode) {
      this.handleInterjectModeInput(str);
      return;
    }

    // Handle 'i' key to enter interject mode
    if (str === "i") {
      this.enterInterjectMode();
    }
  }
}

describe("TUI Interject Mode", () => {
  let tui: TestInterjectTUI;

  beforeEach(() => {
    tui = new TestInterjectTUI();
  });

  describe("Entering Interject Mode", () => {
    test("pressing 'i' enters interject mode for running agent", () => {
      tui.addPane("agent-1", "running");
      tui.setSelectedIndex(0);

      expect(tui.isInterjectModeActive()).toBe(false);

      tui.handleInput("i");

      expect(tui.isInterjectModeActive()).toBe(true);
      expect(tui.getInterjectInput()).toBe("");
    });

    test("pressing 'i' does not enter interject mode for idle agent", () => {
      tui.addPane("agent-1", "idle");
      tui.setSelectedIndex(0);

      tui.handleInput("i");

      expect(tui.isInterjectModeActive()).toBe(false);
      // Should show warning message
      expect(tui.appendedOutput.some((o) => o.text.includes("Cannot interject"))).toBe(true);
    });

    test("pressing 'i' does not enter interject mode for completed agent", () => {
      tui.addPane("agent-1", "completed");
      tui.setSelectedIndex(0);

      tui.handleInput("i");

      expect(tui.isInterjectModeActive()).toBe(false);
    });

    test("pressing 'i' does not enter interject mode for failed agent", () => {
      tui.addPane("agent-1", "failed");
      tui.setSelectedIndex(0);

      tui.handleInput("i");

      expect(tui.isInterjectModeActive()).toBe(false);
    });
  });

  describe("Text Input in Interject Mode", () => {
    beforeEach(() => {
      tui.addPane("agent-1", "running");
      tui.setSelectedIndex(0);
      tui.handleInput("i"); // Enter interject mode
    });

    test("typing characters appends to input", () => {
      tui.handleInput("H");
      tui.handleInput("e");
      tui.handleInput("l");
      tui.handleInput("l");
      tui.handleInput("o");

      expect(tui.getInterjectInput()).toBe("Hello");
    });

    test("typing space is allowed", () => {
      tui.handleInput("H");
      tui.handleInput("i");
      tui.handleInput(" ");
      tui.handleInput("!");

      expect(tui.getInterjectInput()).toBe("Hi !");
    });

    test("backspace removes last character", () => {
      tui.handleInput("H");
      tui.handleInput("e");
      tui.handleInput("l");
      tui.handleInput("\x7f"); // Backspace

      expect(tui.getInterjectInput()).toBe("He");
    });

    test("backspace on empty input does nothing", () => {
      tui.handleInput("\x7f");
      expect(tui.getInterjectInput()).toBe("");
    });

    test("escape cancels interject mode", () => {
      tui.handleInput("H");
      tui.handleInput("e");
      tui.handleInput("l");
      tui.handleInput("\x1b"); // Escape

      expect(tui.isInterjectModeActive()).toBe(false);
      expect(tui.getInterjectInput()).toBe("");
    });

    test("double escape also cancels interject mode", () => {
      tui.handleInput("H");
      tui.handleInput("\x1b\x1b"); // Double escape

      expect(tui.isInterjectModeActive()).toBe(false);
    });
  });

  describe("Submitting Interject Message", () => {
    beforeEach(() => {
      tui.addPane("agent-1", "running");
      tui.setSelectedIndex(0);
      tui.handleInput("i"); // Enter interject mode
    });

    test("pressing Enter submits the message", () => {
      tui.handleInput("S");
      tui.handleInput("t");
      tui.handleInput("o");
      tui.handleInput("p");
      tui.handleInput("\r"); // Enter

      expect(tui.interjectCalls).toHaveLength(1);
      expect(tui.interjectCalls[0]).toEqual({
        agentName: "agent-1",
        message: "Stop",
      });
    });

    test("pressing Enter with newline character also works", () => {
      tui.handleInput("T");
      tui.handleInput("e");
      tui.handleInput("s");
      tui.handleInput("t");
      tui.handleInput("\n"); // Newline

      expect(tui.interjectCalls).toHaveLength(1);
      expect(tui.interjectCalls[0]!.message).toBe("Test");
    });

    test("submitting trims whitespace from message", () => {
      tui.handleInput(" ");
      tui.handleInput(" ");
      tui.handleInput("H");
      tui.handleInput("i");
      tui.handleInput(" ");
      tui.handleInput(" ");
      tui.handleInput("\r");

      expect(tui.interjectCalls[0]!.message).toBe("Hi");
    });

    test("pressing Enter with empty input does nothing", () => {
      tui.handleInput("\r");

      expect(tui.interjectCalls).toHaveLength(0);
      expect(tui.isInterjectModeActive()).toBe(true); // Still in interject mode
    });

    test("pressing Enter with only whitespace does nothing", () => {
      tui.handleInput(" ");
      tui.handleInput(" ");
      tui.handleInput("\r");

      expect(tui.interjectCalls).toHaveLength(0);
    });

    test("submitting exits interject mode", () => {
      tui.handleInput("O");
      tui.handleInput("k");
      tui.handleInput("\r");

      expect(tui.isInterjectModeActive()).toBe(false);
      expect(tui.getInterjectInput()).toBe("");
    });

    test("submitting sets pane to idle status", () => {
      tui.handleInput("O");
      tui.handleInput("k");
      tui.handleInput("\r");

      const pane = tui.getPane("agent-1");
      expect(pane?.status).toBe("idle");
    });

    test("submitting adds interjection messages to output", () => {
      tui.handleInput("H");
      tui.handleInput("e");
      tui.handleInput("l");
      tui.handleInput("p");
      tui.handleInput("\r");

      expect(tui.appendedOutput.some((o) => o.text.includes("INTERJECTED"))).toBe(true);
      expect(tui.appendedOutput.some((o) => o.text.includes("Help"))).toBe(true);
      expect(tui.appendedOutput.some((o) => o.text.includes("resume"))).toBe(true);
    });
  });

  describe("Multiple Agents", () => {
    test("interject applies to selected agent only", () => {
      tui.addPane("agent-1", "running");
      tui.addPane("agent-2", "running");
      tui.setSelectedIndex(1); // Select agent-2

      tui.handleInput("i");
      tui.handleInput("M");
      tui.handleInput("s");
      tui.handleInput("g");
      tui.handleInput("\r");

      expect(tui.interjectCalls).toHaveLength(1);
      expect(tui.interjectCalls[0]!.agentName).toBe("agent-2");
    });

    test("interject does not affect other agents", () => {
      tui.addPane("agent-1", "running");
      tui.addPane("agent-2", "running");
      tui.setSelectedIndex(0);

      tui.handleInput("i");
      tui.handleInput("X");
      tui.handleInput("\r");

      expect(tui.getPane("agent-1")?.status).toBe("idle");
      expect(tui.getPane("agent-2")?.status).toBe("running");
    });
  });

  describe("Edge Cases", () => {
    test("non-printable characters are ignored", () => {
      tui.addPane("agent-1", "running");
      tui.handleInput("i");

      tui.handleInput("\x00"); // Null
      tui.handleInput("\x01"); // SOH
      tui.handleInput("\x1f"); // Unit separator

      expect(tui.getInterjectInput()).toBe("");
    });

    test("long messages are accepted", () => {
      tui.addPane("agent-1", "running");
      tui.handleInput("i");

      const longMessage = "A".repeat(200);
      for (const char of longMessage) {
        tui.handleInput(char);
      }

      expect(tui.getInterjectInput()).toBe(longMessage);
    });

    test("special printable characters are accepted", () => {
      tui.addPane("agent-1", "running");
      tui.handleInput("i");

      tui.handleInput("!");
      tui.handleInput("@");
      tui.handleInput("#");
      tui.handleInput("$");
      tui.handleInput("%");

      expect(tui.getInterjectInput()).toBe("!@#$%");
    });
  });
});
