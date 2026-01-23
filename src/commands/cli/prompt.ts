// =============================================================================
// Prompt Commands for Clerc CLI
// =============================================================================

import chalk from "chalk";
import { type Clerc, Types } from "clerc";

import {
  type AgentCapabilities,
  getAgentCapabilities,
  getRegisteredAgentNames,
  isValidAgentName,
} from "../../agents/capabilities";
import { PromptCompiler, type CompileOptions } from "../../prompts/compiler";
import { findTask, loadTasks } from "../../tasks";
import { getTasksFile } from "../context";

// =============================================================================
// Types
// =============================================================================

interface SectionInfo {
  name: string;
  included: boolean;
  reason: string;
}

interface CompileResult {
  compiled: string;
  sections: SectionInfo[];
}

// =============================================================================
// Constants
// =============================================================================

const AGENT_NAMES = getRegisteredAgentNames();

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register prompt commands with a Clerc CLI instance.
 */
export function registerPromptCommands(cli: Clerc): Clerc {
  return cli
    .command("prompt compile", "Compile and display a prompt for an agent", {
      parameters: [
        {
          key: "<agent>",
          description: "Agent name to compile prompt for",
          type: Types.Enum(...AGENT_NAMES),
          completions: {
            handler: (complete) => {
              for (const agent of AGENT_NAMES) {
                complete(agent, `Compile prompt for ${agent} agent`);
              }
            },
          },
        },
      ],
      flags: {
        task: {
          description: "Task ID to inject context for",
          type: String,
          alias: "t",
        },
        verbose: {
          description: "Show which sections were included/excluded and why",
          type: Boolean,
        },
        diff: {
          description: "Compare with another agent (show diff)",
          type: String,
          alias: "d",
        },
        prompt: {
          description: "Prompt file name to compile (default: workflow)",
          type: String,
          alias: "p",
        },
      },
      help: { group: "system" },
    })
    .on("prompt compile", async (ctx) => {
      const agent = ctx.parameters.agent as string;
      const { task, verbose, diff, prompt: promptFile } = ctx.flags as {
        task?: string;
        verbose?: boolean;
        diff?: string;
        prompt?: string;
      };

      // Validate agent name
      if (!isValidAgentName(agent)) {
        console.error(
          chalk.red("Error:") +
            ` Invalid agent name "${agent}". Valid agents: ${AGENT_NAMES.join(", ")}`
        );
        process.exit(1);
      }

      // Validate diff agent if provided
      if (diff && !isValidAgentName(diff)) {
        console.error(
          chalk.red("Error:") +
            ` Invalid diff agent name "${diff}". Valid agents: ${AGENT_NAMES.join(", ")}`
        );
        process.exit(1);
      }

      try {
        if (diff) {
          await showDiff(agent, diff, promptFile || "workflow", task, verbose);
        } else {
          await showCompiledPrompt(agent, promptFile || "workflow", task, verbose);
        }
      } catch (error) {
        console.error(chalk.red("Error:"), (error as Error).message);
        process.exit(1);
      }
    });
}

// =============================================================================
// Command Handlers
// =============================================================================

/**
 * Show the compiled prompt for a specific agent.
 */
async function showCompiledPrompt(
  agentName: string,
  promptFile: string,
  taskId?: string,
  verbose?: boolean
): Promise<void> {
  const capabilities = getAgentCapabilities(agentName);
  if (!capabilities) {
    throw new Error(`Agent "${agentName}" not found in capability registry`);
  }

  const compileOptions = await buildCompileOptions(capabilities, taskId);
  const compiler = new PromptCompiler();

  if (verbose) {
    const result = await compileWithSectionInfo(compiler, promptFile, compileOptions, capabilities);
    printVerboseOutput(agentName, result);
  } else {
    const compiled = await compiler.loadAndCompile(promptFile, compileOptions);
    console.log(compiled);
  }
}

/**
 * Show diff between two agents' compiled prompts.
 */
