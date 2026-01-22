import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProject, formatProjectName } from "../../src/services/project-service";

describe("project-service", () => {
  describe("formatProjectName", () => {
    // Array input (from variadic CLI args)
    it("converts ['my', 'big', 'idea'] to { slug: 'my-big-idea', displayName: 'my big idea' }", () => {
      const result = formatProjectName(["my", "big", "idea"]);
      expect(result).toEqual({ slug: "my-big-idea", displayName: "my big idea" });
    });

    it("converts ['My', 'Big', 'Idea'] to { slug: 'my-big-idea', displayName: 'My Big Idea' }", () => {
      const result = formatProjectName(["My", "Big", "Idea"]);
      expect(result).toEqual({ slug: "my-big-idea", displayName: "My Big Idea" });
    });

    it("converts ['project'] to { slug: 'project', displayName: 'project' }", () => {
      const result = formatProjectName(["project"]);
      expect(result).toEqual({ slug: "project", displayName: "project" });
    });

    // String input (backwards compatibility)
    it("converts 'my big idea' to { slug: 'my-big-idea', displayName: 'my big idea' }", () => {
      const result = formatProjectName("my big idea");
      expect(result).toEqual({ slug: "my-big-idea", displayName: "my big idea" });
    });

    it("converts 'My Big Idea' to { slug: 'my-big-idea', displayName: 'My Big Idea' }", () => {
      const result = formatProjectName("My Big Idea");
      expect(result).toEqual({ slug: "my-big-idea", displayName: "My Big Idea" });
    });

    it("converts 'my-project' to { slug: 'my-project', displayName: 'my-project' }", () => {
      const result = formatProjectName("my-project");
      expect(result).toEqual({ slug: "my-project", displayName: "my-project" });
    });

    // Edge cases
    it("trims whitespace from string input", () => {
      const result = formatProjectName("  my project  ");
      expect(result).toEqual({ slug: "my-project", displayName: "my project" });
    });

    it("collapses multiple spaces to single space in displayName", () => {
      const result = formatProjectName("my    big   idea");
      expect(result).toEqual({ slug: "my-big-idea", displayName: "my big idea" });
    });

    it("handles empty array by throwing error", () => {
      expect(() => formatProjectName([])).toThrow("Project name cannot be empty");
    });

    it("handles empty string by throwing error", () => {
      expect(() => formatProjectName("")).toThrow("Project name cannot be empty");
      expect(() => formatProjectName("   ")).toThrow("Project name cannot be empty");
    });

    it("removes special characters from slug (keeps alphanumeric and dashes)", () => {
      const result = formatProjectName("My Project! @#$% 123");
      expect(result.slug).toBe("my-project--123");
      expect(result.displayName).toBe("My Project! @#$% 123");
    });
  });

  describe("createProject", () => {
    let testDir: string;
    let templateDir: string;
    let projectsDir: string;

    beforeEach(() => {
      // Create a unique test directory
      testDir = join(tmpdir(), `bloom-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      templateDir = join(testDir, "template");
      projectsDir = join(testDir, "projects");

      // Create directories
      mkdirSync(templateDir, { recursive: true });
      mkdirSync(projectsDir, { recursive: true });

      // Create template files
      writeFileSync(join(templateDir, "PRD.md"), "# PRD Template");
      writeFileSync(join(templateDir, "plan.md"), "# Plan Template");
      writeFileSync(join(templateDir, "CLAUDE.template.md"), "# Claude Template");
    });

    afterEach(() => {
      // Cleanup
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("creates project directory at correct path", async () => {
      const result = await createProject("my-project", projectsDir, testDir);

      expect(result.success).toBe(true);
      expect(result.projectDir).toBe(join(projectsDir, "my-project"));
      expect(existsSync(result.projectDir)).toBe(true);
    });

    it("copies template files (PRD.md, plan.md)", async () => {
      const result = await createProject("my-project", projectsDir, testDir);

      expect(result.success).toBe(true);
      expect(existsSync(join(result.projectDir, "PRD.md"))).toBe(true);
      expect(existsSync(join(result.projectDir, "plan.md"))).toBe(true);
    });

    it("renames CLAUDE.template.md to CLAUDE.md", async () => {
      const result = await createProject("my-project", projectsDir, testDir);

      expect(result.success).toBe(true);
      expect(existsSync(join(result.projectDir, "CLAUDE.md"))).toBe(true);
      expect(existsSync(join(result.projectDir, "CLAUDE.template.md"))).toBe(false);
    });

    it("returns list of created files in result.created", async () => {
      const result = await createProject("my-project", projectsDir, testDir);

      expect(result.success).toBe(true);
      expect(result.created).toContain("my-project/");
      expect(result.created).toContain("PRD.md");
      expect(result.created).toContain("plan.md");
      expect(result.created).toContain("CLAUDE.md");
    });

    it("returns { success: false } if project directory already exists", async () => {
      // Create the project directory first
      mkdirSync(join(projectsDir, "existing-project"), { recursive: true });

      const result = await createProject("existing-project", projectsDir, testDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("returns { success: false } if template directory not found", async () => {
      // Use a non-existent workspace dir
      const result = await createProject("my-project", projectsDir, join(testDir, "nonexistent"));

      expect(result.success).toBe(false);
      expect(result.error).toContain("No template/ folder found");
    });
  });
});
