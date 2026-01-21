// =============================================================================
// Human Question Queue - File-based queue for agent-human interaction
// =============================================================================

import { existsSync, type FSWatcher, mkdirSync, readdirSync, unlinkSync, watch } from "node:fs";
import { dirname, join } from "node:path";
import { getTasksFile } from "./commands/context";
import { createLogger } from "./logger";

const logger = createLogger("human-queue");

// =============================================================================
// Types
// =============================================================================

export type QuestionType = "yes_no" | "open" | "choice";

export interface QuestionAction {
  type: "set_status" | "add_note" | "custom";
  payload?: string;
  onYes?: string;
  onNo?: string;
}

export interface Question {
  id: string;
  agentName: string;
  taskId?: string;
  question: string;
  questionType?: QuestionType;
  options?: string[];
  action?: QuestionAction;
  createdAt: string;
  status: "pending" | "answered";
  answer?: string;
  answeredAt?: string;
  actionExecuted?: boolean;
}

export interface Interjection {
  id: string;
  agentName: string;
  taskId?: string;
  sessionId?: string;
  workingDirectory: string;
  reason?: string;
  createdAt: string;
  status: "pending" | "resumed" | "dismissed";
  resumedAt?: string;
}

// =============================================================================
// Constants & Helpers
// =============================================================================

// Store questions/interjections alongside the tasks file
function getQueueDir(): string {
  return join(dirname(getTasksFile()), ".questions");
}

function getInterjectDir(): string {
  return join(dirname(getTasksFile()), ".interjections");
}

const YES_ANSWERS = new Set([
  "yes",
  "y",
  "yeah",
  "yep",
  "sure",
  "ok",
  "okay",
  "approve",
  "approved",
  "confirm",
  "confirmed",
  "true",
  "1",
]);
const NO_ANSWERS = new Set(["no", "n", "nope", "nah", "reject", "rejected", "deny", "denied", "false", "0"]);

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await Bun.file(path).text());
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await Bun.write(path, JSON.stringify(data, null, 2));
}

async function listJsonFiles<T>(dir: string, filter?: (item: T) => boolean): Promise<T[]> {
  ensureDir(dir);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const items: T[] = [];

  for (const file of files) {
    try {
      const item = await readJson<T>(join(dir, file));
      if (item && (!filter || filter(item))) items.push(item);
    } catch {
      /* skip invalid files */
    }
  }

  return items;
}

// =============================================================================
// Question Operations
// =============================================================================

function getQuestionPath(id: string): string {
  return join(getQueueDir(), `${id}.json`);
}

function detectQuestionType(question: string, hasChoices: boolean): QuestionType {
  if (hasChoices) return "choice";

  const lower = question.toLowerCase();
  const isYesNo =
    lower.includes("yes or no") ||
    lower.includes("yes/no") ||
    (lower.endsWith("?") &&
      (lower.includes("should i") ||
        lower.includes("do you want") ||
        lower.includes("is this") ||
        lower.includes("can i") ||
        lower.includes("ready to")));

  return isYesNo ? "yes_no" : "open";
}

