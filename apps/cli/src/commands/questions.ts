// =============================================================================
// Question Commands
// =============================================================================

import chalk from "chalk";
import {
  answerQuestion,
  askQuestion,
  clearAnsweredQuestions,
  getActionResult,
  getQuestion,
  listQuestions,
  markActionExecuted,
  type Question,
  type QuestionAction,
  type QuestionType,
  waitForAnswer,
  watchQueue,
} from "../human-queue";
import type { TaskStatus } from "../task-schema";
import { findTask, loadTasks, saveTasks } from "../tasks";
import { getTasksFile } from "./context";

export async function cmdAsk(
  agentName: string,
  question: string,
  options: {
    taskId?: string;
    questionType?: QuestionType;
    choices?: string[];
    onYes?: string;
    onNo?: string;
    addNote?: boolean;
  } = {}
): Promise<void> {
  let action: QuestionAction | undefined;

  if (options.onYes || options.onNo) {
    action = {
      type: "set_status",
      onYes: options.onYes,
      onNo: options.onNo,
    };
  } else if (options.addNote) {
    action = {
      type: "add_note",
      payload: "Human response:",
    };
  }

  const id = await askQuestion(agentName, question, {
    taskId: options.taskId,
    choices: options.choices,
    questionType: options.questionType,
    action,
  });

  console.log(`${chalk.bold("Question ID:")} ${chalk.yellow(id)}`);
  console.log(`${chalk.bold("Agent")} ${chalk.cyan(`"${agentName}"`)} ${chalk.bold("asks:")} ${question}`);
  console.log(`${chalk.bold("Type:")} ${chalk.magenta(options.questionType || "auto-detected")}`);

  if (options.choices) {
    console.log(`${chalk.bold("Choices:")} ${options.choices.map((c) => chalk.cyan(c)).join(", ")}`);
  }

  if (action) {
    console.log(`${chalk.bold("Action:")} ${chalk.magenta(action.type)}`);
    if (action.onYes) console.log(`  ${chalk.green("On Yes:")} ${action.onYes}`);
    if (action.onNo) console.log(`  ${chalk.red("On No:")} ${action.onNo}`);
  }

  console.log(`\n${chalk.dim("To answer:")} ${chalk.cyan(`bloom answer ${id} "your response"`)}`);
}

export async function cmdAnswer(questionId: string, answer: string): Promise<void> {
  const q = await getQuestion(questionId);
  if (!q) {
    console.error(chalk.red(`Question not found: ${questionId}`));
    process.exit(1);
  }

  if (q.status === "answered") {
    console.error(chalk.red(`Question already answered: ${questionId}`));
    process.exit(1);
  }

  const success = await answerQuestion(questionId, answer);
  if (success) {
    console.log(`${chalk.green("Answered question")} ${chalk.yellow(questionId)}`);
    console.log(`${chalk.bold("Q:")} ${q.question}`);
    console.log(`${chalk.bold("A:")} ${chalk.green(answer)}`);
  } else {
    console.error(chalk.red("Failed to answer question"));
    process.exit(1);
  }
}

export async function cmdQuestions(showAll = false): Promise<void> {
  const questions = await listQuestions(showAll ? undefined : "pending");

  if (questions.length === 0) {
    console.log(chalk.dim(showAll ? "No questions in queue" : "No pending questions"));
    return;
  }

  console.log(chalk.bold(showAll ? "All Questions:" : "Pending Questions:\n"));

  for (const q of questions) {
    const time = chalk.gray(new Date(q.createdAt).toLocaleTimeString());
    const taskInfo = q.taskId ? chalk.dim(` [task: ${chalk.yellow(q.taskId)}]`) : "";
    const statusIcon = q.status === "pending" ? chalk.yellow("?") : chalk.green("✓");

    console.log(`${statusIcon} ${chalk.yellow(q.id)}`);
    console.log(`  ${chalk.bold("From:")} ${chalk.cyan(q.agentName)}${taskInfo} ${chalk.dim("at")} ${time}`);
    console.log(`  ${chalk.bold("Q:")} ${q.question}`);

    if (q.options && q.options.length > 0) {
      console.log(`  ${chalk.bold("Options:")}`);
      for (const [i, opt] of q.options.entries()) {
        console.log(`    ${chalk.cyan(`${i + 1}.`)} ${opt}`);
      }
    }

    if (q.status === "answered") {
      console.log(`  ${chalk.bold("A:")} ${chalk.green(q.answer)}`);
    } else {
      console.log(`  ${chalk.dim("Answer:")} ${chalk.cyan(`bloom answer ${q.id} "your response"`)}`);
    }
    console.log();
  }
}

