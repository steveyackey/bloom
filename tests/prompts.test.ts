import { describe, expect, it } from "bun:test";
import { loadPrompt } from "../src/prompts";

describe("prompts", () => {
  describe("create prompt", () => {
    it("should help user define project requirements", async () => {
      const prompt = await loadPrompt("create", { PROJECT_DIR: "/test/project" });

      // Should guide user through project definition
      expect(prompt).toContain("What would you like to build");
      expect(prompt).toContain("PRD");
      expect(prompt).toContain("requirements");
    });

    it("should include PRD template structure", async () => {
      const prompt = await loadPrompt("create", { PROJECT_DIR: "/test/project" });

      // Should contain PRD sections
      expect(prompt).toContain("Overview");
      expect(prompt).toContain("Problem Statement");
      expect(prompt).toContain("Target Users");
      expect(prompt).toContain("Core Features");
      expect(prompt).toContain("Technical Requirements");
    });

    it("should tell user about next steps", async () => {
      const prompt = await loadPrompt("create", { PROJECT_DIR: "/test/project" });

      expect(prompt).toContain("bloom plan");
    });
  });

  describe("plan prompt", () => {
    it("should help create implementation plan", async () => {
      const prompt = await loadPrompt("plan", {
        WORKING_DIR: "/test/project",
        PLAN_FILE: "/test/project/plan.md",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("plan");
      expect(prompt).toContain("implementation");
    });

    it("should ask about checkpoint preferences", async () => {
      const prompt = await loadPrompt("plan", {
        WORKING_DIR: "/test/project",
        PLAN_FILE: "/test/project/plan.md",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("checkpoint");
      expect(prompt).toContain("Checkpoint");
    });

    it("should ask about merge strategy", async () => {
      const prompt = await loadPrompt("plan", {
        WORKING_DIR: "/test/project",
        PLAN_FILE: "/test/project/plan.md",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("merge");
      expect(prompt).toContain("Merge Strategy");
    });

    it("should include repos context", async () => {
      const prompt = await loadPrompt("plan", {
        WORKING_DIR: "/test/project",
        PLAN_FILE: "/test/project/plan.md",
        REPOS_CONTEXT: "## Configured Repositories\n\n### backend\n- URL: https://github.com/org/backend",
      });

      expect(prompt).toContain("Configured Repositories");
      expect(prompt).toContain("backend");
    });

    it("should tell user about next steps", async () => {
      const prompt = await loadPrompt("plan", {
        WORKING_DIR: "/test/project",
        PLAN_FILE: "/test/project/plan.md",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("bloom generate");
    });
  });

  describe("generate prompt", () => {
    it("should convert plan to tasks.yaml", async () => {
      const prompt = await loadPrompt("generate", {
        WORKING_DIR: "/test/project",
        TASKS_FILE: "/test/project/tasks.yaml",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("tasks.yaml");
      expect(prompt).toContain("plan");
    });

    it("should include task schema documentation", async () => {
      const prompt = await loadPrompt("generate", {
        WORKING_DIR: "/test/project",
        TASKS_FILE: "/test/project/tasks.yaml",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("status:");
      expect(prompt).toContain("depends_on:");
      expect(prompt).toContain("agent_name:");
      expect(prompt).toContain("acceptance_criteria:");
    });

    it("should explain agent naming strategy", async () => {
      const prompt = await loadPrompt("generate", {
        WORKING_DIR: "/test/project",
        TASKS_FILE: "/test/project/tasks.yaml",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("agent_name");
      expect(prompt).toContain("parallel");
      expect(prompt).toContain("sequential");
    });

    it("should tell user about next steps", async () => {
      const prompt = await loadPrompt("generate", {
        WORKING_DIR: "/test/project",
        TASKS_FILE: "/test/project/tasks.yaml",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("bloom run");
    });
  });
});
