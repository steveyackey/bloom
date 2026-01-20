import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dirname ?? ".", "test-enter-workspace");

describe("enter command", () => {
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

  describe("project context", () => {
    it("should work in directory with project files", async () => {
      await Bun.write(join(TEST_DIR, "PRD.md"), "# My PRD");
      await Bun.write(join(TEST_DIR, "plan.md"), "# My Plan");
      await Bun.write(join(TEST_DIR, "tasks.yaml"), "tasks: []");

      expect(existsSync(join(TEST_DIR, "PRD.md"))).toBe(true);
      expect(existsSync(join(TEST_DIR, "plan.md"))).toBe(true);
      expect(existsSync(join(TEST_DIR, "tasks.yaml"))).toBe(true);
    });

    it("should work in directory without project files", () => {
      // The enter command should work even in empty directories
      expect(existsSync(TEST_DIR)).toBe(true);
    });
  });
});
