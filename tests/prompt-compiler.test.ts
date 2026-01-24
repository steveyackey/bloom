import { describe, expect, test } from "bun:test";
import { compilePrompt, PromptCompiler, type TaskContext } from "../src/prompts/compiler";

// =============================================================================
// Prompt Compiler Test Specifications
// =============================================================================
//
// These tests verify the prompt compiler's ability to:
// 1. Inject task context into prompts
// 2. Substitute variables in prompts
// 3. Handle missing variables gracefully
//
// Note: Capability-based conditionals have been removed. Agents are trusted
// to know their own capabilities via their own system prompts.
//
// =============================================================================

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Sample prompt templates with variable placeholders for testing.
 */
export const FIXTURE_PROMPTS = {
  /**
   * Prompt with task context placeholders.
   * Used to test task context injection.
   */
  withTaskContext: `# Task: {{TASK_TITLE}}

Task ID: {{TASK_ID}}
Branch: {{TASK_BRANCH}}

## CLI Commands

- Mark done: \`bloom -f "{{TASKS_FILE}}" done {{TASK_ID}}\`
- Block: \`bloom -f "{{TASKS_FILE}}" block {{TASK_ID}}\`
- Add note: \`bloom -f "{{TASKS_FILE}}" note {{TASK_ID}} "message"\`

Begin working on the task.
`,

  /**
   * Prompt with custom variables.
   */
  withCustomVariables: `# Agent: {{AGENT_NAME}}

Working on: {{PROJECT_NAME}}

Complete the assigned work.
`,

  /**
   * Simple prompt without variables.
   */
  simplePrompt: `# Agent Instructions

You are a helpful assistant.

Complete the assigned work.
`,
} as const;

/**
 * Sample task context for testing task context injection.
 */
export const FIXTURE_TASK_CONTEXT = {
  simpleTask: {
    id: "task-1",
    title: "Fix bug",
    branch: "fix/bug",
    tasksFile: "/path/to/tasks.yaml",
  } as TaskContext,
  complexTask: {
    id: "implement-feature-auth-system",
    title: "Implement Authentication System",
    branch: "feature/auth-system",
    tasksFile: "/workspace/project/tasks.yaml",
  } as TaskContext,
} as const;

// =============================================================================
// Test Specifications
// =============================================================================

describe("prompt compiler", () => {
  // ---------------------------------------------------------------------------
  // 1. Task Context Injection Tests
  // ---------------------------------------------------------------------------
  describe("task context injection", () => {
    test("injects task ID into prompt", () => {
      const task = FIXTURE_TASK_CONTEXT.simpleTask;
      const prompt = FIXTURE_PROMPTS.withTaskContext;
      const compiled = compilePrompt(prompt, { task });

      expect(compiled).toContain("task-1");
    });

    test("injects task title into prompt", () => {
      const task = FIXTURE_TASK_CONTEXT.simpleTask;
      const prompt = FIXTURE_PROMPTS.withTaskContext;
      const compiled = compilePrompt(prompt, { task });

      expect(compiled).toContain("Fix bug");
    });

    test("injects task branch into prompt", () => {
      const task = FIXTURE_TASK_CONTEXT.simpleTask;
      const prompt = FIXTURE_PROMPTS.withTaskContext;
      const compiled = compilePrompt(prompt, { task });

      expect(compiled).toContain("fix/bug");
    });

    test("injects bloom CLI commands with correct task ID", () => {
      const task = FIXTURE_TASK_CONTEXT.simpleTask;
      const prompt = FIXTURE_PROMPTS.withTaskContext;
      const compiled = compilePrompt(prompt, { task });

      expect(compiled).toContain("bloom -f");
      expect(compiled).toContain("done task-1");
      expect(compiled).toContain("block task-1");
      expect(compiled).toContain("note task-1");
    });

    test("injects correct tasks file path", () => {
      const task = FIXTURE_TASK_CONTEXT.simpleTask;
      const prompt = FIXTURE_PROMPTS.withTaskContext;
      const compiled = compilePrompt(prompt, { task });

      expect(compiled).toContain('/path/to/tasks.yaml"');
    });

    test("handles complex task IDs and branches", () => {
      const task = FIXTURE_TASK_CONTEXT.complexTask;
      const prompt = FIXTURE_PROMPTS.withTaskContext;
      const compiled = compilePrompt(prompt, { task });

      expect(compiled).toContain("implement-feature-auth-system");
      expect(compiled).toContain("Implement Authentication System");
      expect(compiled).toContain("feature/auth-system");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Variable Substitution Tests
  // ---------------------------------------------------------------------------
  describe("variable substitution", () => {
    test("substitutes custom variables", () => {
      const prompt = FIXTURE_PROMPTS.withCustomVariables;
      const compiled = compilePrompt(prompt, {
        variables: {
          AGENT_NAME: "claude",
          PROJECT_NAME: "my-project",
        },
      });

      expect(compiled).toContain("# Agent: claude");
      expect(compiled).toContain("Working on: my-project");
    });

    test("leaves unmatched variables unchanged", () => {
      const prompt = "Hello {{NAME}}, welcome to {{PLACE}}!";
      const compiled = compilePrompt(prompt, {
        variables: { NAME: "Alice" },
      });

      expect(compiled).toContain("Hello Alice");
      expect(compiled).toContain("{{PLACE}}");
    });

    test("handles prompts without variables", () => {
      const prompt = FIXTURE_PROMPTS.simplePrompt;
      const compiled = compilePrompt(prompt, {});

      expect(compiled).toBe(prompt);
    });

    test("handles empty variables object", () => {
      const prompt = "Hello {{NAME}}!";
      const compiled = compilePrompt(prompt, { variables: {} });

      expect(compiled).toBe("Hello {{NAME}}!");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. PromptCompiler Class Tests
  // ---------------------------------------------------------------------------
  describe("PromptCompiler class", () => {
    test("can be instantiated", () => {
      const compiler = new PromptCompiler();
      expect(compiler).toBeDefined();
    });

    test("compile method works correctly", () => {
      const compiler = new PromptCompiler();
      const result = compiler.compile("Hello {{NAME}}", { variables: { NAME: "World" } });
      expect(result).toBe("Hello World");
    });

    test("handles combined variables and task context", () => {
      const compiler = new PromptCompiler();
      const prompt = `# Task: {{TASK_TITLE}}
Agent: {{AGENT_NAME}}
Done.`;

      const result = compiler.compile(prompt, {
        task: {
          id: "task-1",
          title: "Test Task",
          branch: "test/branch",
          tasksFile: "/tasks.yaml",
        },
        variables: {
          AGENT_NAME: "claude",
        },
      });

      expect(result).toContain("# Task: Test Task");
      expect(result).toContain("Agent: claude");
    });
  });
});
