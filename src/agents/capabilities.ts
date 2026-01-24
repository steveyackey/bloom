// =============================================================================
// Agent Capability Registry
// =============================================================================
//
// Defines capabilities for all supported agent providers. This registry enables
// the prompt compiler to generate agent-specific prompts by including/excluding
// sections based on what each agent can do.
//
// =============================================================================

/**
 * Agent capability names for use as type constraints.
 * These match the keys in AgentCapabilities for conditional prompt processing.
 */
export type AgentCapabilityName =
  | "supportsFileRead"
  | "supportsFileWrite"
  | "supportsBash"
  | "supportsGit"
  | "supportsWebSearch"
  | "supportsWebFetch"
  | "supportsSystemPrompt"
  | "supportsAppendSystemPrompt"
  | "supportsSessionResume"
  | "supportsSessionFork"
  | "supportsStructuredOutput"
  | "supportsStreamingJson"
  | "supportsHumanQuestions"
  | "supportsPlanMode"
  | "supportsLSP";

/**
 * Defines what capabilities an AI agent provider supports.
 * Used by the prompt compiler to generate agent-specific prompts.
 */
export interface AgentCapabilities {
  // ===========================================================================
  // Tool Capabilities
  // ===========================================================================

  /**
   * Whether the agent can read files from the filesystem.
   * All coding agents support this - it's fundamental to code analysis.
   */
  supportsFileRead: boolean;

  /**
   * Whether the agent can create and modify files.
   * Required for any agent that needs to make code changes.
   */
  supportsFileWrite: boolean;

  /**
   * Whether the agent can execute terminal/shell commands.
   * Enables running builds, tests, git commands, and other CLI tools.
   */
  supportsBash: boolean;

  /**
   * Whether the agent can perform git operations.
   * Usually true if supportsBash is true, but some agents may restrict git.
   */
  supportsGit: boolean;

  /**
   * Whether the agent can search the web for information.
   * Useful for finding documentation, examples, or current information.
   * Not all agents support this - some are fully offline.
   */
  supportsWebSearch: boolean;

  /**
   * Whether the agent can fetch and read web pages.
   * Different from search - this is direct URL fetching.
   */
  supportsWebFetch: boolean;

  // ===========================================================================
  // Prompt Features
  // ===========================================================================

  /**
   * Whether the agent supports a separate system prompt parameter.
   * If false, system instructions must be prepended to the user prompt.
   */
  supportsSystemPrompt: boolean;

  /**
   * Whether the agent supports appending to an existing system prompt.
   * Claude uses --append-system-prompt for this.
   * If false and supportsSystemPrompt is false, prepend to user prompt.
   */
  supportsAppendSystemPrompt: boolean;

  /**
   * Maximum prompt length in characters (optional).
   * If specified, prompts longer than this will be truncated or rejected.
   */
  maxPromptLength?: number;

  // ===========================================================================
  // Session Features
  // ===========================================================================

  /**
   * Whether the agent can resume a previous session.
   * Enables continuing work across multiple invocations.
   * Session ID is returned from run() and passed back to resume.
   */
  supportsSessionResume: boolean;

  /**
   * Whether the agent can fork/branch an existing session.
   * Enables exploring alternative approaches from a checkpoint.
   * Currently only Codex supports this.
   */
  supportsSessionFork: boolean;

  // ===========================================================================
  // Output Features
  // ===========================================================================

  /**
   * Whether the agent can enforce structured output via JSON schema.
   * Codex supports this via --output-schema flag.
   * Useful for extracting specific data formats from agent output.
   */
  supportsStructuredOutput: boolean;

  /**
   * Whether the agent outputs JSON events in a streaming format.
   * Enables real-time parsing of agent activity (tool use, messages, etc.).
   * Most modern agent CLIs support this for scripting.
   */
  supportsStreamingJson: boolean;

  // ===========================================================================
  // Interaction Features
  // ===========================================================================

  /**
   * Whether the agent can ask clarifying questions to the human.
   * Claude and Goose support this - agent pauses for human input.
   * Copilot and Codex run to completion without interruption.
   */
  supportsHumanQuestions: boolean;

  /**
   * Whether the agent supports a plan-then-act workflow.
   * Some agents may have explicit plan modes - creates plan, waits for approval.
   * Most agents act directly without explicit planning phase.
   */
  supportsPlanMode: boolean;

