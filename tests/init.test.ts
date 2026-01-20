import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { initWorkspace } from "../src/commands/init";

const TEST_DIR = join(import.meta.dirname ?? ".", "test-init-workspace");

describe("init command", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    // Initialize git so isInGitRepo() passes
    spawnSync("git", ["init"], { cwd: TEST_DIR });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("initWorkspace", () => {
    it("should create bloom.config.yaml for project configuration", async () => {
      const result = await initWorkspace(TEST_DIR);

      expect(result.success).toBe(true);
      expect(existsSync(join(TEST_DIR, "bloom.config.yaml"))).toBe(true);
    });

    it("should create repos/ directory for cloned repositories", async () => {
      const result = await initWorkspace(TEST_DIR);

      expect(result.success).toBe(true);
      expect(existsSync(join(TEST_DIR, "repos"))).toBe(true);
    });

    it("should create tasks.yaml for task definitions", async () => {
      const result = await initWorkspace(TEST_DIR);

      expect(result.success).toBe(true);
      expect(existsSync(join(TEST_DIR, "tasks.yaml"))).toBe(true);
    });

    it("should create project/ folder with starter templates", async () => {
      const result = await initWorkspace(TEST_DIR);

      expect(result.success).toBe(true);
      expect(existsSync(join(TEST_DIR, "project"))).toBe(true);
      // Should have PRD.md in project folder
      expect(existsSync(join(TEST_DIR, "project", "PRD.md"))).toBe(true);
    });

    it("should provide PRD template in project folder", async () => {
      await initWorkspace(TEST_DIR);

      const prdPath = join(TEST_DIR, "project", "PRD.md");
      const content = await Bun.file(prdPath).text();

      // PRD should guide user through key product decisions
      expect(content).toContain("Problem Statement");
      expect(content).toContain("Target Users");
      expect(content).toContain("Core Features");
    });

    it("should not overwrite existing files", async () => {
      // Create existing config
      const configPath = join(TEST_DIR, "bloom.config.yaml");
      await Bun.write(configPath, "version: 99\n");

      const result = await initWorkspace(TEST_DIR);

      expect(result.success).toBe(true);
      expect(result.skipped).toContain("bloom.config.yaml");

      // Original content should be preserved
      const content = await Bun.file(configPath).text();
      expect(content).toContain("version: 99");
    });

    it("should report what was created vs skipped", async () => {
      const result = await initWorkspace(TEST_DIR);

      expect(result.created.length).toBeGreaterThan(0);
      expect(result.created).toContain("bloom.config.yaml");
      expect(result.created).toContain("repos/");
      expect(result.created).toContain("tasks.yaml");
      expect(result.created).toContain("project/");
    });
  });
});
