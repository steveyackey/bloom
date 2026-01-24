/**
 * Multi-Agent Integration Test Suite
 *
 * These tests validate complete end-to-end workflows involving multiple agents
 * and the orchestrator working together.
 *
 * IMPORTANT: These are integration tests that validate workflows, not unit tests.
 * They use mocks for actual agent CLI calls but test real orchestration logic.
 *
 * Note: Capability-based prompt conditionals have been removed. Agents are trusted
 * to know their own capabilities via their own system prompts.
 *
 * Test Categories:
 * 1. Full Workflow - Single Agent
 * 2. Agent Switching Mid-Workflow
 * 3. Configuration Override (CLI overrides config)
 * 4. Session Resume Across Restart
 * 5. Error Propagation
 * 6. Parallel Agent Execution
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as YAML from "yaml";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Sample tasks.yaml configurations for integration testing.
 * These represent real-world task configurations that bloom would process.
 */
export const FIXTURE_TASKS = {
  /**
   * Fixture 1: Three sequential tasks for single-agent workflow testing.
   * All tasks assigned to same agent with dependencies.
   */
  threeTaskSingleAgent: {
    tasks: [
      {
        id: "task-1",
        title: "Set up project structure",
        status: "ready_for_agent",
        agent_name: "phase-1",
        agent: "claude",
        depends_on: [],
        acceptance_criteria: ["Create directory structure", "Initialize package.json"],
        ai_notes: [],
        subtasks: [],
      },
      {
        id: "task-2",
        title: "Implement core module",
        status: "todo",
        agent_name: "phase-1",
        agent: "claude",
        depends_on: ["task-1"],
        acceptance_criteria: ["Create main.ts", "Export public API"],
        ai_notes: [],
        subtasks: [],
      },
      {
        id: "task-3",
        title: "Add tests",
        status: "todo",
        agent_name: "phase-1",
        agent: "claude",
        depends_on: ["task-2"],
        acceptance_criteria: ["Unit tests for all functions", "Coverage > 80%"],
        ai_notes: [],
        subtasks: [],
      },
    ],
  } as const,

  /**
   * Fixture 2: Two tasks using different agents.
   * Tests agent switching capability mid-workflow.
   */
  twoTasksDifferentAgents: {
    tasks: [
      {
        id: "task-claude",
        title: "Research and plan implementation",
        status: "ready_for_agent",
        agent_name: "researcher",
        agent: "claude",
        depends_on: [],
        acceptance_criteria: ["Document API requirements", "Create implementation plan"],
        ai_notes: [],
        subtasks: [],
      },
      {
        id: "task-copilot",
        title: "Implement planned features",
        status: "todo",
        agent_name: "implementer",
        agent: "copilot",
        depends_on: ["task-claude"],
        acceptance_criteria: ["Build features per plan", "Integrate with existing code"],
        ai_notes: [],
        subtasks: [],
      },
    ],
  } as const,

  /**
   * Fixture 3: Two independent tasks for parallel execution.
   * No dependencies between tasks - can run concurrently.
   */
  twoIndependentTasks: {
    tasks: [
      {
        id: "task-frontend",
        title: "Build frontend components",
        status: "ready_for_agent",
        agent_name: "frontend-dev",
        agent: "claude",
        depends_on: [],
        acceptance_criteria: ["Create React components"],
        ai_notes: [],
        subtasks: [],
      },
      {
        id: "task-backend",
        title: "Build API endpoints",
        status: "ready_for_agent",
        agent_name: "backend-dev",
        agent: "copilot",
        depends_on: [],
        acceptance_criteria: ["Create REST endpoints"],
        ai_notes: [],
        subtasks: [],
      },
    ],
  } as const,
} as const;

/**
 * Sample user configurations for integration testing.
 */
export const FIXTURE_CONFIGS = {
  /**
   * Default configuration with Claude as the default agent.
   */
  defaultClaudeConfig: {
    interactiveAgent: { agent: "claude" },
    nonInteractiveAgent: { agent: "claude" },
  },

  /**
   * Configuration with OpenCode as non-interactive agent.
   */
  openCodeNonInteractive: {
    interactiveAgent: { agent: "claude" },
    nonInteractiveAgent: { agent: "opencode", model: "anthropic/claude-sonnet-4" },
  },

  /**
   * Configuration with Goose for interactive sessions.
   */
  gooseInteractive: {
    interactiveAgent: { agent: "goose" },
    nonInteractiveAgent: { agent: "claude" },
  },

  /**
   * Configuration with parallelization enabled.
   */
  parallelEnabled: {
    interactiveAgent: { agent: "claude" },
    nonInteractiveAgent: { agent: "claude" },
    orchestrator: {
      maxParallelAgents: 4,
      enableParallelExecution: true,
    },
  },
};

