import { describe, expect, test } from "bun:test";
import { getDefaultConfig, resolveConfig, type SandboxConfig, toSrtSettings } from "../../src/sandbox/config";

describe("Sandbox Config", () => {
  describe("getDefaultConfig", () => {
    test("returns disabled config with deny-all network", () => {
      const config = getDefaultConfig("/workspace/agent-1");

      expect(config.enabled).toBe(false);
      expect(config.workspacePath).toBe("/workspace/agent-1");
      expect(config.networkPolicy).toBe("deny-all");
      expect(config.allowedDomains).toEqual([]);
      expect(config.writablePaths).toEqual([]);
      expect(config.processLimit).toBe(0);
    });

    test("includes default deny-read paths for sensitive directories", () => {
      const config = getDefaultConfig("/workspace");

      expect(config.denyReadPaths).toContain("~/.ssh");
      expect(config.denyReadPaths).toContain("~/.aws");
      expect(config.denyReadPaths).toContain("~/.gnupg");
    });
  });

  describe("resolveConfig", () => {
    test("returns defaults when no overrides provided", () => {
      const config = resolveConfig("/workspace");

      expect(config).toEqual(getDefaultConfig("/workspace"));
    });

    test("merges enabled override", () => {
      const config = resolveConfig("/workspace", { enabled: true });

      expect(config.enabled).toBe(true);
      expect(config.workspacePath).toBe("/workspace");
      expect(config.networkPolicy).toBe("deny-all");
    });

    test("merges network policy override", () => {
      const config = resolveConfig("/workspace", {
        networkPolicy: "allow-list",
        allowedDomains: ["github.com", "registry.npmjs.org"],
      });

      expect(config.networkPolicy).toBe("allow-list");
      expect(config.allowedDomains).toEqual(["github.com", "registry.npmjs.org"]);
    });

    test("replaces array fields entirely (not appends)", () => {
      const config = resolveConfig("/workspace", {
        denyReadPaths: ["/custom/secret"],
      });

      // Should only contain the override, not the defaults
      expect(config.denyReadPaths).toEqual(["/custom/secret"]);
    });

    test("merges writable paths", () => {
      const config = resolveConfig("/workspace", {
        writablePaths: ["/tmp/build-cache"],
      });

      expect(config.writablePaths).toEqual(["/tmp/build-cache"]);
    });

    test("overrides workspace path", () => {
      const config = resolveConfig("/workspace", {
        workspacePath: "/custom/workspace",
      });

      expect(config.workspacePath).toBe("/custom/workspace");
    });

    test("merges multiple overrides simultaneously", () => {
      const config = resolveConfig("/workspace", {
        enabled: true,
        networkPolicy: "allow-list",
        allowedDomains: ["github.com"],
        writablePaths: ["/tmp"],
        denyReadPaths: ["~/.ssh"],
        processLimit: 100,
      });

      expect(config.enabled).toBe(true);
      expect(config.networkPolicy).toBe("allow-list");
      expect(config.allowedDomains).toEqual(["github.com"]);
      expect(config.writablePaths).toEqual(["/tmp"]);
      expect(config.denyReadPaths).toEqual(["~/.ssh"]);
      expect(config.processLimit).toBe(100);
    });
  });

  describe("toSrtSettings", () => {
    test("generates srt settings with workspace in allowWrite", () => {
      const config: SandboxConfig = {
        enabled: true,
        workspacePath: "/workspace/agent-1",
        networkPolicy: "deny-all",
        allowedDomains: [],
        writablePaths: [],
        denyReadPaths: ["~/.ssh"],
        processLimit: 0,
      };

      const settings = toSrtSettings(config);

      expect(settings.filesystem.allowWrite).toEqual(["/workspace/agent-1"]);
      expect(settings.filesystem.denyRead).toEqual(["~/.ssh"]);
      expect(settings.network.allowedDomains).toEqual([]);
    });

    test("includes additional writable paths in allowWrite", () => {
      const config: SandboxConfig = {
        enabled: true,
        workspacePath: "/workspace",
        networkPolicy: "deny-all",
        allowedDomains: [],
        writablePaths: ["/tmp/cache", "/var/log"],
        denyReadPaths: [],
        processLimit: 0,
      };

      const settings = toSrtSettings(config);

      expect(settings.filesystem.allowWrite).toEqual(["/workspace", "/tmp/cache", "/var/log"]);
    });

    test("populates allowedDomains for allow-list network policy", () => {
      const config: SandboxConfig = {
        enabled: true,
        workspacePath: "/workspace",
        networkPolicy: "allow-list",
        allowedDomains: ["github.com", "*.githubusercontent.com"],
        writablePaths: [],
        denyReadPaths: [],
        processLimit: 0,
      };

      const settings = toSrtSettings(config);

      expect(settings.network.allowedDomains).toEqual(["github.com", "*.githubusercontent.com"]);
    });

    test("uses empty allowedDomains for deny-all network policy", () => {
      const config: SandboxConfig = {
        enabled: true,
        workspacePath: "/workspace",
        networkPolicy: "deny-all",
        allowedDomains: ["this-should-be-ignored.com"],
        writablePaths: [],
        denyReadPaths: [],
        processLimit: 0,
      };

      const settings = toSrtSettings(config);

      expect(settings.network.allowedDomains).toEqual([]);
    });

    test("uses empty allowedDomains for disabled network policy", () => {
      const config: SandboxConfig = {
        enabled: true,
        workspacePath: "/workspace",
        networkPolicy: "disabled",
        allowedDomains: [],
        writablePaths: [],
        denyReadPaths: [],
        processLimit: 0,
      };

      const settings = toSrtSettings(config);

      expect(settings.network.allowedDomains).toEqual([]);
    });
  });
});
