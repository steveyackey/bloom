import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildReposContext } from "../src/commands/plan-command";

const TEST_DIR = join(import.meta.dirname ?? ".", "test-plan-workspace");

describe("plan command", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, "repos"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("buildReposContext", () => {
    it("should return message when no repos configured", async () => {
      const context = await buildReposContext(TEST_DIR);

      expect(context).toContain("No repositories configured");
      expect(context).toContain("bloom repo clone");
    });

    it("should list configured repos with paths", async () => {
      const configPath = join(TEST_DIR, "bloom.config.yaml");
      const config = {
        version: 1,
        repos: [
          {
            name: "backend",
            url: "https://github.com/org/backend",
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
          {
            name: "frontend",
            url: "https://github.com/org/frontend",
            defaultBranch: "develop",
            addedAt: new Date().toISOString(),
          },
        ],
      };
      await Bun.write(configPath, JSON.stringify(config));

      const context = await buildReposContext(TEST_DIR);

      expect(context).toContain("## Available Repositories");
      expect(context).toContain("- backend:");
      expect(context).toContain("- frontend:");
      expect(context).toContain("/repos/backend/main");
      expect(context).toContain("/repos/frontend/develop");
    });
  });
});
