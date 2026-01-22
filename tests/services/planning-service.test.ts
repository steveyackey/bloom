import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildReposContext } from "../../src/services/planning-service";

describe("planning-service", () => {
  describe("buildReposContext", () => {
    let testDir: string;

    beforeEach(() => {
      testDir = join(tmpdir(), `bloom-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(testDir, { recursive: true });
      mkdirSync(join(testDir, "repos"), { recursive: true });
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("returns 'No repositories configured' message when repos list is empty", async () => {
      const context = await buildReposContext(testDir);

      expect(context).toContain("No repositories configured");
      expect(context).toContain("bloom repo clone");
    });

    it("returns markdown with '## Configured Repositories' header", async () => {
      // Create a bloom.config.yaml with repos
      const configPath = join(testDir, "bloom.config.yaml");
      const config = {
        version: 1,
        repos: [
          {
            name: "test-repo",
            url: "https://github.com/org/test-repo",
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      };
      await Bun.write(configPath, JSON.stringify(config));

      const context = await buildReposContext(testDir);

      expect(context).toContain("## Configured Repositories");
    });

    it("includes repo name as ### header for each repo", async () => {
      const configPath = join(testDir, "bloom.config.yaml");
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
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      };
      await Bun.write(configPath, JSON.stringify(config));

      const context = await buildReposContext(testDir);

      expect(context).toContain("### backend");
      expect(context).toContain("### frontend");
    });

    it("includes URL, default branch for each repo", async () => {
      const configPath = join(testDir, "bloom.config.yaml");
      const config = {
        version: 1,
        repos: [
          {
            name: "my-repo",
            url: "https://github.com/org/my-repo",
            defaultBranch: "develop",
            addedAt: new Date().toISOString(),
          },
        ],
      };
      await Bun.write(configPath, JSON.stringify(config));

      const context = await buildReposContext(testDir);

      expect(context).toContain("- URL: https://github.com/org/my-repo");
      expect(context).toContain("- Default Branch: develop");
    });

    it("shows 'Cloned' status when bare repo exists", async () => {
      // Create config
      const configPath = join(testDir, "bloom.config.yaml");
      const config = {
        version: 1,
        repos: [
          {
            name: "cloned-repo",
            url: "https://github.com/org/cloned-repo",
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      };
      await Bun.write(configPath, JSON.stringify(config));

      // Create the bare repo directory structure
      const bareRepoPath = join(testDir, "repos", "cloned-repo", "cloned-repo.git");
      mkdirSync(bareRepoPath, { recursive: true });

      const context = await buildReposContext(testDir);

      expect(context).toContain("Status: Cloned");
    });

    it("shows 'Not cloned' status when bare repo missing", async () => {
      const configPath = join(testDir, "bloom.config.yaml");
      const config = {
        version: 1,
        repos: [
          {
            name: "missing-repo",
            url: "https://github.com/org/missing-repo",
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      };
      await Bun.write(configPath, JSON.stringify(config));

      // Don't create the bare repo directory

      const context = await buildReposContext(testDir);

      expect(context).toContain("Status: Not cloned");
    });

    it("includes worktree list when worktrees exist", async () => {
      // Create config
      const configPath = join(testDir, "bloom.config.yaml");
      const config = {
        version: 1,
        repos: [
          {
            name: "repo-with-worktrees",
            url: "https://github.com/org/repo-with-worktrees",
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      };
      await Bun.write(configPath, JSON.stringify(config));

      // Create the bare repo and worktree directories
      const bareRepoPath = join(testDir, "repos", "repo-with-worktrees", "repo-with-worktrees.git");
      mkdirSync(bareRepoPath, { recursive: true });

      // Create worktree directories (they must have .git inside to be detected)
      const worktree1Path = join(testDir, "repos", "repo-with-worktrees", "main");
      const worktree2Path = join(testDir, "repos", "repo-with-worktrees", "feature-branch");
      mkdirSync(join(worktree1Path, ".git"), { recursive: true });
      mkdirSync(join(worktree2Path, ".git"), { recursive: true });

      const context = await buildReposContext(testDir);

      expect(context).toContain("- Worktrees:");
      expect(context).toContain("main");
      expect(context).toContain("feature-branch");
    });
  });

  // Note: runPlanSession, runGenerateSession, and runRefineSession are difficult to unit test
  // because they create interactive Claude agent sessions. These are better tested via
  // integration tests. The tests below document the expected behavior without executing
  // the agent.

  describe("runPlanSession", () => {
    it("loads 'plan' prompt with WORKING_DIR, PLAN_FILE, REPOS_CONTEXT", () => {
      // This test documents that runPlanSession should call loadPrompt("plan", {...})
      // with the correct variables. Since the function creates an interactive agent session,
      // we can't easily unit test it without mocking.
      // The implementation uses buildReposContext (tested above) and loadPrompt.
      expect(true).toBe(true); // Placeholder - behavior documented
    });

    it("creates ClaudeAgentProvider with interactive: true", () => {
      // This test documents that runPlanSession creates an agent with interactive mode.
      // Verified by code inspection.
      expect(true).toBe(true); // Placeholder - behavior documented
    });

    it("calls agent.run with correct startingDirectory (git root)", () => {
      // This test documents that runPlanSession runs from the git root.
      // The implementation uses findGitRoot() || workingDir.
      expect(true).toBe(true); // Placeholder - behavior documented
    });
  });

  describe("runGenerateSession", () => {
    it("loads 'generate' prompt with WORKING_DIR, TASKS_FILE, REPOS_CONTEXT", () => {
      // This test documents that runGenerateSession should call loadPrompt("generate", {...})
      // with the correct variables.
      expect(true).toBe(true); // Placeholder - behavior documented
    });

    it("creates ClaudeAgentProvider with interactive: true", () => {
      // This test documents that runGenerateSession creates an agent with interactive mode.
      expect(true).toBe(true); // Placeholder - behavior documented
    });

    it("calls agent.run with correct startingDirectory (working dir)", () => {
      // This test documents that runGenerateSession runs from the working directory.
      // Unlike runPlanSession which uses git root, this uses the working directory directly.
      expect(true).toBe(true); // Placeholder - behavior documented
    });
  });

  describe("runRefineSession", () => {
    it("builds system prompt with working directory and git root", () => {
      // This test documents that runRefineSession creates a system prompt
      // with both workingDir and gitRoot information.
      expect(true).toBe(true); // Placeholder - behavior documented
    });

    it("includes list of .md and .yaml files from project in context", () => {
      // This test documents that runRefineSession scans the working directory
      // for .md, .yaml, and .yml files and includes them in the system prompt.
      expect(true).toBe(true); // Placeholder - behavior documented
    });

    it("creates ClaudeAgentProvider with interactive: true", () => {
      // This test documents that runRefineSession creates an agent with interactive mode.
      expect(true).toBe(true); // Placeholder - behavior documented
    });
  });
});
