// =============================================================================
// Global User Configuration (~/.bloom/config.yaml)
// =============================================================================

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as YAML from "yaml";
import { z } from "zod";

// =============================================================================
// Schema
// =============================================================================

const UserConfigSchema = z.object({
  gitProtocol: z.enum(["ssh", "https"]).default("ssh"),
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
    return { gitProtocol: "ssh" };
  }

  try {
    const content = await Bun.file(configPath).text();
    const parsed = YAML.parse(content) || {};
    return UserConfigSchema.parse(parsed);
  } catch {
    return { gitProtocol: "ssh" };
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

/**
 * Check if URL is a shorthand format (org/repo) that needs protocol expansion.
 */
export function isShorthandUrl(url: string): boolean {
  // Already a full URL - doesn't need protocol
  if (url.startsWith("git@") || url.startsWith("https://") || url.startsWith("http://")) {
    return false;
  }
  // Check for org/repo format
  return /^[^/\s]+\/[^/\s]+$/.test(url);
}

/**
 * Ensure git protocol is configured. If no config exists and URL needs protocol,
 * prompt the user to choose between SSH and HTTPS.
 */
export async function ensureGitProtocolConfigured(url: string): Promise<void> {
  const configPath = getUserConfigPath();

  // If config already exists or URL doesn't need protocol expansion, we're done
  if (existsSync(configPath) || !isShorthandUrl(url)) {
    return;
  }

  // Prompt user for protocol preference
  const select = (await import("@inquirer/select")).default;

  console.log("\nFirst time using Bloom repo commands? Let's configure your git preferences.\n");

  const protocol = await select({
    message: "How do you want to clone repositories?",
    choices: [
      {
        name: "SSH (recommended)",
        value: "ssh",
        description: "Requires SSH keys configured with GitHub",
      },
      {
        name: "HTTPS",
        value: "https",
        description: "Works with GitHub personal access tokens",
      },
    ],
    default: "ssh",
  });

  await setGitProtocol(protocol as "ssh" | "https");
  console.log(`\nGit protocol set to: ${protocol}`);
  console.log("  To change later: bloom config set-protocol <ssh|https>\n");
}

// =============================================================================
// Git URL Conversion
// =============================================================================

/**
 * Expands shorthand repo format (org/repo) to a full URL.
 * Returns the original URL if it's already a full URL.
 */
export function expandRepoUrl(input: string, protocol: "ssh" | "https", host = "github.com"): string {
  // Already a full URL (SSH or HTTPS)
  if (input.startsWith("git@") || input.startsWith("https://") || input.startsWith("http://")) {
    return input;
  }

  // Check for org/repo format (e.g., "steveyackey/bloom")
  const shortMatch = input.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch?.[1] && shortMatch[2]) {
    const owner = shortMatch[1];
    const repo = shortMatch[2].replace(/\.git$/, "");
    if (protocol === "ssh") {
      return `git@${host}:${owner}/${repo}.git`;
    }
    return `https://${host}/${owner}/${repo}.git`;
  }

  // Return as-is if we can't parse it
  return input;
}

export function normalizeGitUrl(url: string, protocol: "ssh" | "https"): string {
  // Extract owner/repo from various URL formats
  let owner: string | null = null;
  let repo: string | null = null;
  let host = "github.com";

  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch?.[1] && sshMatch[2] && sshMatch[3]) {
    host = sshMatch[1];
    owner = sshMatch[2];
    repo = sshMatch[3];
  }

  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch?.[1] && httpsMatch[2] && httpsMatch[3]) {
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
  if (match?.[1]) {
    return match[1].replace(/\.git$/, "");
  }
  // Fallback: use last segment
  const lastSegment = url.split("/").pop();
  return lastSegment?.replace(/\.git$/, "") || "repo";
}

export function extractRepoInfo(url: string): { host: string; owner: string; repo: string } | null {
  // SSH format
  const sshMatch = url.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch?.[1] && sshMatch[2] && sshMatch[3]) {
    return {
      host: sshMatch[1],
      owner: sshMatch[2],
      repo: sshMatch[3].replace(/\.git$/, ""),
    };
  }

  // HTTPS format
  const httpsMatch = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch?.[1] && httpsMatch[2] && httpsMatch[3]) {
    return {
      host: httpsMatch[1],
      owner: httpsMatch[2],
      repo: httpsMatch[3].replace(/\.git$/, ""),
    };
  }

  return null;
}
