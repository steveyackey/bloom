// =============================================================================
// Human Question Queue - File-based queue for agent-human interaction
// =============================================================================

import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { createLogger } from "./logger";

const logger = createLogger("human-queue");

export interface Question {
  id: string;
  agentName: string;
  taskId?: string;
  question: string;
  options?: string[];  // Optional multiple choice
  createdAt: string;
  status: "pending" | "answered";
  answer?: string;
  answeredAt?: string;
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

// Queue directories - stored alongside tasks
const BLOOM_DIR = resolve(import.meta.dirname ?? ".");
const QUEUE_DIR = join(BLOOM_DIR, ".questions");
const INTERJECT_DIR = join(BLOOM_DIR, ".interjections");

function ensureQueueDir(): void {
  if (!existsSync(QUEUE_DIR)) {
    mkdirSync(QUEUE_DIR, { recursive: true });
  }
}

function generateId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getQuestionPath(id: string): string {
  return join(QUEUE_DIR, `${id}.json`);
}

// =============================================================================
// Queue Operations
// =============================================================================

export async function askQuestion(
  agentName: string,
  question: string,
  options?: {
    taskId?: string;
    choices?: string[];
  }
): Promise<string> {
  ensureQueueDir();

  const id = generateId();
  const q: Question = {
    id,
    agentName,
    taskId: options?.taskId,
    question,
    options: options?.choices,
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  await Bun.write(getQuestionPath(id), JSON.stringify(q, null, 2));
  logger.info(`Question created: ${id} from ${agentName}`);

  return id;
}

export async function answerQuestion(id: string, answer: string): Promise<boolean> {
  const path = getQuestionPath(id);

  if (!existsSync(path)) {
    logger.error(`Question not found: ${id}`);
    return false;
  }

  const content = await Bun.file(path).text();
  const q: Question = JSON.parse(content);

  q.status = "answered";
  q.answer = answer;
  q.answeredAt = new Date().toISOString();

  await Bun.write(path, JSON.stringify(q, null, 2));
  logger.info(`Question answered: ${id}`);

  return true;
}

export async function getQuestion(id: string): Promise<Question | null> {
  const path = getQuestionPath(id);

  if (!existsSync(path)) {
    return null;
  }

  const content = await Bun.file(path).text();
  return JSON.parse(content);
}

export async function listQuestions(status?: "pending" | "answered"): Promise<Question[]> {
  ensureQueueDir();

  const files = readdirSync(QUEUE_DIR).filter(f => f.endsWith(".json"));
  const questions: Question[] = [];

  for (const file of files) {
    try {
      const content = await Bun.file(join(QUEUE_DIR, file)).text();
      const q: Question = JSON.parse(content);
      if (!status || q.status === status) {
        questions.push(q);
      }
    } catch {
      // Skip invalid files
    }
  }

  // Sort by creation time, oldest first
  return questions.sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export async function deleteQuestion(id: string): Promise<boolean> {
  const path = getQuestionPath(id);

  if (!existsSync(path)) {
    return false;
  }

  unlinkSync(path);
  logger.info(`Question deleted: ${id}`);
  return true;
}

export async function clearAnsweredQuestions(): Promise<number> {
  const answered = await listQuestions("answered");
  let count = 0;

  for (const q of answered) {
    if (await deleteQuestion(q.id)) {
      count++;
    }
  }

  return count;
}

// =============================================================================
// File watching for event-driven updates
// =============================================================================

import { watch, type FSWatcher } from "node:fs";

export type QueueEventType = "question_added" | "question_answered" | "question_deleted";

export interface QueueEvent {
  type: QueueEventType;
  questionId: string;
  question?: Question;
}

export type QueueEventHandler = (event: QueueEvent) => void;

let activeWatcher: FSWatcher | null = null;
const eventHandlers: Set<QueueEventHandler> = new Set();

export function watchQueue(handler: QueueEventHandler): () => void {
  ensureQueueDir();

  eventHandlers.add(handler);

  // Start watcher if not already running
  if (!activeWatcher) {
    activeWatcher = watch(QUEUE_DIR, async (eventType, filename) => {
      if (!filename || !filename.endsWith(".json")) return;

      const questionId = filename.replace(".json", "");
      const path = getQuestionPath(questionId);

      let event: QueueEvent;

      if (!existsSync(path)) {
        event = { type: "question_deleted", questionId };
      } else {
        try {
          const content = await Bun.file(path).text();
          const q: Question = JSON.parse(content);
          event = {
            type: q.status === "answered" ? "question_answered" : "question_added",
            questionId,
            question: q,
          };
        } catch {
          return; // Ignore parse errors (file being written)
        }
      }

      // Notify all handlers
      for (const h of eventHandlers) {
        try {
          h(event);
        } catch (err) {
          logger.error("Error in queue event handler:", err);
        }
      }
    });
  }

  // Return unsubscribe function
  return () => {
    eventHandlers.delete(handler);
    if (eventHandlers.size === 0 && activeWatcher) {
      activeWatcher.close();
      activeWatcher = null;
    }
  };
}

// =============================================================================
// Event-driven waiting for agents
// =============================================================================

export async function waitForAnswer(
  id: string,
  timeoutMs = 300000  // 5 minute default timeout
): Promise<string | null> {
  // Check if already answered
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

function ensureInterjectDir(): void {
  if (!existsSync(INTERJECT_DIR)) {
    mkdirSync(INTERJECT_DIR, { recursive: true });
  }
}

function getInterjectionPath(id: string): string {
  return join(INTERJECT_DIR, `${id}.json`);
}

export async function createInterjection(
  agentName: string,
  options: {
    taskId?: string;
    sessionId?: string;
    workingDirectory: string;
    reason?: string;
  }
): Promise<string> {
  ensureInterjectDir();

  const id = `i-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const interjection: Interjection = {
    id,
    agentName,
    taskId: options.taskId,
    sessionId: options.sessionId,
    workingDirectory: options.workingDirectory,
    reason: options.reason,
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  await Bun.write(getInterjectionPath(id), JSON.stringify(interjection, null, 2));
  logger.info(`Interjection created: ${id} for ${agentName}`);

  return id;
}

export async function getInterjection(id: string): Promise<Interjection | null> {
  const path = getInterjectionPath(id);

  if (!existsSync(path)) {
    return null;
  }

  const content = await Bun.file(path).text();
  return JSON.parse(content);
}

export async function listInterjections(status?: "pending" | "resumed" | "dismissed"): Promise<Interjection[]> {
  ensureInterjectDir();

  const files = readdirSync(INTERJECT_DIR).filter(f => f.endsWith(".json"));
  const interjections: Interjection[] = [];

  for (const file of files) {
    try {
      const content = await Bun.file(join(INTERJECT_DIR, file)).text();
      const i: Interjection = JSON.parse(content);
      if (!status || i.status === status) {
        interjections.push(i);
      }
    } catch {
      // Skip invalid files
    }
  }

  return interjections.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function markInterjectionResumed(id: string): Promise<boolean> {
  const path = getInterjectionPath(id);

  if (!existsSync(path)) {
    return false;
  }

  const content = await Bun.file(path).text();
  const i: Interjection = JSON.parse(content);

  i.status = "resumed";
  i.resumedAt = new Date().toISOString();

  await Bun.write(path, JSON.stringify(i, null, 2));
  logger.info(`Interjection resumed: ${id}`);

  return true;
}

export async function dismissInterjection(id: string): Promise<boolean> {
  const path = getInterjectionPath(id);

  if (!existsSync(path)) {
    return false;
  }

  unlinkSync(path);
  logger.info(`Interjection dismissed: ${id}`);
  return true;
}
