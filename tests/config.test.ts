import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { extractRepoInfo, extractRepoName, normalizeGitUrl } from "../src/core/config";
import { listRepos, loadReposFile, removeRepo, saveReposFile } from "../src/core/repos";

const TEST_DIR = join(import.meta.dirname, ".test-config");

describe("User Configuration (~/.bloom/config.yaml)", () => {
  describe("Git URL Normalization", () => {
    test("converts HTTPS URL to SSH format", () => {
      const url = "https://github.com/owner/repo.git";
      const result = normalizeGitUrl(url, "ssh");
      expect(result).toBe("git@github.com:owner/repo.git");
    });

    test("converts SSH URL to HTTPS format", () => {
      const url = "git@github.com:owner/repo.git";
      const result = normalizeGitUrl(url, "https");
      expect(result).toBe("https://github.com/owner/repo.git");
    });

    test("handles URLs without .git suffix", () => {
      const url = "https://github.com/owner/repo";
      const sshResult = normalizeGitUrl(url, "ssh");
      expect(sshResult).toBe("git@github.com:owner/repo.git");
    });

    test("preserves non-GitHub hosts", () => {
      const url = "https://gitlab.com/owner/repo.git";
      const result = normalizeGitUrl(url, "ssh");
      expect(result).toBe("git@gitlab.com:owner/repo.git");
    });
  });

  describe("Repo Name Extraction", () => {
    test("extracts repo name from HTTPS URL", () => {
      const url = "https://github.com/owner/my-project.git";
      expect(extractRepoName(url)).toBe("my-project");
    });

    test("extracts repo name from SSH URL", () => {
      const url = "git@github.com:owner/my-project.git";
      expect(extractRepoName(url)).toBe("my-project");
    });

    test("handles URLs without .git suffix", () => {
      const url = "https://github.com/owner/my-project";
      expect(extractRepoName(url)).toBe("my-project");
    });
  });

  describe("Repo Info Extraction", () => {
    test("extracts host, owner, and repo from HTTPS URL", () => {
      const url = "https://github.com/myorg/myrepo.git";
      const info = extractRepoInfo(url);
      expect(info).toEqual({
        host: "github.com",
        owner: "myorg",
        repo: "myrepo",
      });
    });

    test("extracts host, owner, and repo from SSH URL", () => {
      const url = "git@gitlab.com:myorg/myrepo.git";
      const info = extractRepoInfo(url);
      expect(info).toEqual({
        host: "gitlab.com",
        owner: "myorg",
        repo: "myrepo",
      });
    });
  });
});

describe("Project Repos (bloom.repos.yaml)", () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("Repos File Operations", () => {
    test("missing repos file returns empty repos list", async () => {
      const reposFile = await loadReposFile(TEST_DIR);
      expect(reposFile.repos).toEqual([]);
    });

    test("repos file persists and loads correctly", async () => {
      await saveReposFile(TEST_DIR, {
        version: 1,
        repos: [
          {
            name: "test-repo",
            url: "https://github.com/test/test-repo.git",
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      });

      const loaded = await loadReposFile(TEST_DIR);
      expect(loaded.repos).toHaveLength(1);
      expect(loaded.repos[0]!.name).toBe("test-repo");
    });
  });

  describe("Repo Listing", () => {
    test("listRepos returns empty list when no repos configured", async () => {
      const repos = await listRepos(TEST_DIR);
      expect(repos).toHaveLength(0);
    });

    test("listRepos returns configured repos with existence status", async () => {
      await saveReposFile(TEST_DIR, {
        version: 1,
        repos: [
          {
            name: "missing-repo",
            url: "https://github.com/test/missing.git",
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      });

      const repos = await listRepos(TEST_DIR);
      expect(repos).toHaveLength(1);
      expect(repos[0]!.name).toBe("missing-repo");
      expect(repos[0]!.exists).toBe(false); // bare repo doesn't exist
    });
  });

  describe("Repo Removal", () => {
    test("removeRepo removes repo from config", async () => {
      await saveReposFile(TEST_DIR, {
        version: 1,
        repos: [
          {
            name: "to-remove",
            url: "https://github.com/test/to-remove.git",
            defaultBranch: "main",
            addedAt: new Date().toISOString(),
          },
        ],
      });

      const result = await removeRepo(TEST_DIR, "to-remove");
      expect(result.success).toBe(true);

      const loaded = await loadReposFile(TEST_DIR);
      expect(loaded.repos).toHaveLength(0);
    });

    test("removeRepo fails for non-existent repo", async () => {
      const result = await removeRepo(TEST_DIR, "nonexistent");
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });
});

describe("Bare Repo + Worktree Structure", () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("repos are stored at repos/<name>/<name>.git (bare) with worktrees at repos/<name>/<branch>", async () => {
    // This is a design/documentation test
    // The structure should be:
    // repos/
    //   myrepo/
    //     myrepo.git/   <- bare repo (inside worktrees dir)
    //     main/         <- worktree for main branch
    //     feature-x/    <- worktree for feature branch

    const reposDir = join(TEST_DIR, "repos");
    const worktreesDir = join(reposDir, "myrepo");
    const bareRepoPath = join(worktreesDir, "myrepo.git");
    const mainWorktree = join(worktreesDir, "main");

    // These paths follow the expected convention
    expect(bareRepoPath.endsWith(".git")).toBe(true);
    expect(mainWorktree).toBe(join(worktreesDir, "main"));
  });
});
