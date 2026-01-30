// =============================================================================
// Prompt Loading (Embedded Only)
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PLAN_TEMPLATE, DEFAULT_PRD_TEMPLATE, EMBEDDED_PROMPTS } from "./prompts-embedded";

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
 * Load a prompt from embedded prompts and replace variables
 *
 * @param name - The prompt name
 * @param variables - Variables to replace in the prompt
 * @param bloomDir - Optional bloom workspace directory for loading templates
 */
export async function loadPrompt(name: string, variables: PromptVariables = {}, bloomDir?: string): Promise<string> {
  const content = EMBEDDED_PROMPTS[name];

  if (!content) {
    throw new Error(`Prompt not found: ${name} (available: ${Object.keys(EMBEDDED_PROMPTS).join(", ")})`);
  }

  // Load templates and add to variables if not already provided
  const templates = await loadTemplates(bloomDir);
  const allVariables: PromptVariables = {
    PRD_TEMPLATE: templates.prdTemplate,
    PLAN_TEMPLATE: templates.planTemplate,
    ...variables, // User-provided variables override defaults
  };

  // Replace all {{VARIABLE}} placeholders
  let result = content;
  for (const [key, value] of Object.entries(allVariables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(pattern, value);
  }

  return result;
}
