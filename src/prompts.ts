// =============================================================================
// Prompt Loading from Markdown Files
// =============================================================================

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PROMPTS_DIR = resolve(import.meta.dirname ?? ".", "..", "prompts");

export interface PromptVariables {
  [key: string]: string;
}

/**
 * Load a prompt from a markdown file and replace variables
 */
export async function loadPrompt(name: string, variables: PromptVariables = {}): Promise<string> {
  const filePath = join(PROMPTS_DIR, `${name}.md`);

  if (!existsSync(filePath)) {
    throw new Error(`Prompt file not found: ${filePath}`);
  }

  let content = await Bun.file(filePath).text();

  // Replace all {{VARIABLE}} placeholders
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    content = content.replace(pattern, value);
  }

  return content;
}

/**
 * Load the planning system prompt (legacy - for direct task generation)
 */
export async function loadPlanningPrompt(tasksFile: string): Promise<string> {
  return loadPrompt("planning", { TASKS_FILE: tasksFile });
}

/**
 * Load the agent system prompt
 */
export async function loadAgentPrompt(agentName: string, taskId: string, taskCli: string): Promise<string> {
  return loadPrompt("agent-system", {
    AGENT_NAME: agentName,
    TASK_ID: taskId,
    TASK_CLI: taskCli,
  });
}

/**
 * Load the create project prompt
 */
export async function loadCreatePrompt(projectDir: string): Promise<string> {
  return loadPrompt("create", { PROJECT_DIR: projectDir });
}

/**
 * Load the plan generation prompt
 */
export async function loadPlanPrompt(workingDir: string, planFile: string, reposContext: string): Promise<string> {
  return loadPrompt("plan", {
    WORKING_DIR: workingDir,
    PLAN_FILE: planFile,
    REPOS_CONTEXT: reposContext,
  });
}

/**
 * Load the task generation prompt
 */
export async function loadGeneratePrompt(workingDir: string, tasksFile: string, reposContext: string): Promise<string> {
  return loadPrompt("generate", {
    WORKING_DIR: workingDir,
    TASKS_FILE: tasksFile,
    REPOS_CONTEXT: reposContext,
  });
}
