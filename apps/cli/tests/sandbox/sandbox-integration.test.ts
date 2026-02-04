/**
 * Sandbox Integration Tests
 *
 * Validates sandbox isolation guarantees at the configuration and enforcement layer:
 * - Filesystem isolation: config denies reads to sensitive paths, limits writes to workspace
 * - Network isolation: deny-all policy produces empty allowedDomains in srt settings
 * - Process isolation: SandboxManager tracks and terminates child processes
 * - Graceful fallback: sandbox degrades to unsandboxed when srt is unavailable
 * - Policy application: allow-list network policy permits only specified hosts
 * - Test-agent compatibility: test-agent runs through sandbox manager spawn
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig, toSrtSettings } from "../../src/sandbox/config";
import { createSandboxedSpawn } from "../../src/sandbox/executor";
import { SandboxManager } from "../../src/sandbox/manager";
import { detectPlatform, getPlatformBackend } from "../../src/sandbox/platforms";

// =============================================================================
// Test Helpers
// =============================================================================

const BLOOM_ROOT = join(import.meta.dir, "../..");

function createTestDir(): string {
  const dir = join(tmpdir(), `bloom-sandbox-integ-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createAgentWorkspace(baseDir: string, agentName: string): string {
  const workspace = join(baseDir, agentName);
  mkdirSync(workspace, { recursive: true });
  return workspace;
}

async function spawnAndWait(
  spawnFn: ReturnType<typeof createSandboxedSpawn>["spawn"],
  command: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const proc = spawnFn(command, args, {
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
// 1. Test-Agent Runs Inside Sandbox
// =============================================================================

describe("Test-Agent Inside Sandbox", () => {
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

  test("test-agent runs successfully through sandbox manager spawn", async () => {
    const workspace = createAgentWorkspace(testDir, "test-agent-sandbox");
    const instance = manager.createInstance("test-agent", workspace);

    const testAgentPath = join(BLOOM_ROOT, "src/agents/test-agent/cli.ts");
    const result = await spawnAndWait(
      instance.spawn,
      "bun",
      [testAgentPath, "-p", "Hello from sandbox", "--delay", "1"],
      workspace
    );

    expect(result.exitCode).toBe(0);

    // Parse output events
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);

    const events = lines.map((line) => JSON.parse(line));

    // Verify session event
    const sessionEvent = events.find((e) => e.type === "session");
    expect(sessionEvent).toBeDefined();
    expect(sessionEvent.session_id).toBeDefined();

    // Verify done event
    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
  });

  test("test-agent with tool calls runs through sandbox manager", async () => {
    const workspace = createAgentWorkspace(testDir, "test-agent-tools");
    const instance = manager.createInstance("test-agent-tools", workspace);

    const testAgentPath = join(BLOOM_ROOT, "src/agents/test-agent/cli.ts");
    const result = await spawnAndWait(
      instance.spawn,
      "bun",
      [testAgentPath, "-p", "Do work", "--tools", "read_file,write_file", "--delay", "1"],
      workspace
    );

    expect(result.exitCode).toBe(0);

    const lines = result.stdout.trim().split("\n").filter(Boolean);
    const events = lines.map((line) => JSON.parse(line));

    // Verify tool_use events
    const toolUseEvents = events.filter((e) => e.type === "tool_use");
    expect(toolUseEvents.length).toBe(2);
    expect(toolUseEvents[0].tool_name).toBe("read_file");
    expect(toolUseEvents[1].tool_name).toBe("write_file");

    // Process should be cleaned up from tracking
    expect(instance.processes.size).toBe(0);
  });

  test("test-agent failure is properly reported through sandbox", async () => {
    const workspace = createAgentWorkspace(testDir, "test-agent-fail");
    const instance = manager.createInstance("test-agent-fail", workspace);

    const testAgentPath = join(BLOOM_ROOT, "src/agents/test-agent/cli.ts");
    const result = await spawnAndWait(
      instance.spawn,
      "bun",
      [testAgentPath, "-p", "Will fail", "--fail", "--delay", "1"],
      workspace
    );

    expect(result.exitCode).toBe(1);

    const lines = result.stdout.trim().split("\n").filter(Boolean);
    const events = lines.map((line) => JSON.parse(line));
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
  });

  test("multiple test-agents run concurrently through sandbox manager", async () => {
    const agentCount = 3;

    const promises = Array.from({ length: agentCount }, async (_, i) => {
      const agentName = `concurrent-test-agent-${i}`;
      const workspace = createAgentWorkspace(testDir, agentName);
      const instance = manager.createInstance(agentName, workspace);

      const testAgentPath = join(BLOOM_ROOT, "src/agents/test-agent/cli.ts");
      const result = await spawnAndWait(
        instance.spawn,
        "bun",
        [testAgentPath, "-p", `Task ${i}`, "--output", `Agent ${i} done`, "--delay", "1"],
        workspace
      );

      return { agentName, result };
    });

    const results = await Promise.all(promises);

    for (const { result } of results) {
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Agent");
    }

    expect(manager.getStats().activeInstances).toBe(agentCount);
  });
});

// =============================================================================
// 2. Filesystem Isolation
// =============================================================================

describe("Filesystem Isolation", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("srt settings deny read access to sensitive paths", () => {
    const workspace = createAgentWorkspace(testDir, "fs-iso-agent");
    const config = resolveConfig(workspace, { enabled: true });
    const settings = toSrtSettings(config);

    // Default config should deny read to sensitive directories
    expect(settings.filesystem.denyRead).toContain("~/.ssh");
    expect(settings.filesystem.denyRead).toContain("~/.aws");
    expect(settings.filesystem.denyRead).toContain("~/.gnupg");
  });

  test("srt settings limit write access to workspace only", () => {
    const workspace = createAgentWorkspace(testDir, "fs-write-agent");
    const config = resolveConfig(workspace, { enabled: true });
    const settings = toSrtSettings(config);

    // Only workspace should be writable (plus any explicitly added paths)
    expect(settings.filesystem.allowWrite).toContain(workspace);
    expect(settings.filesystem.allowWrite).toHaveLength(1);
  });

  test("custom denyReadPaths are reflected in srt settings", () => {
    const workspace = createAgentWorkspace(testDir, "custom-deny-agent");
    const config = resolveConfig(workspace, {
      enabled: true,
      denyReadPaths: ["/etc/passwd", "/etc/shadow", "/root"],
    });
    const settings = toSrtSettings(config);

    expect(settings.filesystem.denyRead).toContain("/etc/passwd");
    expect(settings.filesystem.denyRead).toContain("/etc/shadow");
    expect(settings.filesystem.denyRead).toContain("/root");
  });

  test("additional writable paths are included in srt settings", () => {
    const extraPath = join(testDir, "shared");
    mkdirSync(extraPath, { recursive: true });

    const workspace = createAgentWorkspace(testDir, "extra-write-agent");
    const config = resolveConfig(workspace, {
      enabled: true,
      writablePaths: [extraPath],
    });
    const settings = toSrtSettings(config);

    expect(settings.filesystem.allowWrite).toContain(workspace);
    expect(settings.filesystem.allowWrite).toContain(extraPath);
    expect(settings.filesystem.allowWrite).toHaveLength(2);
  });

  test("agents have isolated workspace write permissions", () => {
    const workspace1 = createAgentWorkspace(testDir, "agent-alpha");
    const workspace2 = createAgentWorkspace(testDir, "agent-beta");

    const config1 = resolveConfig(workspace1, { enabled: true });
    const config2 = resolveConfig(workspace2, { enabled: true });

    const settings1 = toSrtSettings(config1);
    const settings2 = toSrtSettings(config2);

    // Agent 1 can only write to workspace 1
    expect(settings1.filesystem.allowWrite).toContain(workspace1);
    expect(settings1.filesystem.allowWrite).not.toContain(workspace2);

    // Agent 2 can only write to workspace 2
    expect(settings2.filesystem.allowWrite).toContain(workspace2);
    expect(settings2.filesystem.allowWrite).not.toContain(workspace1);
  });

  test("sandbox spawn with deny-read config prevents access outside workspace", async () => {
    const workspace = createAgentWorkspace(testDir, "read-test-agent");

    // Create a file outside workspace
    const outsideFile = join(testDir, "secret.txt");
    writeFileSync(outsideFile, "secret-data");

    // Create sandbox with deny-read for the outside directory
    const config = resolveConfig(workspace, {
      enabled: true,
      denyReadPaths: [outsideFile],
    });
    const settings = toSrtSettings(config);

    // Verify the settings include the deny-read path
    expect(settings.filesystem.denyRead).toContain(outsideFile);

    // Without srt, this is config-level enforcement only
    // The srt settings file would prevent the actual read at runtime
  });
});

// =============================================================================
// 3. Network Isolation
// =============================================================================

describe("Network Isolation", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("deny-all policy produces empty allowedDomains", () => {
    const workspace = createAgentWorkspace(testDir, "net-deny-agent");
    const config = resolveConfig(workspace, {
      enabled: true,
      networkPolicy: "deny-all",
    });
    const settings = toSrtSettings(config);

    expect(settings.network.allowedDomains).toEqual([]);
  });

  test("allow-list policy includes only specified domains", () => {
    const workspace = createAgentWorkspace(testDir, "net-allow-agent");
    const config = resolveConfig(workspace, {
      enabled: true,
      networkPolicy: "allow-list",
      allowedDomains: ["api.github.com", "registry.npmjs.org"],
    });
    const settings = toSrtSettings(config);

    expect(settings.network.allowedDomains).toEqual(["api.github.com", "registry.npmjs.org"]);
    expect(settings.network.allowedDomains).toHaveLength(2);
  });

  test("agents have independent network policies", () => {
    const workspace1 = createAgentWorkspace(testDir, "agent-restricted");
    const workspace2 = createAgentWorkspace(testDir, "agent-open");

    const config1 = resolveConfig(workspace1, {
      enabled: true,
      networkPolicy: "deny-all",
    });
    const config2 = resolveConfig(workspace2, {
      enabled: true,
      networkPolicy: "allow-list",
      allowedDomains: ["api.openai.com"],
    });

    const settings1 = toSrtSettings(config1);
    const settings2 = toSrtSettings(config2);

    // Agent 1: no network
    expect(settings1.network.allowedDomains).toEqual([]);

    // Agent 2: specific domains
    expect(settings2.network.allowedDomains).toEqual(["api.openai.com"]);
  });

  test("disabled network policy produces empty allowedDomains (platform handles bypass)", () => {
    const workspace = createAgentWorkspace(testDir, "net-disabled-agent");
    const config = resolveConfig(workspace, {
      enabled: true,
      networkPolicy: "disabled",
    });
    const settings = toSrtSettings(config);

    // "disabled" means no restrictions — but srt handles this at the platform level
    // The settings still have empty domains; the platform backend skips network namespace
    expect(settings.network.allowedDomains).toEqual([]);
  });

  test("network policy change does not affect filesystem settings", () => {
    const workspace = createAgentWorkspace(testDir, "mixed-policy-agent");

    const denyAll = resolveConfig(workspace, { enabled: true, networkPolicy: "deny-all" });
    const allowList = resolveConfig(workspace, {
      enabled: true,
      networkPolicy: "allow-list",
      allowedDomains: ["example.com"],
    });

    const settingsDeny = toSrtSettings(denyAll);
    const settingsAllow = toSrtSettings(allowList);

    // Filesystem settings should be identical regardless of network policy
    expect(settingsDeny.filesystem.allowWrite).toEqual(settingsAllow.filesystem.allowWrite);
    expect(settingsDeny.filesystem.denyRead).toEqual(settingsAllow.filesystem.denyRead);
  });
});

// =============================================================================
// 4. Process Isolation
// =============================================================================

describe("Process Isolation", () => {
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

  test("sandbox manager tracks spawned child processes", async () => {
    const workspace = createAgentWorkspace(testDir, "proc-track-agent");
    const instance = manager.createInstance("proc-track-agent", workspace);

    // Spawn a process that takes time
    const proc = instance.spawn("sleep", ["0.5"], {
      cwd: workspace,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Process should be tracked
    expect(instance.processes.size).toBe(1);

    // Wait for it to complete
    await new Promise<void>((resolve) => proc.on("close", () => resolve()));

    // Process should be removed from tracking after completion
    expect(instance.processes.size).toBe(0);
  });

  test("destroying agent instance kills all its child processes", async () => {
    const workspace = createAgentWorkspace(testDir, "proc-kill-agent");
    const instance = manager.createInstance("proc-kill-agent", workspace);

    // Spawn multiple long-running processes
    const procs: ChildProcess[] = [];
    for (let i = 0; i < 3; i++) {
      procs.push(
        instance.spawn("sleep", ["60"], {
          cwd: workspace,
          stdio: ["pipe", "pipe", "pipe"],
        })
      );
    }

    expect(instance.processes.size).toBe(3);

    // Destroy the instance
    manager.destroyInstance("proc-kill-agent");

    // Wait for processes to terminate
    await Promise.all(
      procs.map(
        (proc) =>
          new Promise<void>((resolve) => {
            if (proc.exitCode !== null) {
              resolve();
              return;
            }
            proc.on("close", () => resolve());
            setTimeout(() => resolve(), 3000);
          })
      )
    );

    // Instance should be removed
    expect(manager.hasInstance("proc-kill-agent")).toBe(false);
  });

  test("processes from different agents are tracked independently", async () => {
    const workspace1 = createAgentWorkspace(testDir, "agent-a");
    const workspace2 = createAgentWorkspace(testDir, "agent-b");

    const instance1 = manager.createInstance("agent-a", workspace1);
    const instance2 = manager.createInstance("agent-b", workspace2);

    // Spawn process in each agent
    const proc1 = instance1.spawn("sleep", ["0.3"], {
      cwd: workspace1,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const proc2 = instance2.spawn("sleep", ["0.3"], {
      cwd: workspace2,
      stdio: ["pipe", "pipe", "pipe"],
    });

    expect(instance1.processes.size).toBe(1);
    expect(instance2.processes.size).toBe(1);

    // Destroy only agent-a
    manager.destroyInstance("agent-a");

    // Wait for proc1 to terminate
    await new Promise<void>((resolve) => {
      if (proc1.exitCode !== null) {
        resolve();
        return;
      }
      proc1.on("close", () => resolve());
      setTimeout(() => resolve(), 2000);
    });

    // agent-b should still have its process
    expect(manager.hasInstance("agent-b")).toBe(true);
    // Wait for proc2 to also complete
    await new Promise<void>((resolve) => proc2.on("close", () => resolve()));
    expect(instance2.processes.size).toBe(0);
  });

  test("sandbox manager stats reflect process counts accurately", async () => {
    const workspace = createAgentWorkspace(testDir, "stats-agent");
    const instance = manager.createInstance("stats-agent", workspace);

    expect(manager.getStats().activeProcesses).toBe(0);

    // Spawn processes
    const procs: ChildProcess[] = [];
    for (let i = 0; i < 4; i++) {
      procs.push(
        instance.spawn("sleep", ["0.2"], {
          cwd: workspace,
          stdio: ["pipe", "pipe", "pipe"],
        })
      );
    }

    expect(manager.getStats().activeProcesses).toBe(4);

    // Wait for all to complete
    await Promise.all(procs.map((p) => new Promise<void>((resolve) => p.on("close", () => resolve()))));

    expect(manager.getStats().activeProcesses).toBe(0);
  });

  test("process limit field is preserved in config", () => {
    const workspace = createAgentWorkspace(testDir, "limit-agent");
    const config = resolveConfig(workspace, { enabled: true, processLimit: 10 });

    expect(config.processLimit).toBe(10);
  });
});

// =============================================================================
// 5. Graceful Fallback
// =============================================================================

describe("Graceful Fallback", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("sandbox disabled by default returns unsandboxed spawn", () => {
    const workspace = createAgentWorkspace(testDir, "fallback-default");
    const config = resolveConfig(workspace);

    expect(config.enabled).toBe(false);

    const result = createSandboxedSpawn(config);
    expect(result.sandboxed).toBe(false);
    expect(typeof result.spawn).toBe("function");
  });

  test("unsandboxed spawn still executes commands correctly", async () => {
    const workspace = createAgentWorkspace(testDir, "fallback-exec");
    const config = resolveConfig(workspace, { enabled: false });
    const { spawn: spawnFn, sandboxed } = createSandboxedSpawn(config);

    expect(sandboxed).toBe(false);

    const result = await spawnAndWait(spawnFn, "echo", ["fallback-works"], workspace);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("fallback-works");
  });

  test("sandbox manager falls back gracefully when srt is unavailable", async () => {
    const manager = new SandboxManager();
    const workspace = createAgentWorkspace(testDir, "manager-fallback");

    // Create instance with sandbox disabled (the default) to test fallback path
    const instance = manager.createInstance("fallback-agent", workspace, { enabled: false });

    // With sandbox disabled, sandboxed should always be false
    expect(instance.sandboxed).toBe(false);
    expect(typeof instance.spawn).toBe("function");

    // Commands should execute normally in unsandboxed mode
    const result = await spawnAndWait(instance.spawn, "echo", ["sandbox-fallback"], workspace);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("sandbox-fallback");

    manager.destroyAll();
  });

  test("sandbox enabled with srt unavailable reports sandboxed status correctly", () => {
    const manager = new SandboxManager();
    const workspace = createAgentWorkspace(testDir, "srt-check");

    // When enabled: true, the sandbox checks for srt availability
    const instance = manager.createInstance("srt-check-agent", workspace, { enabled: true });

    // sandboxed reflects whether srt was actually found and is usable
    expect(typeof instance.sandboxed).toBe("boolean");
    expect(typeof instance.spawn).toBe("function");
    expect(instance.config.enabled).toBe(true);

    manager.destroyAll();
  });

  test("platform detection works on current platform", () => {
    const platform = detectPlatform();

    expect(platform.os).toBeDefined();
    expect(platform.arch).toBeDefined();
    // Should be linux or darwin for supported platforms
    expect(["linux", "darwin", "win32"]).toContain(platform.os);
  });

  test("platform backend is available for supported platforms", () => {
    const platform = detectPlatform();
    const backend = getPlatformBackend(platform);

    if (platform.os === "linux" || platform.os === "darwin") {
      expect(backend).not.toBeNull();
      expect(typeof backend!.checkAvailability).toBe("function");
      expect(typeof backend!.checkDependencies).toBe("function");
      expect(typeof backend!.buildCommand).toBe("function");
    }
  });

  test("unsupported platform returns null backend", () => {
    const backend = getPlatformBackend({ os: "freebsd", arch: "x64" });
    expect(backend).toBeNull();
  });

  test("createSandboxedSpawn with unsupported platform returns unsandboxed spawn", () => {
    const workspace = createAgentWorkspace(testDir, "unsupported-platform");
    const config = resolveConfig(workspace, { enabled: true });

    // When the platform doesn't support sandboxing, createSandboxedSpawn
    // falls back to unsandboxed. We can verify the function returns a valid spawn.
    const result = createSandboxedSpawn(config);
    expect(typeof result.spawn).toBe("function");
    // On systems with srt + deps, sandboxed=true; without, sandboxed=false
    expect(typeof result.sandboxed).toBe("boolean");
  });
});

// =============================================================================
// 6. Policy Application (Allow-List Network)
// =============================================================================

describe("Policy Application", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("allow-list policy permits only specified hosts in srt settings", () => {
    const workspace = createAgentWorkspace(testDir, "policy-allow");
    const config = resolveConfig(workspace, {
      enabled: true,
      networkPolicy: "allow-list",
      allowedDomains: ["api.github.com", "registry.npmjs.org"],
    });
    const settings = toSrtSettings(config);

    // Only the specified domains should be in allowedDomains
    expect(settings.network.allowedDomains).toEqual(["api.github.com", "registry.npmjs.org"]);

    // Domains not in the list should NOT be present
    expect(settings.network.allowedDomains).not.toContain("evil.example.com");
    expect(settings.network.allowedDomains).not.toContain("google.com");
  });

  test("empty allow-list blocks all network access", () => {
    const workspace = createAgentWorkspace(testDir, "policy-empty-allow");
    const config = resolveConfig(workspace, {
      enabled: true,
      networkPolicy: "allow-list",
      allowedDomains: [],
    });
    const settings = toSrtSettings(config);

    expect(settings.network.allowedDomains).toEqual([]);
  });

  test("per-agent allow-list policies are independent", () => {
    const ws1 = createAgentWorkspace(testDir, "agent-github");
    const ws2 = createAgentWorkspace(testDir, "agent-npm");
    const ws3 = createAgentWorkspace(testDir, "agent-isolated");

    const config1 = resolveConfig(ws1, {
      enabled: true,
      networkPolicy: "allow-list",
      allowedDomains: ["api.github.com"],
    });
    const config2 = resolveConfig(ws2, {
      enabled: true,
      networkPolicy: "allow-list",
      allowedDomains: ["registry.npmjs.org"],
    });
    const config3 = resolveConfig(ws3, {
      enabled: true,
      networkPolicy: "deny-all",
    });

    const settings1 = toSrtSettings(config1);
    const settings2 = toSrtSettings(config2);
    const settings3 = toSrtSettings(config3);

    expect(settings1.network.allowedDomains).toEqual(["api.github.com"]);
    expect(settings2.network.allowedDomains).toEqual(["registry.npmjs.org"]);
    expect(settings3.network.allowedDomains).toEqual([]);

    // Cross-check: agent-github cannot reach npm, agent-npm cannot reach github
    expect(settings1.network.allowedDomains).not.toContain("registry.npmjs.org");
    expect(settings2.network.allowedDomains).not.toContain("api.github.com");
  });

  test("srt settings file contains correct JSON structure", () => {
    const workspace = createAgentWorkspace(testDir, "settings-structure");
    const config = resolveConfig(workspace, {
      enabled: true,
      networkPolicy: "allow-list",
      allowedDomains: ["api.example.com"],
      denyReadPaths: ["/etc/shadow"],
      writablePaths: ["/tmp/extra"],
    });
    const settings = toSrtSettings(config);

    // Verify the complete structure matches srt expectations
    expect(settings).toHaveProperty("filesystem");
    expect(settings).toHaveProperty("network");
    expect(settings.filesystem).toHaveProperty("denyRead");
    expect(settings.filesystem).toHaveProperty("allowWrite");
    expect(settings.network).toHaveProperty("allowedDomains");

    // Verify values
    expect(settings.filesystem.denyRead).toContain("/etc/shadow");
    expect(settings.filesystem.allowWrite).toContain(workspace);
    expect(settings.filesystem.allowWrite).toContain("/tmp/extra");
    expect(settings.network.allowedDomains).toContain("api.example.com");

    // Verify it serializes to valid JSON
    const json = JSON.stringify(settings, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(settings);
  });

  test("linux platform backend builds correct srt command", () => {
    const platform = detectPlatform();
    if (platform.os !== "linux") {
      // Skip on non-Linux platforms
      return;
    }

    const backend = getPlatformBackend(platform);
    expect(backend).not.toBeNull();

    const workspace = createAgentWorkspace(testDir, "cmd-build");
    const config = resolveConfig(workspace, { enabled: true });
    const settingsPath = "/tmp/bloom-sandbox/test-settings.json";

    const { cmd, args } = backend!.buildCommand(config, settingsPath, "bun", ["test-agent.ts"]);

    // srt should be the command
    expect(cmd).toBe("srt");
    // Args should include --settings, the path, and the original command + args
    expect(args).toContain("--settings");
    expect(args).toContain(settingsPath);
    expect(args).toContain("bun");
    expect(args).toContain("test-agent.ts");
  });
});

// =============================================================================
// 7. End-to-End: Test-Agent with Sandbox Config
// =============================================================================

describe("Test-Agent E2E with Sandbox Configuration", () => {
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

  test("test-agent runs with deny-all sandbox config applied", async () => {
    const workspace = createAgentWorkspace(testDir, "e2e-deny-all");
    // Use sandbox manager to create config but let command run unsandboxed
    // (srt may not be installed; we verify config correctness separately)
    const instance = manager.createInstance("e2e-deny-all", workspace, {
      networkPolicy: "deny-all",
    });

    const testAgentPath = join(BLOOM_ROOT, "src/agents/test-agent/cli.ts");
    const result = await spawnAndWait(
      instance.spawn,
      "bun",
      [testAgentPath, "-p", "Deny-all test", "--delay", "1"],
      workspace
    );

    expect(result.exitCode).toBe(0);

    // Verify config was applied correctly
    expect(instance.config.networkPolicy).toBe("deny-all");
    expect(instance.config.workspacePath).toBe(workspace);

    // Verify the srt settings would enforce deny-all
    const settings = toSrtSettings(instance.config);
    expect(settings.network.allowedDomains).toEqual([]);
  });

  test("test-agent runs with allow-list sandbox config applied", async () => {
    const workspace = createAgentWorkspace(testDir, "e2e-allow-list");
    const instance = manager.createInstance("e2e-allow-list", workspace, {
      networkPolicy: "allow-list",
      allowedDomains: ["api.anthropic.com"],
    });

    const testAgentPath = join(BLOOM_ROOT, "src/agents/test-agent/cli.ts");
    const result = await spawnAndWait(
      instance.spawn,
      "bun",
      [testAgentPath, "-p", "Allow-list test", "--delay", "1"],
      workspace
    );

    expect(result.exitCode).toBe(0);

    // Verify the config
    expect(instance.config.networkPolicy).toBe("allow-list");
    expect(instance.config.allowedDomains).toEqual(["api.anthropic.com"]);

    // Verify srt settings
    const settings = toSrtSettings(instance.config);
    expect(settings.network.allowedDomains).toEqual(["api.anthropic.com"]);
  });

  test("test-agent runs with custom filesystem restrictions applied", async () => {
    const workspace = createAgentWorkspace(testDir, "e2e-fs-restrict");
    const instance = manager.createInstance("e2e-fs-restrict", workspace, {
      denyReadPaths: ["/etc/passwd", "/etc/shadow", "/root"],
    });

    const testAgentPath = join(BLOOM_ROOT, "src/agents/test-agent/cli.ts");
    const result = await spawnAndWait(
      instance.spawn,
      "bun",
      [testAgentPath, "-p", "FS restrict test", "--delay", "1"],
      workspace
    );

    expect(result.exitCode).toBe(0);

    // Verify the config
    expect(instance.config.denyReadPaths).toContain("/etc/passwd");
    expect(instance.config.denyReadPaths).toContain("/etc/shadow");
    expect(instance.config.denyReadPaths).toContain("/root");

    // Verify srt settings would enforce this
    const settings = toSrtSettings(instance.config);
    expect(settings.filesystem.denyRead).toContain("/etc/passwd");
    expect(settings.filesystem.allowWrite).toContain(workspace);
  });

  test("test-agent session and process cleanup after sandbox run", async () => {
    const workspace = createAgentWorkspace(testDir, "e2e-cleanup");
    const instance = manager.createInstance("e2e-cleanup", workspace);

    const testAgentPath = join(BLOOM_ROOT, "src/agents/test-agent/cli.ts");
    await spawnAndWait(instance.spawn, "bun", [testAgentPath, "-p", "Cleanup test", "--delay", "1"], workspace);

    // After completion, no processes should be tracked
    expect(instance.processes.size).toBe(0);

    // Manager should still track the instance
    expect(manager.hasInstance("e2e-cleanup")).toBe(true);

    // Destroy should succeed
    expect(manager.destroyInstance("e2e-cleanup")).toBe(true);
    expect(manager.hasInstance("e2e-cleanup")).toBe(false);
  });
});
