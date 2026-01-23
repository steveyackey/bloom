import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildReposContext } from "../src/services/planning-service";

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

    it("should list configured repos", async () => {
      // Create a bloom.config.yaml with repos
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

      expect(context).toContain("## Configured Repositories");
      expect(context).toContain("### backend");
      expect(context).toContain("### frontend");
      expect(context).toContain("https://github.com/org/backend");
      expect(context).toContain("https://github.com/org/frontend");
      expect(context).toContain("Default Branch: main");
      expect(context).toContain("Default Branch: develop");
    });

    it("should show repo status", async () => {
      // Create a bloom.config.yaml with repos
      const configPath = join(TEST_DIR, "bloom.config.yaml");
      const config = {
        version: 1,
        repos: [
          {
            name: "my-repo",
            url: "https://github.com/org/my-repo",
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      };
      await Bun.write(configPath, JSON.stringify(config));

      const context = await buildReposContext(TEST_DIR);

      // Since we haven't cloned the repo, it should show as not cloned
      expect(context).toContain("Status: Not cloned");
    });
  });
});
