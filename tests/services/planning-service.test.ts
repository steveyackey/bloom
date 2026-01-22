import { describe, it } from "bun:test";

describe("planning-service", () => {
  describe("buildReposContext", () => {
    it.todo("returns 'No repositories configured' message when repos list is empty");
    it.todo("returns markdown with '## Configured Repositories' header");
    it.todo("includes repo name as ### header for each repo");
    it.todo("includes URL, default branch for each repo");
    it.todo("shows 'Cloned' status when bare repo exists");
    it.todo("shows 'Not cloned' status when bare repo missing");
    it.todo("includes worktree list when worktrees exist");
  });

  describe("runPlanSession", () => {
    it.todo("loads 'plan' prompt with WORKING_DIR, PLAN_FILE, REPOS_CONTEXT");
    it.todo("creates ClaudeAgentProvider with interactive: true");
    it.todo("calls agent.run with correct startingDirectory (git root)");
  });

  describe("runGenerateSession", () => {
    it.todo("loads 'generate' prompt with WORKING_DIR, TASKS_FILE, REPOS_CONTEXT");
    it.todo("creates ClaudeAgentProvider with interactive: true");
    it.todo("calls agent.run with correct startingDirectory (working dir)");
  });

  describe("runRefineSession", () => {
    it.todo("builds system prompt with working directory and git root");
    it.todo("includes list of .md and .yaml files from project in context");
    it.todo("creates ClaudeAgentProvider with interactive: true");
  });
});