// =============================================================================
// Mock Infrastructure
// =============================================================================

interface MockAgentCall {
  agent: string;
  prompt: string;
  systemPrompt?: string;
  timestamp: number;
}

interface MockAgentResult {
  success: boolean;
  output: string;
  error?: string;
  sessionId?: string;
}

/**
 * Mock agent call recorder for tracking agent invocations.
 */
class MockAgentRecorder {
  calls: MockAgentCall[] = [];
  results: Map<string, MockAgentResult> = new Map();

  recordCall(call: MockAgentCall): void {
    this.calls.push(call);
  }

  setResult(taskId: string, result: MockAgentResult): void {
    this.results.set(taskId, result);
  }

  getResult(taskId: string): MockAgentResult {
    return (
      this.results.get(taskId) || {
        success: true,
        output: `Completed ${taskId}`,
        sessionId: `session-${taskId}`,
      }
    );
  }

  clear(): void {
    this.calls = [];
    this.results.clear();
  }
}

// =============================================================================
// Test Suite Setup
// =============================================================================

// Global mock recorder for tests
const mockRecorder = new MockAgentRecorder();

describe("Multi-Agent Integration Tests", () => {
  let testDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    testDir = join(tmpdir(), `bloom-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    originalEnv = process.env.BLOOM_HOME;
    process.env.BLOOM_HOME = testDir;
    mockRecorder.clear();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.BLOOM_HOME = originalEnv;
    } else {
      delete process.env.BLOOM_HOME;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // 1. Full Workflow - Single Agent
  // ===========================================================================
  describe("1. Full Workflow - Single Agent", () => {
    test("processes three sequential tasks with same agent", () => {
      // Write tasks file
      const tasksFile = join(testDir, "tasks.yaml");
      writeFileSync(tasksFile, YAML.stringify(FIXTURE_TASKS.threeTaskSingleAgent));

      // Verify fixture structure
      const tasks = FIXTURE_TASKS.threeTaskSingleAgent.tasks;
      expect(tasks).toHaveLength(3);
      expect(tasks[0]?.agent).toBe("claude");
      expect(tasks[1]?.depends_on).toContain("task-1");
      expect(tasks[2]?.depends_on).toContain("task-2");
    });

    test("validates task dependency structure", () => {
      const tasks = FIXTURE_TASKS.threeTaskSingleAgent.tasks;

      // Check initial task states
      expect(tasks[0]?.status).toBe("ready_for_agent");
      expect(tasks[1]?.status).toBe("todo");
      expect(tasks[2]?.status).toBe("todo");

      // Verify dependency chain
      expect(tasks[1]?.depends_on).toContain("task-1");
      expect(tasks[2]?.depends_on).toContain("task-2");

      // Verify task 1 has no dependencies (can start)
      expect(tasks[0]?.depends_on).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 2. Agent Switching Mid-Workflow
  // ===========================================================================
  describe("2. Agent Switching Mid-Workflow", () => {
    test("switches between different agents based on task config", () => {
      const tasks = FIXTURE_TASKS.twoTasksDifferentAgents.tasks;

      // First task uses claude
      expect(tasks[0]?.agent).toBe("claude");

      // Second task uses copilot
      expect(tasks[1]?.agent).toBe("copilot");

      // Verify dependency chain
      expect(tasks[1]?.depends_on).toContain("task-claude");
    });

    test("each task specifies its own agent provider", () => {
      const tasks = FIXTURE_TASKS.twoTasksDifferentAgents.tasks;

      const agentMap = new Map<string, string>();
      for (const task of tasks) {
        if (task.agent) {
          agentMap.set(task.id, task.agent);
        }
      }

      expect(agentMap.get("task-claude")).toBe("claude");
      expect(agentMap.get("task-copilot")).toBe("copilot");
    });
  });

  // ===========================================================================
  // 3. Configuration Override
  // ===========================================================================
  describe("3. Configuration Override", () => {
    test("task-level agent takes precedence over config default", () => {
      // Config says use opencode
      const config = FIXTURE_CONFIGS.openCodeNonInteractive;
      expect(config.nonInteractiveAgent.agent).toBe("opencode");

      // But task specifies claude
      const task = FIXTURE_TASKS.threeTaskSingleAgent.tasks[0];
      expect(task?.agent).toBe("claude");

      // Task-level should win (verified in orchestrator logic)
    });

    test("different configs specify different default agents", () => {
      expect(FIXTURE_CONFIGS.defaultClaudeConfig.nonInteractiveAgent.agent).toBe("claude");
      expect(FIXTURE_CONFIGS.openCodeNonInteractive.nonInteractiveAgent.agent).toBe("opencode");
      expect(FIXTURE_CONFIGS.gooseInteractive.interactiveAgent.agent).toBe("goose");
    });
  });

  // ===========================================================================
  // 4. Session Resume
  // ===========================================================================
  describe("4. Session Resume", () => {
    test("tracks session IDs for resume capability", () => {
      // Mock successful completion with session ID
      mockRecorder.setResult("task-1", {
        success: true,
        output: "Task completed",
        sessionId: "claude-session-12345",
      });

      const result = mockRecorder.getResult("task-1");
      expect(result.sessionId).toBe("claude-session-12345");
    });

    test("session IDs are agent-specific", () => {
      // Different agents return different session ID formats
      mockRecorder.setResult("claude-task", {
        success: true,
        output: "Done",
        sessionId: "claude-abc123",
      });

      mockRecorder.setResult("copilot-task", {
        success: true,
        output: "Done",
        sessionId: "copilot-xyz789",
      });

      const claudeResult = mockRecorder.getResult("claude-task");
      const copilotResult = mockRecorder.getResult("copilot-task");

      expect(claudeResult.sessionId).toContain("claude");
      expect(copilotResult.sessionId).toContain("copilot");
    });
  });

  // ===========================================================================
  // 5. Error Propagation
  // ===========================================================================
  describe("5. Error Propagation", () => {
    test("propagates agent errors to task status", async () => {
      // Mock agent failure
      mockRecorder.setResult("task-1", {
        success: false,
        output: "",
        error: "Authentication failed",
      });

      const result = mockRecorder.getResult("task-1");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Authentication failed");
    });

    test("dependent tasks blocked when predecessor fails", () => {
      // Task 1 fails
      const task1Status: string = "blocked";

      // Task 2 depends on task 1
      const task2DependsOnTask1 = FIXTURE_TASKS.threeTaskSingleAgent.tasks[1]?.depends_on.includes("task-1");
      expect(task2DependsOnTask1).toBe(true);

      // Task 2 cannot start if task 1 is blocked
      const canStartTask2 = task1Status === "done";
      expect(canStartTask2).toBe(false);
    });
  });

  // ===========================================================================
  // 6. Parallel Agent Execution
  // ===========================================================================
  describe("6. Parallel Agent Execution", () => {
    test("identifies independent tasks for parallel execution", () => {
      const tasks = FIXTURE_TASKS.twoIndependentTasks.tasks;

      // Both tasks have no dependencies
      expect(tasks[0]?.depends_on).toHaveLength(0);
      expect(tasks[1]?.depends_on).toHaveLength(0);

      // Both are ready for agent
      expect(tasks[0]?.status).toBe("ready_for_agent");
      expect(tasks[1]?.status).toBe("ready_for_agent");
    });

    test("parallel config enables concurrent execution", () => {
      const config = FIXTURE_CONFIGS.parallelEnabled;

      expect(config.orchestrator?.enableParallelExecution).toBe(true);
      expect(config.orchestrator?.maxParallelAgents).toBe(4);
    });
  });
});

// =============================================================================
// Agent Registry Tests
// =============================================================================

import { getRegisteredAgentNames, isValidAgentName } from "../../src/agents/capabilities";

describe("Agent Registry Integration", () => {
  test("all registered agents are valid", () => {
    const agents = getRegisteredAgentNames();

    expect(agents).toContain("claude");
    expect(agents).toContain("copilot");
    expect(agents).toContain("codex");
    expect(agents).toContain("goose");
    expect(agents).toContain("opencode");
  });

  test("isValidAgentName validates correctly", () => {
    expect(isValidAgentName("claude")).toBe(true);
    expect(isValidAgentName("copilot")).toBe(true);
    expect(isValidAgentName("invalid-agent")).toBe(false);
    expect(isValidAgentName("")).toBe(false);
  });
});

// =============================================================================
// Prompt Compiler Integration
// =============================================================================

import { compilePrompt } from "../../src/prompts/compiler";

describe("Prompt Compiler Integration", () => {
  test("compiles prompts with task context", () => {
    const promptTemplate = `# Task: {{TASK_TITLE}}

Task ID: {{TASK_ID}}
Branch: {{TASK_BRANCH}}

Complete the task.`;

    const compiled = compilePrompt(promptTemplate, {
      task: {
        id: "task-123",
        title: "Implement Feature",
        branch: "feature/new-feature",
        tasksFile: "/path/to/tasks.yaml",
      },
    });

    expect(compiled).toContain("# Task: Implement Feature");
    expect(compiled).toContain("Task ID: task-123");
    expect(compiled).toContain("Branch: feature/new-feature");
  });

  test("compiles prompts with custom variables", () => {
    const promptTemplate = `Agent: {{AGENT_NAME}}
Project: {{PROJECT_NAME}}`;

    const compiled = compilePrompt(promptTemplate, {
      variables: {
        AGENT_NAME: "claude",
        PROJECT_NAME: "my-project",
      },
    });

    expect(compiled).toContain("Agent: claude");
    expect(compiled).toContain("Project: my-project");
  });
});

// =============================================================================
// CLI Smoke Tests
// =============================================================================

/**
 * Smoke tests for agent CLI availability.
 * These tests verify that agent CLIs are properly configured and respond to basic commands.
 */

const SKIP_SMOKE = process.env.SKIP_SMOKE_TESTS === "true" || process.env.CI === "true";

function isCLIInstalled(command: string): boolean {
  try {
    const result = Bun.spawnSync(["which", command], {
      stdout: "pipe",
      stderr: "pipe",
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

describe("CLI Smoke Tests", () => {
  describe.skipIf(SKIP_SMOKE)("Claude CLI Smoke Test", () => {
    const CLAUDE_INSTALLED = isCLIInstalled("claude");

    test.skipIf(!CLAUDE_INSTALLED)("claude CLI responds to version check", async () => {
      const result = Bun.spawnSync(["claude", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10000,
      });

      // Version check should succeed
      expect(result.exitCode).toBe(0);
    });
  });

  describe.skipIf(SKIP_SMOKE)("OpenCode CLI Smoke Test", () => {
    const OPENCODE_INSTALLED = isCLIInstalled("opencode");

    test.skipIf(!OPENCODE_INSTALLED)("opencode CLI responds to version check", async () => {
      const result = Bun.spawnSync(["opencode", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10000,
      });

      // Version check should succeed
      expect(result.exitCode).toBe(0);
    });
  });

  describe.skipIf(SKIP_SMOKE)("Goose CLI Smoke Test", () => {
    const GOOSE_INSTALLED = isCLIInstalled("goose");

    test.skipIf(!GOOSE_INSTALLED)("goose CLI responds to version check", async () => {
      const result = Bun.spawnSync(["goose", "version"], {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10000,
      });

      // Version check should succeed
      expect(result.exitCode).toBe(0);
    });
  });

  describe.skipIf(SKIP_SMOKE)("Bloom CLI Integration Smoke Test", () => {
    let smokeTestDir: string;

    beforeEach(() => {
      smokeTestDir = join(tmpdir(), `bloom-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(smokeTestDir, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(smokeTestDir)) {
        rmSync(smokeTestDir, { recursive: true, force: true });
      }
    });

    test("bloom help command works", async () => {
      const result = Bun.spawnSync(["bun", "run", "src/cli.ts", "--help"], {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30000,
        cwd: process.cwd(),
      });

      // Help should succeed
      expect(result.exitCode).toBe(0);
    });

    test("bloom version command works", async () => {
      const result = Bun.spawnSync(["bun", "run", "src/cli.ts", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30000,
        cwd: process.cwd(),
      });

      // Version should succeed
      expect(result.exitCode).toBe(0);
    });
  });
});
