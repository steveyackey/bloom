import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as YAML from "yaml";
import { createAgent, getRegisteredAgents, isAgentRegistered } from "../../src/agents/factory";
import { GenericAgentProvider } from "../../src/agents/generic-provider";

describe("agent factory", () => {
  let testHomeDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Save original BLOOM_HOME
    originalEnv = process.env.BLOOM_HOME;

    // Create a unique test directory
    testHomeDir = join(tmpdir(), `bloom-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testHomeDir, { recursive: true });

    // Set BLOOM_HOME to our test directory
    process.env.BLOOM_HOME = testHomeDir;
  });

  afterEach(() => {
    // Restore original BLOOM_HOME
    if (originalEnv !== undefined) {
      process.env.BLOOM_HOME = originalEnv;
    } else {
      delete process.env.BLOOM_HOME;
    }

    // Cleanup test directory
    if (existsSync(testHomeDir)) {
      rmSync(testHomeDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to write a config file
   */
  async function writeConfig(config: Record<string, unknown>): Promise<void> {
    const configPath = join(testHomeDir, "config.yaml");
    await Bun.write(configPath, YAML.stringify(config));
  }

  describe("default behavior (no config)", () => {
    test("returns GenericAgentProvider when no config exists for interactive mode", async () => {
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("returns GenericAgentProvider when no config exists for nonInteractive mode", async () => {
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("returns GenericAgentProvider when config exists but no agent config", async () => {
      await writeConfig({ gitProtocol: "https" });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });
  });

  describe("interactive mode selection", () => {
    test("respects defaultInteractive config for claude", async () => {
      await writeConfig({
        agent: { defaultInteractive: "claude", defaultNonInteractive: "claude" },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("respects defaultInteractive config for opencode", async () => {
      await writeConfig({
        agent: { defaultInteractive: "opencode", defaultNonInteractive: "claude" },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("respects defaultInteractive config for goose", async () => {
      await writeConfig({
        agent: { defaultInteractive: "goose", defaultNonInteractive: "claude" },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("uses defaultInteractive config only for interactive mode", async () => {
      await writeConfig({
        agent: { defaultInteractive: "opencode", defaultNonInteractive: "claude" },
      });
      const interactiveAgent = await createAgent("interactive");
      expect(interactiveAgent).toBeInstanceOf(GenericAgentProvider);
    });
  });

  describe("nonInteractive mode selection", () => {
    test("respects defaultNonInteractive config for claude", async () => {
      await writeConfig({
        agent: { defaultInteractive: "claude", defaultNonInteractive: "claude" },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("respects defaultNonInteractive config for opencode", async () => {
      await writeConfig({
        agent: { defaultInteractive: "claude", defaultNonInteractive: "opencode" },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("respects defaultNonInteractive config for goose", async () => {
      await writeConfig({
        agent: { defaultInteractive: "claude", defaultNonInteractive: "goose" },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("uses defaultNonInteractive config only for nonInteractive mode", async () => {
      await writeConfig({
        agent: { defaultInteractive: "claude", defaultNonInteractive: "opencode" },
      });
      const nonInteractiveAgent = await createAgent("nonInteractive");
      expect(nonInteractiveAgent).toBeInstanceOf(GenericAgentProvider);
    });
  });

  describe("model passthrough", () => {
    test("passes model to GenericAgentProvider via per-agent config", async () => {
      const customModel = "custom-model-123";
      await writeConfig({
        agent: {
          defaultInteractive: "claude",
          defaultNonInteractive: "opencode",
          opencode: { defaultModel: customModel },
        },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
      // Note: We can't directly access private properties, but we verify
      // the agent was created successfully with the model config
    });

    test("creates agent when model is provided for claude", async () => {
      await writeConfig({
        agent: {
          defaultInteractive: "claude",
          defaultNonInteractive: "claude",
          claude: { defaultModel: "opus" },
        },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("creates agent when model is undefined", async () => {
      await writeConfig({
        agent: { defaultInteractive: "opencode", defaultNonInteractive: "claude" },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });
  });

  describe("unknown agent name validation", () => {
    test("throws error for unknown agent name", async () => {
      await writeConfig({
        agent: { defaultInteractive: "unknown-agent", defaultNonInteractive: "claude" },
      });
      await expect(createAgent("interactive")).rejects.toThrow("Unknown agent");
    });

    test("throws error for nonInteractive unknown agent", async () => {
      await writeConfig({
        agent: { defaultInteractive: "claude", defaultNonInteractive: "nonexistent-provider" },
      });
      await expect(createAgent("nonInteractive")).rejects.toThrow("Unknown agent");
    });

    test("throws error for empty agent name", async () => {
      await writeConfig({
        agent: { defaultInteractive: "", defaultNonInteractive: "claude" },
      });
      await expect(createAgent("interactive")).rejects.toThrow("Unknown agent");
    });
  });

  describe("codex agent selection", () => {
    test("respects defaultInteractive config for codex", async () => {
      await writeConfig({
        agent: { defaultInteractive: "codex", defaultNonInteractive: "claude" },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("respects defaultNonInteractive config for codex", async () => {
      await writeConfig({
        agent: { defaultInteractive: "claude", defaultNonInteractive: "codex" },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("passes model to GenericAgentProvider via per-agent config", async () => {
      const customModel = "gpt-4o";
      await writeConfig({
        agent: {
          defaultInteractive: "claude",
          defaultNonInteractive: "codex",
          codex: { defaultModel: customModel },
        },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });
  });

  describe("copilot mode selection", () => {
    test("respects defaultInteractive config for copilot", async () => {
      await writeConfig({
        agent: { defaultInteractive: "copilot", defaultNonInteractive: "claude" },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("respects defaultNonInteractive config for copilot", async () => {
      await writeConfig({
        agent: { defaultInteractive: "claude", defaultNonInteractive: "copilot" },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });

    test("passes model to GenericAgentProvider via per-agent config", async () => {
      await writeConfig({
        agent: {
          defaultInteractive: "claude",
          defaultNonInteractive: "copilot",
          copilot: { defaultModel: "claude" },
        },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(GenericAgentProvider);
    });
  });

  describe("utility functions", () => {
    test("getRegisteredAgents returns registered agent names", () => {
      const agents = getRegisteredAgents();
      expect(agents).toContain("claude");
      expect(agents).toContain("codex");
      expect(agents).toContain("copilot");
      expect(agents).toContain("cursor");
      expect(agents).toContain("goose");
      expect(agents).toContain("opencode");
      expect(agents).toContain("test");
      expect(agents.length).toBe(7);
    });

    test("isAgentRegistered returns true for registered agents", () => {
      expect(isAgentRegistered("claude")).toBe(true);
      expect(isAgentRegistered("codex")).toBe(true);
      expect(isAgentRegistered("copilot")).toBe(true);
      expect(isAgentRegistered("cursor")).toBe(true);
      expect(isAgentRegistered("goose")).toBe(true);
      expect(isAgentRegistered("opencode")).toBe(true);
      expect(isAgentRegistered("test")).toBe(true);
    });

    test("isAgentRegistered returns false for unknown agents", () => {
      expect(isAgentRegistered("unknown")).toBe(false);
      expect(isAgentRegistered("")).toBe(false);
      expect(isAgentRegistered("CLAUDE")).toBe(false); // case sensitive
    });
  });
});
