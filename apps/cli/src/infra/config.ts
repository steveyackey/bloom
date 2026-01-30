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

import { createLogger } from "./logger";

const configLogger = createLogger("user-config");

// =============================================================================
// Per-Agent Configuration Schemas
// =============================================================================

/**
 * Tool permissions: either "all" or an array of specific tool names.
 */
const ToolPermissionSchema = z.union([z.literal("all"), z.array(z.string())]);

/**
 * Base per-agent configuration shared by all agents.
 * Uses `defaultModel` as the active model and `models` as available options.
 */
const BaseAgentConfigSchema = z.object({
  defaultModel: z.string().optional(),
  models: z.array(z.string()).optional(),
  allowedTools: ToolPermissionSchema.optional(),
  deniedTools: z.array(z.string()).optional(),
});

/**
 * Claude-specific configuration.
 */
const ClaudeAgentConfigSchema = BaseAgentConfigSchema.extend({});

/**
 * Copilot-specific configuration.
 */
const CopilotAgentConfigSchema = BaseAgentConfigSchema.extend({});

/**
 * Codex-specific configuration.
 */
const CodexAgentConfigSchema = BaseAgentConfigSchema.extend({
  fullAuto: z.boolean().optional(),
});

/**
 * Goose-specific configuration.
 */
const GooseAgentConfigSchema = BaseAgentConfigSchema.extend({});

/**
 * OpenCode-specific configuration.
 * Note: defaultModel is REQUIRED for opencode - validated separately.
 */
const OpenCodeAgentConfigSchema = BaseAgentConfigSchema.extend({});

/**
 * Type for per-agent config values.
 */
export type PerAgentConfig = z.infer<typeof BaseAgentConfigSchema> & {
  fullAuto?: boolean;
};

// =============================================================================
// Known Agent Names (for validation warnings)
// =============================================================================

export const KNOWN_AGENTS = ["claude", "copilot", "codex", "goose", "opencode", "cursor"] as const;
export type KnownAgentName = (typeof KNOWN_AGENTS)[number];

// =============================================================================
// Agent Section Schema
// =============================================================================

/**
 * The full agent configuration section in config.yaml.
 *
 * Example:
 * ```yaml
 * agent:
 *   defaultInteractive: claude
 *   defaultNonInteractive: claude
 *   timeout: 600
 *   claude:
 *     defaultModel: claude-sonnet-4-20250514
 *     models:
 *       - claude-sonnet-4-20250514
 *       - claude-opus-4-20250514
 *     allowedTools: all
 *   opencode:
 *     defaultModel: anthropic/claude-sonnet-4  # REQUIRED
 *     models:
 *       - anthropic/claude-sonnet-4
 *       - openai/gpt-4o
 * ```
 */
const AgentSectionSchema = z
  .object({
    defaultInteractive: z.string().default("claude"),
    defaultNonInteractive: z.string().default("claude"),
    timeout: z.number().optional(),
    // Per-agent configurations using passthrough for forward compatibility
    claude: ClaudeAgentConfigSchema.optional(),
    copilot: CopilotAgentConfigSchema.optional(),
    codex: CodexAgentConfigSchema.optional(),
    goose: GooseAgentConfigSchema.optional(),
    opencode: OpenCodeAgentConfigSchema.optional(),
  })
  .passthrough(); // Allow unknown agent names for forward compatibility

export type AgentSection = z.infer<typeof AgentSectionSchema> & {
  [agentName: string]: PerAgentConfig | string | number | undefined;
};

// =============================================================================
// User Config Schema
// =============================================================================

const UserConfigSchema = z.object({
  gitProtocol: z.enum(["ssh", "https"]).default("ssh"),
  agent: AgentSectionSchema.optional(),
});

export type UserConfig = z.infer<typeof UserConfigSchema>;

// =============================================================================
// Validation Results
// =============================================================================

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate agent configuration with semantic checks.
 * Returns validation errors and warnings.
 *
 * Validation rules:
 * - `defaultInteractive` and `defaultNonInteractive` must be valid agent names
 * - `opencode.defaultModel` is REQUIRED (no silent defaults)
 * - Unknown agent configs produce warnings (forward compatibility)
 */
