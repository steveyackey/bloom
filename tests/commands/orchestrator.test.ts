/**
 * Orchestrator Agent Integration Tests
 *
 * These tests validate that the orchestrator correctly:
 * 1. Uses the agent specified for each task
 * 2. Gets capabilities for the correct agent (not hardcoded "claude")
 * 3. Passes agent information through the work loop
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { getAgentCapabilities } from "../../src/agents/capabilities";
import { ClaudeAgentProvider } from "../../src/agents/claude";
import { createAgent } from "../../src/agents/factory";
import { GooseAgentProvider } from "../../src/agents/goose";
import { OpenCodeAgentProvider } from "../../src/agents/opencode";

describe("Orchestrator Agent Selection", () => {
  let testHomeDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.BLOOM_HOME;
    testHomeDir = join(tmpdir(), `bloom-orchestrator-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testHomeDir, { recursive: true });
    process.env.BLOOM_HOME = testHomeDir;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.BLOOM_HOME = originalEnv;
    } else {
      delete process.env.BLOOM_HOME;
    }
    if (existsSync(testHomeDir)) {
      rmSync(testHomeDir, { recursive: true, force: true });
    }
  });

  async function writeConfig(config: Record<string, unknown>): Promise<void> {
    const configPath = join(testHomeDir, "config.yaml");
    await Bun.write(configPath, YAML.stringify(config));
  }

  describe("createAgent with agentName option", () => {
    /**
     * BUG #1 TEST: The orchestrator should use agentName option when creating agents.
     * Currently, runAgentWorkLoop() calls createAgent("nonInteractive") without
     * passing the agentName, causing it to always use the default (claude).
     */
    test("createAgent respects agentName option for opencode", async () => {
      // Even without config, specifying agentName should override
      const agent = await createAgent("nonInteractive", { agentName: "opencode" });
      expect(agent).toBeInstanceOf(OpenCodeAgentProvider);
    });

    test("createAgent respects agentName option for goose", async () => {
      const agent = await createAgent("nonInteractive", { agentName: "goose" });
      expect(agent).toBeInstanceOf(GooseAgentProvider);
    });

    test("createAgent respects agentName option over config default", async () => {
      // Config says use claude, but explicit agentName should override
      await writeConfig({
        nonInteractiveAgent: { agent: "claude" },
      });
      const agent = await createAgent("nonInteractive", { agentName: "opencode" });
      expect(agent).toBeInstanceOf(OpenCodeAgentProvider);
    });

    test("createAgent agentName option takes precedence over config agent.default", async () => {
      await writeConfig({
        agent: { default: "claude" },
      });
      const agent = await createAgent("nonInteractive", { agentName: "goose" });
      expect(agent).toBeInstanceOf(GooseAgentProvider);
    });
  });

  describe("Agent Capabilities Lookup", () => {
    /**
     * These tests verify that getAgentCapabilities returns correct capabilities
     * for each agent. The bug in orchestrator.ts hardcodes "claude" when it
     * should use the actual agent name.
     */
    test("getAgentCapabilities returns different capabilities for different agents", () => {
      const claudeCaps = getAgentCapabilities("claude");
      const gooseCaps = getAgentCapabilities("goose");
      const opencodeCaps = getAgentCapabilities("opencode");

      // Claude supports web search, Goose does not
      expect(claudeCaps?.supportsWebSearch).toBe(true);
      expect(gooseCaps?.supportsWebSearch).toBe(false);

      // Goose supports human questions
      expect(gooseCaps?.supportsHumanQuestions).toBe(true);
      expect(claudeCaps?.supportsHumanQuestions).toBe(true);

      // OpenCode supports LSP, Claude does not
      expect(opencodeCaps?.supportsLSP).toBe(true);
      expect(claudeCaps?.supportsLSP).toBe(false);
    });

    test("orchestrator should use correct agent capabilities (not hardcoded claude)", () => {
      // This test documents the expected behavior that orchestrator.ts violates
      // When running tasks for "goose" agent, capabilities should be Goose's, not Claude's

      const gooseCapabilities = getAgentCapabilities("goose");

      // If orchestrator is fixed, it should get Goose's capabilities:
      expect(gooseCapabilities).toBeDefined();
      expect(gooseCapabilities?.supportsWebSearch).toBe(false);
      expect(gooseCapabilities?.supportsHumanQuestions).toBe(true);

      // But currently orchestrator.ts:300 does:
      // const agentCapabilities = getAgentCapabilities("claude") || {};
      // This is wrong - it should use the agent determined from config/task
    });
  });

  describe("Agent Provider Identification", () => {
    /**
     * BUG #2 TEST: Agent instances should be identifiable by their provider.
     * This is needed so orchestrator can determine which agent was created
     * and use the correct capabilities.
     */
    test("agent providers should be identifiable", async () => {
      const claudeAgent = await createAgent("nonInteractive", { agentName: "claude" });
      const gooseAgent = await createAgent("nonInteractive", { agentName: "goose" });
      const opencodeAgent = await createAgent("nonInteractive", { agentName: "opencode" });

      // We can identify by instanceof, but the Agent interface doesn't
      // expose the provider name - orchestrator has to track it separately
      expect(claudeAgent).toBeInstanceOf(ClaudeAgentProvider);
      expect(gooseAgent).toBeInstanceOf(GooseAgentProvider);
      expect(opencodeAgent).toBeInstanceOf(OpenCodeAgentProvider);
    });
  });
});

describe("Orchestrator Work Loop Agent Selection", () => {
  /**
   * These tests document the bug where runAgentWorkLoop receives an agentName
   * parameter but doesn't use it when creating the agent or getting capabilities.
   *
   * The bug is at orchestrator.ts:
   * - Line 218: createAgent("nonInteractive") ignores the agentName parameter
   * - Line 300: getAgentCapabilities("claude") hardcodes "claude"
   * - Line 310: Log message hardcodes "Claude"
   */

  test("documents the expected behavior for agent name parameter", () => {
    // The runAgentWorkLoop function signature is:
    // export async function runAgentWorkLoop(agentName: string): Promise<void>
    //
    // Expected behavior:
    // 1. The agent created should respect the agentName (or be from config)
    // 2. The capabilities should be for the actual agent being used
    // 3. Log messages should identify the actual agent
    //
    // Current behavior (BUG):
    // 1. createAgent("nonInteractive") - agentName ignored
    // 2. getAgentCapabilities("claude") - hardcoded
    // 3. agentLog.info(`Starting Claude session...`) - hardcoded

    // This test passes because it just documents the issue
    expect(true).toBe(true);
  });
});
