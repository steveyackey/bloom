// =============================================================================
// Prompt Compiler
// =============================================================================
//
// Compiles prompt templates with capability-based conditional processing,
// task context injection, and dynamic capability section generation.
//
// Conditional Syntax:
//   <!-- @if capabilityName -->
//   Content included when capability is truthy
//   <!-- @endif -->
//
// Variable Syntax:
//   {{VARIABLE_NAME}} - replaced with corresponding value
//
// =============================================================================

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

// =============================================================================
// Types
// =============================================================================

/**
 * Agent capabilities that control conditional inclusion in prompts.
 */
export interface AgentCapabilities {
  supportsWebSearch?: boolean;
  supportsFileRead?: boolean;
  supportsBash?: boolean;
  supportsGit?: boolean;
  supportsMcp?: boolean;
  supportsHumanQuestions?: boolean;
  supportsPlanMode?: boolean;
  supportsSessionFork?: boolean;
  supportsPRWorkflow?: boolean;
  supportsAutoMerge?: boolean;
  supportsCheckpoints?: boolean;
  supportsLinting?: boolean;
  supportsTypeChecking?: boolean;
  supportsFormatting?: boolean;
  supportsLSP?: boolean;
  [key: string]: boolean | string[] | number | undefined;
}

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
  capabilities?: AgentCapabilities;
  task?: TaskContext;
  variables?: Record<string, string>;
  fileName?: string; // For error messages
}

/**
 * Mapping of capability names to their human-readable descriptions.
 */
const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  supportsWebSearch: "Web search",
  supportsFileRead: "Read files",
  supportsBash: "Run terminal commands",
  supportsGit: "Git operations",
  supportsMcp: "MCP tools",
  supportsHumanQuestions: "Ask human questions",
  supportsPlanMode: "Plan mode",
  supportsSessionFork: "Session forking",
  supportsPRWorkflow: "Pull request workflow",
  supportsAutoMerge: "Auto-merge",
  supportsCheckpoints: "Checkpoints",
  supportsLinting: "Code linting",
  supportsTypeChecking: "Type checking",
  supportsFormatting: "Code formatting",
  supportsLSP: "Language Server Protocol (LSP) for code intelligence",
};

// =============================================================================
// PromptCompiler Class
// =============================================================================

/**
 * Compiles prompt templates with conditional processing and variable substitution.
 */
export class PromptCompiler {
  private promptsDir: string;

  constructor(promptsDir?: string) {
    this.promptsDir = promptsDir ?? resolve(import.meta.dirname ?? ".", "..", "..", "prompts", "core");
  }

