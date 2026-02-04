import { describe, expect, test } from "bun:test";
import type { SandboxConfig } from "../../src/sandbox/config";
import { detectPlatform, getPlatformBackend, type PlatformInfo } from "../../src/sandbox/platforms";
import { buildCommand as linuxBuildCommand } from "../../src/sandbox/platforms/linux";
import { buildCommand as macosBuildCommand } from "../../src/sandbox/platforms/macos";

// =============================================================================
// Platform Detection
// =============================================================================

describe("Platform Detection", () => {
  test("detectPlatform returns current platform info", () => {
    const info = detectPlatform();

    expect(typeof info.os).toBe("string");
    expect(typeof info.arch).toBe("string");
    // Should be one of the known node:os platform values
    expect(["linux", "darwin", "win32", "freebsd", "openbsd", "sunos", "aix"]).toContain(info.os);
  });

  test("getPlatformBackend returns backend for linux", () => {
    const info: PlatformInfo = { os: "linux", arch: "x64" };
    const backend = getPlatformBackend(info);

    expect(backend).not.toBeNull();
    expect(backend!.checkAvailability).toBeFunction();
    expect(backend!.checkDependencies).toBeFunction();
    expect(backend!.buildCommand).toBeFunction();
  });

  test("getPlatformBackend returns backend for darwin", () => {
    const info: PlatformInfo = { os: "darwin", arch: "arm64" };
    const backend = getPlatformBackend(info);

    expect(backend).not.toBeNull();
    expect(backend!.checkAvailability).toBeFunction();
    expect(backend!.checkDependencies).toBeFunction();
    expect(backend!.buildCommand).toBeFunction();
  });

  test("getPlatformBackend returns null for unsupported platform", () => {
    const info: PlatformInfo = { os: "win32", arch: "x64" };
    const backend = getPlatformBackend(info);

    expect(backend).toBeNull();
  });

  test("getPlatformBackend returns null for unknown platform", () => {
    const info: PlatformInfo = { os: "freebsd", arch: "x64" };
    const backend = getPlatformBackend(info);

    expect(backend).toBeNull();
  });
});

// =============================================================================
// Linux Command Building
// =============================================================================

describe("Linux Command Building", () => {
  const baseConfig: SandboxConfig = {
    enabled: true,
    workspacePath: "/workspace/agent-1",
    networkPolicy: "deny-all",
    allowedDomains: [],
    writablePaths: [],
    denyReadPaths: ["~/.ssh"],
    processLimit: 0,
  };

  test("builds srt command with settings path", () => {
    const result = linuxBuildCommand(baseConfig, "/tmp/bloom-sandbox/settings.json", "claude", ["--print", "do stuff"]);

    expect(result.cmd).toBe("srt");
    expect(result.args).toEqual(["--settings", "/tmp/bloom-sandbox/settings.json", "claude", "--print", "do stuff"]);
  });

  test("preserves all original command args", () => {
    const result = linuxBuildCommand(baseConfig, "/tmp/settings.json", "node", [
      "script.js",
      "--flag",
      "value",
      "--verbose",
    ]);

    expect(result.cmd).toBe("srt");
    expect(result.args[0]).toBe("--settings");
    expect(result.args[1]).toBe("/tmp/settings.json");
    expect(result.args[2]).toBe("node");
    expect(result.args.slice(3)).toEqual(["script.js", "--flag", "value", "--verbose"]);
  });

  test("handles empty args", () => {
    const result = linuxBuildCommand(baseConfig, "/tmp/settings.json", "bash", []);

    expect(result.cmd).toBe("srt");
    expect(result.args).toEqual(["--settings", "/tmp/settings.json", "bash"]);
  });
});

// =============================================================================
// macOS Command Building
// =============================================================================

describe("macOS Command Building", () => {
  const baseConfig: SandboxConfig = {
    enabled: true,
    workspacePath: "/Users/dev/workspace",
    networkPolicy: "allow-list",
    allowedDomains: ["github.com"],
    writablePaths: [],
    denyReadPaths: [],
    processLimit: 0,
  };

  test("builds srt command with settings path", () => {
    const result = macosBuildCommand(baseConfig, "/tmp/bloom-sandbox/settings.json", "claude", ["--print", "do stuff"]);

    expect(result.cmd).toBe("srt");
    expect(result.args).toEqual(["--settings", "/tmp/bloom-sandbox/settings.json", "claude", "--print", "do stuff"]);
  });

  test("handles command with no args", () => {
    const result = macosBuildCommand(baseConfig, "/tmp/settings.json", "ls", []);

    expect(result.cmd).toBe("srt");
    expect(result.args).toEqual(["--settings", "/tmp/settings.json", "ls"]);
  });
});