export function validateAgentConfig(config: UserConfig): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.agent) {
    return { valid: true, errors, warnings };
  }

  const agentSection = config.agent as AgentSection;

  // Get all keys that look like agent configs (exclude reserved keys)
  const reservedKeys = ["defaultInteractive", "defaultNonInteractive", "timeout"];
  const agentKeys = Object.keys(agentSection).filter((key) => !reservedKeys.includes(key));

  // Validate 'defaultInteractive' references a valid agent
  if (agentSection.defaultInteractive && !KNOWN_AGENTS.includes(agentSection.defaultInteractive as KnownAgentName)) {
    if (!agentKeys.includes(agentSection.defaultInteractive)) {
      warnings.push(
        `agent.defaultInteractive '${agentSection.defaultInteractive}' is not a known agent (${KNOWN_AGENTS.join(", ")})`
      );
    }
  }

  // Validate 'defaultNonInteractive' references a valid agent
  if (
    agentSection.defaultNonInteractive &&
    !KNOWN_AGENTS.includes(agentSection.defaultNonInteractive as KnownAgentName)
  ) {
    if (!agentKeys.includes(agentSection.defaultNonInteractive)) {
      warnings.push(
        `agent.defaultNonInteractive '${agentSection.defaultNonInteractive}' is not a known agent (${KNOWN_AGENTS.join(", ")})`
      );
    }
  }

  // Check for unknown agent configs (forward compatibility warning)
  for (const key of agentKeys) {
    if (!KNOWN_AGENTS.includes(key as KnownAgentName)) {
      warnings.push(`Unknown agent '${key}' in configuration (known agents: ${KNOWN_AGENTS.join(", ")})`);
    }
  }

  // Validate opencode.defaultModel is required
  if (agentSection.opencode) {
    const openCodeConfig = agentSection.opencode as PerAgentConfig;
    if (!openCodeConfig.defaultModel) {
      errors.push("opencode.defaultModel is required (OpenCode requires explicit model selection)");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Log validation warnings to console.
 */
function logValidationWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    configLogger.warn(warning);
  }
}

// =============================================================================
// Agent Config Helpers
// =============================================================================

/**
 * Get the per-agent configuration for a specific agent.
 * Returns undefined if no config exists for that agent.
 */
export function getAgentConfig(config: UserConfig, agentName: string): PerAgentConfig | undefined {
  if (!config.agent) {
    return undefined;
  }

  const agentSection = config.agent as AgentSection;
  const agentConfig = agentSection[agentName];

  // Filter out non-object values (like 'default' string or 'timeout' number)
  if (agentConfig && typeof agentConfig === "object") {
    return agentConfig as PerAgentConfig;
  }

  return undefined;
}

/**
 * Get the default interactive agent name from configuration.
 * Falls back to 'claude' if not specified.
 */
export function getDefaultInteractiveAgent(config: UserConfig): string {
  return config.agent?.defaultInteractive ?? "claude";
}

/**
 * Get the default non-interactive agent name from configuration.
 * Falls back to 'claude' if not specified.
 */
export function getDefaultNonInteractiveAgent(config: UserConfig): string {
  return config.agent?.defaultNonInteractive ?? "claude";
}

/**
 * Get the default agent name for a given mode.
 * Falls back to 'claude' if not specified.
 */
export function getDefaultAgentName(
  config: UserConfig,
  mode: "interactive" | "nonInteractive" = "interactive"
): string {
  if (mode === "interactive") {
    return getDefaultInteractiveAgent(config);
  }
  return getDefaultNonInteractiveAgent(config);
}

/**
 * Get the default model for an agent.
 */
export function getDefaultModel(config: UserConfig, agentName: string): string | undefined {
  const agentConfig = getAgentConfig(config, agentName);
  return agentConfig?.defaultModel;
}

/**
 * Get available models for an agent from config.
 */
export function getConfiguredModels(config: UserConfig, agentName: string): string[] {
  const agentConfig = getAgentConfig(config, agentName);
  return agentConfig?.models ?? [];
}

/**
 * Get the global timeout setting from configuration.
 * Returns undefined if not specified.
 */
export function getAgentTimeout(config: UserConfig): number | undefined {
  return config.agent?.timeout;
}

/**
 * Check if a specific tool is allowed for an agent based on configuration.
 *
 * Tool permission rules:
 * 1. If allowedTools is "all" or undefined, all tools are allowed (unless in deniedTools)
 * 2. If allowedTools is an array, only those tools are allowed
 * 3. Tools in deniedTools are always denied
 *
 * @returns true if the tool is allowed, false if denied
 */
export function isToolAllowed(agentConfig: PerAgentConfig | undefined, toolName: string): boolean {
  if (!agentConfig) {
    return true; // No config means all tools allowed
  }

  // Check deniedTools first (takes precedence)
  if (agentConfig.deniedTools?.includes(toolName)) {
    return false;
  }

  // Check allowedTools
  if (agentConfig.allowedTools === undefined || agentConfig.allowedTools === "all") {
    return true; // All tools allowed
  }

  // allowedTools is an array - check if tool is in it
  return agentConfig.allowedTools.includes(toolName);
}

