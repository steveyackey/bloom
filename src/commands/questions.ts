// =============================================================================
// Question Commands
// =============================================================================

import { ansi, semantic } from "../colors";
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

  console.log(`Question ID: ${id}`);
  console.log(`Agent "${agentName}" asks: ${question}`);
  console.log(`Type: ${options.questionType || "auto-detected"}`);

  if (options.choices) {
    console.log(`Choices: ${options.choices.join(", ")}`);
  }

  if (action) {
    console.log(`Action: ${action.type}`);
    if (action.onYes) console.log(`  On Yes: ${action.onYes}`);
    if (action.onNo) console.log(`  On No: ${action.onNo}`);
  }

  console.log(`\nTo answer: bloom answer ${id} "your response"`);
}

export async function cmdAnswer(questionId: string, answer: string): Promise<void> {
  const q = await getQuestion(questionId);
  if (!q) {
    console.error(`Question not found: ${questionId}`);
    process.exit(1);
  }

  if (q.status === "answered") {
    console.error(`Question already answered: ${questionId}`);
    process.exit(1);
  }

  const success = await answerQuestion(questionId, answer);
  if (success) {
    console.log(`Answered question ${questionId}`);
    console.log(`Q: ${q.question}`);
    console.log(`A: ${answer}`);
  } else {
    console.error("Failed to answer question");
    process.exit(1);
  }
}

export async function cmdQuestions(showAll = false): Promise<void> {
  const questions = await listQuestions(showAll ? undefined : "pending");

  if (questions.length === 0) {
    console.log(showAll ? "No questions in queue" : "No pending questions");
    return;
  }

  console.log(showAll ? "All Questions:" : "Pending Questions:\n");

  for (const q of questions) {
    const time = new Date(q.createdAt).toLocaleTimeString();
    const taskInfo = q.taskId ? ` [task: ${q.taskId}]` : "";
    const statusIcon = q.status === "pending" ? "?" : "✓";

    console.log(`${statusIcon} ${q.id}`);
    console.log(`  From: ${q.agentName}${taskInfo} at ${time}`);
    console.log(`  Q: ${q.question}`);

    if (q.options && q.options.length > 0) {
      console.log(`  Options:`);
      for (const [i, opt] of q.options.entries()) {
        console.log(`    ${i + 1}. ${opt}`);
      }
    }

    if (q.status === "answered") {
      console.log(`  A: ${q.answer}`);
    } else {
      console.log(`  Answer: bloom answer ${q.id} "your response"`);
    }
    console.log();
  }
}

export async function cmdWaitAnswer(questionId: string, timeoutSecs = 300): Promise<void> {
  const q = await getQuestion(questionId);
  if (!q) {
    console.error(`Question not found: ${questionId}`);
    process.exit(1);
  }

  if (q.status === "answered" && q.answer !== undefined) {
    console.log(q.answer);
    return;
  }

  console.error(`Waiting for answer to: ${q.question}`);

  const answer = await waitForAnswer(questionId, timeoutSecs * 1000);

  if (answer !== null) {
    console.log(answer);
  } else {
    console.error("Timed out waiting for answer");
    process.exit(1);
  }
}

export async function cmdClearAnswered(): Promise<void> {
  const count = await clearAnsweredQuestions();
  console.log(`Cleared ${count} answered question(s)`);
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
        console.log(`${semantic.success}Action executed:${ansi.reset} ${q.taskId}: ${oldStatus} → ${result.status}`);
        await markActionExecuted(q.id);
      }

      if (result.note) {
        task.ai_notes.push(result.note);
        await saveTasks(getTasksFile(), tasksFile);
        console.log(`${semantic.success}Note added to task:${ansi.reset} ${q.taskId}`);
        await markActionExecuted(q.id);
      }
    } catch (err) {
      console.log(`${semantic.error}Failed to execute action:${ansi.reset}`, err);
    }
  };

  const runLoop = async () => {
    while (true) {
      const questions = await listQuestions("pending");
      console.clear();

      console.log("══════════════════════════════════════════");
      console.log("  HUMAN QUESTIONS QUEUE");
      console.log("══════════════════════════════════════════\n");

      if (questions.length === 0) {
        console.log("No pending questions - agents are working autonomously.\n");
        console.log("Waiting for questions from agents...\n");

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
        const typeIcon = q.questionType === "yes_no" ? "◉" : q.questionType === "choice" ? "◈" : "◇";
        return {
          name: `${typeIcon} [${q.agentName}${taskInfo}] ${q.question.slice(0, 55)}${q.question.length > 55 ? "..." : ""}`,
          value: q.id,
          description: `Asked at ${time}: ${q.question}`,
        };
      });

      choices.push({
        name: "↻ Refresh list",
        value: "__refresh__",
        description: "Check for new questions",
      });

      try {
        const selectedId = await select({
          message: `${questions.length} question(s) need your attention: (◉=yes/no ◈=choice ◇=open)`,
          choices,
          pageSize: 10,
        });

        if (selectedId === "__refresh__") {
          continue;
        }

        const selectedQ = questions.find((q) => q.id === selectedId);
        if (!selectedQ) continue;

        console.log("\n──────────────────────────────────────────");
        console.log(`Agent: ${selectedQ.agentName}`);
        if (selectedQ.taskId) console.log(`Task: ${selectedQ.taskId}`);
        console.log(`Type: ${selectedQ.questionType || "open"}`);
        console.log(`\nQuestion: ${selectedQ.question}`);

        if (selectedQ.action && selectedQ.taskId) {
          console.log(`\n${semantic.info}Auto-action:${ansi.reset}`);
          if (selectedQ.action.onYes) {
            console.log(`  Yes → set task status to "${selectedQ.action.onYes}"`);
          }
          if (selectedQ.action.onNo) {
            console.log(`  No → set task status to "${selectedQ.action.onNo}"`);
          }
          if (selectedQ.action.type === "add_note") {
            console.log(`  Answer will be added as note to task`);
          }
        }

        if (selectedQ.options && selectedQ.options.length > 0) {
          console.log("\nSuggested options:");
          for (const [i, opt] of selectedQ.options.entries()) {
            console.log(`  ${i + 1}. ${opt}`);
          }
        }
        console.log("──────────────────────────────────────────\n");

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
          choiceOptions.push({ name: "Other (type custom answer)", value: "__other__" });

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
        console.log("\n✓ Answer submitted!");

        await executeAction(selectedQ, answer.trim());

        await Bun.sleep(1000);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "name" in err && err.name === "ExitPromptError") {
          console.log("\nExiting questions dashboard...");
          process.exit(0);
        }
        throw err;
      }
    }
  };

  await runLoop();
}
