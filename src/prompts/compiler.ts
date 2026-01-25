// =============================================================================
// Prompt Compiler
// =============================================================================
//
// Compiles prompt templates with task context injection and variable substitution.
// This is a simplified compiler that trusts agents to know their own capabilities.
//
// Variable Syntax:
//   {{VARIABLE_NAME}} - replaced with corresponding value
//
// Task Variables:
//   {{TASK_ID}} - Current task ID
//   {{TASK_TITLE}} - Current task title
//   {{TASK_BRANCH}} - Git branch for the task
//   {{TASKS_FILE}} - Path to tasks.yaml file
//
// =============================================================================

import { EMBEDDED_PROMPTS } from "../prompts-embedded";

// =============================================================================
// Types
// =============================================================================

/**
 * Task context for variable injection into prompts.
 */
export interface TaskContext {
  id: string;
  title: string;
  branch: string;
  tasksFile: string;
}

/**
 * Options for prompt compilation.
 */
export interface CompileOptions {
  task?: TaskContext;
  variables?: Record<string, string>;
  fileName?: string; // For error messages
}

// =============================================================================
// PromptCompiler Class
// =============================================================================

/**
 * Compiles prompt templates with variable substitution.
 */
export class PromptCompiler {
  constructor() {
    // No longer needs promptsDir - always uses embedded prompts
  }

  /**
   * Compile a prompt string with the given options.
   *
   * @param content - The raw prompt content with variables
   * @param options - Compilation options including task context
   * @returns The compiled prompt with variables substituted
   */
  compile(content: string, options: CompileOptions = {}): string {
    const { task, variables = {} } = options;

    let result = content;

    // Inject task context variables
    if (task) {
      result = this.injectTaskContext(result, task);
    }

    // Replace any additional variables
    result = this.substituteVariables(result, variables);

    return result;
  }

  /**
   * Load and compile a prompt from embedded prompts.
   *
   * @param name - The prompt name
   * @param options - Compilation options
   * @returns The compiled prompt
   */
  async loadAndCompile(name: string, options: CompileOptions = {}): Promise<string> {
    const content = EMBEDDED_PROMPTS[name];

    if (!content) {
      throw new Error(`Prompt not found: ${name} (available: ${Object.keys(EMBEDDED_PROMPTS).join(", ")})`);
    }

    return this.compile(content, { ...options, fileName: `${name}` });
  }

  /**
   * Inject task context into the prompt.
   */
  private injectTaskContext(content: string, task: TaskContext): string {
    let result = content;

    result = result.replace(/\{\{TASK_ID\}\}/g, task.id);
    result = result.replace(/\{\{TASK_TITLE\}\}/g, task.title);
    result = result.replace(/\{\{TASK_BRANCH\}\}/g, task.branch);
    result = result.replace(/\{\{TASKS_FILE\}\}/g, task.tasksFile);

    return result;
  }

  /**
   * Substitute variables in the content.
   */
  private substituteVariables(content: string, variables: Record<string, string>): string {
    let result = content;

    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      result = result.replace(pattern, value);
    }

    return result;
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Create a default PromptCompiler instance.
 */
export function createCompiler(): PromptCompiler {
  return new PromptCompiler();
}

/**
 * Compile a prompt string with the given options.
 * Convenience function that creates a compiler and compiles the content.
 */
export function compilePrompt(content: string, options: CompileOptions = {}): string {
  const compiler = new PromptCompiler();
  return compiler.compile(content, options);
}
