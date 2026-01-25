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

    it("should write PRD to project root", async () => {
      const prompt = await loadPrompt("create", { PROJECT_DIR: "/test/project" });

      // PRD should be saved to project root, not a subfolder
      expect(prompt).toContain("/test/project/PRD.md");
    });

    it("should tell user about next steps", async () => {
      const prompt = await loadPrompt("create", { PROJECT_DIR: "/test/project" });

      expect(prompt).toContain("bloom plan");
    });
  });

  describe("plan prompt", () => {
    it("should instruct Claude to read PRD before planning", async () => {
      const prompt = await loadPrompt("plan", {
        WORKING_DIR: "/test/project",
        PLAN_FILE: "/test/project/plan.md",
        REPOS_CONTEXT: "No repos configured",
      });

      // Must read context FIRST before doing anything else
      expect(prompt).toContain("Read the project context first");
      expect(prompt).toContain("PRD.md");
      expect(prompt).toContain("REQUIRED");
    });

    it("should check PRD at working directory root", async () => {
      const prompt = await loadPrompt("plan", {
        WORKING_DIR: "/test/project",
        PLAN_FILE: "/test/project/plan.md",
        REPOS_CONTEXT: "No repos configured",
      });

      // Should check PRD at working directory root
      expect(prompt).toContain("/test/project/PRD.md");
    });

    it("should ask about checkpoint preferences", async () => {
      const prompt = await loadPrompt("plan", {
        WORKING_DIR: "/test/project",
        PLAN_FILE: "/test/project/plan.md",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("Checkpoint");
    });

    it("should ask about merge strategy options", async () => {
      const prompt = await loadPrompt("plan", {
        WORKING_DIR: "/test/project",
        PLAN_FILE: "/test/project/plan.md",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("Merge Strategy");
      expect(prompt).toContain("Feature branches");
      expect(prompt).toContain("open_pr");
      expect(prompt).toContain("merge_into");
    });

    it("should include repos context for target codebase awareness", async () => {
      const prompt = await loadPrompt("plan", {
        WORKING_DIR: "/test/project",
        PLAN_FILE: "/test/project/plan.md",
        REPOS_CONTEXT: "## Configured Repositories\n\n### backend\n- URL: https://github.com/org/backend",
      });

      expect(prompt).toContain("Configured Repositories");
      expect(prompt).toContain("backend");
    });

    it("should output plan.md file", async () => {
      const prompt = await loadPrompt("plan", {
        WORKING_DIR: "/test/project",
        PLAN_FILE: "/test/project/plan.md",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("/test/project/plan.md");
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
    it("should instruct Claude to read plan.md first", async () => {
      const prompt = await loadPrompt("generate", {
        WORKING_DIR: "/test/project",
        TASKS_FILE: "/test/project/tasks.yaml",
        REPOS_CONTEXT: "No repos configured",
      });

      // Must read context FIRST
      expect(prompt).toContain("Read the project context first");
      expect(prompt).toContain("plan.md");
      expect(prompt).toContain("REQUIRED");
    });

    it("should also read PRD for context", async () => {
      const prompt = await loadPrompt("generate", {
        WORKING_DIR: "/test/project",
        TASKS_FILE: "/test/project/tasks.yaml",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("PRD.md");
    });

    it("should not ask user what to generate - plan has that info", async () => {
      const prompt = await loadPrompt("generate", {
        WORKING_DIR: "/test/project",
        TASKS_FILE: "/test/project/tasks.yaml",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("The plan already contains the work to be done");
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

    it("should explain agent naming for parallelization", async () => {
      const prompt = await loadPrompt("generate", {
        WORKING_DIR: "/test/project",
        TASKS_FILE: "/test/project/tasks.yaml",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("agent_name");
      expect(prompt).toContain("parallel");
      expect(prompt).toContain("sequential");
      expect(prompt).toContain("Same name = Same agent");
    });

    it("should output tasks.yaml file", async () => {
      const prompt = await loadPrompt("generate", {
        WORKING_DIR: "/test/project",
        TASKS_FILE: "/test/project/tasks.yaml",
        REPOS_CONTEXT: "No repos configured",
      });

      expect(prompt).toContain("/test/project/tasks.yaml");
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
