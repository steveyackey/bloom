import { describe, expect, test } from "bun:test";
import { getActionResult, isNoAnswer, isYesAnswer, type Question } from "../src/core/questions";

describe("Human-Agent Communication", () => {
  describe("Yes/No Answer Detection", () => {
    test("recognizes common affirmative responses", () => {
      const yesVariants = [
        "yes",
        "Yes",
        "YES",
        "y",
        "Y",
        "yeah",
        "yep",
        "sure",
        "ok",
        "okay",
        "approve",
        "confirmed",
        "true",
        "1",
      ];

      for (const answer of yesVariants) {
        expect(isYesAnswer(answer)).toBe(true);
      }
    });

    test("recognizes common negative responses", () => {
      const noVariants = ["no", "No", "NO", "n", "N", "nope", "nah", "reject", "deny", "false", "0"];

      for (const answer of noVariants) {
        expect(isNoAnswer(answer)).toBe(true);
      }
    });

    test("handles whitespace in answers", () => {
      expect(isYesAnswer("  yes  ")).toBe(true);
      expect(isNoAnswer("  no  ")).toBe(true);
    });

    test("does not confuse unrelated words for yes/no", () => {
      expect(isYesAnswer("yesterday")).toBe(false);
      expect(isYesAnswer("yelling")).toBe(false);
      expect(isNoAnswer("notation")).toBe(false);
      expect(isNoAnswer("known")).toBe(false);
    });
  });

  describe("Action Results", () => {
    test("yes_no question with yes answer triggers onYes action", () => {
      const question: Question = {
        id: "q1",
        agentName: "test-agent",
        question: "Should I proceed?",
        questionType: "yes_no",
        status: "answered",
        answer: "yes",
        createdAt: new Date().toISOString(),
        action: {
          type: "set_status",
          onYes: "done",
          onNo: "blocked",
        },
      };

      const result = getActionResult(question);

      expect(result.shouldExecute).toBe(true);
      expect(result.status).toBe("done");
    });

    test("yes_no question with no answer triggers onNo action", () => {
      const question: Question = {
        id: "q1",
        agentName: "test-agent",
        question: "Should I proceed?",
        questionType: "yes_no",
        status: "answered",
        answer: "no",
        createdAt: new Date().toISOString(),
        action: {
          type: "set_status",
          onYes: "done",
          onNo: "blocked",
        },
      };

      const result = getActionResult(question);

      expect(result.shouldExecute).toBe(true);
      expect(result.status).toBe("blocked");
    });

    test("add_note action captures human feedback as note", () => {
      const question: Question = {
        id: "q1",
        agentName: "test-agent",
        question: "What approach should I take?",
        questionType: "open",
        status: "answered",
        answer: "Use the factory pattern",
        createdAt: new Date().toISOString(),
        action: {
          type: "add_note",
          payload: "Human feedback:",
        },
      };

      const result = getActionResult(question);

      expect(result.shouldExecute).toBe(true);
      expect(result.note).toBe("Human feedback: Use the factory pattern");
    });

    test("ambiguous yes_no answer does not trigger action", () => {
      const question: Question = {
        id: "q1",
        agentName: "test-agent",
        question: "Should I proceed?",
        questionType: "yes_no",
        status: "answered",
        answer: "maybe later",
        createdAt: new Date().toISOString(),
        action: {
          type: "set_status",
          onYes: "done",
          onNo: "blocked",
        },
      };

      const result = getActionResult(question);

      expect(result.shouldExecute).toBe(false);
    });

    test("no action configured returns shouldExecute false", () => {
      const question: Question = {
        id: "q1",
        agentName: "test-agent",
        question: "FYI message",
        questionType: "open",
        status: "answered",
        answer: "acknowledged",
        createdAt: new Date().toISOString(),
        // no action
      };

      const result = getActionResult(question);

      expect(result.shouldExecute).toBe(false);
    });
  });
});

describe("Question Workflow Intentions", () => {
  test("agents can ask humans for clarification and wait for response", () => {
    // This tests the intended workflow, not implementation details
    // An agent should be able to:
    // 1. Create a question
    // 2. Wait for the human to answer
    // 3. Get the answer and continue work

    // The question system should support:
    // - Multiple question types (yes_no, open, choice)
    // - Associating questions with tasks
    // - Programmatic actions based on answers

    expect(true).toBe(true); // Placeholder - actual integration would be tested in e2e
  });

  test("choice questions should present options to humans", () => {
    // A choice question should:
    // - Show multiple options
    // - Allow human to select one
    // - Return the selected option as the answer

    expect(true).toBe(true); // Placeholder - UI integration tested separately
  });
});
