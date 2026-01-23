import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { initWorkspace } from "../src/features/init";

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

    it("should create template/ directory with templates", async () => {
      const result = await initWorkspace(TEST_DIR);

      expect(result.success).toBe(true);
      expect(existsSync(join(TEST_DIR, "template"))).toBe(true);
      expect(existsSync(join(TEST_DIR, "template", "PRD.md"))).toBe(true);
      expect(existsSync(join(TEST_DIR, "template", "plan.md"))).toBe(true);
      expect(existsSync(join(TEST_DIR, "template", "CLAUDE.template.md"))).toBe(true);
    });

    it("should provide PRD template with key sections", async () => {
      await initWorkspace(TEST_DIR);

      const prdPath = join(TEST_DIR, "template", "PRD.md");
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
      expect(result.created).toContain("template/");
      expect(result.created.some((f) => f.includes("PRD.md"))).toBe(true);
      expect(result.created.some((f) => f.includes("plan.md"))).toBe(true);
      expect(result.created.some((f) => f.includes("CLAUDE.template.md"))).toBe(true);
    });

    it("should create .gitignore with repos/ entry", async () => {
      const result = await initWorkspace(TEST_DIR);

      expect(result.success).toBe(true);
      expect(result.created).toContain(".gitignore");

      const gitignorePath = join(TEST_DIR, ".gitignore");
      expect(existsSync(gitignorePath)).toBe(true);

      const content = await Bun.file(gitignorePath).text();
      expect(content).toContain("repos/");
    });

    it("should add repos/ to existing .gitignore", async () => {
      const gitignorePath = join(TEST_DIR, ".gitignore");
      await Bun.write(gitignorePath, "node_modules/\n.env\n");

      const result = await initWorkspace(TEST_DIR);

      expect(result.success).toBe(true);
      expect(result.created).toContain(".gitignore (added repos/)");

      const content = await Bun.file(gitignorePath).text();
      expect(content).toContain("node_modules/");
      expect(content).toContain(".env");
      expect(content).toContain("repos/");
    });

    it("should not duplicate repos/ in .gitignore if already present", async () => {
      const gitignorePath = join(TEST_DIR, ".gitignore");
      await Bun.write(gitignorePath, "node_modules/\nrepos/\n.env\n");

      const result = await initWorkspace(TEST_DIR);

      expect(result.success).toBe(true);
      expect(result.skipped).toContain(".gitignore (repos/ already present)");

      const content = await Bun.file(gitignorePath).text();
      // Should only have one occurrence of repos/
      const matches = content.match(/repos\//g);
      expect(matches?.length).toBe(1);
    });
  });
});
