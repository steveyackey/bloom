// =============================================================================
// Question Commands for Clerc CLI
// =============================================================================

import { type Clerc, Types } from "clerc";

import { getAgentNames, getQuestionIds } from "../../completions/providers";
import type { QuestionType } from "../../human-queue";
import { getTasksFile } from "../context";
import { cmdAnswer, cmdAsk, cmdClearAnswered, cmdQuestions, cmdQuestionsDashboard, cmdWaitAnswer } from "../questions";

// =============================================================================
// Constants
// =============================================================================

const QUESTION_TYPES = ["yes_no", "open", "choice"] as const;

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register question commands with a Clerc CLI instance.
 */
export function registerQuestionCommands(cli: Clerc): Clerc {
  return cli
    .command("questions", "List pending questions from agents", {
      alias: "qs",
      flags: {
        all: {
          description: "Show all questions including answered ones",
          type: Boolean,
          alias: "a",
        },
      },
    })
    .on("questions", async (ctx) => {
      await cmdQuestions(ctx.flags.all ?? false);
    })
    .command("questions-dashboard", "Interactive dashboard for answering questions", {
      alias: "qd",
    })
    .on("questions-dashboard", async () => {
      await cmdQuestionsDashboard();
    })
    .command("ask", "Ask a question to be answered by a human", {
      parameters: [
        {
          key: "<agent>",
          description: "Name of the agent asking the question",
          completions: {
            handler: async (complete) => {
              const names = await getAgentNames(getTasksFile());
              for (const name of names) {
                complete(name, "Agent name");
              }
            },
          },
        },
        {
          key: "<question>",
          description: "The question to ask",
        },
      ],
      flags: {
        task: {
          description: "Associate with a task ID",
          type: String,
          alias: "t",
        },
        type: {
          description: "Question type: yes_no, open, choice",
          type: Types.Enum(...QUESTION_TYPES),
        },
        choices: {
          description: "Comma-separated choices for choice questions",
          type: String,
          alias: "c",
        },
        "on-yes": {
          description: "Status to set when answered yes (yes_no questions)",
          type: String,
        },
        "on-no": {
          description: "Status to set when answered no (yes_no questions)",
          type: String,
        },
        "add-note": {
          description: "Add answer as a note to the task",
          type: Boolean,
        },
      },
    })
    .on("ask", async (ctx) => {
      const agent = ctx.parameters.agent as string;
      const question = ctx.parameters.question as string;

      const choices = ctx.flags.choices ? (ctx.flags.choices as string).split(",").map((s) => s.trim()) : undefined;

      await cmdAsk(agent, question, {
        taskId: ctx.flags.task as string | undefined,
        questionType: ctx.flags.type as QuestionType | undefined,
        choices,
        onYes: ctx.flags["on-yes"] as string | undefined,
        onNo: ctx.flags["on-no"] as string | undefined,
        addNote: ctx.flags["add-note"] as boolean | undefined,
      });
    })
    .command("answer", "Answer a pending question", {
      parameters: [
        {
          key: "<questionId>",
          description: "ID of the question to answer",
          completions: {
            handler: async (complete) => {
              const ids = await getQuestionIds(getTasksFile());
              for (const id of ids) {
                complete(id, "Question ID");
              }
            },
          },
        },
        {
          key: "<response>",
          description: "The answer to provide",
        },
      ],
    })
    .on("answer", async (ctx) => {
      const questionId = ctx.parameters.questionId as string;
      const response = ctx.parameters.response as string;
      await cmdAnswer(questionId, response);
    })
    .command("wait-answer", "Wait for a question to be answered", {
      parameters: [
        {
          key: "<questionId>",
          description: "ID of the question to wait for",
          completions: {
            handler: async (complete) => {
              const ids = await getQuestionIds(getTasksFile());
              for (const id of ids) {
                complete(id, "Question ID");
              }
            },
          },
        },
        {
          key: "[timeout]",
          description: "Timeout in seconds (default: 300)",
          type: Number,
        },
      ],
    })
    .on("wait-answer", async (ctx) => {
      const questionId = ctx.parameters.questionId as string;
      const timeout = (ctx.parameters.timeout as number) || 300;
      await cmdWaitAnswer(questionId, timeout);
    })
    .command("clear-answered", "Clear all answered questions from the queue", {})
    .on("clear-answered", async () => {
      await cmdClearAnswered();
    });
}
