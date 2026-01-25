/**
 * Built-in Agent Definitions
 *
 * These are bundled with Bloom and define how to interact with each CLI.
 * Users can override or extend these via ~/.bloom/config.yaml
 */

import type { AgentDefinition } from "./schema";

// =============================================================================
// Claude
// =============================================================================

export const claudeAgent: AgentDefinition = {
  command: "claude",
  version: ["--version"],
  docs: "https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview",
  description: "Anthropic's Claude Code CLI for general development and web research",

  flags: {
    model: ["--model"],
    resume: ["--resume"],
    approval_bypass: ["--dangerously-skip-permissions"],
    system_prompt: ["--append-system-prompt"],
  },

  interactive: {
    base_args: ["--verbose"],
    prompt: "positional",
    prepend_system_prompt: false,
  },

  streaming: {
    base_args: ["-p", "--verbose", "--output-format", "stream-json"],
    prompt: "positional",
    prepend_system_prompt: false,
  },

  env: {
    inject: {},
    required: ["ANTHROPIC_API_KEY"],
  },

  output: {
    format: "stream-json",
    session_id_field: "session_id",
  },

  model_required_for_streaming: false,
};

// =============================================================================
// Copilot
// =============================================================================

export const copilotAgent: AgentDefinition = {
  command: "copilot",
  version: ["--version"],
  docs: "https://docs.github.com/copilot/concepts/agents/about-copilot-cli",
  description: "GitHub Copilot CLI for GitHub-integrated workflows",

  flags: {
    model: ["--model"],
    resume: ["--resume"],
    approval_bypass: ["--allow-all-tools"],
  },

  interactive: {
    base_args: [],
    prompt: { flag: "-i" },
    prepend_system_prompt: true, // Copilot doesn't have system prompt flag
  },

  streaming: {
    base_args: [],
    prompt: { flag: "-p" },
    prepend_system_prompt: true,
  },

  env: {
    inject: {},
    required: [], // Uses gh auth
  },

  output: {
    format: "stream-json",
    session_id_field: "session_id",
  },

  model_required_for_streaming: false,
};

// =============================================================================
// Codex
// =============================================================================

export const codexAgent: AgentDefinition = {
  command: "codex",
  version: ["--version"],
  docs: "https://github.com/openai/codex",
  description: "OpenAI Codex CLI for structured output and exploratory work",

  flags: {
    model: ["-m", "--model"],
    approval_bypass: ["--dangerously-bypass-approvals-and-sandbox"],
  },

  interactive: {
    base_args: [],
    prompt: "positional",
    prepend_system_prompt: true,
  },

  streaming: {
    subcommand: "exec",
    base_args: [],
    prompt: "positional",
    prepend_system_prompt: true,
  },

  env: {
    inject: {},
    required: ["OPENAI_API_KEY"],
  },

  output: {
    format: "stream-json",
    session_id_field: "session_id",
  },

  model_required_for_streaming: false,
};

// =============================================================================
// Goose
// =============================================================================

export const gooseAgent: AgentDefinition = {
  command: "goose",
  version: ["version"], // goose uses 'version' subcommand
  docs: "https://block.github.io/goose/",
  description: "Block's Goose CLI for extensible automation via MCP",

  flags: {
    model: [], // Uses configured provider
    resume: ["--session-id"],
  },

  interactive: {
    subcommand: "session",
    base_args: [],
    prompt: "positional", // Session is interactive REPL
    prepend_system_prompt: true,
  },

  streaming: {
    subcommand: "run",
    base_args: ["--output-format", "stream-json"],
    prompt: { flag: "-t" },
    prepend_system_prompt: true,
  },

  env: {
    inject: {},
    required: [], // Uses goose configure
  },

  output: {
    format: "stream-json",
    session_id_field: "session_id",
  },

  model_required_for_streaming: false,
};

// =============================================================================
// OpenCode
// =============================================================================

export const opencodeAgent: AgentDefinition = {
  command: "opencode",
  version: ["--version"],
  docs: "https://opencode.ai/",
  description: "Multi-provider coding agent with native LSP support",

  flags: {
    model: ["-m", "--model"],
    resume: ["-s"],
  },

  interactive: {
    base_args: [],
    prompt: { flag: "--prompt" },
    prepend_system_prompt: true,
  },

  streaming: {
    subcommand: "run",
    base_args: ["--format", "json"],
    prompt: "positional",
    prepend_system_prompt: true,
  },

  env: {
    inject: {
      // Auto-approve all tool calls
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { "*": "allow" } }),
    },
    required: [], // Depends on provider
  },

  output: {
    format: "json",
    session_id_field: "sessionID",
    session_id_field_alt: "session_id",
  },

  models_command: ["models"],
  model_required_for_streaming: true,
};

// =============================================================================
// Test Agent (for e2e testing without LLM)
// =============================================================================

export const testAgent: AgentDefinition = {
  command: "bun",
  version: ["--version"], // Uses bun's version
  docs: "https://github.com/your-org/bloom/blob/main/src/agents/test-agent/README.md",
  description: "Mock agent for e2e testing without an LLM",

  flags: {
    model: ["--model"],
    resume: ["--session-id"],
    approval_bypass: ["--yes"],
    system_prompt: ["--system"],
  },

  interactive: {
    // Test agent doesn't have a true interactive mode, but we support it
    base_args: ["src/agents/test-agent/cli.ts"],
    prompt: { flag: "-p" },
    prepend_system_prompt: true,
  },

  streaming: {
    base_args: ["src/agents/test-agent/cli.ts", "--json"],
    prompt: { flag: "-p" },
    prepend_system_prompt: true,
  },

  env: {
    inject: {},
    required: [], // No API keys needed
  },

  output: {
    format: "stream-json",
    session_id_field: "session_id",
  },

  model_required_for_streaming: false,
};

// =============================================================================
// Registry
// =============================================================================

/**
 * All built-in agents indexed by name
 */
export const BUILTIN_AGENTS: Record<string, AgentDefinition> = {
  claude: claudeAgent,
  copilot: copilotAgent,
  codex: codexAgent,
  goose: gooseAgent,
  opencode: opencodeAgent,
  test: testAgent,
};

/**
 * Get a built-in agent definition by name
 */
export function getBuiltinAgent(name: string): AgentDefinition | undefined {
  return BUILTIN_AGENTS[name];
}

/**
 * Get all built-in agent names
 */
export function getBuiltinAgentNames(): string[] {
  return Object.keys(BUILTIN_AGENTS);
}
