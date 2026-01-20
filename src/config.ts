// =============================================================================
// Bloom Configuration - Dynamic repo and project settings
// =============================================================================

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import * as YAML from "yaml";
import { z } from "zod";

// =============================================================================
// Config Schema
// =============================================================================

const RepoConfigSchema = z.object({
  name: z.string(),
  path: z.string().optional(),       // Absolute path, or relative to repos/
  remote: z.string().optional(),     // Git remote URL for cloning
  baseBranch: z.string().default("main"),
});

const BloomConfigSchema = z.object({
  repos: z.array(z.union([
    z.string(),  // Simple: just repo name
    RepoConfigSchema,  // Full config object
  ])).optional(),
  reposDir: z.string().optional(),  // Override default repos/ directory
  autoDetect: z.boolean().default(true),  // Auto-detect repos in reposDir
});

export type RepoConfig = z.infer<typeof RepoConfigSchema>;
export type BloomConfig = z.infer<typeof BloomConfigSchema>;

// =============================================================================
// Normalized Repo (what we actually use)
// =============================================================================

export interface NormalizedRepo {
  name: string;
  path: string;
  remote?: string;
  baseBranch: string;
}

// =============================================================================
// Config Loading
// =============================================================================

const CONFIG_FILENAME = "bloom.config.yaml";

export function getConfigPath(bloomDir: string): string {
  return join(bloomDir, CONFIG_FILENAME);
}

export async function loadConfig(bloomDir: string): Promise<BloomConfig> {
  const configPath = getConfigPath(bloomDir);

  if (!existsSync(configPath)) {
    // Return default config if no config file exists
    return { autoDetect: true };
  }

  try {
    const content = await Bun.file(configPath).text();
    const parsed = YAML.parse(content);
    return BloomConfigSchema.parse(parsed);
  } catch (error) {
    throw new Error(`Invalid bloom.config.yaml: ${error}`);
  }
}

export async function saveConfig(bloomDir: string, config: BloomConfig): Promise<void> {
  const configPath = getConfigPath(bloomDir);
  await Bun.write(configPath, YAML.stringify(config, { indent: 2 }));
}

// =============================================================================
// Repo Resolution
// =============================================================================

export async function getRepos(bloomDir: string, reposDir: string): Promise<NormalizedRepo[]> {
  const config = await loadConfig(bloomDir);
  const repos: NormalizedRepo[] = [];
  const effectiveReposDir = config.reposDir ? join(bloomDir, config.reposDir) : reposDir;

  // If explicit repos are configured, use those
  if (config.repos && config.repos.length > 0) {
    for (const repo of config.repos) {
      if (typeof repo === "string") {
        // Simple string: name only
        repos.push({
          name: repo,
          path: join(effectiveReposDir, repo),
          baseBranch: "main",
        });
      } else {
        // Full config object
        repos.push({
          name: repo.name,
          path: repo.path
            ? (repo.path.startsWith("/") ? repo.path : join(effectiveReposDir, repo.path))
            : join(effectiveReposDir, repo.name),
          remote: repo.remote,
          baseBranch: repo.baseBranch,
        });
      }
    }
    return repos;
  }

  // Auto-detect repos in reposDir if enabled
  if (config.autoDetect && existsSync(effectiveReposDir)) {
    const entries = readdirSync(effectiveReposDir);

    for (const entry of entries) {
      const entryPath = join(effectiveReposDir, entry);
      const gitPath = join(entryPath, ".git");

      // Check if it's a directory with a .git folder (a git repo)
      if (statSync(entryPath).isDirectory() && existsSync(gitPath)) {
        repos.push({
          name: entry,
          path: entryPath,
          baseBranch: "main",
        });
      }
    }
  }

  return repos;
}

// =============================================================================
// Config Initialization
// =============================================================================

export async function initConfig(
  bloomDir: string,
  options?: { repos?: string[]; remote?: string }
): Promise<BloomConfig> {
  const config: BloomConfig = {
    autoDetect: true,
  };

  if (options?.repos && options.repos.length > 0) {
    config.repos = options.repos;
    config.autoDetect = false;  // Explicit repos disables auto-detect
  }

  await saveConfig(bloomDir, config);
  return config;
}

// =============================================================================
// Example Config Template
// =============================================================================

export function getConfigTemplate(): string {
  return `# Bloom Configuration
# This file configures which repositories bloom manages

# Option 1: Simple list of repo names (will look in repos/ directory)
# repos:
#   - frontend
#   - backend
#   - api-service

# Option 2: Full configuration with remotes and custom paths
# repos:
#   - name: frontend
#     remote: https://github.com/myorg/frontend.git
#     baseBranch: main
#   - name: backend
#     path: /absolute/path/to/backend
#     baseBranch: develop

# Option 3: Auto-detect (default) - finds all git repos in repos/ directory
autoDetect: true

# Optional: Override the repos directory location
# reposDir: ./my-repos
`;
}
