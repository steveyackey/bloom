import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expandRepoUrl,
  extractRepoInfo,
  extractRepoName,
  getConfiguredModels,
  getDefaultInteractiveAgent,
  getDefaultModel,
  getDefaultNonInteractiveAgent,
  isShorthandUrl,
  loadUserConfig,
  normalizeGitUrl,
  saveUserConfig,
  setAgentDefaultModel,
  setAgentModels,
  setDefaultInteractiveAgent,
  setDefaultNonInteractiveAgent,
} from "../src/user-config";

describe("user-config Git URL functions", () => {
  describe("isShorthandUrl", () => {
    test("returns true for org/repo format", () => {
      expect(isShorthandUrl("steveyackey/bloom")).toBe(true);
      expect(isShorthandUrl("facebook/react")).toBe(true);
      expect(isShorthandUrl("my-org/my-repo")).toBe(true);
    });

    test("returns false for SSH URLs", () => {
      expect(isShorthandUrl("git@github.com:steveyackey/bloom.git")).toBe(false);
      expect(isShorthandUrl("git@gitlab.com:org/repo.git")).toBe(false);
    });

    test("returns false for HTTPS URLs", () => {
      expect(isShorthandUrl("https://github.com/steveyackey/bloom")).toBe(false);
      expect(isShorthandUrl("https://github.com/steveyackey/bloom.git")).toBe(false);
      expect(isShorthandUrl("http://github.com/org/repo")).toBe(false);
    });

    test("returns false for invalid formats", () => {
      expect(isShorthandUrl("invalid")).toBe(false);
      expect(isShorthandUrl("")).toBe(false);
      expect(isShorthandUrl("org/repo/extra")).toBe(false);
      expect(isShorthandUrl("org/repo with spaces")).toBe(false);
    });
  });

  describe("expandRepoUrl", () => {
    test("expands shorthand to SSH URL when protocol is ssh", () => {
      const result = expandRepoUrl("steveyackey/bloom", "ssh");
      expect(result).toBe("git@github.com:steveyackey/bloom.git");
    });

    test("expands shorthand to HTTPS URL when protocol is https", () => {
      const result = expandRepoUrl("steveyackey/bloom", "https");
      expect(result).toBe("https://github.com/steveyackey/bloom.git");
    });

    test("uses custom host", () => {
      const result = expandRepoUrl("myorg/repo", "ssh", "gitlab.com");
      expect(result).toBe("git@gitlab.com:myorg/repo.git");
    });

    test("removes .git suffix from shorthand before adding it", () => {
      const result = expandRepoUrl("org/repo.git", "ssh");
      expect(result).toBe("git@github.com:org/repo.git");
    });

    test("returns full SSH URL unchanged", () => {
      const url = "git@github.com:steveyackey/bloom.git";
      expect(expandRepoUrl(url, "ssh")).toBe(url);
      expect(expandRepoUrl(url, "https")).toBe(url);
    });

    test("returns full HTTPS URL unchanged", () => {
      const url = "https://github.com/steveyackey/bloom.git";
      expect(expandRepoUrl(url, "ssh")).toBe(url);
      expect(expandRepoUrl(url, "https")).toBe(url);
    });

    test("returns unparseable input unchanged", () => {
      expect(expandRepoUrl("invalid", "ssh")).toBe("invalid");
    });
  });

  describe("normalizeGitUrl", () => {
    test("converts SSH URL to HTTPS when protocol is https", () => {
      const result = normalizeGitUrl("git@github.com:steveyackey/bloom.git", "https");
      expect(result).toBe("https://github.com/steveyackey/bloom.git");
    });

    test("converts HTTPS URL to SSH when protocol is ssh", () => {
      const result = normalizeGitUrl("https://github.com/steveyackey/bloom.git", "ssh");
      expect(result).toBe("git@github.com:steveyackey/bloom.git");
    });

    test("keeps SSH URL as SSH when protocol is ssh", () => {
      const result = normalizeGitUrl("git@github.com:steveyackey/bloom.git", "ssh");
      expect(result).toBe("git@github.com:steveyackey/bloom.git");
    });

    test("keeps HTTPS URL as HTTPS when protocol is https", () => {
      const result = normalizeGitUrl("https://github.com/steveyackey/bloom.git", "https");
      expect(result).toBe("https://github.com/steveyackey/bloom.git");
    });

    test("removes .git suffix and re-adds it consistently", () => {
      const result1 = normalizeGitUrl("git@github.com:org/repo.git", "ssh");
      expect(result1).toBe("git@github.com:org/repo.git");

      const result2 = normalizeGitUrl("https://github.com/org/repo", "https");
      expect(result2).toBe("https://github.com/org/repo.git");
    });

    test("preserves custom hosts", () => {
      const result = normalizeGitUrl("git@gitlab.com:myorg/myrepo.git", "https");
      expect(result).toBe("https://gitlab.com/myorg/myrepo.git");
    });

    test("returns unparseable URL unchanged", () => {
      expect(normalizeGitUrl("invalid", "ssh")).toBe("invalid");
      expect(normalizeGitUrl("", "https")).toBe("");
    });
  });

  describe("extractRepoName", () => {
    test("extracts repo name from SSH URL", () => {
      expect(extractRepoName("git@github.com:steveyackey/bloom.git")).toBe("bloom");
      expect(extractRepoName("git@github.com:org/my-repo.git")).toBe("my-repo");
    });

    test("extracts repo name from HTTPS URL", () => {
      expect(extractRepoName("https://github.com/steveyackey/bloom.git")).toBe("bloom");
      expect(extractRepoName("https://github.com/org/my-repo")).toBe("my-repo");
    });

    test("handles URLs without .git suffix", () => {
      expect(extractRepoName("https://github.com/org/repo")).toBe("repo");
    });

    test("handles .git suffix being part of last segment", () => {
      expect(extractRepoName("https://github.com/org/my-app.git")).toBe("my-app");
    });

    test("returns 'repo' as fallback for unparseable input", () => {
      expect(extractRepoName("invalid")).toBe("invalid");
      expect(extractRepoName("")).toBe("repo");
    });
  });

  describe("extractRepoInfo", () => {
    test("extracts info from SSH URL", () => {
      const info = extractRepoInfo("git@github.com:steveyackey/bloom.git");
      expect(info).toEqual({
        host: "github.com",
        owner: "steveyackey",
        repo: "bloom",
      });
    });

    test("extracts info from HTTPS URL", () => {
      const info = extractRepoInfo("https://github.com/steveyackey/bloom.git");
      expect(info).toEqual({
        host: "github.com",
        owner: "steveyackey",
        repo: "bloom",
      });
    });

    test("handles custom hosts", () => {
      const info = extractRepoInfo("git@gitlab.com:myorg/myrepo.git");
      expect(info).toEqual({
        host: "gitlab.com",
        owner: "myorg",
        repo: "myrepo",
      });
    });

    test("handles HTTP URLs", () => {
      const info = extractRepoInfo("http://github.com/org/repo.git");
      expect(info).toEqual({
        host: "github.com",
        owner: "org",
        repo: "repo",
      });
    });

    test("removes .git suffix from repo name", () => {
      const info = extractRepoInfo("git@github.com:org/my-repo.git");
      expect(info?.repo).toBe("my-repo");
    });

    test("returns null for unparseable URLs", () => {
      expect(extractRepoInfo("invalid")).toBeNull();
      expect(extractRepoInfo("")).toBeNull();
      expect(extractRepoInfo("org/repo")).toBeNull();
    });
  });
});

