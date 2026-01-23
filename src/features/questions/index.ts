// =============================================================================
// Questions Feature - Human question queue commands
// =============================================================================

import chalk from "chalk";
import type { Clerc } from "clerc";
import {
  answerQuestion,
  askQuestion,
  clearAnsweredQuestions,
  listQuestions,
  waitForAnswer,
} from "../../core/questions";

// =============================================================================
// Command Implementations
// =============================================================================

async function cmdListQuestions(showAll: boolean): Promise<void> {
  const questions = await listQuestions(showAll ? undefined : "pending");

  if (questions.length === 0) {
    console.log(chalk.dim(showAll ? "No questions found." : "No pending questions."));
    return;
  }

  console.log(chalk.bold(showAll ? "All Questions:" : "Pending Questions:"));
  for (const q of questions) {
    const statusIcon = q.status === "answered" ? chalk.green("✓") : chalk.yellow("?");
    const typeTag = q.questionType ? chalk.dim(`[${q.questionType}]`) : "";
    console.log(`\n${statusIcon} ${chalk.cyan(q.id)} ${typeTag}`);
    console.log(`  ${chalk.bold("From:")} ${chalk.magenta(q.agentName)}`);
    if (q.taskId) console.log(`  ${chalk.bold("Task:")} ${chalk.yellow(q.taskId)}`);
    console.log(`  ${chalk.bold("Question:")} ${q.question}`);
    if (q.status === "answered") {
      console.log(`  ${chalk.bold("Answer:")} ${chalk.green(q.answer)}`);
    }
  }
}

async function cmdAsk(agentName: string, questionText: string): Promise<void> {
  const id = await askQuestion(agentName, questionText);
  console.log(`${chalk.green("Question created:")} ${chalk.cyan(id)}`);
}

async function cmdAnswer(questionId: string, response: string): Promise<void> {
  const success = await answerQuestion(questionId, response);
  if (success) {
    console.log(`${chalk.green("Answer recorded for:")} ${chalk.cyan(questionId)}`);
  } else {
    console.error(chalk.red(`Question not found: ${questionId}`));
    process.exit(1);
  }
}

async function cmdWaitAnswer(questionId: string, timeoutMs: number): Promise<void> {
  console.log(chalk.dim(`Waiting for answer to ${questionId}...`));
  const answer = await waitForAnswer(questionId, timeoutMs);

  if (answer === null) {
    console.error(chalk.red("Timed out or question not found"));
    process.exit(1);
  }

  console.log(`${chalk.green("Answer:")} ${answer}`);
}

async function cmdClearAnswered(): Promise<void> {
  const count = await clearAnsweredQuestions();
  console.log(`${chalk.green("Cleared")} ${count} answered question(s)`);
}

// =============================================================================
// Completions
// =============================================================================

function getQuestionIdsSync(): string[] {
  const fs = require("node:fs");
  const path = require("node:path");

  const questionsDir = path.join(process.cwd(), ".questions");
  if (!fs.existsSync(questionsDir)) return [];

  try {
    return fs
      .readdirSync(questionsDir)
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

const questionIdCompletions = (complete: (value: string, description: string) => void) => {
  for (const id of getQuestionIdsSync()) {
    complete(id, "Question ID");
  }
};

// =============================================================================
// CLI Registration
// =============================================================================

export function register(cli: Clerc): Clerc {
  return cli
    .command("questions", "List pending questions from agents", {
      flags: {
        all: { type: Boolean, short: "a", description: "Show all questions including answered" },
      },
      help: { group: "questions" },
    })
    .on("questions", async (ctx) => {
      await cmdListQuestions(!!ctx.flags.all);
    })

    .command("ask", "Ask a question on behalf of an agent", {
      parameters: ["<agent>", "<question...>"],
      help: { group: "questions" },
    })
    .on("ask", async (ctx) => {
      const questionText = Array.isArray(ctx.parameters.question)
        ? (ctx.parameters.question as string[]).join(" ")
        : (ctx.parameters.question as string);
      await cmdAsk(ctx.parameters.agent as string, questionText);
    })

    .command("answer", "Answer a pending question", {
      parameters: [
        { key: "<questionId>", description: "Question ID", completions: { handler: questionIdCompletions } },
        "<response...>",
      ],
      help: { group: "questions" },
    })
    .on("answer", async (ctx) => {
      const response = Array.isArray(ctx.parameters.response)
        ? (ctx.parameters.response as string[]).join(" ")
        : (ctx.parameters.response as string);
      await cmdAnswer(ctx.parameters.questionId as string, response);
    })

    .command("wait-answer", "Wait for a question to be answered", {
      parameters: [
        { key: "<questionId>", description: "Question ID", completions: { handler: questionIdCompletions } },
        "[timeout]",
      ],
      help: { group: "questions" },
    })
    .on("wait-answer", async (ctx) => {
      const timeout = ctx.parameters.timeout ? parseInt(ctx.parameters.timeout as string, 10) * 1000 : 300000;
      await cmdWaitAnswer(ctx.parameters.questionId as string, timeout);
    })

    .command("clear-answered", "Clear all answered questions", {
      help: { group: "questions" },
    })
    .on("clear-answered", async () => {
      await cmdClearAnswered();
    });
}
