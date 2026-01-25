// =============================================================================
// Prompt Commands for Clerc CLI
// =============================================================================

import chalk from "chalk";
import { type Clerc, Types } from "clerc";

import { getRegisteredAgentNames, isValidAgentName } from "../agents/capabilities";
import { getTasksFile } from "../commands/context";
import { type CompileOptions, PromptCompiler } from "../prompts/compiler";
import { findTask, loadTasks } from "../tasks";

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
    .command("prompt compile", "Compile and display a prompt with task context", {
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
        prompt: {
          description: "Prompt file name to compile (default: agent-system)",
          type: String,
          alias: "p",
        },
      },
      help: { group: "system" },
    })
    .on("prompt compile", async (ctx) => {
      const agent = ctx.parameters.agent as string;
      const { task, prompt: promptFile } = ctx.flags as {
        task?: string;
        prompt?: string;
      };

      // Validate agent name
      if (!isValidAgentName(agent)) {
        console.error(`${chalk.red("Error:")} Invalid agent name "${agent}". Valid agents: ${AGENT_NAMES.join(", ")}`);
        process.exit(1);
      }

      try {
        await showCompiledPrompt(agent, promptFile || "agent-system", task);
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
async function showCompiledPrompt(agentName: string, promptFile: string, taskId?: string): Promise<void> {
  const compileOptions = await buildCompileOptions(agentName, taskId);
  const compiler = new PromptCompiler();
  const compiled = await compiler.loadAndCompile(promptFile, compileOptions);
  console.log(compiled);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build compile options with optional task context.
 */
async function buildCompileOptions(agentName: string, taskId?: string): Promise<CompileOptions> {
  const options: CompileOptions = {
    variables: {
      AGENT_NAME: agentName,
    },
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
          ...options.variables,
          TASK_CLI: `bloom -f "${tasksFile}"`,
          AGENT_NAME: task.agent_name || agentName,
        };
      }
    } catch {
      // Task file not available, continue without task context
    }
  }

  return options;
}
