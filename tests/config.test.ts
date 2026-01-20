import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  loadConfig,
  saveConfig,
  getRepos,
  initConfig,
  getConfigPath,
} from "../src/config";

const TEST_DIR = join(import.meta.dirname, ".test-config");
const TEST_REPOS_DIR = join(TEST_DIR, "repos");

describe("Configuration System", () => {
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

  describe("Config File Management", () => {
    test("missing config file returns default config with auto-detect", async () => {
      const config = await loadConfig(TEST_DIR);

      expect(config.autoDetect).toBe(true);
      expect(config.repos).toBeUndefined();
    });

    test("config file persists and loads correctly", async () => {
      await saveConfig(TEST_DIR, {
        repos: ["frontend", "backend"],
        autoDetect: false,
      });

      const loaded = await loadConfig(TEST_DIR);

      expect(loaded.repos).toEqual(["frontend", "backend"]);
      expect(loaded.autoDetect).toBe(false);
    });

    test("init creates config file at expected location", async () => {
      await initConfig(TEST_DIR, { repos: ["my-repo"] });

      const configPath = getConfigPath(TEST_DIR);
      expect(existsSync(configPath)).toBe(true);
    });
  });

  describe("Repository Resolution", () => {
    test("explicit repo list takes precedence over auto-detect", async () => {
      await saveConfig(TEST_DIR, {
        repos: ["explicitly-configured"],
        autoDetect: true, // should be ignored when repos are specified
      });

      const repos = await getRepos(TEST_DIR, TEST_REPOS_DIR);

      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe("explicitly-configured");
    });

    test("simple repo names resolve to repos/ directory", async () => {
      await saveConfig(TEST_DIR, {
        repos: ["frontend", "backend"],
      });

      const repos = await getRepos(TEST_DIR, TEST_REPOS_DIR);

      expect(repos).toHaveLength(2);
      expect(repos[0].path).toBe(join(TEST_REPOS_DIR, "frontend"));
      expect(repos[1].path).toBe(join(TEST_REPOS_DIR, "backend"));
    });

    test("full repo config allows custom paths and remotes", async () => {
      await saveConfig(TEST_DIR, {
        repos: [
          {
            name: "custom-repo",
            path: "/absolute/path/to/repo",
            remote: "https://github.com/org/repo.git",
            baseBranch: "develop",
          },
        ],
      });

      const repos = await getRepos(TEST_DIR, TEST_REPOS_DIR);

      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe("custom-repo");
      expect(repos[0].path).toBe("/absolute/path/to/repo");
      expect(repos[0].remote).toBe("https://github.com/org/repo.git");
      expect(repos[0].baseBranch).toBe("develop");
    });

    test("auto-detect finds git repos in repos/ directory", async () => {
      // Create repos/ with a git repo
      mkdirSync(TEST_REPOS_DIR, { recursive: true });
      const repoPath = join(TEST_REPOS_DIR, "detected-repo");
      mkdirSync(repoPath);
      spawnSync("git", ["init"], { cwd: repoPath });

      await saveConfig(TEST_DIR, { autoDetect: true });

      const repos = await getRepos(TEST_DIR, TEST_REPOS_DIR);

      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe("detected-repo");
    });

    test("auto-detect ignores non-git directories", async () => {
      mkdirSync(TEST_REPOS_DIR, { recursive: true });

      // Create a git repo
      const gitRepo = join(TEST_REPOS_DIR, "is-git");
      mkdirSync(gitRepo);
      spawnSync("git", ["init"], { cwd: gitRepo });

      // Create a non-git directory
      const notGit = join(TEST_REPOS_DIR, "not-git");
      mkdirSync(notGit);

      await saveConfig(TEST_DIR, { autoDetect: true });

      const repos = await getRepos(TEST_DIR, TEST_REPOS_DIR);

      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe("is-git");
    });

    test("empty repos/ with auto-detect returns empty list", async () => {
      mkdirSync(TEST_REPOS_DIR, { recursive: true });
      await saveConfig(TEST_DIR, { autoDetect: true });

      const repos = await getRepos(TEST_DIR, TEST_REPOS_DIR);

      expect(repos).toHaveLength(0);
    });
  });

  describe("Default Values", () => {
    test("repos default to main branch when not specified", async () => {
      await saveConfig(TEST_DIR, {
        repos: ["my-repo"],
      });

      const repos = await getRepos(TEST_DIR, TEST_REPOS_DIR);

      expect(repos[0].baseBranch).toBe("main");
    });

    test("full repo config without baseBranch defaults to main", async () => {
      await saveConfig(TEST_DIR, {
        repos: [{ name: "my-repo" }],
      });

      const repos = await getRepos(TEST_DIR, TEST_REPOS_DIR);

      expect(repos[0].baseBranch).toBe("main");
    });
  });
});

describe("Multi-Repo Workflow Support", () => {
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

  test("can configure diverse set of repos for a monorepo-style project", async () => {
    await saveConfig(TEST_DIR, {
      repos: [
        { name: "web-app", baseBranch: "main" },
        { name: "mobile-app", baseBranch: "main" },
        { name: "api-server", baseBranch: "develop" },
        { name: "shared-libs", baseBranch: "main" },
      ],
    });

    const repos = await getRepos(TEST_DIR, TEST_REPOS_DIR);

    expect(repos).toHaveLength(4);
    expect(repos.map(r => r.name)).toEqual(["web-app", "mobile-app", "api-server", "shared-libs"]);
  });

  test("mixed simple and full repo configs work together", async () => {
    await saveConfig(TEST_DIR, {
      repos: [
        "simple-repo", // string format
        { name: "full-repo", remote: "https://example.com/repo.git" }, // object format
      ],
    });

    const repos = await getRepos(TEST_DIR, TEST_REPOS_DIR);

    expect(repos).toHaveLength(2);
    expect(repos[0].name).toBe("simple-repo");
    expect(repos[0].remote).toBeUndefined();
    expect(repos[1].name).toBe("full-repo");
    expect(repos[1].remote).toBe("https://example.com/repo.git");
  });
});
