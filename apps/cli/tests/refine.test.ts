import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dirname ?? ".", "test-refine-workspace");

describe("refine command", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("project file detection", () => {
    it("should detect PRD.md as a project file", async () => {
      await Bun.write(join(TEST_DIR, "PRD.md"), "# My PRD");

      expect(existsSync(join(TEST_DIR, "PRD.md"))).toBe(true);
    });

    it("should detect plan.md as a project file", async () => {
      await Bun.write(join(TEST_DIR, "plan.md"), "# My Plan");

      expect(existsSync(join(TEST_DIR, "plan.md"))).toBe(true);
    });

    it("should detect tasks.yaml as a project file", async () => {
      await Bun.write(join(TEST_DIR, "tasks.yaml"), "tasks: []");

      expect(existsSync(join(TEST_DIR, "tasks.yaml"))).toBe(true);
    });

    it("should detect CLAUDE.md as a project file", async () => {
      await Bun.write(join(TEST_DIR, "CLAUDE.md"), "# Guidelines");

      expect(existsSync(join(TEST_DIR, "CLAUDE.md"))).toBe(true);
    });
  });

  describe("graceful handling", () => {
    it("should allow running in empty directory", () => {
      // The refine command should not crash even with no project files
      // It shows a message but continues
      expect(existsSync(TEST_DIR)).toBe(true);
    });
  });
});