export async function askQuestion(
  agentName: string,
  question: string,
  options?: {
    taskId?: string;
    choices?: string[];
    questionType?: QuestionType;
    action?: QuestionAction;
  }
): Promise<string> {
  ensureDir(getQueueDir());

  const id = generateId("q");
  const questionType = options?.questionType ?? detectQuestionType(question, !!options?.choices?.length);

  const q: Question = {
    id,
    agentName,
    taskId: options?.taskId,
    question,
    questionType,
    options: options?.choices,
    action: options?.action,
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  await writeJson(getQuestionPath(id), q);
  logger.info(`Question created: ${id} from ${agentName} (type: ${questionType})`);
  return id;
}

export async function answerQuestion(id: string, answer: string): Promise<boolean> {
  const path = getQuestionPath(id);
  const q = await readJson<Question>(path);

  if (!q) {
    logger.error(`Question not found: ${id}`);
    return false;
  }

  q.status = "answered";
  q.answer = answer;
  q.answeredAt = new Date().toISOString();

  await writeJson(path, q);
  logger.info(`Question answered: ${id}`);
  return true;
}

export async function getQuestion(id: string): Promise<Question | null> {
  return readJson<Question>(getQuestionPath(id));
}

export async function listQuestions(status?: "pending" | "answered"): Promise<Question[]> {
  const questions = await listJsonFiles<Question>(getQueueDir(), status ? (q) => q.status === status : undefined);
  return questions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function deleteQuestion(id: string): Promise<boolean> {
  const path = getQuestionPath(id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  logger.info(`Question deleted: ${id}`);
  return true;
}

export async function clearAnsweredQuestions(): Promise<number> {
  const answered = await listQuestions("answered");
  let count = 0;
  for (const q of answered) {
    if (await deleteQuestion(q.id)) count++;
  }
  return count;
}

// =============================================================================
// Queue Watching
// =============================================================================

export type QueueEventType = "question_added" | "question_answered" | "question_deleted";

export interface QueueEvent {
  type: QueueEventType;
  questionId: string;
  question?: Question;
}

export type QueueEventHandler = (event: QueueEvent) => void;

let activeWatcher: FSWatcher | null = null;
const eventHandlers = new Set<QueueEventHandler>();

export function watchQueue(handler: QueueEventHandler): () => void {
  ensureDir(getQueueDir());
  eventHandlers.add(handler);

  if (!activeWatcher) {
    activeWatcher = watch(getQueueDir(), async (_, filename) => {
      if (!filename?.endsWith(".json")) return;

      const questionId = filename.replace(".json", "");
      const q = await readJson<Question>(getQuestionPath(questionId));

      const event: QueueEvent = q
        ? { type: q.status === "answered" ? "question_answered" : "question_added", questionId, question: q }
        : { type: "question_deleted", questionId };

      for (const h of eventHandlers) {
        try {
          h(event);
        } catch (err) {
          logger.error("Error in queue event handler:", err);
        }
      }
    });
  }

  return () => {
    eventHandlers.delete(handler);
    if (eventHandlers.size === 0 && activeWatcher) {
      activeWatcher.close();
      activeWatcher = null;
    }
  };
}

export async function waitForAnswer(id: string, timeoutMs = 300000): Promise<string | null> {
  const existing = await getQuestion(id);
  if (!existing) {
    logger.error(`Question ${id} not found`);
    return null;
  }
  if (existing.status === "answered" && existing.answer !== undefined) {
    return existing.answer;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      logger.warn(`Question ${id} timed out waiting for answer`);
      resolve(null);
    }, timeoutMs);

    const unsubscribe = watchQueue((event) => {
      if (event.questionId !== id) return;

      if (event.type === "question_answered" && event.question?.answer !== undefined) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event.question.answer);
      } else if (event.type === "question_deleted") {
        clearTimeout(timeout);
        unsubscribe();
        logger.error(`Question ${id} was deleted while waiting`);
        resolve(null);
      }
    });
  });
}

// =============================================================================
// Interjection Operations
// =============================================================================

function getInterjectionPath(id: string): string {
  return join(getInterjectDir(), `${id}.json`);
}

export async function createInterjection(
  agentName: string,
  options: { taskId?: string; sessionId?: string; workingDirectory: string; reason?: string }
): Promise<string> {
  ensureDir(getInterjectDir());

  const id = generateId("i");
  const interjection: Interjection = {
    id,
    agentName,
    ...options,
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  await writeJson(getInterjectionPath(id), interjection);
  logger.info(`Interjection created: ${id} for ${agentName}`);
  return id;
}

export async function getInterjection(id: string): Promise<Interjection | null> {
  return readJson<Interjection>(getInterjectionPath(id));
}

export async function listInterjections(status?: "pending" | "resumed" | "dismissed"): Promise<Interjection[]> {
  const interjections = await listJsonFiles<Interjection>(
    getInterjectDir(),
    status ? (i) => i.status === status : undefined
  );
  return interjections.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function markInterjectionResumed(id: string): Promise<boolean> {
  const path = getInterjectionPath(id);
  const i = await readJson<Interjection>(path);

  if (!i) return false;

  i.status = "resumed";
  i.resumedAt = new Date().toISOString();

  await writeJson(path, i);
  logger.info(`Interjection resumed: ${id}`);
  return true;
}

export async function dismissInterjection(id: string): Promise<boolean> {
  const path = getInterjectionPath(id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  logger.info(`Interjection dismissed: ${id}`);
  return true;
}

// =============================================================================
// Answer Helpers
// =============================================================================

export function isYesAnswer(answer: string): boolean {
  return YES_ANSWERS.has(answer.toLowerCase().trim());
}

export function isNoAnswer(answer: string): boolean {
  return NO_ANSWERS.has(answer.toLowerCase().trim());
}

export function getActionResult(question: Question): { shouldExecute: boolean; status?: string; note?: string } {
  if (!question.action || !question.answer) {
    return { shouldExecute: false };
  }

  const { action, answer, questionType } = question;

  if (questionType === "yes_no") {
    if (isYesAnswer(answer)) return { shouldExecute: true, status: action.onYes };
    if (isNoAnswer(answer)) return { shouldExecute: true, status: action.onNo };
    return { shouldExecute: false };
  }

  if (action.type === "add_note") {
    return { shouldExecute: true, note: `${action.payload || "Human response:"} ${answer}` };
  }

  return { shouldExecute: false };
}

export async function markActionExecuted(id: string): Promise<boolean> {
  const path = getQuestionPath(id);
  const q = await readJson<Question>(path);

  if (!q) return false;

  q.actionExecuted = true;
  await writeJson(path, q);
  logger.info(`Question action executed: ${id}`);
  return true;
}
