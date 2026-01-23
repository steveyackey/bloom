// =============================================================================
// Clerc CLI Task Management Commands
// =============================================================================

import type { Clerc } from "clerc";

import { getAgentNamesSync, getTaskIdsSync, getTaskStatuses } from "../../completions/providers";
import type { TaskStatus } from "../../task-schema";
import { getTasksFile } from "../context";
import {
  cmdAssign,
  cmdDashboard,
  cmdList,
  cmdNext,
  cmdNote,
  cmdReset,
  cmdSetStatus,
  cmdShow,
  cmdValidate,
} from "../tasks";

// =============================================================================
// Completion Handlers
// =============================================================================

const taskIdCompletionHandler = (complete: (value: string, description: string) => void) => {
  const taskIds = getTaskIdsSync(getTasksFile());
  for (const id of taskIds) {
    complete(id, "Task ID");
  }
};

const agentCompletionHandler = (complete: (value: string, description: string) => void) => {
  const agents = getAgentNamesSync(getTasksFile());
  for (const agent of agents) {
    complete(agent, "Agent");
  }
};

const statusCompletionHandler = (complete: (value: string, description: string) => void) => {
  const statuses = getTaskStatuses();
  for (const status of statuses) {
    complete(status, "Task status");
  }
};

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register task management commands with a Clerc CLI instance.
 */
export function registerTaskCommands(cli: Clerc): Clerc {
  return (
    cli
      // list [status] - List tasks
      .command("list", "List tasks, optionally filtered by status", {
        parameters: [
          {
            key: "[status]",
            description: "Filter by status",
            completions: {
              handler: statusCompletionHandler,
            },
          },
        ],
        help: { group: "monitor" },
      })
      .on("list", async (ctx) => {
        const status = ctx.parameters.status as TaskStatus | undefined;
        await cmdList(status);
      })

      // show <taskid> - Show task details
      .command("show", "Show task details", {
        parameters: [
          {
            key: "<taskid>",
            description: "Task ID to show",
            completions: {
              handler: taskIdCompletionHandler,
            },
          },
        ],
        help: { group: "tasks" },
      })
      .on("show", async (ctx) => {
        await cmdShow(ctx.parameters.taskid as string);
      })

      // dashboard - Live dashboard
      .command("dashboard", "Live dashboard showing task progress", {
        help: { group: "monitor" },
      })
      .on("dashboard", async () => {
        await cmdDashboard();
      })

      // validate - Validate tasks file
      .command("validate", "Validate tasks file for errors", {
        help: { group: "monitor" },
      })
      .on("validate", async () => {
        await cmdValidate();
      })

      // Note: 'agents' command is registered in agents.ts as 'agent list' with alias 'agents'

      // next [agent] - Show available tasks
      .command("next", "Show available tasks (ready to start)", {
        parameters: [
          {
            key: "[agent]",
            description: "Filter by agent name",
            completions: {
              handler: agentCompletionHandler,
            },
          },
        ],
        help: { group: "tasks" },
      })
      .on("next", async (ctx) => {
        await cmdNext(ctx.parameters.agent as string | undefined);
      })

      // ready <taskid> - Mark task as ready
      .command("ready", "Mark task as ready for agent", {
        parameters: [
          {
            key: "<taskid>",
            description: "Task ID to mark ready",
            completions: {
              handler: taskIdCompletionHandler,
            },
          },
        ],
        help: { group: "tasks" },
      })
      .on("ready", async (ctx) => {
        await cmdSetStatus(ctx.parameters.taskid as string, "ready_for_agent");
      })

      // start <taskid> - Mark task as in progress
      .command("start", "Mark task as in progress", {
        parameters: [
          {
            key: "<taskid>",
            description: "Task ID to start",
            completions: {
              handler: taskIdCompletionHandler,
            },
          },
        ],
        help: { group: "tasks" },
      })
      .on("start", async (ctx) => {
        await cmdSetStatus(ctx.parameters.taskid as string, "in_progress");
      })

      // done <taskid> - Mark task as done
      .command("done", "Mark task as done", {
        parameters: [
          {
            key: "<taskid>",
            description: "Task ID to mark done",
            completions: {
              handler: taskIdCompletionHandler,
            },
          },
        ],
        help: { group: "tasks" },
      })
      .on("done", async (ctx) => {
        await cmdSetStatus(ctx.parameters.taskid as string, "done");
      })

      // block <taskid> - Mark task as blocked
      .command("block", "Mark task as blocked", {
        parameters: [
          {
            key: "<taskid>",
            description: "Task ID to mark blocked",
            completions: {
              handler: taskIdCompletionHandler,
            },
          },
        ],
        help: { group: "tasks" },
      })
      .on("block", async (ctx) => {
        await cmdSetStatus(ctx.parameters.taskid as string, "blocked");
      })

      // todo <taskid> - Mark task as todo
      .command("todo", "Mark task as todo", {
        parameters: [
          {
            key: "<taskid>",
            description: "Task ID to mark todo",
            completions: {
              handler: taskIdCompletionHandler,
            },
          },
        ],
        help: { group: "tasks" },
      })
      .on("todo", async (ctx) => {
        await cmdSetStatus(ctx.parameters.taskid as string, "todo");
      })

      // assign <taskid> <agent> - Assign task to agent
      .command("assign", "Assign task to an agent", {
        parameters: [
          {
            key: "<taskid>",
            description: "Task ID to assign",
            completions: {
              handler: taskIdCompletionHandler,
            },
          },
          {
            key: "<agent>",
            description: "Agent name to assign to",
            completions: {
              handler: agentCompletionHandler,
            },
          },
        ],
        help: { group: "tasks" },
      })
      .on("assign", async (ctx) => {
        await cmdAssign(ctx.parameters.taskid as string, ctx.parameters.agent as string);
      })

      // note <taskid> <note> - Add note to task
      .command("note", "Add a note to a task", {
        parameters: [
          {
            key: "<taskid>",
            description: "Task ID to add note to",
            completions: {
              handler: taskIdCompletionHandler,
            },
          },
          {
            key: "<note...>",
            description: "Note text to add",
          },
        ],
        help: { group: "tasks" },
      })
      .on("note", async (ctx) => {
        // Handle variadic note argument - join all parts
        const noteText = Array.isArray(ctx.parameters.note)
          ? (ctx.parameters.note as string[]).join(" ")
          : (ctx.parameters.note as string);
        await cmdNote(ctx.parameters.taskid as string, noteText);
      })

      // reset <taskid|--stuck> - Reset task(s)
      .command("reset", "Reset task to ready_for_agent, or use --stuck to reset all stuck tasks", {
        parameters: [
          {
            key: "[taskid]",
            description: "Task ID to reset",
            completions: {
              handler: taskIdCompletionHandler,
            },
          },
        ],
        flags: {
          stuck: {
            type: Boolean,
            short: "s",
            description: "Reset all stuck (in_progress or blocked) tasks",
          },
        },
        help: { group: "tasks" },
      })
      .on("reset", async (ctx) => {
        // If --stuck flag is provided, reset all stuck tasks
        if (ctx.flags.stuck) {
          await cmdReset("--stuck");
        } else if (ctx.parameters.taskid) {
          await cmdReset(ctx.parameters.taskid as string);
        } else {
          console.error("Error: Either provide a task ID or use --stuck flag");
          process.exit(1);
        }
      })
  );
}
