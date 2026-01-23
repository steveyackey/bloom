// =============================================================================
// Prompt Loading from Markdown Files
// =============================================================================

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_PLAN_TEMPLATE, DEFAULT_PRD_TEMPLATE, EMBEDDED_PROMPTS } from "./prompts-embedded";

// Try to resolve prompts directory, but it may not exist in bundled binaries
const PROMPTS_DIR = resolve(import.meta.dirname ?? ".", "..", "prompts");

export interface PromptVariables {
  [key: string]: string;
}

/**
 * Load templates from the bloom workspace's template/ directory.
 * Falls back to default templates if files don't exist.
 */
async function loadTemplates(bloomDir?: string): Promise<{ prdTemplate: string; planTemplate: string }> {
  let prdTemplate = DEFAULT_PRD_TEMPLATE;
  let planTemplate = DEFAULT_PLAN_TEMPLATE;

  if (bloomDir) {
    const templateDir = join(bloomDir, "template");

    const prdPath = join(templateDir, "PRD.md");
    if (existsSync(prdPath)) {
      prdTemplate = await Bun.file(prdPath).text();
    }

    const planPath = join(templateDir, "plan.md");
    if (existsSync(planPath)) {
      planTemplate = await Bun.file(planPath).text();
    }
  }

  return { prdTemplate, planTemplate };
}

/**
 * Load a prompt from a markdown file and replace variables
 * Falls back to embedded prompts when files aren't accessible (bundled binary)
 *
 * @param name - The prompt name (without .md extension)
 * @param variables - Variables to replace in the prompt
 * @param bloomDir - Optional bloom workspace directory for loading templates
 */
export async function loadPrompt(name: string, variables: PromptVariables = {}, bloomDir?: string): Promise<string> {
  const filePath = join(PROMPTS_DIR, `${name}.md`);

  let content: string;

  if (existsSync(filePath)) {
    // Load from external file (development mode)
    content = await Bun.file(filePath).text();
  } else if (EMBEDDED_PROMPTS[name]) {
    // Fall back to embedded prompt (bundled binary)
    content = EMBEDDED_PROMPTS[name];
  } else {
    throw new Error(`Prompt not found: ${name} (checked: ${filePath})`);
  }

  // Load templates and add to variables if not already provided
  const templates = await loadTemplates(bloomDir);
  const allVariables: PromptVariables = {
    PRD_TEMPLATE: templates.prdTemplate,
    PLAN_TEMPLATE: templates.planTemplate,
    ...variables, // User-provided variables override defaults
  };

  // Replace all {{VARIABLE}} placeholders
  for (const [key, value] of Object.entries(allVariables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    content = content.replace(pattern, value);
  }

  return content;
}

/**
 * Load the planning system prompt (legacy - for direct task generation)
 */
export async function loadPlanningPrompt(tasksFile: string, bloomDir?: string): Promise<string> {
  return loadPrompt("planning", { TASKS_FILE: tasksFile }, bloomDir);
}

/**
 * Load the agent system prompt
 */
export async function loadAgentPrompt(
  agentName: string,
  taskId: string,
  taskCli: string,
  bloomDir?: string
): Promise<string> {
  return loadPrompt(
    "agent-system",
    {
      AGENT_NAME: agentName,
      TASK_ID: taskId,
      TASK_CLI: taskCli,
    },
    bloomDir
  );
}

/**
 * Load the create project prompt
 */
export async function loadCreatePrompt(projectDir: string, bloomDir?: string): Promise<string> {
  return loadPrompt("create", { PROJECT_DIR: projectDir }, bloomDir);
}

/**
 * Load the plan generation prompt
 */
export async function loadPlanPrompt(
  workingDir: string,
  planFile: string,
  reposContext: string,
  bloomDir?: string
): Promise<string> {
  return loadPrompt(
    "plan",
    {
      WORKING_DIR: workingDir,
      PLAN_FILE: planFile,
      REPOS_CONTEXT: reposContext,
    },
    bloomDir
  );
}

/**
 * Load the task generation prompt
 */
export async function loadGeneratePrompt(
  workingDir: string,
  tasksFile: string,
  reposContext: string,
  bloomDir?: string
): Promise<string> {
  return loadPrompt(
    "generate",
    {
      WORKING_DIR: workingDir,
      TASKS_FILE: tasksFile,
      REPOS_CONTEXT: reposContext,
    },
    bloomDir
  );
}