export async function cmdWaitAnswer(questionId: string, timeoutSecs = 300): Promise<void> {
  const q = await getQuestion(questionId);
  if (!q) {
    console.error(chalk.red(`Question not found: ${questionId}`));
    process.exit(1);
  }

  if (q.status === "answered" && q.answer !== undefined) {
    console.log(q.answer);
    return;
  }

  console.error(chalk.dim(`Waiting for answer to: ${q.question}`));

  const answer = await waitForAnswer(questionId, timeoutSecs * 1000);

  if (answer !== null) {
    console.log(answer);
  } else {
    console.error(chalk.red("Timed out waiting for answer"));
    process.exit(1);
  }
}

export async function cmdClearAnswered(): Promise<void> {
  const count = await clearAnsweredQuestions();
  console.log(`${chalk.green("Cleared")} ${chalk.yellow(count)} ${chalk.green("answered question(s)")}`);
}

export async function cmdQuestionsDashboard(): Promise<void> {
  const select = (await import("@inquirer/select")).default;
  const input = (await import("@inquirer/input")).default;
  const confirm = (await import("@inquirer/confirm")).default;

  const executeAction = async (q: Question, answer: string) => {
    if (!q.action || !q.taskId) return;

    const result = getActionResult({ ...q, answer });
    if (!result.shouldExecute) return;

    try {
      const tasksFile = await loadTasks(getTasksFile());
      const task = findTask(tasksFile.tasks, q.taskId);
      if (!task) return;

      if (result.status) {
        const oldStatus = task.status;
        task.status = result.status as TaskStatus;
        await saveTasks(getTasksFile(), tasksFile);
        console.log(
          `${chalk.green("Action executed:")} ${chalk.yellow(q.taskId)}: ${chalk.gray(oldStatus)} ${chalk.dim("→")} ${chalk.green(result.status)}`
        );
        await markActionExecuted(q.id);
      }

      if (result.note) {
        task.ai_notes.push(result.note);
        await saveTasks(getTasksFile(), tasksFile);
        console.log(`${chalk.green("Note added to task:")} ${chalk.yellow(q.taskId)}`);
        await markActionExecuted(q.id);
      }
    } catch (err) {
      console.log(chalk.red(`Failed to execute action:`), err);
    }
  };

  const runLoop = async () => {
    while (true) {
      const questions = await listQuestions("pending");
      console.clear();

      console.log(chalk.cyan("══════════════════════════════════════════"));
      console.log(chalk.bold.cyan("  HUMAN QUESTIONS QUEUE"));
      console.log(chalk.cyan("══════════════════════════════════════════\n"));

      if (questions.length === 0) {
        console.log(chalk.dim("No pending questions - agents are working autonomously.\n"));
        console.log(chalk.dim("Waiting for questions from agents...\n"));

        await new Promise<void>((resolve) => {
          const unsubscribe = watchQueue((event) => {
            if (event.type === "question_added") {
              unsubscribe();
              resolve();
            }
          });
        });
        continue;
      }

      const choices = questions.map((q) => {
        const time = new Date(q.createdAt).toLocaleTimeString();
        const taskInfo = q.taskId ? ` [${q.taskId}]` : "";
        const typeIcon =
          q.questionType === "yes_no"
            ? chalk.green("◉")
            : q.questionType === "choice"
              ? chalk.blue("◈")
              : chalk.yellow("◇");
        return {
          name: `${typeIcon} ${chalk.dim("[")}${chalk.cyan(q.agentName)}${chalk.dim(`${taskInfo}]`)} ${q.question.slice(0, 55)}${q.question.length > 55 ? "..." : ""}`,
          value: q.id,
          description: `Asked at ${time}: ${q.question}`,
        };
      });

      choices.push({
        name: chalk.dim("↻ Refresh list"),
        value: "__refresh__",
        description: "Check for new questions",
      });

      try {
        const selectedId = await select({
          message: `${chalk.yellow(questions.length)} question(s) need your attention: ${chalk.dim("(")}${chalk.green("◉")}${chalk.dim("=yes/no")} ${chalk.blue("◈")}${chalk.dim("=choice")} ${chalk.yellow("◇")}${chalk.dim("=open)")}`,
          choices,
          pageSize: 10,
        });

        if (selectedId === "__refresh__") {
          continue;
        }

        const selectedQ = questions.find((q) => q.id === selectedId);
        if (!selectedQ) continue;

        console.log(chalk.dim("\n──────────────────────────────────────────"));
        console.log(`${chalk.bold("Agent:")} ${chalk.cyan(selectedQ.agentName)}`);
        if (selectedQ.taskId) console.log(`${chalk.bold("Task:")} ${chalk.yellow(selectedQ.taskId)}`);
        console.log(`${chalk.bold("Type:")} ${chalk.magenta(selectedQ.questionType || "open")}`);
        console.log(`\n${chalk.bold("Question:")} ${selectedQ.question}`);

        if (selectedQ.action && selectedQ.taskId) {
          console.log(`\n${chalk.bold("Auto-action:")}`);
          if (selectedQ.action.onYes) {
            console.log(`  ${chalk.green("Yes")} → set task status to "${chalk.green(selectedQ.action.onYes)}"`);
          }
          if (selectedQ.action.onNo) {
            console.log(`  ${chalk.red("No")} → set task status to "${chalk.red(selectedQ.action.onNo)}"`);
          }
          if (selectedQ.action.type === "add_note") {
            console.log(`  ${chalk.cyan("Answer will be added as note to task")}`);
          }
        }

        if (selectedQ.options && selectedQ.options.length > 0) {
          console.log(`\n${chalk.bold("Suggested options:")}`);
          for (const [i, opt] of selectedQ.options.entries()) {
            console.log(`  ${chalk.cyan(`${i + 1}.`)} ${opt}`);
          }
        }
        console.log(chalk.dim("──────────────────────────────────────────\n"));

        let answer: string;

        if (selectedQ.questionType === "yes_no") {
          const result = await confirm({
            message: "Your answer:",
            default: true,
          });
          answer = result ? "yes" : "no";
        } else if (selectedQ.questionType === "choice" && selectedQ.options && selectedQ.options.length > 0) {
          const choiceOptions = selectedQ.options.map((opt) => ({
            name: opt,
            value: opt,
          }));
          choiceOptions.push({ name: chalk.dim("Other (type custom answer)"), value: "__other__" });

          const selected = await select({
            message: "Your answer:",
            choices: choiceOptions,
          });

          if (selected === "__other__") {
            answer = await input({
              message: "Custom answer:",
              validate: (value) => value.trim().length > 0 || "Please provide an answer",
            });
          } else {
            answer = selected;
          }
        } else {
          answer = await input({
            message: "Your answer:",
            validate: (value) => value.trim().length > 0 || "Please provide an answer",
          });
        }

        await answerQuestion(selectedId, answer.trim());
        console.log(`\n${chalk.green("✓ Answer submitted!")}`);

        await executeAction(selectedQ, answer.trim());

        await Bun.sleep(1000);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "name" in err && err.name === "ExitPromptError") {
          console.log(chalk.dim("\nExiting questions dashboard..."));
          process.exit(0);
        }
        throw err;
      }
    }
  };

  await runLoop();
}