describe("user-config file operations", () => {
  let testHomeDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Save original BLOOM_HOME
    originalEnv = process.env.BLOOM_HOME;

    // Create a unique test directory
    testHomeDir = join(tmpdir(), `bloom-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testHomeDir, { recursive: true });

    // Set BLOOM_HOME to our test directory
    process.env.BLOOM_HOME = testHomeDir;
  });

  afterEach(() => {
    // Restore original BLOOM_HOME
    if (originalEnv !== undefined) {
      process.env.BLOOM_HOME = originalEnv;
    } else {
      delete process.env.BLOOM_HOME;
    }

    // Cleanup test directory
    if (existsSync(testHomeDir)) {
      rmSync(testHomeDir, { recursive: true, force: true });
    }
  });

  describe("loadUserConfig with agent config", () => {
    test("returns defaults when no config file exists", async () => {
      const config = await loadUserConfig();
      expect(config.gitProtocol).toBe("ssh");
      expect(getDefaultInteractiveAgent(config)).toBe("claude");
      expect(getDefaultNonInteractiveAgent(config)).toBe("claude");
    });

    test("loads valid config with agent section", async () => {
      await saveUserConfig({
        gitProtocol: "https",
        agent: {
          defaultInteractive: "goose",
          defaultNonInteractive: "claude",
          claude: {
            defaultModel: "claude-sonnet-4",
            models: ["claude-sonnet-4", "claude-opus-4"],
          },
        },
      });

      const config = await loadUserConfig();
      expect(config.gitProtocol).toBe("https");
      expect(getDefaultInteractiveAgent(config)).toBe("goose");
      expect(getDefaultNonInteractiveAgent(config)).toBe("claude");
      expect(getDefaultModel(config, "claude")).toBe("claude-sonnet-4");
      expect(getConfiguredModels(config, "claude")).toEqual(["claude-sonnet-4", "claude-opus-4"]);
    });

    test("loads config with only defaultInteractive specified", async () => {
      await saveUserConfig({
        gitProtocol: "ssh",
        agent: {
          defaultInteractive: "goose",
          defaultNonInteractive: "claude",
        },
      });

      const config = await loadUserConfig();
      expect(config.gitProtocol).toBe("ssh");
      expect(getDefaultInteractiveAgent(config)).toBe("goose");
      expect(getDefaultNonInteractiveAgent(config)).toBe("claude");
    });

    test("returns defaults when config file has invalid YAML", async () => {
      // Write invalid YAML directly
      await Bun.write(join(testHomeDir, "config.yaml"), "invalid: yaml: content: [");

      const config = await loadUserConfig();
      expect(config.gitProtocol).toBe("ssh");
      expect(getDefaultInteractiveAgent(config)).toBe("claude");
    });
  });

  describe("agent config setters", () => {
    test("setDefaultInteractiveAgent creates agent section if missing", async () => {
      await setDefaultInteractiveAgent("goose");
      const config = await loadUserConfig();
      expect(getDefaultInteractiveAgent(config)).toBe("goose");
    });

    test("setDefaultNonInteractiveAgent creates agent section if missing", async () => {
      await setDefaultNonInteractiveAgent("opencode");
      const config = await loadUserConfig();
      expect(getDefaultNonInteractiveAgent(config)).toBe("opencode");
    });

    test("setAgentDefaultModel creates agent config if missing", async () => {
      await setAgentDefaultModel("claude", "claude-opus-4");
      const config = await loadUserConfig();
      expect(getDefaultModel(config, "claude")).toBe("claude-opus-4");
      expect(getConfiguredModels(config, "claude")).toContain("claude-opus-4");
    });

    test("setAgentDefaultModel adds model to existing list", async () => {
      await saveUserConfig({
        gitProtocol: "ssh",
        agent: {
          defaultInteractive: "claude",
          defaultNonInteractive: "claude",
          claude: {
            defaultModel: "claude-sonnet-4",
            models: ["claude-sonnet-4"],
          },
        },
      });

      await setAgentDefaultModel("claude", "claude-opus-4");
      const config = await loadUserConfig();
      expect(getDefaultModel(config, "claude")).toBe("claude-opus-4");
      expect(getConfiguredModels(config, "claude")).toContain("claude-sonnet-4");
      expect(getConfiguredModels(config, "claude")).toContain("claude-opus-4");
    });

    test("setAgentModels replaces model list", async () => {
      await setAgentModels("claude", ["model-a", "model-b", "model-c"]);
      const config = await loadUserConfig();
      expect(getConfiguredModels(config, "claude")).toEqual(["model-a", "model-b", "model-c"]);
      expect(getDefaultModel(config, "claude")).toBe("model-a");
    });

    test("setAgentModels preserves default if still in list", async () => {
      await saveUserConfig({
        gitProtocol: "ssh",
        agent: {
          defaultInteractive: "claude",
          defaultNonInteractive: "claude",
          claude: {
            defaultModel: "model-b",
            models: ["model-a", "model-b"],
          },
        },
      });

      await setAgentModels("claude", ["model-b", "model-c", "model-d"]);
      const config = await loadUserConfig();
      expect(getDefaultModel(config, "claude")).toBe("model-b");
    });

    test("setAgentModels changes default if not in new list", async () => {
      await saveUserConfig({
        gitProtocol: "ssh",
        agent: {
          defaultInteractive: "claude",
          defaultNonInteractive: "claude",
          claude: {
            defaultModel: "old-model",
            models: ["old-model"],
          },
        },
      });

      await setAgentModels("claude", ["new-model-a", "new-model-b"]);
      const config = await loadUserConfig();
      expect(getDefaultModel(config, "claude")).toBe("new-model-a");
    });
  });
});
