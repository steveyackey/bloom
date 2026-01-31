/**
 * Task Prompt Builder Tests
 *
 * Tests for building agent prompts, especially step-related prompts.
 */

import { describe, expect, test } from "bun:test";
import { buildNextStepPrompt } from "../../src/core/orchestrator/task-prompt";
import type { Task } from "../../src/task-schema";

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "test-task",
    title: "Test Task",
    status: "in_progress",
    depends_on: [],
    acceptance_criteria: [],
    ai_notes: [],
    subtasks: [],
    ...overrides,
  };
}

describe("buildNextStepPrompt", () => {
  test("builds prompt for first step", () => {
    const task = createTask({
      id: "refactor-auth",
      title: "Refactor Authentication",
      steps: [
        {
          id: "step-1",
          instruction: "Extract JWT validation",
          status: "pending",
          acceptance_criteria: ["JWT module exists"],
        },
        { id: "step-2", instruction: "Add unit tests", status: "pending", acceptance_criteria: [] },
        { id: "step-3", instruction: "Update docs", status: "pending", acceptance_criteria: [] },
      ],
    });

    const prompt = buildNextStepPrompt(task, 0, "bloom -f tasks.yaml");

    expect(prompt).toContain("# Continuing Task: Refactor Authentication");
    expect(prompt).toContain("Step 1 of 3");
    expect(prompt).toContain("## Current Step: step-1");
    expect(prompt).toContain("Extract JWT validation");
    expect(prompt).toContain("bloom -f tasks.yaml step done step-1");
    expect(prompt).not.toContain("This is the final step");
    expect(prompt).toContain("Bloom will resume your session with the next step");
  });

  test("builds prompt for middle step with completed steps", () => {
    const task = createTask({
      id: "refactor-auth",
      title: "Refactor Authentication",
      steps: [
        { id: "step-1", instruction: "Extract JWT validation", status: "done", acceptance_criteria: [] },
        { id: "step-2", instruction: "Add unit tests", status: "pending", acceptance_criteria: ["Tests pass"] },
        { id: "step-3", instruction: "Update docs", status: "pending", acceptance_criteria: [] },
      ],
    });

    const prompt = buildNextStepPrompt(task, 1, "bloom");

    expect(prompt).toContain("Step 2 of 3");
    expect(prompt).toContain("## Completed Steps");
    expect(prompt).toContain("step-1");
    expect(prompt).toContain("Extract JWT validation");
    expect(prompt).toContain("## Current Step: step-2");
    expect(prompt).toContain("Add unit tests");
    expect(prompt).toContain("bloom step done step-2");
  });

  test("builds prompt for last step with final step message", () => {
    const task = createTask({
      id: "refactor-auth",
      title: "Refactor Authentication",
      steps: [
        { id: "step-1", instruction: "Extract JWT", status: "done", acceptance_criteria: [] },
        { id: "step-2", instruction: "Add tests", status: "done", acceptance_criteria: [] },
        { id: "step-3", instruction: "Update docs", status: "pending", acceptance_criteria: [] },
      ],
    });

    const prompt = buildNextStepPrompt(task, 2, "bloom");

    expect(prompt).toContain("Step 3 of 3");
    expect(prompt).toContain("## Current Step: step-3");
    expect(prompt).toContain("**This is the final step.**");
    expect(prompt).toContain("ready for git operations");
    expect(prompt).not.toContain("resume your session with the next step");
  });

  test("includes step acceptance criteria when present", () => {
    const task = createTask({
      steps: [
        {
          id: "step-1",
          instruction: "Implement feature",
          status: "pending",
          acceptance_criteria: ["Tests pass", "No TypeScript errors", "Documentation updated"],
        },
      ],
    });

    const prompt = buildNextStepPrompt(task, 0, "bloom");

    expect(prompt).toContain("### Step Acceptance Criteria");
    expect(prompt).toContain("- Tests pass");
    expect(prompt).toContain("- No TypeScript errors");
    expect(prompt).toContain("- Documentation updated");
  });

  test("handles multiline instructions with first line in completed steps", () => {
    const task = createTask({
      steps: [
        {
          id: "step-1",
          instruction: "First line of instruction\nSecond line with details\nThird line",
          status: "done",
          acceptance_criteria: [],
        },
        { id: "step-2", instruction: "Next step", status: "pending", acceptance_criteria: [] },
      ],
    });

    const prompt = buildNextStepPrompt(task, 1, "bloom");

    // Completed steps should show only first line
    expect(prompt).toContain("First line of instruction");
    expect(prompt).not.toContain("Second line with details");
  });

  test("throws error for invalid step index", () => {
    const task = createTask({
      steps: [{ id: "step-1", instruction: "Do something", status: "pending", acceptance_criteria: [] }],
    });

    expect(() => buildNextStepPrompt(task, 5, "bloom")).toThrow("Invalid step index");
  });

  test("throws error for task without steps", () => {
    const task = createTask({});

    expect(() => buildNextStepPrompt(task, 0, "bloom")).toThrow("Invalid step index");
  });

  test("includes important instructions about step workflow", () => {
    const task = createTask({
      steps: [{ id: "step-1", instruction: "Test", status: "pending", acceptance_criteria: [] }],
    });

    const prompt = buildNextStepPrompt(task, 0, "bloom");

    expect(prompt).toContain("Only work on THIS step's instruction");
    expect(prompt).toContain("Commit after completing the step");
    expect(prompt).toContain("EXIT");
    expect(prompt).toContain("Do NOT mark the overall task as done");
  });
});
