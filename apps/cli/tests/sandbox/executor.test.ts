import { describe, expect, test } from "bun:test";
import { resolveConfig } from "../../src/sandbox/config";
import { createSandboxedSpawn } from "../../src/sandbox/executor";

describe("Sandbox Executor", () => {
  describe("createSandboxedSpawn", () => {
    test("returns unsandboxed spawn when config.enabled is false", async () => {
      const config = resolveConfig("/workspace", { enabled: false });
      const result = await createSandboxedSpawn(config);

      expect(result.sandboxed).toBe(false);
      expect(result.spawn).toBeFunction();
    });

    test("returns unsandboxed spawn for default config (disabled)", async () => {
      const config = resolveConfig("/workspace");
      const result = await createSandboxedSpawn(config);

      expect(result.sandboxed).toBe(false);
    });

    test("spawn function is callable", async () => {
      const config = resolveConfig("/workspace");
      const result = await createSandboxedSpawn(config);

      // The spawn function should be a function
      expect(typeof result.spawn).toBe("function");
    });

    test("passthrough spawn executes commands correctly", async () => {
      const config = resolveConfig("/workspace", { enabled: false });
      const { spawn } = await createSandboxedSpawn(config);

      const proc = await spawn("echo", ["hello"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      const output = await new Promise<string>((resolve) => {
        let data = "";
        proc.stdout?.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        proc.on("close", () => resolve(data));
      });

      expect(output.trim()).toBe("hello");
    });
  });
});
