import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  getBareRepoPath,
  getWorktreePath,
  pullAllDefaultBranches,
  pullDefaultBranch,
  saveReposFile,
} from "../src/infra/git";

const TEST_DIR = join(import.meta.dirname ?? ".", "test-pull-workspace");
const REMOTE_DIR = join(import.meta.dirname ?? ".", "test-pull-remote");

function runGit(args: string[], cwd: string): { success: boolean; output: string; error: string } {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return {
    success: result.status === 0,
    output: result.stdout?.toString() || "",
    error: result.stderr?.toString() || "",
  };
}

describe("pull repos", () => {
  beforeEach(() => {
    // Clean up any existing test directories
    for (const dir of [TEST_DIR, REMOTE_DIR]) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
      mkdirSync(dir, { recursive: true });
    }
    // Create workspace structure
    mkdirSync(join(TEST_DIR, "repos"), { recursive: true });
  });

  afterEach(() => {
    for (const dir of [TEST_DIR, REMOTE_DIR]) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  describe("pullDefaultBranch", () => {
    it("should return error when repo not found in config", async () => {
      // Create empty config
      await saveReposFile(TEST_DIR, { version: 1, repos: [] });

      const result = await pullDefaultBranch(TEST_DIR, "nonexistent");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found in config");
    });

    it("should skip repos without a remote URL (local-only)", async () => {
      // Create config with local-only repo
      await saveReposFile(TEST_DIR, {
        version: 1,
        repos: [
          {
            name: "local-repo",
            url: "", // No remote URL
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      });

      const result = await pullDefaultBranch(TEST_DIR, "local-repo");

      expect(result.success).toBe(true);
      expect(result.updated).toBe(false);
    });

    it("should return error when bare repo does not exist", async () => {
      // Create config with repo that hasn't been cloned
      await saveReposFile(TEST_DIR, {
        version: 1,
        repos: [
          {
            name: "missing-repo",
            url: "https://github.com/org/repo",
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      });

      const result = await pullDefaultBranch(TEST_DIR, "missing-repo");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Bare repo not found");
    });

    it("should pull updates from remote successfully", async () => {
      // Set up a "remote" repo with 'main' as default branch
      runGit(["init", "--bare", "--initial-branch=main"], REMOTE_DIR);

      // Create a temporary clone to make initial commit
      const tempClone = join(TEST_DIR, "temp-clone");
      mkdirSync(tempClone, { recursive: true });
      runGit(["clone", REMOTE_DIR, "."], tempClone);
      runGit(["config", "user.email", "test@test.com"], tempClone);
      runGit(["config", "user.name", "Test"], tempClone);
      // Create branch 'main' since we're cloning empty repo
      runGit(["checkout", "-b", "main"], tempClone);
      await Bun.write(join(tempClone, "README.md"), "Initial content");
      runGit(["add", "README.md"], tempClone);
      runGit(["commit", "-m", "Initial commit"], tempClone);
      runGit(["push", "-u", "origin", "main"], tempClone);
      rmSync(tempClone, { recursive: true, force: true });

      // Set up workspace with bare repo and worktree
      const repoName = "test-repo";
      const repoDir = join(TEST_DIR, "repos", repoName);
      mkdirSync(repoDir, { recursive: true });

      const bareRepoPath = getBareRepoPath(TEST_DIR, repoName);
      const worktreePath = getWorktreePath(TEST_DIR, repoName, "main");

      runGit(["clone", "--bare", REMOTE_DIR, bareRepoPath], TEST_DIR);
      runGit(["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"], bareRepoPath);
      runGit(["fetch", "origin"], bareRepoPath);
      runGit(["worktree", "add", worktreePath, "main"], bareRepoPath);
      runGit(["branch", "--set-upstream-to", "origin/main", "main"], worktreePath);

      // Save config
      await saveReposFile(TEST_DIR, {
        version: 1,
        repos: [
          {
            name: repoName,
            url: REMOTE_DIR,
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      });

      // Make a commit to the remote (simulate upstream changes)
      const tempClone2 = join(TEST_DIR, "temp-clone2");
      mkdirSync(tempClone2, { recursive: true });
      runGit(["clone", REMOTE_DIR, "."], tempClone2);
      runGit(["config", "user.email", "test@test.com"], tempClone2);
      runGit(["config", "user.name", "Test"], tempClone2);
      await Bun.write(join(tempClone2, "README.md"), "Updated content");
      runGit(["add", "README.md"], tempClone2);
      runGit(["commit", "-m", "Update README"], tempClone2);
      runGit(["push"], tempClone2);
      rmSync(tempClone2, { recursive: true, force: true });

      // Now pull the updates
      const result = await pullDefaultBranch(TEST_DIR, repoName);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(true);

      // Verify the worktree has the updated content
      const content = await Bun.file(join(worktreePath, "README.md")).text();
      expect(content).toBe("Updated content");
    });

    it("should report already up to date when no changes", async () => {
      // Set up a "remote" repo with 'main' as default branch
      runGit(["init", "--bare", "--initial-branch=main"], REMOTE_DIR);

      // Create a temporary clone to make initial commit
      const tempClone = join(TEST_DIR, "temp-clone");
      mkdirSync(tempClone, { recursive: true });
      runGit(["clone", REMOTE_DIR, "."], tempClone);
      runGit(["config", "user.email", "test@test.com"], tempClone);
      runGit(["config", "user.name", "Test"], tempClone);
      runGit(["checkout", "-b", "main"], tempClone);
      await Bun.write(join(tempClone, "README.md"), "Initial content");
      runGit(["add", "README.md"], tempClone);
      runGit(["commit", "-m", "Initial commit"], tempClone);
      runGit(["push", "-u", "origin", "main"], tempClone);
      rmSync(tempClone, { recursive: true, force: true });

      // Set up workspace with bare repo and worktree
      const repoName = "test-repo";
      const repoDir = join(TEST_DIR, "repos", repoName);
      mkdirSync(repoDir, { recursive: true });

      const bareRepoPath = getBareRepoPath(TEST_DIR, repoName);
      const worktreePath = getWorktreePath(TEST_DIR, repoName, "main");

      runGit(["clone", "--bare", REMOTE_DIR, bareRepoPath], TEST_DIR);
      runGit(["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"], bareRepoPath);
      runGit(["fetch", "origin"], bareRepoPath);
      runGit(["worktree", "add", worktreePath, "main"], bareRepoPath);
      runGit(["branch", "--set-upstream-to", "origin/main", "main"], worktreePath);

      // Save config
      await saveReposFile(TEST_DIR, {
        version: 1,
        repos: [
          {
            name: repoName,
            url: REMOTE_DIR,
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      });

      // Pull without any new changes
      const result = await pullDefaultBranch(TEST_DIR, repoName);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(false);
    });
  });

  describe("pullAllDefaultBranches", () => {
    it("should return empty results when no repos configured", async () => {
      // Create empty config
      await saveReposFile(TEST_DIR, { version: 1, repos: [] });

      const result = await pullAllDefaultBranches(TEST_DIR);

      expect(result.updated).toEqual([]);
      expect(result.upToDate).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it("should skip local-only repos", async () => {
      // Create config with local-only repo
      await saveReposFile(TEST_DIR, {
        version: 1,
        repos: [
          {
            name: "local-repo",
            url: "",
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      });

      const result = await pullAllDefaultBranches(TEST_DIR);

      expect(result.upToDate).toContain("local-repo");
      expect(result.failed).toEqual([]);
    });

    it("should report failures for repos that fail to pull", async () => {
      // Create config with repo that doesn't exist locally
      await saveReposFile(TEST_DIR, {
        version: 1,
        repos: [
          {
            name: "missing-repo",
            url: "https://github.com/org/repo",
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      });

      const result = await pullAllDefaultBranches(TEST_DIR);

      expect(result.failed.length).toBe(1);
      const failedRepo = result.failed[0];
      expect(failedRepo?.name).toBe("missing-repo");
      expect(failedRepo?.error).toContain("Bare repo not found");
    });

    it("should handle multiple repos with mixed results", async () => {
      // Set up a "remote" repo for the working repo with 'main' as default
      runGit(["init", "--bare", "--initial-branch=main"], REMOTE_DIR);

      // Create initial commit
      const tempClone = join(TEST_DIR, "temp-clone");
      mkdirSync(tempClone, { recursive: true });
      runGit(["clone", REMOTE_DIR, "."], tempClone);
      runGit(["config", "user.email", "test@test.com"], tempClone);
      runGit(["config", "user.name", "Test"], tempClone);
      runGit(["checkout", "-b", "main"], tempClone);
      await Bun.write(join(tempClone, "README.md"), "Initial content");
      runGit(["add", "README.md"], tempClone);
      runGit(["commit", "-m", "Initial commit"], tempClone);
      runGit(["push", "-u", "origin", "main"], tempClone);
      rmSync(tempClone, { recursive: true, force: true });

      // Set up working repo
      const workingRepo = "working-repo";
      const workingRepoDir = join(TEST_DIR, "repos", workingRepo);
      mkdirSync(workingRepoDir, { recursive: true });

      const bareRepoPath = getBareRepoPath(TEST_DIR, workingRepo);
      const worktreePath = getWorktreePath(TEST_DIR, workingRepo, "main");

      runGit(["clone", "--bare", REMOTE_DIR, bareRepoPath], TEST_DIR);
      runGit(["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"], bareRepoPath);
      runGit(["fetch", "origin"], bareRepoPath);
      runGit(["worktree", "add", worktreePath, "main"], bareRepoPath);
      runGit(["branch", "--set-upstream-to", "origin/main", "main"], worktreePath);

      // Save config with multiple repos
      await saveReposFile(TEST_DIR, {
        version: 1,
        repos: [
          {
            name: workingRepo,
            url: REMOTE_DIR,
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
          {
            name: "local-only",
            url: "", // Local-only repo
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
          {
            name: "missing-repo",
            url: "https://github.com/org/missing",
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      });

      const result = await pullAllDefaultBranches(TEST_DIR);

      // Working repo should be up to date (no new changes)
      expect(result.upToDate).toContain(workingRepo);
      // Local-only should be skipped (counted as up to date)
      expect(result.upToDate).toContain("local-only");
      // Missing repo should fail
      expect(result.failed.length).toBe(1);
      const failedRepo = result.failed[0];
      expect(failedRepo?.name).toBe("missing-repo");
    });
  });
});
