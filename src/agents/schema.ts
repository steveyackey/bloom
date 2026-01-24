/**
 * Agent Definition Schema
 *
 * Defines the structure for declarative agent CLI configurations.
 * Agents can be defined in code (built-in) or user config (custom).
 */

import { z } from "zod";

// =============================================================================
// Prompt Style
// =============================================================================

/**
 * How to pass the prompt to the CLI
 */
export const PromptStyleSchema = z.union([
  z.literal("positional"), // Prompt is a positional argument
  z.object({
    flag: z.string(), // Prompt passed via flag (e.g., "-p", "--prompt", "-t")
  }),
]);

export type PromptStyle = z.infer<typeof PromptStyleSchema>;

// =============================================================================
// Mode Configuration
// =============================================================================

/**
 * Configuration for a specific mode (interactive or streaming)
 */
export const ModeConfigSchema = z.object({
  /** Subcommand to use (e.g., "run", "exec", "session") */
  subcommand: z.string().optional(),

  /** Base args that are always added */
  base_args: z.array(z.string()).default([]),

  /** How to pass the prompt */
  prompt: PromptStyleSchema,

  /** Whether system prompt is prepended to user prompt (vs separate flag) */
  prepend_system_prompt: z.boolean().default(false),
});

export type ModeConfig = z.infer<typeof ModeConfigSchema>;

// =============================================================================
// Environment Configuration
// =============================================================================

/**
 * Environment variable configuration
 */
export const EnvConfigSchema = z.object({
  /** Environment variables to always inject (key: value) */
  inject: z.record(z.string(), z.string()).optional().default({}),

  /** Environment variable names that are required (for validation) */
  required: z.array(z.string()).optional().default([]),
});

export type EnvConfig = z.infer<typeof EnvConfigSchema>;

// =============================================================================
// Output Configuration
// =============================================================================

/**
 * Output parsing configuration
 */
export const OutputConfigSchema = z.object({
  /** Expected output format */
  format: z.enum(["stream-json", "json", "text"]).default("text"),

  /** JSON field name for session ID (supports dot notation) */
  session_id_field: z.string().optional(),

  /** JSON field name for session ID (alternative field) */
  session_id_field_alt: z.string().optional(),
});

export type OutputConfig = z.infer<typeof OutputConfigSchema>;

// =============================================================================
// Agent Definition
// =============================================================================

/**
 * Complete agent definition schema
 */
export const AgentDefinitionSchema = z.object({
  /** CLI command name */
  command: z.string(),

  /** Version check arguments (e.g., ["--version"]) */
  version: z.array(z.string()).default(["--version"]),

  /** Official documentation URL */
  docs: z.string().url().optional(),

  /** Common flags shared across modes */
  flags: z
    .object({
      /** Model selection flag(s) */
      model: z.array(z.string()).optional(),

      /** Session resume flag(s) */
      resume: z.array(z.string()).optional(),

      /** Approval bypass flag(s) for non-interactive execution */
      approval_bypass: z.array(z.string()).optional(),

      /** System prompt flag(s) */
      system_prompt: z.array(z.string()).optional(),
    })
    .default({}),

  /** Interactive mode configuration */
  interactive: ModeConfigSchema,

  /** Streaming/non-interactive mode configuration */
  streaming: ModeConfigSchema,

  /** Environment variable configuration */
  env: EnvConfigSchema.optional().default({ inject: {}, required: [] }),

  /** Output parsing configuration */
  output: OutputConfigSchema.optional().default({ format: "text" }),

  /** Command to list available models (e.g., ["models"]) */
  models_command: z.array(z.string()).optional(),

  /** Whether model is required for streaming mode */
  model_required_for_streaming: z.boolean().default(false),

  /** Description for help/docs */
  description: z.string().optional(),
});

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

// =============================================================================
// Agent Registry (for user config)
// =============================================================================

/**
 * Schema for custom agents in user config
 */
export const CustomAgentsConfigSchema = z.record(z.string(), AgentDefinitionSchema);

export type CustomAgentsConfig = z.infer<typeof CustomAgentsConfigSchema>;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse and validate an agent definition
 */
export function parseAgentDefinition(data: unknown): AgentDefinition {
  return AgentDefinitionSchema.parse(data);
}

/**
 * Safely parse an agent definition, returning null on failure
 */
export function safeParseAgentDefinition(data: unknown): AgentDefinition | null {
  const result = AgentDefinitionSchema.safeParse(data);
  return result.success ? result.data : null;
}
