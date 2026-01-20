// =============================================================================
// Global User Configuration (~/.bloom/config.yaml)
// =============================================================================

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as YAML from "yaml";
import { z } from "zod";

// =============================================================================
// Schema
// =============================================================================

const UserConfigSchema = z.object({
  gitProtocol: z.enum(["ssh", "https"]).default("https"),
});

export type UserConfig = z.infer<typeof UserConfigSchema>;

// =============================================================================
// Paths
// =============================================================================

// BLOOM_HOME can be overridden via environment variable for testing
// This avoids polluting the user's actual ~/.bloom during e2e tests
function getBloomHomeDir(): string {
  return process.env.BLOOM_HOME || join(homedir(), ".bloom");
}

export function getBloomHome(): string {
  return getBloomHomeDir();
}

export function getUserConfigPath(): string {
  return join(getBloomHomeDir(), "config.yaml");
}

// =============================================================================
// Config Operations
// =============================================================================

export async function loadUserConfig(): Promise<UserConfig> {
  const configPath = getUserConfigPath();
  if (!existsSync(configPath)) {
    return { gitProtocol: "https" };
  }

  try {
    const content = await Bun.file(configPath).text();
    const parsed = YAML.parse(content) || {};
    return UserConfigSchema.parse(parsed);
  } catch {
    return { gitProtocol: "https" };
  }
}

export async function saveUserConfig(config: UserConfig): Promise<void> {
  const bloomHome = getBloomHome();
  if (!existsSync(bloomHome)) {
    mkdirSync(bloomHome, { recursive: true });
  }
  await Bun.write(getUserConfigPath(), YAML.stringify(config, { indent: 2 }));
}

export async function setGitProtocol(protocol: "ssh" | "https"): Promise<void> {
  const config = await loadUserConfig();
  config.gitProtocol = protocol;
  await saveUserConfig(config);
}

// =============================================================================
// Git URL Conversion
// =============================================================================

export function normalizeGitUrl(url: string, protocol: "ssh" | "https"): string {
  // Extract owner/repo from various URL formats
  let owner: string | null = null;
  let repo: string | null = null;
  let host = "github.com";

  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    host = sshMatch[1];
    owner = sshMatch[2];
    repo = sshMatch[3];
  }

  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    host = httpsMatch[1];
    owner = httpsMatch[2];
    repo = httpsMatch[3];
  }

  if (!owner || !repo) {
    // Can't parse, return as-is
    return url;
  }

  // Remove .git suffix if present
  repo = repo.replace(/\.git$/, "");

  if (protocol === "ssh") {
    return `git@${host}:${owner}/${repo}.git`;
  } else {
    return `https://${host}/${owner}/${repo}.git`;
  }
}

export function extractRepoName(url: string): string {
  // Extract repo name from URL
  const match = url.match(/\/([^/]+?)(?:\.git)?$/);
  if (match) {
    return match[1].replace(/\.git$/, "");
  }
  // Fallback: use last segment
  return url.split("/").pop()?.replace(/\.git$/, "") || "repo";
}

export function extractRepoInfo(url: string): { host: string; owner: string; repo: string } | null {
  // SSH format
  const sshMatch = url.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return {
      host: sshMatch[1],
      owner: sshMatch[2],
      repo: sshMatch[3].replace(/\.git$/, ""),
    };
  }

  // HTTPS format
  const httpsMatch = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return {
      host: httpsMatch[1],
      owner: httpsMatch[2],
      repo: httpsMatch[3].replace(/\.git$/, ""),
    };
  }

  return null;
}
