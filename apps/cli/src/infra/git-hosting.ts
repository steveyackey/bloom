// =============================================================================
// Git Hosting CLI Operations
// =============================================================================
// Infrastructure layer for git hosting CLI operations.
// Supports GitHub (gh) and Forgejo (fj) CLIs, auto-detecting the provider
// from the git remote URL.

import { spawnSync } from "node:child_process";

// =============================================================================
// Types
// =============================================================================

export type GitHostingProvider = "github" | "forgejo";

export interface CreatePROptions {
  title: string;
  body: string;
  baseBranch: string;
  headBranch: string;
  cwd: string;
}

export interface CreatePRResult {
  success: boolean;
  url?: string;
  alreadyExists?: boolean;
  error?: string;
}

// =============================================================================
// Provider Detection
// =============================================================================

/** Known Forgejo hosting instances. */
const KNOWN_FORGEJO_HOSTS = ["codeberg.org"];

/**
 * Detect the git hosting provider from the remote URL in a working directory.
 * Returns "forgejo" if the remote URL contains "forgejo" or matches a known
 * Forgejo host. Falls back to "github".
 */
export function detectHostingProvider(cwd: string): GitHostingProvider {
  try {
    const result = spawnSync("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.status === 0) {
      const url = result.stdout?.trim().toLowerCase() ?? "";

      if (url.includes("forgejo")) {
        return "forgejo";
      }

      // Check against known Forgejo hosts
      for (const host of KNOWN_FORGEJO_HOSTS) {
        if (url.includes(host)) {
          return "forgejo";
        }
      }
    }
  } catch {
    // Fall through to default
  }

  return "github";
}

// =============================================================================
// Pull Request Creation
// =============================================================================

/**
 * Create a pull request using the appropriate CLI for the detected provider.
 * Auto-detects the hosting provider from the git remote URL.
 */
export function createPullRequest(options: CreatePROptions): CreatePRResult {
  const provider = detectHostingProvider(options.cwd);

  if (provider === "forgejo") {
    return createForjejoPullRequest(options);
  }
  return createGitHubPullRequest(options);
}

/**
 * Create a pull request using the GitHub CLI (gh).
 */
function createGitHubPullRequest(options: CreatePROptions): CreatePRResult {
  const { title, body, baseBranch, headBranch, cwd } = options;

  try {
    const result = spawnSync(
      "gh",
      ["pr", "create", "--title", title, "--body", body, "--base", baseBranch, "--head", headBranch],
      {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    if (result.status === 0) {
      const url = result.stdout?.trim();
      return { success: true, url };
    }

    const stderr = result.stderr?.trim() || "";

    // Check if PR already exists
    if (stderr.includes("already exists")) {
      return { success: true, alreadyExists: true };
    }

    return { success: false, error: stderr };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Create a pull request using the Forgejo CLI (fj).
 */
function createForjejoPullRequest(options: CreatePROptions): CreatePRResult {
  const { title, body, baseBranch, headBranch, cwd } = options;

  try {
    const args = ["pr", "create", title, "--base", baseBranch, "--head", headBranch];
    if (body) {
      args.push("--body", body);
    }

    const result = spawnSync("fj", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.status === 0) {
      const url = result.stdout?.trim();
      return { success: true, url };
    }

    const stderr = result.stderr?.trim() || "";

    if (stderr.includes("already exists")) {
      return { success: true, alreadyExists: true };
    }

    return { success: false, error: stderr };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// CLI Availability Checks
// =============================================================================

/**
 * Check if the GitHub CLI (gh) is available.
 */
export function isGhAvailable(): boolean {
  try {
    const result = spawnSync("gh", ["--version"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Check if the GitHub CLI (gh) is authenticated.
 */
export function isGhAuthenticated(): boolean {
  try {
    const result = spawnSync("gh", ["auth", "status"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Check if the Forgejo CLI (fj) is available.
 */
export function isFjAvailable(): boolean {
  try {
    const result = spawnSync("fj", ["--version"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Check if the appropriate hosting CLI is available for a given working directory.
 */
export function isHostingCliAvailable(cwd: string): boolean {
  const provider = detectHostingProvider(cwd);
  return provider === "forgejo" ? isFjAvailable() : isGhAvailable();
}
