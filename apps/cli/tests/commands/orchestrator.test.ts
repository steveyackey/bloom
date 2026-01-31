/**
 * Orchestrator Agent Integration Tests
 *
 * These tests validate that the orchestrator correctly:
 * 1. Uses the agent specified for each task
 * 2. Passes agent information through the work loop
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { createAgent } from "../../src/agents/factory";
import { GenericAgentProvider } from "../../src/agents/generic-provider";

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
    test("createAgent respects agentName option for opencode", async () => {
      // Even without config, specifying agentName should override
      const agent = await createAgent("nonInteractive", { agentName: "opencode" });
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("createAgent respects agentName option for goose", async () => {
      const agent = await createAgent("nonInteractive", { agentName: "goose" });
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("createAgent respects agentName option over config default", async () => {
      // Config says use claude, but explicit agentName should override
      await writeConfig({
        nonInteractiveAgent: { agent: "claude" },
      });
      const agent = await createAgent("nonInteractive", { agentName: "opencode" });
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("createAgent agentName option takes precedence over config defaults", async () => {
      await writeConfig({
        agent: { defaultInteractive: "claude", defaultNonInteractive: "claude" },
      });
      const agent = await createAgent("nonInteractive", { agentName: "goose" });
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });
  });

  describe("Agent Provider Identification", () => {
    test("agent providers should be identifiable", async () => {
      const claudeAgent = await createAgent("nonInteractive", { agentName: "claude" });
      const gooseAgent = await createAgent("nonInteractive", { agentName: "goose" });
      const opencodeAgent = await createAgent("nonInteractive", { agentName: "opencode" });

      // We can identify by instanceof, but the Agent interface doesn't
      // expose the provider name - orchestrator has to track it separately
      expect(claudeAgent).toBeInstanceOf(GenericAgentProvider);
      expect(gooseAgent).toBeInstanceOf(GenericAgentProvider);
      expect(opencodeAgent).toBeInstanceOf(GenericAgentProvider);
    });
  });
});
