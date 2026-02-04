/**
 * Sandbox Manager Tests
 *
 * Tests for the SandboxManager class that manages per-agent sandbox instances
 * with lifecycle management, process tracking, and cleanup.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxManager } from "../../src/sandbox/manager";

describe("SandboxManager", () => {
  let manager: SandboxManager;
  let testDir: string;

  beforeEach(() => {
    manager = new SandboxManager();
    testDir = join(tmpdir(), `bloom-sandbox-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    manager.destroyAll();
    rmSync(testDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // Instance Creation
  // ===========================================================================

  describe("createInstance", () => {
    test("creates a sandbox instance for an agent", () => {
      const instance = manager.createInstance("agent-1", join(testDir, "agent-1"));

      expect(instance.agentName).toBe("agent-1");
      expect(instance.config.workspacePath).toBe(join(testDir, "agent-1"));
      expect(typeof instance.spawn).toBe("function");
      expect(instance.processes.size).toBe(0);
      expect(instance.createdAt).toBeGreaterThan(0);
    });

    test("each agent gets its own isolated instance", () => {
      const workspace1 = join(testDir, "agent-1");
      const workspace2 = join(testDir, "agent-2");

      const instance1 = manager.createInstance("agent-1", workspace1);
      const instance2 = manager.createInstance("agent-2", workspace2);

      expect(instance1.agentName).toBe("agent-1");
      expect(instance2.agentName).toBe("agent-2");
      expect(instance1.config.workspacePath).toBe(workspace1);
      expect(instance2.config.workspacePath).toBe(workspace2);
      expect(instance1).not.toBe(instance2);
    });

    test("replaces existing instance for same agent", () => {
      const workspace1 = join(testDir, "ws1");
      const workspace2 = join(testDir, "ws2");

      manager.createInstance("agent-1", workspace1);
      const instance2 = manager.createInstance("agent-1", workspace2);

      expect(manager.getInstance("agent-1")).toBe(instance2);
      expect(instance2.config.workspacePath).toBe(workspace2);
    });

    test("applies sandbox config overrides", () => {
      const instance = manager.createInstance("agent-1", join(testDir, "agent-1"), {
        enabled: true,
        networkPolicy: "allow-list",
        allowedDomains: ["github.com"],
      });

      expect(instance.config.enabled).toBe(true);
      expect(instance.config.networkPolicy).toBe("allow-list");
      expect(instance.config.allowedDomains).toEqual(["github.com"]);
    });
  });

  // ===========================================================================
  // Instance Retrieval
  // ===========================================================================

  describe("getInstance", () => {
    test("returns instance for existing agent", () => {
      const created = manager.createInstance("agent-1", join(testDir, "agent-1"));
      const retrieved = manager.getInstance("agent-1");

      expect(retrieved).toBe(created);
    });

    test("returns undefined for non-existent agent", () => {
      expect(manager.getInstance("nonexistent")).toBeUndefined();
    });
  });

  describe("hasInstance", () => {
    test("returns true for existing agent", () => {
      manager.createInstance("agent-1", join(testDir, "agent-1"));
      expect(manager.hasInstance("agent-1")).toBe(true);
    });

    test("returns false for non-existent agent", () => {
      expect(manager.hasInstance("nonexistent")).toBe(false);
    });
  });

  // ===========================================================================
  // Instance Destruction
  // ===========================================================================

  describe("destroyInstance", () => {
    test("removes instance for agent", () => {
      manager.createInstance("agent-1", join(testDir, "agent-1"));
      const result = manager.destroyInstance("agent-1");

      expect(result).toBe(true);
      expect(manager.hasInstance("agent-1")).toBe(false);
    });

    test("returns false for non-existent agent", () => {
      const result = manager.destroyInstance("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("destroyAll", () => {
    test("removes all instances", () => {
      manager.createInstance("agent-1", join(testDir, "agent-1"));
      manager.createInstance("agent-2", join(testDir, "agent-2"));
      manager.createInstance("agent-3", join(testDir, "agent-3"));

      manager.destroyAll();

      expect(manager.hasInstance("agent-1")).toBe(false);
      expect(manager.hasInstance("agent-2")).toBe(false);
      expect(manager.hasInstance("agent-3")).toBe(false);
    });

    test("handles empty manager", () => {
      // Should not throw
      manager.destroyAll();
      expect(manager.getStats().activeInstances).toBe(0);
    });
  });

  // ===========================================================================
  // Statistics
  // ===========================================================================

  describe("getStats", () => {
    test("reports zero stats for empty manager", () => {
      const stats = manager.getStats();

      expect(stats.activeInstances).toBe(0);
      expect(stats.activeProcesses).toBe(0);
      expect(stats.agents).toEqual([]);
    });

    test("reports correct instance count", () => {
      manager.createInstance("agent-1", join(testDir, "agent-1"));
      manager.createInstance("agent-2", join(testDir, "agent-2"));
      manager.createInstance("agent-3", join(testDir, "agent-3"));

      const stats = manager.getStats();

      expect(stats.activeInstances).toBe(3);
      expect(stats.agents).toHaveLength(3);
      expect(stats.agents).toContain("agent-1");
      expect(stats.agents).toContain("agent-2");
      expect(stats.agents).toContain("agent-3");
    });
  });

  // ===========================================================================
  // Concurrent Instance Creation
  // ===========================================================================

  describe("concurrent instances", () => {
    test("supports 10 concurrent sandbox instances", () => {
      const agents = Array.from({ length: 10 }, (_, i) => `agent-${i}`);

      for (const agent of agents) {
        manager.createInstance(agent, join(testDir, agent));
      }

      const stats = manager.getStats();
      expect(stats.activeInstances).toBe(10);
      expect(stats.agents).toHaveLength(10);

      // Each agent has its own distinct instance
      const instances = agents.map((a) => manager.getInstance(a));
      const uniqueInstances = new Set(instances);
      expect(uniqueInstances.size).toBe(10);
    });

    test("each instance has isolated workspace path", () => {
      const agents = Array.from({ length: 5 }, (_, i) => `agent-${i}`);
      const workspaces = agents.map((a) => join(testDir, a));

      for (let i = 0; i < agents.length; i++) {
        manager.createInstance(agents[i]!, workspaces[i]!);
      }

      for (let i = 0; i < agents.length; i++) {
        const instance = manager.getInstance(agents[i]!);
        expect(instance?.config.workspacePath).toBe(workspaces[i]);
      }
    });

    test("destroying one instance does not affect others", () => {
      for (let i = 0; i < 5; i++) {
        manager.createInstance(`agent-${i}`, join(testDir, `agent-${i}`));
      }

      manager.destroyInstance("agent-2");

      expect(manager.hasInstance("agent-0")).toBe(true);
      expect(manager.hasInstance("agent-1")).toBe(true);
      expect(manager.hasInstance("agent-2")).toBe(false);
      expect(manager.hasInstance("agent-3")).toBe(true);
      expect(manager.hasInstance("agent-4")).toBe(true);
      expect(manager.getStats().activeInstances).toBe(4);
    });
  });

  // ===========================================================================
  // Process Tracking via Spawn
  // ===========================================================================

  describe("process tracking", () => {
    test("spawn function tracks child processes", () => {
      const instance = manager.createInstance("agent-1", join(testDir, "agent-1"));

      // Spawn a simple process (sandbox disabled, so passthrough spawn)
      const proc = instance.spawn("echo", ["hello"], {
        cwd: testDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      expect(instance.processes.has(proc)).toBe(true);
    });

    test("process removed from tracking on exit", async () => {
      const instance = manager.createInstance("agent-1", join(testDir, "agent-1"));

      const proc = instance.spawn("echo", ["hello"], {
        cwd: testDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        proc.on("close", () => resolve());
      });

      expect(instance.processes.has(proc)).toBe(false);
    });

    test("tracks processes per-instance independently", async () => {
      const instance1 = manager.createInstance("agent-1", join(testDir, "agent-1"));
      const instance2 = manager.createInstance("agent-2", join(testDir, "agent-2"));

      const proc1 = instance1.spawn("sleep", ["0.1"], {
        cwd: testDir,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const proc2 = instance2.spawn("sleep", ["0.1"], {
        cwd: testDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Each instance tracks its own process
      expect(instance1.processes.has(proc1)).toBe(true);
      expect(instance1.processes.has(proc2)).toBe(false);
      expect(instance2.processes.has(proc2)).toBe(true);
      expect(instance2.processes.has(proc1)).toBe(false);

      // Wait for both to finish
      await Promise.all([
        new Promise<void>((r) => proc1.on("close", () => r())),
        new Promise<void>((r) => proc2.on("close", () => r())),
      ]);
    });
  });
});
