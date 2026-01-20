import { z } from "zod";

// =============================================================================
// Task Status
// =============================================================================

export const TaskStatusSchema = z.enum(["todo", "ready_for_agent", "assigned", "in_progress", "done", "blocked"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// =============================================================================
// Task Schema (recursive for subtasks)
// =============================================================================

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  phase?: number;
  depends_on: string[];
  /** Folder path to execute this task in */
  repo?: string;
  /** Git worktree name for isolated work */
  worktree?: string;
  agent_name?: string;
  instructions?: string;
  acceptance_criteria: string[];
  ai_notes: string[];
  subtasks: Task[];
  /** Points to a validation task that verifies this task's work (e.g. run tests, lint) */
  validation_task_id?: string;
};

export const TaskSchema: z.ZodType<Task> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    status: TaskStatusSchema.default("todo"),
    phase: z.number().int().positive().optional(),
    depends_on: z.array(z.string()).default([]),
    repo: z.string().optional(),
    worktree: z.string().optional(),
    agent_name: z.string().optional(),
    instructions: z.string().optional(),
    acceptance_criteria: z.array(z.string()).default([]),
    ai_notes: z.array(z.string()).default([]),
    subtasks: z.array(TaskSchema).default([]),
    validation_task_id: z.string().optional(),
  })
);

// =============================================================================
// Tasks File Schema
// =============================================================================

export const TasksFileSchema = z.object({
  tasks: z.array(TaskSchema).default([]),
});
export type TasksFile = z.infer<typeof TasksFileSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

export function createTask(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return TaskSchema.parse(partial);
}

export function createTasksFile(tasks: Task[] = []): TasksFile {
  return TasksFileSchema.parse({ tasks });
}

// =============================================================================
// Validation
// =============================================================================

export function validateTasksFile(data: unknown): TasksFile {
  return TasksFileSchema.parse(data);
}

export function safeValidateTasksFile(
  data: unknown
): { success: true; data: TasksFile } | { success: false; error: z.ZodError } {
  const result = TasksFileSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
