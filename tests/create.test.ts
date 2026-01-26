import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createProject } from "../src/commands/create";
import { DEFAULT_PLAN_TEMPLATE, DEFAULT_PRD_TEMPLATE } from "../src/prompts-embedded";

const TEST_DIR = join(import.meta.dirname ?? ".", "test-create-workspace");

// Create workspace templates from embedded defaults
async function setupWorkspaceTemplates() {
  const templateDir = join(TEST_DIR, "template");
  if (!existsSync(templateDir)) {
    mkdirSync(templateDir, { recursive: true });

    // Write templates from embedded defaults
    await Bun.write(join(templateDir, "PRD.md"), DEFAULT_PRD_TEMPLATE);
    await Bun.write(join(templateDir, "plan.md"), DEFAULT_PLAN_TEMPLATE);

    const claudeContent = `# Project Guidelines

## Commit Style
Always use conventional commits.

## Development Workflow
1. Review the PRD in PRD.md
2. Check the plan in plan.md
3. Follow the tasks in tasks.yaml

## Code Standards
- Write clear, maintainable code
- Add tests for new functionality
- Update documentation as needed
`;
    await Bun.write(join(templateDir, "CLAUDE.template.md"), claudeContent);
  }
}

describe("create command", () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    await setupWorkspaceTemplates();
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("createProject", () => {
    it("should create a new project folder with the given name", async () => {
      const result = await createProject("my-app", TEST_DIR, TEST_DIR);

      expect(result.success).toBe(true);
      expect(existsSync(result.projectDir)).toBe(true);
      expect(result.projectDir).toContain("my-app");
    });

    it("should copy templates from workspace template folder", async () => {
      const result = await createProject("my-project", TEST_DIR, TEST_DIR);

      expect(result.success).toBe(true);
      // Project should have files copied from template/
      expect(existsSync(join(result.projectDir, "PRD.md"))).toBe(true);
      expect(existsSync(join(result.projectDir, "plan.md"))).toBe(true);
      expect(existsSync(join(result.projectDir, "CLAUDE.md"))).toBe(true);
    });

    it("should provide a PRD template to guide project definition", async () => {
      const result = await createProject("my-project", TEST_DIR, TEST_DIR);

      // PRD.md should be at project root
      const prdPath = join(result.projectDir, "PRD.md");
      expect(existsSync(prdPath)).toBe(true);

      const content = await Bun.file(prdPath).text();
      // PRD should guide user through key product decisions
      expect(content).toContain("Problem Statement");
      expect(content).toContain("Target Users");
      expect(content).toContain("Core Features");
      expect(content).toContain("Technical Requirements");
    });

    it("should provide CLAUDE.md with project guidelines", async () => {
      const result = await createProject("my-project", TEST_DIR, TEST_DIR);

      const claudePath = join(result.projectDir, "CLAUDE.md");
      expect(existsSync(claudePath)).toBe(true);

      const content = await Bun.file(claudePath).text();
      // CLAUDE.md should provide project-specific guidance
      expect(content).toContain("conventional commits");
      expect(content).toContain("PRD");
    });

    it("should prevent overwriting existing projects", async () => {
      const projectDir = join(TEST_DIR, "existing-project");
      mkdirSync(projectDir);

      const result = await createProject("existing-project", TEST_DIR, TEST_DIR);

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("should report what files were created", async () => {
      const result = await createProject("my-project", TEST_DIR, TEST_DIR);

      expect(result.success).toBe(true);
      expect(result.created.length).toBeGreaterThan(0);
      // Files should be copied from template folder
      expect(result.created.some((f) => f.includes("PRD.md"))).toBe(true);
      expect(result.created.some((f) => f.includes("CLAUDE.md"))).toBe(true);
    });
  });
});