async function showDiff(
  agent1: string,
  agent2: string,
  promptFile: string,
  taskId?: string,
  verbose?: boolean
): Promise<void> {
  const caps1 = getAgentCapabilities(agent1);
  const caps2 = getAgentCapabilities(agent2);

  if (!caps1) throw new Error(`Agent "${agent1}" not found`);
  if (!caps2) throw new Error(`Agent "${agent2}" not found`);

  const compiler = new PromptCompiler();
  const opts1 = await buildCompileOptions(caps1, taskId);
  const opts2 = await buildCompileOptions(caps2, taskId);

  const compiled1 = await compiler.loadAndCompile(promptFile, opts1);
  const compiled2 = await compiler.loadAndCompile(promptFile, opts2);

  if (verbose) {
    const result1 = await compileWithSectionInfo(compiler, promptFile, opts1, caps1);
    const result2 = await compileWithSectionInfo(compiler, promptFile, opts2, caps2);
    printCapabilityComparison(agent1, agent2, result1.sections, result2.sections);
    console.log();
  }

  printDiff(agent1, agent2, compiled1, compiled2);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build compile options with optional task context.
 */
async function buildCompileOptions(
  capabilities: AgentCapabilities,
  taskId?: string
): Promise<CompileOptions> {
  const options: CompileOptions = {
    capabilities: capabilities as AgentCapabilities,
  };

  if (taskId) {
    try {
      const tasksFile = getTasksFile();
      const tasksData = await loadTasks(tasksFile);
      const task = findTask(tasksData.tasks, taskId);

      if (task) {
        options.task = {
          id: task.id,
          title: task.title,
          branch: task.branch || "",
          tasksFile,
        };
        options.variables = {
          TASK_CLI: `bloom -f "${tasksFile}"`,
          AGENT_NAME: task.agent_name || "agent",
        };
      }
    } catch {
      // Task file not available, continue without task context
    }
  }

  return options;
}

/**
 * Compile a prompt and track which sections were included/excluded.
 */
async function compileWithSectionInfo(
  compiler: PromptCompiler,
  promptFile: string,
  options: CompileOptions,
  capabilities: AgentCapabilities
): Promise<CompileResult> {
  const compiled = await compiler.loadAndCompile(promptFile, options);

  // Extract section info from capabilities
  const sections: SectionInfo[] = [];
  const capabilityKeys = Object.keys(capabilities) as (keyof AgentCapabilities)[];

  for (const key of capabilityKeys) {
    if (key === "specialInstructions" || key === "maxPromptLength") continue;

    const value = capabilities[key];
    const capName = String(key);

    // Only track boolean capabilities used in conditionals
    if (typeof value === "boolean") {
      sections.push({
        name: capName,
        included: value,
        reason: value ? "Capability enabled for this agent" : "Capability disabled for this agent",
      });
    }
  }

  return { compiled, sections };
}

/**
 * Print verbose output showing sections included/excluded.
 */
function printVerboseOutput(agentName: string, result: CompileResult): void {
  console.log(chalk.bold.cyan(`\n═══ Prompt Compilation for ${agentName} ═══\n`));

  // Group sections by included/excluded
  const included = result.sections.filter((s) => s.included);
  const excluded = result.sections.filter((s) => !s.included);

  if (included.length > 0) {
    console.log(chalk.green.bold("✓ Included Sections:"));
    for (const section of included) {
      console.log(chalk.green(`  • ${formatCapabilityName(section.name)}`));
      console.log(chalk.dim(`    ${section.reason}`));
    }
    console.log();
  }

  if (excluded.length > 0) {
    console.log(chalk.red.bold("✗ Excluded Sections:"));
    for (const section of excluded) {
      console.log(chalk.red(`  • ${formatCapabilityName(section.name)}`));
      console.log(chalk.dim(`    ${section.reason}`));
    }
    console.log();
  }

  console.log(chalk.bold.cyan("═══ Compiled Prompt ═══\n"));
  console.log(result.compiled);
}

/**
 * Print capability comparison between two agents.
 */
function printCapabilityComparison(
  agent1: string,
  agent2: string,
  sections1: SectionInfo[],
  sections2: SectionInfo[]
): void {
  console.log(chalk.bold.cyan(`\n═══ Capability Comparison: ${agent1} vs ${agent2} ═══\n`));

  const allNames = new Set([...sections1.map((s) => s.name), ...sections2.map((s) => s.name)]);

  const differences: string[] = [];
  const same: string[] = [];

  for (const name of allNames) {
    const s1 = sections1.find((s) => s.name === name);
    const s2 = sections2.find((s) => s.name === name);

    const v1 = s1?.included ?? false;
    const v2 = s2?.included ?? false;

    const formattedName = formatCapabilityName(name);

    if (v1 !== v2) {
      const status1 = v1 ? chalk.green("✓") : chalk.red("✗");
      const status2 = v2 ? chalk.green("✓") : chalk.red("✗");
      differences.push(`  ${formattedName}: ${status1} ${agent1} | ${status2} ${agent2}`);
    } else {
      const status = v1 ? chalk.green("✓") : chalk.red("✗");
      same.push(`  ${formattedName}: ${status} (both)`);
    }
  }

  if (differences.length > 0) {
    console.log(chalk.yellow.bold("Differences:"));
    for (const diff of differences) {
      console.log(diff);
    }
  }

  if (same.length > 0 && differences.length > 0) {
    console.log();
    console.log(chalk.dim.bold("Same:"));
    for (const s of same) {
      console.log(chalk.dim(s));
    }
  }
}

/**
 * Print diff between two compiled prompts.
 */
function printDiff(agent1: string, agent2: string, prompt1: string, prompt2: string): void {
  if (prompt1 === prompt2) {
    console.log(chalk.green("Prompts are identical."));
    return;
  }

  console.log(chalk.bold.cyan(`\n═══ Prompt Diff: ${agent1} vs ${agent2} ═══\n`));

  const lines1 = prompt1.split("\n");
  const lines2 = prompt2.split("\n");

  // Simple line-by-line diff
  const maxLines = Math.max(lines1.length, lines2.length);

  let inDiff = false;
  let diffStart = -1;

  for (let i = 0; i < maxLines; i++) {
    const line1 = lines1[i];
    const line2 = lines2[i];

    if (line1 !== line2) {
      if (!inDiff) {
        inDiff = true;
        diffStart = i + 1;
        console.log(chalk.yellow(`--- Line ${diffStart} ---`));
      }

      if (line1 !== undefined && line2 === undefined) {
        console.log(chalk.red(`- [${agent1}] ${line1}`));
      } else if (line1 === undefined && line2 !== undefined) {
        console.log(chalk.green(`+ [${agent2}] ${line2}`));
      } else {
        console.log(chalk.red(`- [${agent1}] ${line1}`));
        console.log(chalk.green(`+ [${agent2}] ${line2}`));
      }
    } else if (inDiff) {
      inDiff = false;
      console.log();
    }
  }

  // Summary statistics
  console.log();
  console.log(chalk.bold("Summary:"));
  console.log(`  ${agent1}: ${lines1.length} lines`);
  console.log(`  ${agent2}: ${lines2.length} lines`);

  const onlyIn1 = lines1.filter((l) => !lines2.includes(l)).length;
  const onlyIn2 = lines2.filter((l) => !lines1.includes(l)).length;

  if (onlyIn1 > 0) {
    console.log(chalk.red(`  Lines only in ${agent1}: ~${onlyIn1}`));
  }
  if (onlyIn2 > 0) {
    console.log(chalk.green(`  Lines only in ${agent2}: ~${onlyIn2}`));
  }
}

/**
 * Format a capability name for display.
 */
function formatCapabilityName(name: string): string {
  // Remove 'supports' prefix and convert to readable format
  const cleaned = name.replace(/^supports/, "");
  // Add spaces before capitals
  return cleaned.replace(/([A-Z])/g, " $1").trim();
}
