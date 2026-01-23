import { describe, expect, test } from "bun:test";
import {
  PromptCompiler,
  compilePrompt,
  generateCapabilitiesSection,
  type AgentCapabilities,
  type TaskContext,
} from "../src/prompts/compiler";

// =============================================================================
// Prompt Compiler Test Specifications
// =============================================================================
//
// These tests verify the prompt compiler's ability to:
// 1. Conditionally include/exclude sections based on agent capabilities
// 2. Generate capability sections dynamically
// 3. Inject task context into prompts
// 4. Ensure no unprocessed conditionals remain in output
// 5. Handle errors gracefully with descriptive messages
//
// PRD Requirements Traced:
// - REQ-PC-001: Capability-based conditional inclusion
// - REQ-PC-002: Dynamic capability section generation
// - REQ-PC-003: Task context injection
// - REQ-PC-004: Clean output (no unprocessed markers)
// - REQ-PC-005: Error handling with descriptive messages
//
// =============================================================================

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Sample agent capabilities configuration for testing.
 * These represent the capabilities an agent may or may not have.
 */
export const FIXTURE_CAPABILITIES = {
  fullCapabilities: {
    supportsWebSearch: true,
    supportsFileRead: true,
    supportsBash: true,
    supportsGit: true,
    supportsMcp: true,
  } as AgentCapabilities,
  limitedCapabilities: {
    supportsWebSearch: false,
    supportsFileRead: true,
    supportsBash: true,
    supportsGit: false,
    supportsMcp: false,
  } as AgentCapabilities,
  minimalCapabilities: {
    supportsWebSearch: false,
    supportsFileRead: false,
    supportsBash: false,
    supportsGit: false,
    supportsMcp: false,
  } as AgentCapabilities,
} as const;

/**
 * Sample prompt templates with conditional markers for testing.
 */