  /**
   * Compile a prompt string with the given options.
   *
   * @param content - The raw prompt content with conditionals and variables
   * @param options - Compilation options including capabilities and task context
   * @returns The compiled prompt with conditionals resolved and variables substituted
   */
  compile(content: string, options: CompileOptions = {}): string {
    const { capabilities = {}, task, variables = {}, fileName } = options;

    // Process conditionals first (handles nested conditionals)
    let result = this.processConditionals(content, capabilities, fileName);

    // Generate and inject capability section if placeholder exists
    if (result.includes("{{CAPABILITIES_SECTION}}")) {
      const capabilitySection = this.generateCapabilitiesSection(capabilities);
      result = result.replace(/\{\{CAPABILITIES_SECTION\}\}/g, capabilitySection);
    }

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
   *
   * @param name - The prompt file name (without .md extension)
   * @param options - Compilation options
   * @returns The compiled prompt
   */
  async loadAndCompile(name: string, options: CompileOptions = {}): Promise<string> {
    const filePath = join(this.promptsDir, `${name}.md`);

    if (!existsSync(filePath)) {
      throw new Error(`Prompt file not found: ${name} (checked: ${filePath})`);
    }

    const content = await Bun.file(filePath).text();
    return this.compile(content, { ...options, fileName: `${name}.md` });
  }

  /**
   * Process conditional blocks in the content.
   * Handles nested conditionals by processing from innermost to outermost.
   *
   * @param content - The raw content with conditional markers
   * @param capabilities - The agent capabilities
   * @param fileName - Optional file name for error messages
   * @returns Content with conditionals resolved
   */
  private processConditionals(
    content: string,
    capabilities: AgentCapabilities,
    fileName?: string
  ): string {
    // Validate conditional structure first
    this.validateConditionalStructure(content, fileName);

    // Process conditionals from innermost to outermost
    let result = content;
    let iterations = 0;
    const maxIterations = 100; // Safety limit for deeply nested conditionals

    // Keep processing until no more conditionals remain
    while (this.hasConditionals(result) && iterations < maxIterations) {
      result = this.processInnermostConditionals(result, capabilities);
      iterations++;
    }

    if (iterations >= maxIterations) {
      throw new Error(
        this.formatError("Maximum iteration limit reached while processing conditionals", fileName)
      );
    }

    return result;
  }

  /**
   * Check if content has any conditional markers.
   */
  private hasConditionals(content: string): boolean {
    return content.includes("<!-- @if ") || content.includes("<!-- @endif");
  }

  /**
   * Process the innermost conditional blocks (those without nested conditionals inside them).
   */
  private processInnermostConditionals(content: string, capabilities: AgentCapabilities): string {
    // Match innermost conditionals (those with no nested @if inside their content)
    // This regex matches:
    // - <!-- @if capabilityName --> (with optional whitespace)
    // - Content that does NOT contain another <!-- @if
    // - <!-- @endif --> (with optional whitespace)
    const conditionalRegex =
      /<!-- @if\s+(\w+)\s*-->([\s\S]*?)<!-- @endif\s*-->/;

    let result = content;
    let match: RegExpExecArray | null;

    // Process one conditional at a time to handle them correctly
    while ((match = conditionalRegex.exec(result)) !== null) {
      const fullMatch = match[0];
      const capabilityName = match[1] ?? "";
      const innerContent = match[2] ?? "";

      // Check if there's a nested @if inside - if so, skip this one for now
      if (innerContent.includes("<!-- @if ")) {
        // This has nested conditionals, skip it and find a truly innermost one
        // by looking for a match that starts after this one
        const afterMatch = result.slice(match.index + 1);
        const innerMatch = conditionalRegex.exec(afterMatch);

        if (innerMatch && innerMatch[2] && !innerMatch[2].includes("<!-- @if ")) {
          // Found an innermost one, process it
          const actualIndex = match.index + 1 + innerMatch.index;
          const before = result.slice(0, actualIndex);
          const after = result.slice(actualIndex + innerMatch[0].length);

          const innerCapability = innerMatch[1] ?? "";
          const isEnabled = Boolean(capabilities[innerCapability]);
          const replacement = isEnabled ? (innerMatch[2] ?? "") : "";
          result = before + replacement + after;
          continue;
        }
        // No innermost found after, just process this one
      }

      // Check if capability is enabled
      const isEnabled = Boolean(capabilities[capabilityName]);

      // Replace the conditional block
      const replacement = isEnabled ? innerContent : "";
      result = result.slice(0, match.index) + replacement + result.slice(match.index + fullMatch.length);
    }

    return result;
  }

  /**
   * Validate the conditional structure to catch malformed conditionals.
   */
  private validateConditionalStructure(content: string, fileName?: string): void {
    const lines = content.split("\n");
    const stack: Array<{ capability: string; line: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const lineNumber = i + 1;

      // Check for @if markers
      const ifMatch = line.match(/<!-- @if\s+(\w+)\s*-->/);
      if (ifMatch && ifMatch[1]) {
        stack.push({ capability: ifMatch[1], line: lineNumber });
      }

      // Check for @endif markers
      const endifMatch = line.match(/<!-- @endif\s*-->/);
      if (endifMatch) {
        if (stack.length === 0) {
          throw new Error(
            this.formatError(
              `Unexpected @endif at line ${lineNumber}: no matching @if found`,
              fileName,
              lineNumber
            )
          );
        }
        stack.pop();
      }
    }

    // Check for unclosed conditionals
    if (stack.length > 0) {
      const unclosed = stack[stack.length - 1]!;
      throw new Error(
        this.formatError(
          `Unclosed conditional @if ${unclosed.capability} starting at line ${unclosed.line}: missing @endif`,
          fileName,
          unclosed.line
        )
      );
    }
  }

  /**
   * Generate a capabilities section listing enabled capabilities.
   */
  generateCapabilitiesSection(capabilities: AgentCapabilities): string {
    const enabledCapabilities: string[] = [];

    for (const [key, value] of Object.entries(capabilities)) {
      if (value && CAPABILITY_DESCRIPTIONS[key]) {
        enabledCapabilities.push(CAPABILITY_DESCRIPTIONS[key]);
      }
    }

    if (enabledCapabilities.length === 0) {
      return "## Capabilities\n\nNo special capabilities enabled.";
    }

    const capabilityList = enabledCapabilities.map((cap) => `- ${cap}`).join("\n");
    return `## Capabilities\n\nYou have access to the following capabilities:\n${capabilityList}`;
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

  /**
   * Format an error message with optional file name and line number.
   */
  private formatError(message: string, fileName?: string, lineNumber?: number): string {
    const parts: string[] = [];

    if (fileName) {
      parts.push(fileName);
    }
    if (lineNumber !== undefined) {
      parts.push(`line ${lineNumber}`);
    }

    if (parts.length > 0) {
      return `${parts.join(":")}: ${message}`;
    }
    return message;
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

/**
 * Generate a capabilities section for the given capabilities.
 * Convenience function for generating capability sections directly.
 */
export function generateCapabilitiesSection(capabilities: AgentCapabilities): string {
  const compiler = new PromptCompiler();
  return compiler.generateCapabilitiesSection(capabilities);
}