  /**
   * Whether the agent has native Language Server Protocol (LSP) support.
   * LSP provides accurate code intelligence features like go-to-definition,
   * find references, hover info, and diagnostics.
   * OpenCode has native LSP support built-in.
   */
  supportsLSP: boolean;

  // ===========================================================================
  // Agent-Specific Features
  // ===========================================================================

  /**
   * Special instructions specific to this agent.
   * Included in compiled prompts to guide agent-specific behavior.
   * Examples: "Use TodoWrite tool", "Has GitHub MCP by default"
   */
  specialInstructions?: string[];

  /**
   * Index signature to allow dynamic capability access.
   * Required for compatibility with PromptCompiler's conditional processing.
   */
  [key: string]: boolean | string[] | number | undefined;
}

/**
 * Supported agent names.
 */
export type AgentName = "claude" | "copilot" | "codex" | "goose" | "opencode";

/**
 * Capability registry for all supported agents.
 * Maps agent names to their capability definitions.
 */
export const agentCapabilities: Record<AgentName, AgentCapabilities> = {
  // ===========================================================================
  // Claude (Anthropic)
  // ===========================================================================
  // CLI: claude
  // Features: Rich tool ecosystem, streaming JSON, session resume
  // Strengths: TodoWrite tool, Task subagents, web search, human questions
  // ===========================================================================
  claude: {
    // Tools
    supportsFileRead: true,
    supportsFileWrite: true,
    supportsBash: true,
    supportsGit: true,
    supportsWebSearch: true,
    supportsWebFetch: true,

    // Prompt features
    supportsSystemPrompt: false, // Uses --append-system-prompt instead
    supportsAppendSystemPrompt: true,
    maxPromptLength: undefined, // No documented limit

    // Session features
    supportsSessionResume: true, // Via --resume <session_id>
    supportsSessionFork: false,

    // Output features
    supportsStructuredOutput: false,
    supportsStreamingJson: true, // Via --output-format stream-json

    // Interaction
    supportsHumanQuestions: true, // Can pause for human input
    supportsPlanMode: false, // No explicit plan mode

    // Code intelligence
    supportsLSP: false, // Uses AST analysis but no native LSP

    // Special instructions
    specialInstructions: [
      "Use TodoWrite tool to track task progress",
      "Can use Task tool to spawn subagents for complex tasks",
      "Use WebFetch for retrieving web page content",
    ],
  },

  // ===========================================================================
  // Copilot (GitHub)
  // ===========================================================================
  // CLI: copilot
  // Features: Multi-model support, granular tool permissions, GitHub MCP
  // Strengths: Access to Claude, GPT, Gemini models; fine-grained permissions
  // ===========================================================================
  copilot: {
    // Tools
    supportsFileRead: true,
    supportsFileWrite: true,
    supportsBash: true,
    supportsGit: true,
    supportsWebSearch: true,
    supportsWebFetch: true,

    // Prompt features
    supportsSystemPrompt: false, // Prepend to user prompt
    supportsAppendSystemPrompt: false,
    maxPromptLength: undefined,

    // Session features
    supportsSessionResume: true, // Via --resume <session_id>
    supportsSessionFork: false,

    // Output features
    supportsStructuredOutput: false,
    supportsStreamingJson: true, // Native streaming JSON

    // Interaction
    supportsHumanQuestions: false, // Runs to completion
    supportsPlanMode: false,

    // Code intelligence
    supportsLSP: false, // No native LSP support

    // Special instructions
    specialInstructions: [
      "Has access to GitHub MCP server by default for GitHub operations",
      "Supports multi-model selection via --model flag (Claude, GPT, Gemini)",
      "Use --allow-tool and --deny-tool for fine-grained permission control",
    ],
  },

  // ===========================================================================
  // Codex (OpenAI)
  // ===========================================================================
  // CLI: codex
  // Features: Session forking/resume, sandbox control, approval policies
  // Strengths: Session branching, sandbox control, web search
  // ===========================================================================
  codex: {
    // Tools
    supportsFileRead: true,
    supportsFileWrite: true,
    supportsBash: true,
    supportsGit: true,
    supportsWebSearch: true, // Via --search flag
    supportsWebFetch: false, // No direct URL fetching

    // Prompt features
    supportsSystemPrompt: false, // Prepend to user prompt
    supportsAppendSystemPrompt: false,
    maxPromptLength: undefined,

    // Session features
    supportsSessionResume: true, // Via `codex resume` (--last for most recent)
    supportsSessionFork: true, // Via `codex fork` (--last for most recent)

    // Output features
    supportsStructuredOutput: false,
    supportsStreamingJson: true, // Via `codex exec` subcommand

    // Interaction
    supportsHumanQuestions: false, // Runs to completion (approval policies are CLI-level)
    supportsPlanMode: false,

    // Code intelligence
    supportsLSP: false, // No native LSP support

    // Special instructions
    specialInstructions: [
      "Supports session forking to explore alternative approaches",
      "Use -s/--sandbox flag to control file system access level",
    ],
  },

  // ===========================================================================
  // Goose (Block)
  // ===========================================================================
  // CLI: goose
  // Features: Extensible via MCP, multi-provider, scheduling, recipes
  // Strengths: Open source, extensible, local execution, browser automation
  // ===========================================================================
  goose: {
    // Tools
    supportsFileRead: true,
    supportsFileWrite: true,
    supportsBash: true,
    supportsGit: true,
    supportsWebSearch: false, // No built-in web search
    supportsWebFetch: true, // Via Computer Controller extension

    // Prompt features
    supportsSystemPrompt: true, // Via --system flag
    supportsAppendSystemPrompt: false,
    maxPromptLength: undefined,

    // Session features
    supportsSessionResume: true, // Via --session-id or -r flag
    supportsSessionFork: false,

    // Output features
    supportsStructuredOutput: false,
    supportsStreamingJson: true, // Via --output-format stream-json

    // Interaction
    supportsHumanQuestions: true, // Interactive session mode
    supportsPlanMode: false, // No explicit plan mode

    // Code intelligence
    supportsLSP: false, // No native LSP support

    // Special instructions
    specialInstructions: [
      "Extensible via MCP (Model Context Protocol) servers",
      "Use `goose configure` to add extensions and providers",
      "Supports scheduled automation via `goose schedule`",
      "Browser automation available via Computer Controller extension",
    ],
  },

  // ===========================================================================
  // OpenCode
  // ===========================================================================
  // CLI: opencode
  // Features: Multi-provider, LSP integration, session export/import
  // Strengths: Native LSP support for accurate code intelligence
  // ===========================================================================
  opencode: {
    // Tools
    supportsFileRead: true,
    supportsFileWrite: true,
    supportsBash: true,
    supportsGit: true,
    supportsWebSearch: false, // No web search
    supportsWebFetch: false, // No web fetching

    // Prompt features
    supportsSystemPrompt: false, // Prepend to user prompt
    supportsAppendSystemPrompt: false,
    maxPromptLength: undefined,

    // Session features
    supportsSessionResume: true, // Via -s <session_id> or -c flag
    supportsSessionFork: false,

    // Output features
    supportsStructuredOutput: false,
    supportsStreamingJson: true, // Via --format json

    // Interaction
    supportsHumanQuestions: false, // Runs to completion
    supportsPlanMode: false,

    // Code intelligence
    supportsLSP: true, // Native LSP support for accurate code intelligence

    // Special instructions
    specialInstructions: [
      "Has native LSP (Language Server Protocol) support for accurate code intelligence",
      "Model must be explicitly specified - no default model in non-interactive mode",
      "Use provider/model format for model selection (e.g., anthropic/claude-sonnet-4)",
      "Supports session export/import for debugging and sharing",
    ],
  },
};

/**
 * Get capabilities for a specific agent.
 * @param agentName - The name of the agent
 * @returns The agent's capabilities or undefined if not found
 */
export function getAgentCapabilities(agentName: string): AgentCapabilities | undefined {
  return agentCapabilities[agentName as AgentName];
}

/**
 * Check if an agent supports a specific capability.
 * @param agentName - The name of the agent
 * @param capability - The capability to check
 * @returns true if the agent supports the capability, false otherwise
 */
export function hasCapability(agentName: string, capability: AgentCapabilityName): boolean {
  const caps = getAgentCapabilities(agentName);
  if (!caps) return false;
  return caps[capability] === true;
}

/**
 * Get list of all registered agent names.
 * @returns Array of agent names
 */
export function getRegisteredAgentNames(): AgentName[] {
  return Object.keys(agentCapabilities) as AgentName[];
}

/**
 * Check if an agent name is valid/registered.
 * @param name - The name to check
 * @returns true if the agent is registered
 */
export function isValidAgentName(name: string): name is AgentName {
  return name in agentCapabilities;
}
