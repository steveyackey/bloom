import { describe, expect, test } from "bun:test";
import { resolveConfig } from "../../src/sandbox/config";
import { createSandboxedSpawn } from "../../src/sandbox/executor";

describe("Sandbox Executor", () => {
  describe("createSandboxedSpawn", () => {
    test("returns unsandboxed spawn when config.enabled is false", () => {
      const config = resolveConfig("/workspace", { enabled: false });
      const result = createSandboxedSpawn(config);

      expect(result.sandboxed).toBe(false);
      expect(result.spawn).toBeFunction();
    });

    test("returns unsandboxed spawn for default config (disabled)", () => {
      const config = resolveConfig("/workspace");
      const result = createSandboxedSpawn(config);

      expect(result.sandboxed).toBe(false);
    });

    test("spawn function is callable", () => {
      const config = resolveConfig("/workspace");
      const result = createSandboxedSpawn(config);

      // The spawn function should be a function
      expect(typeof result.spawn).toBe("function");
    });
  });
});