/**
 * Get all allowed tools for an agent.
 * Returns "all" if all tools are allowed, or an array of specific tool names.
 */
export function getAllowedTools(agentConfig: PerAgentConfig | undefined): "all" | string[] {
  if (!agentConfig || agentConfig.allowedTools === undefined || agentConfig.allowedTools === "all") {
    return "all";
  }
  return agentConfig.allowedTools;
}

/**
 * Get denied tools for an agent.
 * Returns empty array if none are denied.
 */
export function getDeniedTools(agentConfig: PerAgentConfig | undefined): string[] {
  return agentConfig?.deniedTools ?? [];
}

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

/**
 * Load user configuration from ~/.bloom/config.yaml.
 * Validates the configuration and logs warnings for unknown agent configs.
 *
 * @param options.validate - If true, performs semantic validation (default: true)
 * @param options.throwOnError - If true, throws on validation errors (default: false)
 * @returns The parsed user configuration
 * @throws Error if throwOnError is true and validation errors are found
 */
export async function loadUserConfig(
  options: { validate?: boolean; throwOnError?: boolean } = {}
): Promise<UserConfig> {
  const { validate = true, throwOnError = false } = options;
  const configPath = getUserConfigPath();

  if (!existsSync(configPath)) {
    return { gitProtocol: "ssh" };
  }

  try {
    const content = await Bun.file(configPath).text();
    const parsed = YAML.parse(content) || {};
    const config = UserConfigSchema.parse(parsed);

    // Perform semantic validation
    if (validate) {
      const validationResult = validateAgentConfig(config);

      // Log warnings
      logValidationWarnings(validationResult.warnings);

      // Handle errors
      if (!validationResult.valid) {
        const errorMessage = `Configuration errors:\n  - ${validationResult.errors.join("\n  - ")}`;
        if (throwOnError) {
          throw new Error(errorMessage);
        } else {
          configLogger.error(errorMessage);
        }
      }
    }

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Zod v4 uses issues array instead of errors
      const issues = error.issues ?? [];
      const message = `Invalid configuration in ${configPath}:\n  - ${issues.map((e: z.ZodIssue) => e.message).join("\n  - ")}`;
      configLogger.error(message);
      if (throwOnError) {
        throw new Error(message);
      }
    } else if (error instanceof Error && throwOnError) {
      throw error;
    }
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
 * Set the default interactive agent.
 */
export async function setDefaultInteractiveAgent(agentName: string): Promise<void> {
  const config = await loadUserConfig({ validate: false });
  if (!config.agent) {
    config.agent = { defaultInteractive: agentName, defaultNonInteractive: "claude" };
  } else {
    (config.agent as AgentSection).defaultInteractive = agentName;
  }
  await saveUserConfig(config);
}

/**
 * Set the default non-interactive agent.
 */
export async function setDefaultNonInteractiveAgent(agentName: string): Promise<void> {
  const config = await loadUserConfig({ validate: false });
  if (!config.agent) {
    config.agent = { defaultInteractive: "claude", defaultNonInteractive: agentName };
  } else {
    (config.agent as AgentSection).defaultNonInteractive = agentName;
  }
  await saveUserConfig(config);
}

/**
 * Set the default model for an agent.
 */
export async function setAgentDefaultModel(agentName: string, model: string): Promise<void> {
  const config = await loadUserConfig({ validate: false });
  if (!config.agent) {
    config.agent = { defaultInteractive: "claude", defaultNonInteractive: "claude" };
  }
  const agentSection = config.agent as AgentSection;
  if (!agentSection[agentName]) {
    agentSection[agentName] = { defaultModel: model, models: [model] };
  } else {
    const agentConfig = agentSection[agentName] as PerAgentConfig;
    agentConfig.defaultModel = model;
    // Add to models list if not already present
    if (!agentConfig.models) {
      agentConfig.models = [model];
    } else if (!agentConfig.models.includes(model)) {
      agentConfig.models.push(model);
    }
  }
  await saveUserConfig(config);
}

/**
 * Set the available models for an agent.
 */
export async function setAgentModels(agentName: string, models: string[]): Promise<void> {
  const config = await loadUserConfig({ validate: false });
  if (!config.agent) {
    config.agent = { defaultInteractive: "claude", defaultNonInteractive: "claude" };
  }
  const agentSection = config.agent as AgentSection;
  if (!agentSection[agentName]) {
    agentSection[agentName] = { models, defaultModel: models[0] };
  } else {
    const agentConfig = agentSection[agentName] as PerAgentConfig;
    agentConfig.models = models;
    // Set default model if not already set or not in the new list
    if (!agentConfig.defaultModel || !models.includes(agentConfig.defaultModel)) {
      agentConfig.defaultModel = models[0];
    }
  }
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
