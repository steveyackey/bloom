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

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
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
  private promptsDir: string;

  constructor(promptsDir?: string) {
    this.promptsDir = promptsDir ?? resolve(import.meta.dirname ?? ".", "..", "..", "prompts", "core");
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
   * Load and compile a prompt from a file.
   * Falls back to embedded prompts if the file doesn't exist (for bundled binary).
   *
   * @param name - The prompt file name (without .md extension)
   * @param options - Compilation options
   * @returns The compiled prompt
   */
  async loadAndCompile(name: string, options: CompileOptions = {}): Promise<string> {
    const filePath = join(this.promptsDir, `${name}.md`);

    let content: string;

    if (existsSync(filePath)) {
      // Load from filesystem
      content = await Bun.file(filePath).text();
    } else if (EMBEDDED_PROMPTS[name]) {
      // Fall back to embedded prompts (for bundled binary)
      content = EMBEDDED_PROMPTS[name];
    } else {
      throw new Error(
        `Prompt file not found: ${name} (checked: ${filePath}, embedded: ${Object.keys(EMBEDDED_PROMPTS).join(", ")})`
      );
    }

    return this.compile(content, { ...options, fileName: `${name}.md` });
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
export function createCompiler(promptsDir?: string): PromptCompiler {
  return new PromptCompiler(promptsDir);
}

/**
 * Compile a prompt string with the given options.
 * Convenience function that creates a compiler and compiles the content.
 */
export function compilePrompt(content: string, options: CompileOptions = {}): string {
  const compiler = new PromptCompiler();
  return compiler.compile(content, options);
}
