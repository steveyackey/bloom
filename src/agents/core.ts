export interface AgentRunOptions {
  systemPrompt: string;
  prompt: string;
  startingDirectory: string;
  /** Agent name for session tracking */
  agentName?: string;
  /** Task ID for context */
  taskId?: string;
}

export interface AgentRunResult {
  success: boolean;
  output: string;
  error?: string;
  /** Session ID for resume support */
  sessionId?: string;
}

export interface Agent {
  run(options: AgentRunOptions): Promise<AgentRunResult>;
}
