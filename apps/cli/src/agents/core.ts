// =============================================================================
// Agent Interface Design Decisions
// =============================================================================
//
// This interface defines the contract between bloom's orchestration layer and
// AI agent providers (Claude, OpenCode, etc.).
//
// GENERIC vs PROVIDER-SPECIFIC CONCEPTS:
//
// GENERIC (in this interface):
// - Mode (interactive/streaming): Both providers support this fundamental distinction
//   - Interactive: Human-in-the-loop REPL mode with stdio: inherit
//   - Streaming: Autonomous execution with captured output
// - Model selection: Providers may support multiple models
// - Session management: Required by orchestrator for interjection/resume support
//
// PROVIDER-SPECIFIC (in provider options):
// - Timeout/heartbeat configuration (ClaudeAgentProvider only)
// - Event callbacks (ClaudeAgentProvider only)
// - Auto-approve/permission settings (provider-specific security models)
// - Output format flags (e.g., Claude's --output-format stream-json)
//
// =============================================================================

/**
 * Execution mode for the agent.
 * - "interactive": Human-in-the-loop REPL mode with terminal access
 * - "streaming": Autonomous execution with captured output
 */
export type AgentMode = "interactive" | "streaming";

/**
 * Options passed to agent.run() for a single execution.
 */
export interface AgentRunOptions {
  /** System prompt providing context and instructions */
  systemPrompt: string;
  /** User prompt / task to execute */
  prompt: string;
  /** Working directory for the agent process */
  startingDirectory: string;
  /** Agent name for session tracking and interjection support */
  agentName?: string;
  /** Task ID for context (used in session tracking) */
  taskId?: string;
  /** Session ID to resume a previous session */
  sessionId?: string;
  /** Callback for streaming output from the agent process */
  onOutput?: (data: string) => void;
  /** Callback when the agent subprocess starts */
  onProcessStart?: (pid: number, command: string) => void;
  /** Callback when the agent subprocess ends */
  onProcessEnd?: (pid: number, exitCode: number | null) => void;
}

/**
 * Result returned from agent.run().
 */
export interface AgentRunResult {
  success: boolean;
  /** Captured output from the agent (empty in interactive mode) */
  output: string;
  error?: string;
  /** Session ID for resume support (if provider supports sessions) */
  sessionId?: string;
}

/**
 * Represents a running agent session for interjection/monitoring.
 * This is a generic interface - providers may have additional internal state.
 */
export interface AgentSession {
  /** Session ID for resume support (may be undefined until agent reports it) */
  sessionId?: string;
  /** When the session started */
  startTime: number;
  /** Last activity timestamp (for timeout detection) */
  lastActivity: number;
  /** Task being worked on */
  taskId?: string;
  /** Agent identifier */
  agentName?: string;
  /** Working directory */
  workingDirectory: string;
}

/**
 * Configuration for agent instantiation.
 * These are common options supported by all providers.
 * Provider-specific options should be defined in provider option interfaces.
 */
/**
 * Per-agent sandbox configuration overrides.
 * These are passed through to the sandbox module's resolveConfig().
 * Fields not specified here fall back to sandbox defaults.
 */
export interface AgentSandboxConfig {
  /** Whether sandboxing is enabled for this agent. Default: false */
  enabled?: boolean;
  /** Network policy override. Default: "deny-all" */
  networkPolicy?: "deny-all" | "allow-list" | "monitor" | "disabled";
  /** Domains to allow when networkPolicy is "allow-list" */
  allowedDomains?: string[];
  /** Additional filesystem paths to mount as writable */
  writablePaths?: string[];
  /** Filesystem paths to deny read access to */
  denyReadPaths?: string[];
}

export interface AgentConfig {
  /**
   * Execution mode:
   * - "interactive": REPL mode with terminal access
   * - "streaming": Autonomous execution with output capture
   */
  mode?: AgentMode;
  /**
   * Model to use for the agent (provider-specific model identifiers).
   * If not specified, provider uses its default model.
   */
  model?: string;
  /**
   * Whether to stream output to stdout/stderr while capturing.
   * Only applies in streaming mode. Defaults to true for most providers.
   */
  streamOutput?: boolean;
  /**
   * Per-agent sandbox configuration.
   * Controls process isolation when running this agent.
   * If not specified, sandbox defaults apply (disabled).
   */
  sandbox?: AgentSandboxConfig;
}

/**
 * Core agent interface implemented by all providers.
 *
 * Providers must implement:
 * - run(): Execute a prompt and return results
 *
 * Providers may optionally implement session management methods:
 * - getActiveSession(): Get current session for monitoring/interjection
 *
 * Session interjection (killing active sessions) should be handled via
 * provider-specific exports since it requires access to internal process state.
 */
export interface Agent {
  /**
   * Execute the agent with the given options.
   * Returns when the agent completes or is interrupted.
   */
  run(options: AgentRunOptions): Promise<AgentRunResult>;

  /**
   * Get the currently active session for this agent instance, if any.
   * Used by orchestrator for monitoring and interjection support.
   * Returns undefined if no session is active or provider doesn't track sessions.
   */
  getActiveSession?(): AgentSession | undefined;
}
