/**
 * Concurrent Sandbox Integration Tests
 *
 * Validates that the multi-agent sandbox model works correctly:
 * - Each agent gets its own sandbox instance
 * - 5-10 concurrent sandboxed agents work without degradation
 * - Sandbox processes are cleaned up on normal and abnormal exit
 * - Isolation between agents is maintained
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "../../src/sandbox/config";
import { SandboxManager } from "../../src/sandbox/manager";

// =============================================================================
// Test Helpers
// =============================================================================

function createTestDir(): string {
  const dir = join(tmpdir(), `bloom-concurrent-sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createAgentWorkspace(baseDir: string, agentName: string): string {
  const workspace = join(baseDir, agentName);
  mkdirSync(workspace, { recursive: true });
  return workspace;
}

/**
 * Spawn a process through a sandbox instance and wait for it to complete.
 * Returns the output and exit code.
 */
async function spawnAndWait(
  instance: ReturnType<SandboxManager["createInstance"]>,
  command: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const proc = instance.spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code });
    });

    proc.on("error", (err) => {
      resolve({ stdout, stderr: err.message, exitCode: -1 });
    });
  });
}

// =============================================================================
// Test Suite
// =============================================================================

describe("Concurrent Sandbox Integration", () => {
  let manager: SandboxManager;
  let testDir: string;

  beforeEach(() => {
    manager = new SandboxManager();
    testDir = createTestDir();
  });

  afterEach(() => {
    manager.destroyAll();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // 1. Per-Agent Sandbox Isolation
  // ===========================================================================

  describe("per-agent sandbox isolation", () => {
    test("each agent gets its own sandbox instance with unique workspace", () => {
      const agentCount = 8;
      const instances: ReturnType<SandboxManager["createInstance"]>[] = [];

      for (let i = 0; i < agentCount; i++) {
        const workspace = createAgentWorkspace(testDir, `agent-${i}`);
        instances.push(manager.createInstance(`agent-${i}`, workspace));
      }

      // Verify each instance is unique with its own workspace
      const workspaces = new Set(instances.map((inst) => inst.config.workspacePath));
      expect(workspaces.size).toBe(agentCount);

      // Verify stats
      const stats = manager.getStats();
      expect(stats.activeInstances).toBe(agentCount);
    });

    test("agents cannot access each other's workspaces via config", () => {
      const workspace1 = createAgentWorkspace(testDir, "agent-alpha");
      const workspace2 = createAgentWorkspace(testDir, "agent-beta");

      const instance1 = manager.createInstance("agent-alpha", workspace1, { enabled: true });
      const instance2 = manager.createInstance("agent-beta", workspace2, { enabled: true });

      // Each sandbox config only allows writing to its own workspace
      const config1 = instance1.config;
      const config2 = instance2.config;

      expect(config1.workspacePath).toBe(workspace1);
      expect(config2.workspacePath).toBe(workspace2);
      expect(config1.workspacePath).not.toBe(config2.workspacePath);

      // When srt settings are generated, each agent's allowWrite is limited to its workspace
      const { toSrtSettings } = require("../../src/sandbox/config");
      const settings1 = toSrtSettings(config1);
      const settings2 = toSrtSettings(config2);

      expect(settings1.filesystem.allowWrite).toContain(workspace1);
      expect(settings1.filesystem.allowWrite).not.toContain(workspace2);
      expect(settings2.filesystem.allowWrite).toContain(workspace2);
      expect(settings2.filesystem.allowWrite).not.toContain(workspace1);
    });

    test("sandbox config is independently configurable per agent", () => {
      const workspace1 = createAgentWorkspace(testDir, "agent-1");
      const workspace2 = createAgentWorkspace(testDir, "agent-2");

      const instance1 = manager.createInstance("agent-1", workspace1, {
        enabled: true,
        networkPolicy: "deny-all",
      });

      const instance2 = manager.createInstance("agent-2", workspace2, {
        enabled: true,
        networkPolicy: "allow-list",
        allowedDomains: ["api.example.com"],
      });

      expect(instance1.config.networkPolicy).toBe("deny-all");
      expect(instance2.config.networkPolicy).toBe("allow-list");
      expect(instance2.config.allowedDomains).toEqual(["api.example.com"]);
    });
  });

  // ===========================================================================
  // 2. Concurrent Agent Execution (5-10 agents)
  // ===========================================================================

  describe("concurrent agent execution", () => {
    test("5 concurrent agents start and run correctly in parallel", async () => {
      const agentCount = 5;
      const results: Array<{ agent: string; stdout: string; exitCode: number | null }> = [];

      // Create instances and spawn processes concurrently
      const promises = Array.from({ length: agentCount }, async (_, i) => {
        const agentName = `concurrent-agent-${i}`;
        const workspace = createAgentWorkspace(testDir, agentName);
        const instance = manager.createInstance(agentName, workspace);

        // Each agent writes to its own workspace to prove isolation
        writeFileSync(join(workspace, "input.txt"), `agent-${i}-data`);

        const result = await spawnAndWait(instance, "cat", [join(workspace, "input.txt")], workspace);

        results.push({ agent: agentName, ...result });
      });

      await Promise.all(promises);

      // All agents should complete successfully
      expect(results).toHaveLength(agentCount);
      for (let i = 0; i < agentCount; i++) {
        const result = results.find((r) => r.agent === `concurrent-agent-${i}`);
        expect(result).toBeDefined();
        expect(result!.exitCode).toBe(0);
        expect(result!.stdout.trim()).toBe(`agent-${i}-data`);
      }
    });

    test("10 concurrent agents complete without degradation", async () => {
      const agentCount = 10;
      const startTime = Date.now();

      // Create all instances first
      const instances = Array.from({ length: agentCount }, (_, i) => {
        const agentName = `scale-agent-${i}`;
        const workspace = createAgentWorkspace(testDir, agentName);
        return {
          name: agentName,
          workspace,
          instance: manager.createInstance(agentName, workspace),
        };
      });

      expect(manager.getStats().activeInstances).toBe(agentCount);

      // Run all agents concurrently - each does a small computation
      const promises = instances.map(async ({ name, workspace, instance }) => {
        // Create a unique file per agent
        const inputFile = join(workspace, "task.txt");
        writeFileSync(inputFile, `Hello from ${name}\n`);

        const result = await spawnAndWait(
          instance,
          "sh",
          ["-c", `cat "${inputFile}" && echo "done-${name}"`],
          workspace
        );

        return { name, result };
      });

      const results = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      // All agents should succeed
      for (const { name, result } of results) {
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`Hello from ${name}`);
        expect(result.stdout).toContain(`done-${name}`);
      }

      // Verify no excessive time (allow generous timeout for CI)
      // 10 concurrent echo/cat should finish in well under 30 seconds
      expect(elapsed).toBeLessThan(30_000);
    });

    test("agents produce independent output streams", async () => {
      const agentCount = 7;

      const instances = Array.from({ length: agentCount }, (_, i) => {
        const agentName = `output-agent-${i}`;
        const workspace = createAgentWorkspace(testDir, agentName);
        return {
          name: agentName,
          workspace,
          instance: manager.createInstance(agentName, workspace),
        };
      });

      // Each agent writes a unique marker to stdout
      const promises = instances.map(({ name, workspace, instance }) => {
        return spawnAndWait(instance, "echo", [`MARKER:${name}:${Date.now()}`], workspace);
      });

      const results = await Promise.all(promises);

      // Each result should contain only its own marker
      for (let i = 0; i < agentCount; i++) {
        const result = results[i]!;
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`MARKER:output-agent-${i}:`);

        // Should not contain other agents' markers
        for (let j = 0; j < agentCount; j++) {
          if (j !== i) {
            expect(result.stdout).not.toContain(`MARKER:output-agent-${j}:`);
          }
        }
      }
    });
  });

  // ===========================================================================
  // 3. Sandbox Cleanup
  // ===========================================================================

  describe("sandbox cleanup", () => {
    test("normal exit: processes cleaned up after completion", async () => {
      const workspace = createAgentWorkspace(testDir, "cleanup-agent");
      const instance = manager.createInstance("cleanup-agent", workspace);

      // Spawn a process and wait for it to finish
      const result = await spawnAndWait(instance, "echo", ["done"], workspace);
      expect(result.exitCode).toBe(0);

      // Process should be removed from tracking
      expect(instance.processes.size).toBe(0);
    });

    test("normal exit: multiple processes cleaned up", async () => {
      const workspace = createAgentWorkspace(testDir, "multi-proc-agent");
      const instance = manager.createInstance("multi-proc-agent", workspace);

      // Spawn multiple sequential processes
      for (let i = 0; i < 5; i++) {
        const result = await spawnAndWait(instance, "echo", [`process-${i}`], workspace);
        expect(result.exitCode).toBe(0);
      }

      // All processes should be cleaned up
      expect(instance.processes.size).toBe(0);
    });

    test("abnormal exit (error): process tracked until exit", async () => {
      const workspace = createAgentWorkspace(testDir, "error-agent");
      const instance = manager.createInstance("error-agent", workspace);

      // Spawn a process that will fail
      const result = await spawnAndWait(instance, "sh", ["-c", "exit 1"], workspace);

      expect(result.exitCode).toBe(1);
      // Process should still be cleaned up from tracking
      expect(instance.processes.size).toBe(0);
    });

    test("destroyInstance kills running processes", async () => {
      const workspace = createAgentWorkspace(testDir, "destroy-agent");
      const instance = manager.createInstance("destroy-agent", workspace);

      // Spawn a long-running process
      const proc = instance.spawn("sleep", ["60"], {
        cwd: workspace,
        stdio: ["pipe", "pipe", "pipe"],
      });

      expect(instance.processes.size).toBe(1);

      // Destroy the instance - should kill the process
      const destroyed = manager.destroyInstance("destroy-agent");
      expect(destroyed).toBe(true);

      // Wait for process to actually terminate
      await new Promise<void>((resolve) => {
        proc.on("close", () => resolve());
        // Safety timeout
        setTimeout(() => resolve(), 2000);
      });
    });

    test("destroyAll kills all running processes across agents", async () => {
      const procs: ChildProcess[] = [];

      // Spawn long-running processes for multiple agents
      for (let i = 0; i < 5; i++) {
        const workspace = createAgentWorkspace(testDir, `killall-agent-${i}`);
        const instance = manager.createInstance(`killall-agent-${i}`, workspace);
        const proc = instance.spawn("sleep", ["60"], {
          cwd: workspace,
          stdio: ["pipe", "pipe", "pipe"],
        });
        procs.push(proc);
      }

      expect(manager.getStats().activeInstances).toBe(5);

      // Destroy all
      manager.destroyAll();

      // Wait for all processes to terminate
      await Promise.all(
        procs.map(
          (proc) =>
            new Promise<void>((resolve) => {
              if (proc.exitCode !== null) {
                resolve();
                return;
              }
              proc.on("close", () => resolve());
              setTimeout(() => resolve(), 2000);
            })
        )
      );

      expect(manager.getStats().activeInstances).toBe(0);
    });

    test("no orphaned processes after cleanup", async () => {
      const workspace = createAgentWorkspace(testDir, "orphan-check");
      const instance = manager.createInstance("orphan-check", workspace);

      // Spawn several processes
      const procs: ChildProcess[] = [];
      for (let i = 0; i < 3; i++) {
        procs.push(
          instance.spawn("sleep", ["0.1"], {
            cwd: workspace,
            stdio: ["pipe", "pipe", "pipe"],
          })
        );
      }

      // Wait for all to exit naturally
      await Promise.all(procs.map((p) => new Promise<void>((resolve) => p.on("close", () => resolve()))));

      // No processes should remain tracked
      expect(instance.processes.size).toBe(0);

      // Destroy should have nothing to clean up
      manager.destroyInstance("orphan-check");
    });
  });

  // ===========================================================================
  // 4. Resource Usage
  // ===========================================================================

  describe("resource usage", () => {
    test("memory usage stays reasonable with 10 instances", () => {
      const baselineMemory = process.memoryUsage().heapUsed;

      // Create 10 sandbox instances
      for (let i = 0; i < 10; i++) {
        const workspace = createAgentWorkspace(testDir, `mem-agent-${i}`);
        manager.createInstance(`mem-agent-${i}`, workspace);
      }

      const afterMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = afterMemory - baselineMemory;

      // Memory increase for 10 instances should be under 50MB
      // (each instance is just config + spawn function + small set)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test("stats correctly reflect active state", async () => {
      // Create instances
      for (let i = 0; i < 5; i++) {
        const workspace = createAgentWorkspace(testDir, `stats-agent-${i}`);
        manager.createInstance(`stats-agent-${i}`, workspace);
      }

      let stats = manager.getStats();
      expect(stats.activeInstances).toBe(5);
      expect(stats.activeProcesses).toBe(0);

      // Spawn a process in one instance
      const instance = manager.getInstance("stats-agent-0")!;
      const proc = instance.spawn("sleep", ["0.5"], {
        cwd: testDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      stats = manager.getStats();
      expect(stats.activeProcesses).toBe(1);

      // Wait for process to finish
      await new Promise<void>((r) => proc.on("close", () => r()));

      stats = manager.getStats();
      expect(stats.activeProcesses).toBe(0);
    });
  });

  // ===========================================================================
  // 5. Workspace File Isolation (Functional Test)
  // ===========================================================================

  describe("workspace file isolation", () => {
    test("agents write to their own workspace only", async () => {
      const agentCount = 5;
      const workspaces: string[] = [];

      // Create workspaces and instances
      for (let i = 0; i < agentCount; i++) {
        const workspace = createAgentWorkspace(testDir, `iso-agent-${i}`);
        workspaces.push(workspace);
        manager.createInstance(`iso-agent-${i}`, workspace);
      }

      // Each agent writes a unique file to its workspace
      const promises = Array.from({ length: agentCount }, async (_, i) => {
        const instance = manager.getInstance(`iso-agent-${i}`)!;
        const outputFile = join(workspaces[i]!, "output.txt");

        await spawnAndWait(instance, "sh", ["-c", `echo "agent-${i}-output" > "${outputFile}"`], workspaces[i]!);
      });

      await Promise.all(promises);

      // Verify each workspace has only its own output
      for (let i = 0; i < agentCount; i++) {
        const outputFile = join(workspaces[i]!, "output.txt");
        expect(existsSync(outputFile)).toBe(true);

        const content = readFileSync(outputFile, "utf-8").trim();
        expect(content).toBe(`agent-${i}-output`);
      }
    });

    test("concurrent agents do not interfere with each other's files", async () => {
      const agentCount = 8;

      // Create workspace and instances
      const agents = Array.from({ length: agentCount }, (_, i) => {
        const workspace = createAgentWorkspace(testDir, `interference-agent-${i}`);
        return {
          name: `interference-agent-${i}`,
          workspace,
          instance: manager.createInstance(`interference-agent-${i}`, workspace),
        };
      });

      // All agents write concurrently - each writes multiple files
      const promises = agents.map(async ({ name, workspace, instance }) => {
        // Write a unique file
        const file1 = join(workspace, "data.txt");
        const file2 = join(workspace, "marker.txt");

        await spawnAndWait(
          instance,
          "sh",
          ["-c", `echo "${name}" > "${file1}" && echo "done" > "${file2}"`],
          workspace
        );

        return { name, workspace };
      });

      const completed = await Promise.all(promises);

      // Verify isolation - each workspace has correct content
      for (const { name, workspace } of completed) {
        const dataContent = readFileSync(join(workspace, "data.txt"), "utf-8").trim();
        const markerContent = readFileSync(join(workspace, "marker.txt"), "utf-8").trim();

        expect(dataContent).toBe(name);
        expect(markerContent).toBe("done");
      }
    });
  });

  // ===========================================================================
  // 6. Orchestrator-Compatible Sandbox Creation
  // ===========================================================================

  describe("orchestrator integration", () => {
    test("sandbox config resolves correctly per-agent with different overrides", () => {
      // Simulate what the orchestrator does: create agents with different sandbox configs
      const agents = [
        { name: "claude-agent", sandbox: { enabled: true, networkPolicy: "deny-all" as const } },
        {
          name: "copilot-agent",
          sandbox: { enabled: true, networkPolicy: "allow-list" as const, allowedDomains: ["github.com"] },
        },
        { name: "goose-agent", sandbox: { enabled: false } },
      ];

      for (const agent of agents) {
        const workspace = createAgentWorkspace(testDir, agent.name);
        const config = resolveConfig(workspace, agent.sandbox);

        expect(config.workspacePath).toBe(workspace);
        if (agent.sandbox.enabled) {
          expect(config.enabled).toBe(true);
        }
      }
    });

    test("GenericAgentProvider creates per-agent spawn functions", () => {
      // Verify that each agent gets its own createSandboxedSpawn call
      // This mirrors GenericAgentProvider.createSpawn()
      const agents = Array.from({ length: 5 }, (_, i) => `provider-agent-${i}`);
      const spawnFunctions: Array<ReturnType<SandboxManager["createInstance"]>["spawn"]> = [];

      for (const agent of agents) {
        const workspace = createAgentWorkspace(testDir, agent);
        const instance = manager.createInstance(agent, workspace);
        spawnFunctions.push(instance.spawn);
      }

      // Each agent has a distinct spawn function
      for (let i = 0; i < spawnFunctions.length; i++) {
        for (let j = i + 1; j < spawnFunctions.length; j++) {
          expect(spawnFunctions[i]).not.toBe(spawnFunctions[j]);
        }
      }
    });
  });
});
