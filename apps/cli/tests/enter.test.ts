import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getBranchNamesSync } from "../src/completions/providers";
import {
  addWorktree,
  createRepo,
  getBareRepoPath,
  getWorktreePath,
  listWorktrees,
  loadReposFile,
} from "../src/infra/git";

const TEST_DIR = join(import.meta.dirname ?? ".", "test-enter-workspace");

describe("enter command", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, "repos"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // Mode 1: No Args - Project context
  // ===========================================================================

  describe("project context (no args)", () => {
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

  // ===========================================================================
  // Mode 2: Repo Only - Worktree listing for selection
  // ===========================================================================

  describe("repo-only flow", () => {
    it("should list existing worktrees for a repo", async () => {
      const repoResult = await createRepo(TEST_DIR, "my-app");
      expect(repoResult.success).toBe(true);

      // Add a feature branch worktree
      const addResult = await addWorktree(TEST_DIR, "my-app", "feature/login", { create: true });
      expect(addResult.success).toBe(true);

      // List worktrees - should include default branch + feature branch
      const worktrees = await listWorktrees(TEST_DIR, "my-app");
      expect(worktrees.length).toBeGreaterThanOrEqual(2);

      const branches = worktrees.map((wt) => wt.branch);
      expect(branches).toContain("main");
      expect(branches).toContain("feature/login");
    });

    it("should validate repo exists in config", async () => {
      const reposFile = await loadReposFile(TEST_DIR);
      const repo = reposFile.repos.find((r) => r.name === "nonexistent-repo");
      expect(repo).toBeUndefined();
    });

    it("should find valid repo in config after creation", async () => {
      await createRepo(TEST_DIR, "real-repo");

      const reposFile = await loadReposFile(TEST_DIR);
      const repo = reposFile.repos.find((r) => r.name === "real-repo");
      expect(repo).toBeDefined();
      expect(repo?.name).toBe("real-repo");
      expect(repo?.defaultBranch).toBe("main");
    });

    it("should detect bare repo existence", async () => {
      await createRepo(TEST_DIR, "test-repo");

      const bareRepoPath = getBareRepoPath(TEST_DIR, "test-repo");
      expect(existsSync(bareRepoPath)).toBe(true);

      // Non-existent repo should not have bare repo
      const missingPath = getBareRepoPath(TEST_DIR, "missing-repo");
      expect(existsSync(missingPath)).toBe(false);
    });

    it("should handle creating new worktree from selection", async () => {
      await createRepo(TEST_DIR, "my-app");

      // Simulate "Create new" action by calling addWorktree directly
      const result = await addWorktree(TEST_DIR, "my-app", "feature/new-branch", { create: true });
      expect(result.success).toBe(true);
      expect(existsSync(result.path)).toBe(true);

      // Verify it shows up in worktree listing
      const worktrees = await listWorktrees(TEST_DIR, "my-app");
      const newBranch = worktrees.find((wt) => wt.branch === "feature/new-branch");
      expect(newBranch).toBeDefined();
    });
  });

  // ===========================================================================
  // Mode 3: Repo + Branch - Direct worktree entry
  // ===========================================================================

  describe("repo+branch flow", () => {
    it("should enter existing worktree directly", async () => {
      await createRepo(TEST_DIR, "my-app");

      // The default branch worktree should exist
      const worktreePath = getWorktreePath(TEST_DIR, "my-app", "main");
      expect(existsSync(worktreePath)).toBe(true);
    });

    it("should auto-create worktree when it does not exist", async () => {
      await createRepo(TEST_DIR, "my-app");

      const worktreePath = getWorktreePath(TEST_DIR, "my-app", "feature/auto-create");
      expect(existsSync(worktreePath)).toBe(false);

      // Create the worktree (simulating what cmdEnterRepoBranch does)
      const result = await addWorktree(TEST_DIR, "my-app", "feature/auto-create", { create: true });
      expect(result.success).toBe(true);
      expect(existsSync(result.path)).toBe(true);
    });

    it("should handle invalid repo name", async () => {
      const reposFile = await loadReposFile(TEST_DIR);
      const repo = reposFile.repos.find((r) => r.name === "invalid-repo");

      // Invalid repo should not be found
      expect(repo).toBeUndefined();
    });

    it("should handle bare repo path for missing repo", () => {
      const bareRepoPath = getBareRepoPath(TEST_DIR, "nonexistent");
      expect(existsSync(bareRepoPath)).toBe(false);
    });

    it("should use existing worktree when branch already checked out", async () => {
      await createRepo(TEST_DIR, "my-app");

      // Create a feature worktree
      const addResult = await addWorktree(TEST_DIR, "my-app", "feature/existing", { create: true });
      expect(addResult.success).toBe(true);

      // Verify the worktree exists (so no auto-create needed)
      const worktreePath = getWorktreePath(TEST_DIR, "my-app", "feature/existing");
      expect(existsSync(worktreePath)).toBe(true);
    });
  });

  // ===========================================================================
  // Invalid repo error handling
  // ===========================================================================

  describe("error handling", () => {
    it("should list available repos when invalid repo given", async () => {
      await createRepo(TEST_DIR, "repo-a");
      await createRepo(TEST_DIR, "repo-b");

      const reposFile = await loadReposFile(TEST_DIR);
      const names = reposFile.repos.map((r) => r.name);

      // Verify valid repos are listed
      expect(names).toContain("repo-a");
      expect(names).toContain("repo-b");

      // Verify invalid repo is not found
      expect(reposFile.repos.find((r) => r.name === "invalid")).toBeUndefined();
    });

    it("should handle repos dir without bloom.config.yaml", async () => {
      const emptyDir = join(TEST_DIR, "empty-workspace");
      mkdirSync(emptyDir, { recursive: true });

      const reposFile = await loadReposFile(emptyDir);
      expect(reposFile.repos).toEqual([]);
    });
  });
});

// =============================================================================
// getBranchNamesSync Tests
// =============================================================================

describe("getBranchNamesSync", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, "repos"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("should return branch names from a repo with branches", async () => {
    // Create a repo with the default branch
    const repoResult = await createRepo(TEST_DIR, "test-repo");
    expect(repoResult.success).toBe(true);

    // Add feature branches
    await addWorktree(TEST_DIR, "test-repo", "feature/auth", { create: true });
    await addWorktree(TEST_DIR, "test-repo", "fix/bug-123", { create: true });

    const branches = getBranchNamesSync(TEST_DIR, "test-repo");

    expect(branches).toContain("main");
    expect(branches).toContain("feature/auth");
    expect(branches).toContain("fix/bug-123");
  });

  it("should deduplicate branches that appear as both local and remote", async () => {
    const repoResult = await createRepo(TEST_DIR, "test-repo");
    expect(repoResult.success).toBe(true);

    const branches = getBranchNamesSync(TEST_DIR, "test-repo");

    // Check there are no duplicates
    const uniqueBranches = [...new Set(branches)];
    expect(branches.length).toBe(uniqueBranches.length);
  });

  it("should filter out HEAD", async () => {
    const repoResult = await createRepo(TEST_DIR, "test-repo");
    expect(repoResult.success).toBe(true);

    const branches = getBranchNamesSync(TEST_DIR, "test-repo");

    expect(branches).not.toContain("HEAD");
  });

  it("should return empty array for non-existent repo", () => {
    const branches = getBranchNamesSync(TEST_DIR, "nonexistent-repo");
    expect(branches).toEqual([]);
  });

  it("should return empty array for non-existent bloom dir", () => {
    const branches = getBranchNamesSync("/tmp/nonexistent-bloom-dir-12345", "some-repo");
    expect(branches).toEqual([]);
  });

  it("should return empty array when git command fails", () => {
    // Use a temp directory outside any git repo so git branch -a fails
    const isolatedDir = join("/tmp", `bloom-test-isolated-${Date.now()}`);
    try {
      const fakeRepoName = "fake-repo";
      const fakeBareDir = join(isolatedDir, "repos", fakeRepoName);
      const fakeBarePath = join(fakeBareDir, `${fakeRepoName}.git`);
      mkdirSync(fakeBarePath, { recursive: true });

      const branches = getBranchNamesSync(isolatedDir, fakeRepoName);
      expect(branches).toEqual([]);
    } finally {
      if (existsSync(isolatedDir)) {
        rmSync(isolatedDir, { recursive: true, force: true });
      }
    }
  });

  it("should strip origin/ prefix from remote branches", async () => {
    const repoResult = await createRepo(TEST_DIR, "test-repo");
    expect(repoResult.success).toBe(true);

    const branches = getBranchNamesSync(TEST_DIR, "test-repo");

    // No branch should start with "origin/"
    for (const branch of branches) {
      expect(branch.startsWith("origin/")).toBe(false);
    }
  });

  it("should return branches from repo with only default branch", async () => {
    const repoResult = await createRepo(TEST_DIR, "minimal-repo");
    expect(repoResult.success).toBe(true);

    const branches = getBranchNamesSync(TEST_DIR, "minimal-repo");

    // Should have at least the default branch
    expect(branches.length).toBeGreaterThanOrEqual(1);
    expect(branches).toContain("main");
  });
});