export const FIXTURE_PROMPTS = {
  /**
   * Prompt with web search conditional section.
   * Used to test capability-based inclusion/exclusion.
   */
  withWebSearchConditional: `# Agent Instructions

You are a helpful assistant.

<!-- @if supportsWebSearch -->
## Web Search

You can search the web to find current information.
Use the web_search tool when you need up-to-date information.
<!-- @endif -->

## Core Tasks

Complete the assigned work.
`,

  /**
   * Prompt with multiple conditional sections.
   * Tests that multiple conditionals can be processed independently.
   */
  withMultipleConditionals: `# Agent Workflow

<!-- @if supportsFileRead -->
## File Operations
Read files using the Read tool.
<!-- @endif -->

<!-- @if supportsBash -->
## Terminal Access
Run terminal commands using Bash.
<!-- @endif -->

<!-- @if supportsGit -->
## Git Operations
Manage git repositories and commits.
<!-- @endif -->

Complete the task.
`,

  /**
   * Prompt with nested conditionals (edge case).
   * Tests that nested conditionals are handled correctly.
   */
  withNestedConditionals: `# Instructions

<!-- @if supportsBash -->
## System Access
You have system access.
<!-- @if supportsGit -->
### Git Available
You can use git commands.
<!-- @endif -->
<!-- @endif -->

Done.
`,

  /**
   * Prompt with malformed conditional (missing @endif).
   * Used to test error handling.
   */
  malformedMissingEndif: `# Instructions

<!-- @if supportsWebSearch -->
## Web Search
This section has no closing tag.

Continue with work.
`,

  /**
   * Prompt with malformed conditional (orphan @endif).
   * Used to test error handling.
   */
  malformedOrphanEndif: `# Instructions

## Section
Some content.
<!-- @endif -->

Continue with work.
`,

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
   * Prompt with capability section placeholder.
   * Used to test dynamic capability section generation.
   */
  withCapabilitySection: `# Agent Instructions

{{CAPABILITIES_SECTION}}

## Your Mission

Complete the assigned task.
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

/**
 * Expected capability section outputs for different capability sets.
 */
export const FIXTURE_EXPECTED_CAPABILITY_SECTIONS = {
  fullCapabilities: [
    "Read files",
    "Run terminal commands",
    "Git operations",
    "Web search",
    "MCP tools",
  ],
  limitedCapabilities: ["Read files", "Run terminal commands"],
  // Items that should NOT appear
  limitedCapabilitiesExcluded: ["Git operations", "Web search", "MCP tools"],
} as const;

// =============================================================================
// Test Specifications
// =============================================================================

describe("prompt compiler", () => {
  // ---------------------------------------------------------------------------
  // 1. Capability-Based Inclusion Tests
  // REQ-PC-001: Capability-based conditional inclusion
  // ---------------------------------------------------------------------------
  describe("capability-based inclusion", () => {
    test("includes web search section when agent has supportsWebSearch=true", () => {
      // GIVEN: agent with supportsWebSearch=true
      // WHEN: compiling workflow.md containing <!-- @if supportsWebSearch -->
      // THEN: the web search section IS included in output

      const capabilities = FIXTURE_CAPABILITIES.fullCapabilities;
      const prompt = FIXTURE_PROMPTS.withWebSearchConditional;
      const compiled = compilePrompt(prompt, { capabilities });

      expect(compiled).toContain("## Web Search");
      expect(compiled).toContain("web_search tool");
    });

    test("excludes web search section when agent has supportsWebSearch=false", () => {
      // GIVEN: agent with supportsWebSearch=false
      // WHEN: compiling same workflow.md
      // THEN: the web search section IS NOT included in output

      const capabilities = FIXTURE_CAPABILITIES.limitedCapabilities;
      const prompt = FIXTURE_PROMPTS.withWebSearchConditional;
      const compiled = compilePrompt(prompt, { capabilities });

      expect(compiled).not.toContain("## Web Search");
      expect(compiled).not.toContain("web_search tool");
    });

    test("handles multiple independent conditionals correctly", () => {
      // GIVEN: agent with mixed capabilities {supportsFileRead: true, supportsBash: true, supportsGit: false}
      // WHEN: compiling prompt with multiple conditional sections
      // THEN: only matching sections are included

      const capabilities = FIXTURE_CAPABILITIES.limitedCapabilities;
      const prompt = FIXTURE_PROMPTS.withMultipleConditionals;
      const compiled = compilePrompt(prompt, { capabilities });

      expect(compiled).toContain("## File Operations");
      expect(compiled).toContain("## Terminal Access");
      expect(compiled).not.toContain("## Git Operations");
    });

    test("handles nested conditionals correctly", () => {
      // GIVEN: agent with supportsBash=true and supportsGit=true
      // WHEN: compiling prompt with nested conditionals
      // THEN: both outer and inner sections are included

      const capabilities = FIXTURE_CAPABILITIES.fullCapabilities;
      const prompt = FIXTURE_PROMPTS.withNestedConditionals;
      const compiled = compilePrompt(prompt, { capabilities });

      expect(compiled).toContain("## System Access");
      expect(compiled).toContain("### Git Available");
    });

    test("excludes nested sections when outer condition is false", () => {
      // GIVEN: agent with supportsBash=false
      // WHEN: compiling prompt with nested conditionals
      // THEN: entire outer section (including nested) is excluded

      const capabilities = { ...FIXTURE_CAPABILITIES.minimalCapabilities };
      const prompt = FIXTURE_PROMPTS.withNestedConditionals;
      const compiled = compilePrompt(prompt, { capabilities });

      expect(compiled).not.toContain("## System Access");
      expect(compiled).not.toContain("### Git Available");
    });

    test("preserves content outside of conditionals unchanged", () => {
      // GIVEN: any agent capabilities
      // WHEN: compiling a prompt with conditionals
      // THEN: content outside conditionals is preserved exactly

      const capabilities = FIXTURE_CAPABILITIES.limitedCapabilities;
      const prompt = FIXTURE_PROMPTS.withWebSearchConditional;
      const compiled = compilePrompt(prompt, { capabilities });

      expect(compiled).toContain("# Agent Instructions");
      expect(compiled).toContain("You are a helpful assistant.");
      expect(compiled).toContain("## Core Tasks");
      expect(compiled).toContain("Complete the assigned work.");
    });

    test("includes nested section but excludes inner when outer true and inner false", () => {
      // GIVEN: agent with supportsBash=true but supportsGit=false
      // WHEN: compiling prompt with nested conditionals
      // THEN: outer section is included but inner is excluded

      const capabilities = { supportsBash: true, supportsGit: false } as AgentCapabilities;
      const prompt = FIXTURE_PROMPTS.withNestedConditionals;
      const compiled = compilePrompt(prompt, { capabilities });

      expect(compiled).toContain("## System Access");
      expect(compiled).toContain("You have system access.");
      expect(compiled).not.toContain("### Git Available");
      expect(compiled).not.toContain("You can use git commands.");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Capability Section Generation Tests
  // REQ-PC-002: Dynamic capability section generation
  // ---------------------------------------------------------------------------
  describe("capability section generation", () => {
    test("generates capability section with all enabled capabilities", () => {
      // GIVEN: agent capabilities {supportsFileRead: true, supportsBash: true, supportsGit: false}
      // WHEN: generating capabilities section
      // THEN: output contains "Read files", "Run terminal commands"
      // AND: output does NOT contain "Git operations"

      const capabilities = FIXTURE_CAPABILITIES.limitedCapabilities;
      const section = generateCapabilitiesSection(capabilities);

      expect(section).toContain("Read files");
      expect(section).toContain("Run terminal commands");
      expect(section).not.toContain("Git operations");
    });

    test("generates complete capability section for full capabilities", () => {
      // GIVEN: agent with all capabilities enabled
      // WHEN: generating capabilities section
      // THEN: output contains all capability descriptions

      const capabilities = FIXTURE_CAPABILITIES.fullCapabilities;
      const section = generateCapabilitiesSection(capabilities);

      for (const expected of FIXTURE_EXPECTED_CAPABILITY_SECTIONS.fullCapabilities) {
        expect(section).toContain(expected);
      }
    });

    test("generates minimal capability section for minimal capabilities", () => {
      // GIVEN: agent with no capabilities enabled
      // WHEN: generating capabilities section
      // THEN: output indicates limited capabilities or is empty/minimal

      const capabilities = FIXTURE_CAPABILITIES.minimalCapabilities;
      const section = generateCapabilitiesSection(capabilities);

      // No specific capabilities should be listed
      expect(section).not.toContain("Read files");
      expect(section).not.toContain("Run terminal commands");
      expect(section).not.toContain("Git operations");
    });

    test("integrates capability section into prompt template", () => {
      // GIVEN: prompt with {{CAPABILITIES_SECTION}} placeholder
      // WHEN: compiling with capabilities
      // THEN: placeholder is replaced with generated capability section

      const capabilities = FIXTURE_CAPABILITIES.limitedCapabilities;
      const prompt = FIXTURE_PROMPTS.withCapabilitySection;
      const compiled = compilePrompt(prompt, { capabilities });

      expect(compiled).not.toContain("{{CAPABILITIES_SECTION}}");
      expect(compiled).toContain("Read files");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Task Context Injection Tests
  // REQ-PC-003: Task context injection
  // ---------------------------------------------------------------------------
  describe("task context injection", () => {
    test("injects task ID into prompt", () => {
      // GIVEN: task {id: "task-1", title: "Fix bug", branch: "fix/bug"}
      // WHEN: compiling with task context
      // THEN: output contains task ID

      const task = FIXTURE_TASK_CONTEXT.simpleTask;
      const prompt = FIXTURE_PROMPTS.withTaskContext;
      const compiled = compilePrompt(prompt, { task });

      expect(compiled).toContain("task-1");
    });

    test("injects task title into prompt", () => {
      // GIVEN: task {id: "task-1", title: "Fix bug", branch: "fix/bug"}
      // WHEN: compiling with task context
      // THEN: output contains task title

      const task = FIXTURE_TASK_CONTEXT.simpleTask;
      const prompt = FIXTURE_PROMPTS.withTaskContext;
      const compiled = compilePrompt(prompt, { task });

      expect(compiled).toContain("Fix bug");
    });

    test("injects task branch into prompt", () => {
      // GIVEN: task {id: "task-1", title: "Fix bug", branch: "fix/bug"}
      // WHEN: compiling with task context
      // THEN: output contains task branch

      const task = FIXTURE_TASK_CONTEXT.simpleTask;
      const prompt = FIXTURE_PROMPTS.withTaskContext;
      const compiled = compilePrompt(prompt, { task });

      expect(compiled).toContain("fix/bug");
    });

    test("injects bloom CLI commands with correct task ID", () => {
      // GIVEN: task {id: "task-1", ...}
      // WHEN: compiling with task context
      // THEN: output contains bloom CLI commands with that task ID

      const task = FIXTURE_TASK_CONTEXT.simpleTask;
      const prompt = FIXTURE_PROMPTS.withTaskContext;
      const compiled = compilePrompt(prompt, { task });

      expect(compiled).toContain("bloom -f");
      expect(compiled).toContain("done task-1");
      expect(compiled).toContain("block task-1");
      expect(compiled).toContain("note task-1");
    });

    test("injects correct tasks file path", () => {
      // GIVEN: task with tasksFile: "/path/to/tasks.yaml"
      // WHEN: compiling with task context
      // THEN: output contains correct tasks file path in CLI commands

      const task = FIXTURE_TASK_CONTEXT.simpleTask;
      const prompt = FIXTURE_PROMPTS.withTaskContext;
      const compiled = compilePrompt(prompt, { task });

      expect(compiled).toContain('/path/to/tasks.yaml"');
    });

    test("handles complex task IDs and branches", () => {
      // GIVEN: task with complex ID and branch names
      // WHEN: compiling with task context
      // THEN: output contains exact ID and branch values

      const task = FIXTURE_TASK_CONTEXT.complexTask;
      const prompt = FIXTURE_PROMPTS.withTaskContext;
      const compiled = compilePrompt(prompt, { task });

      expect(compiled).toContain("implement-feature-auth-system");
      expect(compiled).toContain("Implement Authentication System");
      expect(compiled).toContain("feature/auth-system");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. No Unprocessed Conditionals Tests
  // REQ-PC-004: Clean output (no unprocessed markers)
  // ---------------------------------------------------------------------------
  describe("no unprocessed conditionals", () => {
    test("removes all @if markers from output", () => {
      // GIVEN: any agent and any prompt file with conditionals
      // WHEN: compiling
      // THEN: output contains NO "<!-- @if" markers

      const capabilities = FIXTURE_CAPABILITIES.fullCapabilities;
      const prompt = FIXTURE_PROMPTS.withWebSearchConditional;
      const compiled = compilePrompt(prompt, { capabilities });

      expect(compiled).not.toContain("<!-- @if");
    });

    test("removes all @endif markers from output", () => {
      // GIVEN: any agent and any prompt file with conditionals
      // WHEN: compiling
      // THEN: output contains NO "<!-- @endif" markers

      const capabilities = FIXTURE_CAPABILITIES.fullCapabilities;
      const prompt = FIXTURE_PROMPTS.withWebSearchConditional;
      const compiled = compilePrompt(prompt, { capabilities });

      expect(compiled).not.toContain("<!-- @endif");
    });

    test("removes all conditional markers when section is excluded", () => {
      // GIVEN: agent without capability for a conditional section
      // WHEN: compiling
      // THEN: output contains NO conditional markers

      const capabilities = FIXTURE_CAPABILITIES.limitedCapabilities;
      const prompt = FIXTURE_PROMPTS.withWebSearchConditional;
      const compiled = compilePrompt(prompt, { capabilities });

      expect(compiled).not.toContain("<!-- @if");
      expect(compiled).not.toContain("<!-- @endif");
      expect(compiled).not.toContain("@if");
      expect(compiled).not.toContain("@endif");
    });

    test("removes all conditional markers from multi-conditional prompts", () => {
      // GIVEN: prompt with multiple conditional sections
      // WHEN: compiling with mixed capabilities
      // THEN: output contains NO conditional markers

      const capabilities = FIXTURE_CAPABILITIES.limitedCapabilities;
      const prompt = FIXTURE_PROMPTS.withMultipleConditionals;
      const compiled = compilePrompt(prompt, { capabilities });

      expect(compiled).not.toContain("<!-- @if");
      expect(compiled).not.toContain("<!-- @endif");
    });

    test("removes all conditional markers from nested conditionals", () => {
      // GIVEN: prompt with nested conditional sections
      // WHEN: compiling
      // THEN: output contains NO conditional markers

      const capabilities = FIXTURE_CAPABILITIES.fullCapabilities;
      const prompt = FIXTURE_PROMPTS.withNestedConditionals;
      const compiled = compilePrompt(prompt, { capabilities });

      expect(compiled).not.toContain("<!-- @if");
      expect(compiled).not.toContain("<!-- @endif");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Error Handling Tests
  // REQ-PC-005: Error handling with descriptive messages
  // ---------------------------------------------------------------------------
  describe("error handling", () => {
    test("throws error identifying unclosed conditional", () => {
      // GIVEN: prompt file with malformed conditional (missing @endif)
      // WHEN: compiling
      // THEN: throws error identifying the unclosed conditional

      const capabilities = FIXTURE_CAPABILITIES.fullCapabilities;
      const prompt = FIXTURE_PROMPTS.malformedMissingEndif;

      expect(() => {
        compilePrompt(prompt, { capabilities });
      }).toThrow(/unclosed|missing.*endif|unmatched/i);
    });

    test("throws error for orphan @endif marker", () => {
      // GIVEN: prompt file with orphan @endif (no matching @if)
      // WHEN: compiling
      // THEN: throws error identifying the orphan marker

      const capabilities = FIXTURE_CAPABILITIES.fullCapabilities;
      const prompt = FIXTURE_PROMPTS.malformedOrphanEndif;

      expect(() => {
        compilePrompt(prompt, { capabilities });
      }).toThrow(/orphan|unmatched|unexpected.*endif/i);
    });

    test("error message includes context about malformed conditional", () => {
      // GIVEN: prompt with malformed conditional
      // WHEN: compiling and catching error
      // THEN: error message includes helpful context (e.g., capability name, line number)

      const capabilities = FIXTURE_CAPABILITIES.fullCapabilities;
      const prompt = FIXTURE_PROMPTS.malformedMissingEndif;

      try {
        compilePrompt(prompt, { capabilities });
        expect.fail("Should have thrown an error");
      } catch (error) {
        const message = (error as Error).message;
        // Should mention the capability or provide context
        expect(message).toMatch(/supportsWebSearch|Web Search|line/i);
      }
    });

    test("handles empty capabilities object gracefully", () => {
      // GIVEN: empty capabilities object {}
      // WHEN: compiling prompt with conditionals
      // THEN: compiles successfully with all conditional sections excluded

      const capabilities = {} as AgentCapabilities;
      const prompt = FIXTURE_PROMPTS.withWebSearchConditional;

      // Should not throw
      const compiled = compilePrompt(prompt, { capabilities });
      expect(compiled).not.toContain("## Web Search");
    });

    test("handles undefined capabilities gracefully", () => {
      // GIVEN: undefined capabilities
      // WHEN: compiling prompt
      // THEN: compiles successfully with all conditional sections excluded

      const prompt = FIXTURE_PROMPTS.withWebSearchConditional;

      // Should not throw - treats undefined as empty capabilities
      const compiled = compilePrompt(prompt, {});
      expect(compiled).toBeDefined();
      expect(compiled).not.toContain("## Web Search");
    });

    test("error message includes file name when provided", () => {
      // GIVEN: prompt with malformed conditional and fileName option
      // WHEN: compiling
      // THEN: error message includes file name

      const capabilities = FIXTURE_CAPABILITIES.fullCapabilities;
      const prompt = FIXTURE_PROMPTS.malformedMissingEndif;

      try {
        compilePrompt(prompt, { capabilities, fileName: "test-prompt.md" });
        expect.fail("Should have thrown an error");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("test-prompt.md");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Additional Tests for PromptCompiler class
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

    test("handles combined capabilities and task context", () => {
      const compiler = new PromptCompiler();
      const prompt = `# Task: {{TASK_TITLE}}
<!-- @if supportsGit -->
## Git Available
Use git to commit your work.
<!-- @endif -->
Done.`;

      const result = compiler.compile(prompt, {
        capabilities: { supportsGit: true },
        task: {
          id: "task-1",
          title: "Test Task",
          branch: "test/branch",
          tasksFile: "/tasks.yaml",
        },
      });

      expect(result).toContain("# Task: Test Task");
      expect(result).toContain("## Git Available");
      expect(result).not.toContain("<!-- @if");
    });
  });
});
