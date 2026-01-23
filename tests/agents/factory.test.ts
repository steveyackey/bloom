import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as YAML from "yaml";
import { ClaudeAgentProvider } from "../../src/agents/claude";
import { ClineAgentProvider } from "../../src/agents/cline";
import { CodexAgentProvider } from "../../src/agents/codex";
import { CopilotAgentProvider } from "../../src/agents/copilot";
import {
  createAgent,
  createAgentByName,
  getAgentCapabilities,
  getRegisteredAgents,
  isAgentRegistered,
  listAvailableAgents,
} from "../../src/agents/factory";
import { OpenCodeAgentProvider } from "../../src/agents/opencode";

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
    test("returns ClaudeAgentProvider when no config exists for interactive mode", async () => {
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(ClaudeAgentProvider);
    });

    test("returns ClaudeAgentProvider when no config exists for nonInteractive mode", async () => {
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(ClaudeAgentProvider);
    });

    test("returns ClaudeAgentProvider when config exists but no agent config", async () => {
      await writeConfig({ gitProtocol: "https" });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(ClaudeAgentProvider);
    });
  });

  describe("interactive mode selection", () => {
    test("respects interactiveAgent config for claude", async () => {
      await writeConfig({
        interactiveAgent: { agent: "claude" },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(ClaudeAgentProvider);
    });

    test("respects interactiveAgent config for opencode", async () => {
      await writeConfig({
        interactiveAgent: { agent: "opencode" },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(OpenCodeAgentProvider);
    });

    test("respects interactiveAgent config for cline", async () => {
      await writeConfig({
        interactiveAgent: { agent: "cline" },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(ClineAgentProvider);
    });

    test("respects interactiveAgent config for copilot", async () => {
      await writeConfig({
        interactiveAgent: { agent: "copilot" },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(CopilotAgentProvider);
    });

    test("respects interactiveAgent config for codex", async () => {
      await writeConfig({
        interactiveAgent: { agent: "codex" },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(CodexAgentProvider);
    });

    test("uses interactiveAgent config only for interactive mode", async () => {
      await writeConfig({
        interactiveAgent: { agent: "opencode" },
        nonInteractiveAgent: { agent: "claude" },
      });
      const interactiveAgent = await createAgent("interactive");
      expect(interactiveAgent).toBeInstanceOf(OpenCodeAgentProvider);
    });
  });

  describe("nonInteractive mode selection", () => {
    test("respects nonInteractiveAgent config for claude", async () => {
      await writeConfig({
        nonInteractiveAgent: { agent: "claude" },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(ClaudeAgentProvider);
    });

    test("respects nonInteractiveAgent config for opencode", async () => {
      await writeConfig({
        nonInteractiveAgent: { agent: "opencode" },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(OpenCodeAgentProvider);
    });

    test("respects nonInteractiveAgent config for cline", async () => {
      await writeConfig({
        nonInteractiveAgent: { agent: "cline" },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(ClineAgentProvider);
    });

    test("respects nonInteractiveAgent config for copilot", async () => {
      await writeConfig({
        nonInteractiveAgent: { agent: "copilot" },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(CopilotAgentProvider);
    });

    test("respects nonInteractiveAgent config for codex", async () => {
      await writeConfig({
        nonInteractiveAgent: { agent: "codex" },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(CodexAgentProvider);
    });

    test("uses nonInteractiveAgent config only for nonInteractive mode", async () => {
      await writeConfig({
        interactiveAgent: { agent: "claude" },
        nonInteractiveAgent: { agent: "opencode" },
      });
      const nonInteractiveAgent = await createAgent("nonInteractive");
      expect(nonInteractiveAgent).toBeInstanceOf(OpenCodeAgentProvider);
    });
  });

  describe("model passthrough", () => {
    test("passes model to OpenCodeAgentProvider", async () => {
      const customModel = "custom-model-123";
      await writeConfig({
        nonInteractiveAgent: { agent: "opencode", model: customModel },
      });
      const agent = await createAgent("nonInteractive");
      expect(agent).toBeInstanceOf(OpenCodeAgentProvider);
      // Note: We can't directly access private properties, but we verify
      // the agent was created successfully with the model config
    });

    test("creates agent when model is provided for claude", async () => {
      await writeConfig({
        interactiveAgent: { agent: "claude", model: "opus" },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(ClaudeAgentProvider);
      // ClaudeAgentProvider doesn't currently use model, but should not error
    });

    test("creates agent when model is undefined", async () => {
      await writeConfig({
        interactiveAgent: { agent: "opencode" },
      });
      const agent = await createAgent("interactive");
      expect(agent).toBeInstanceOf(OpenCodeAgentProvider);
    });
  });

  describe("invalid agent name errors", () => {
    test("throws error for unknown agent name with helpful message", async () => {
      await writeConfig({
        interactiveAgent: { agent: "unknown-agent" },
      });
      await expect(createAgent("interactive")).rejects.toThrow(
        "Unknown agent 'unknown-agent'. Available: claude, copilot, codex, cline, opencode"
      );
    });

    test("throws error for nonexistent provider", async () => {
      await writeConfig({
        nonInteractiveAgent: { agent: "nonexistent-provider" },
      });
      await expect(createAgent("nonInteractive")).rejects.toThrow(
        "Unknown agent 'nonexistent-provider'. Available: claude, copilot, codex, cline, opencode"
      );
    });

    test("throws error for empty agent name", async () => {
      await writeConfig({
        interactiveAgent: { agent: "" },
      });
      await expect(createAgent("interactive")).rejects.toThrow(
        "Unknown agent ''. Available: claude, copilot, codex, cline, opencode"
      );
    });

    test("error message lists all available agents", async () => {
      await writeConfig({
        interactiveAgent: { agent: "invalid" },
      });
      try {
        await createAgent("interactive");
        expect.unreachable("Should have thrown");
      } catch (e) {
        const error = e as Error;
        expect(error.message).toContain("claude");
        expect(error.message).toContain("copilot");
        expect(error.message).toContain("codex");
        expect(error.message).toContain("cline");
        expect(error.message).toContain("opencode");
      }
    });
  });

  describe("createAgentByName", () => {
    test("creates ClaudeAgentProvider for 'claude'", () => {
      const agent = createAgentByName("claude", true);
      expect(agent).toBeInstanceOf(ClaudeAgentProvider);
    });

    test("creates CopilotAgentProvider for 'copilot'", () => {
      const agent = createAgentByName("copilot", true);
      expect(agent).toBeInstanceOf(CopilotAgentProvider);
    });

    test("creates CodexAgentProvider for 'codex'", () => {
      const agent = createAgentByName("codex", true);
      expect(agent).toBeInstanceOf(CodexAgentProvider);
    });

    test("creates ClineAgentProvider for 'cline'", () => {
      const agent = createAgentByName("cline", true);
      expect(agent).toBeInstanceOf(ClineAgentProvider);
    });

    test("creates OpenCodeAgentProvider for 'opencode'", () => {
      const agent = createAgentByName("opencode", true);
      expect(agent).toBeInstanceOf(OpenCodeAgentProvider);
    });

    test("throws error for invalid agent name", () => {
      expect(() => createAgentByName("invalid", true)).toThrow(
        "Unknown agent 'invalid'. Available: claude, copilot, codex, cline, opencode"
      );
    });
  });

  describe("utility functions", () => {
    test("getRegisteredAgents returns registered agent names", () => {
      const agents = getRegisteredAgents();
      expect(agents).toContain("claude");
      expect(agents).toContain("copilot");
      expect(agents).toContain("codex");
      expect(agents).toContain("cline");
      expect(agents).toContain("opencode");
      expect(agents.length).toBe(5);
    });

    test("listAvailableAgents returns all agent names", () => {
      const agents = listAvailableAgents();
      expect(agents).toEqual(["claude", "copilot", "codex", "cline", "opencode"]);
    });

    test("isAgentRegistered returns true for registered agents", () => {
      expect(isAgentRegistered("claude")).toBe(true);
      expect(isAgentRegistered("copilot")).toBe(true);
      expect(isAgentRegistered("codex")).toBe(true);
      expect(isAgentRegistered("cline")).toBe(true);
      expect(isAgentRegistered("opencode")).toBe(true);
    });

    test("isAgentRegistered returns false for unknown agents", () => {
      expect(isAgentRegistered("unknown")).toBe(false);
      expect(isAgentRegistered("")).toBe(false);
      expect(isAgentRegistered("CLAUDE")).toBe(false); // case sensitive
    });
  });

  describe("capability queries", () => {
    test("getAgentCapabilities returns capabilities for claude", () => {
      const caps = getAgentCapabilities("claude");
      expect(caps).toBeDefined();
      expect(caps?.supportsFileRead).toBe(true);
      expect(caps?.supportsFileWrite).toBe(true);
      expect(caps?.supportsBash).toBe(true);
      expect(caps?.supportsSessionResume).toBe(true);
    });

    test("getAgentCapabilities returns capabilities for copilot", () => {
      const caps = getAgentCapabilities("copilot");
      expect(caps).toBeDefined();
      expect(caps?.supportsFileRead).toBe(true);
      expect(caps?.supportsWebSearch).toBe(true);
      expect(caps?.supportsHumanQuestions).toBe(false);
    });

    test("getAgentCapabilities returns capabilities for codex", () => {
      const caps = getAgentCapabilities("codex");
      expect(caps).toBeDefined();
      expect(caps?.supportsSessionFork).toBe(true);
      expect(caps?.supportsStructuredOutput).toBe(true);
    });

    test("getAgentCapabilities returns capabilities for cline", () => {
      const caps = getAgentCapabilities("cline");
      expect(caps).toBeDefined();
      expect(caps?.supportsPlanMode).toBe(true);
      expect(caps?.supportsHumanQuestions).toBe(true);
    });

    test("getAgentCapabilities returns capabilities for opencode", () => {
      const caps = getAgentCapabilities("opencode");
      expect(caps).toBeDefined();
      expect(caps?.supportsLSP).toBe(true);
      expect(caps?.supportsFileRead).toBe(true);
    });

    test("getAgentCapabilities returns undefined for unknown agent", () => {
      const caps = getAgentCapabilities("unknown");
      expect(caps).toBeUndefined();
    });

    test("capability queries work without instantiating agent", () => {
      // This test verifies that capabilities can be queried
      // without creating an agent instance
      const caps = getAgentCapabilities("claude");
      expect(caps).toBeDefined();
      // No agent instance was created - just capabilities retrieved
    });
  });
});
