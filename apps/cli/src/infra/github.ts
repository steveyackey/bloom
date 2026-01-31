// =============================================================================
// GitHub CLI Operations
// =============================================================================
// Infrastructure layer for GitHub CLI (gh) operations.

import { spawnSync } from "node:child_process";

// =============================================================================
// Types
// =============================================================================

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
// GitHub CLI Operations
// =============================================================================

/**
 * Create a pull request using the GitHub CLI.
 * Requires `gh` to be installed and authenticated.
 */
export function createPullRequest(options: CreatePROptions): CreatePRResult {
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
 * Check if the GitHub CLI is available.
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
 * Check if the GitHub CLI is authenticated.
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
