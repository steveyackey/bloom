import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { addWorktree, createRepo, getWorktreePath, listWorktrees, removeWorktree } from "../src/core/repos";

const TEST_DIR = join(import.meta.dirname ?? ".", "test-worktrees-workspace");

describe("worktrees", () => {
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

  describe("getWorktreePath", () => {
    it("should sanitize slashes in branch names to hyphens", () => {
      const path = getWorktreePath(TEST_DIR, "my-repo", "feature/auth");
      expect(path).toBe(join(TEST_DIR, "repos", "my-repo", "feature-auth"));
    });

    it("should handle multiple slashes in branch names", () => {
      const path = getWorktreePath(TEST_DIR, "my-repo", "claude/feature/fix-bug");
      expect(path).toBe(join(TEST_DIR, "repos", "my-repo", "claude-feature-fix-bug"));
    });

    it("should leave branch names without slashes unchanged", () => {
      const path = getWorktreePath(TEST_DIR, "my-repo", "main");
      expect(path).toBe(join(TEST_DIR, "repos", "my-repo", "main"));
    });

    it("should handle branch names with leading slashes", () => {
      // Edge case - shouldn't happen in practice but good to test
      const path = getWorktreePath(TEST_DIR, "my-repo", "/leading-slash");
      expect(path).toBe(join(TEST_DIR, "repos", "my-repo", "-leading-slash"));
    });
  });

  describe("addWorktree", () => {
    it("should create worktree with sanitized branch name path", async () => {
      // First create a repo to work with
      const repoResult = await createRepo(TEST_DIR, "test-repo");
      expect(repoResult.success).toBe(true);

      // Now add a worktree with a slash in the branch name
      const result = await addWorktree(TEST_DIR, "test-repo", "feature/new-auth", { create: true });
      expect(result.success).toBe(true);

      // The worktree path should have hyphens instead of slashes
      const expectedPath = join(TEST_DIR, "repos", "test-repo", "feature-new-auth");
      expect(result.path).toBe(expectedPath);
      expect(existsSync(expectedPath)).toBe(true);

      // But the git branch should have the original name with slashes
      const worktrees = await listWorktrees(TEST_DIR, "test-repo");
      const newWorktree = worktrees.find((w) => w.branch === "feature/new-auth");
      expect(newWorktree).toBeDefined();
    });

    it("should create worktree with multiple slashes in branch name", async () => {
      const repoResult = await createRepo(TEST_DIR, "test-repo");
      expect(repoResult.success).toBe(true);

      const result = await addWorktree(TEST_DIR, "test-repo", "claude/issue/fix-123", { create: true });
      expect(result.success).toBe(true);

      const expectedPath = join(TEST_DIR, "repos", "test-repo", "claude-issue-fix-123");
      expect(result.path).toBe(expectedPath);
      expect(existsSync(expectedPath)).toBe(true);
    });

    it("should fail when repo does not exist", async () => {
      const result = await addWorktree(TEST_DIR, "nonexistent-repo", "feature/test", { create: true });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should fail when worktree already exists", async () => {
      const repoResult = await createRepo(TEST_DIR, "test-repo");
      expect(repoResult.success).toBe(true);

      // Create first worktree
      const result1 = await addWorktree(TEST_DIR, "test-repo", "feature/test", { create: true });
      expect(result1.success).toBe(true);

      // Try to create same worktree again
      const result2 = await addWorktree(TEST_DIR, "test-repo", "feature/test", { create: true });
      expect(result2.success).toBe(false);
      expect(result2.error).toContain("already exists");
    });
  });

  describe("listWorktrees", () => {
    it("should list worktrees with their original branch names", async () => {
      const repoResult = await createRepo(TEST_DIR, "test-repo");
      expect(repoResult.success).toBe(true);

      // Add a worktree with slashes
      await addWorktree(TEST_DIR, "test-repo", "feature/auth", { create: true });

      const worktrees = await listWorktrees(TEST_DIR, "test-repo");

      // Should have main (default) + feature/auth
      expect(worktrees.length).toBeGreaterThanOrEqual(2);

      // Find the feature branch
      const featureWorktree = worktrees.find((w) => w.branch === "feature/auth");
      expect(featureWorktree).toBeDefined();
      // Path should be sanitized
      expect(featureWorktree?.path).toContain("feature-auth");
    });

    it("should return empty array when repo does not exist", async () => {
      const worktrees = await listWorktrees(TEST_DIR, "nonexistent");
      expect(worktrees).toEqual([]);
    });
  });

  describe("removeWorktree", () => {
    it("should remove worktree using original branch name", async () => {
      const repoResult = await createRepo(TEST_DIR, "test-repo");
      expect(repoResult.success).toBe(true);

      // Create worktree with slash
      const addResult = await addWorktree(TEST_DIR, "test-repo", "feature/to-remove", { create: true });
      expect(addResult.success).toBe(true);

      // Remove it using original branch name
      const removeResult = await removeWorktree(TEST_DIR, "test-repo", "feature/to-remove");
      expect(removeResult.success).toBe(true);

      // Verify it's gone
      const expectedPath = join(TEST_DIR, "repos", "test-repo", "feature-to-remove");
      expect(existsSync(expectedPath)).toBe(false);
    });
  });
});
