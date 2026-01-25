# Step Execution Implementation Plan

## Overview

Implement session-reusing step execution in the work loop. Tasks with `steps` will:
1. Execute steps sequentially, resuming the same agent session
2. Agent marks each step done via `bloom step done <id>`, then exits
3. Bloom resumes the session with the next step's prompt
4. Git operations (push, merge, PR) happen only after all steps complete

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Work Loop                                 │
├─────────────────────────────────────────────────────────────────┤
│  1. getTaskForAgent() → returns task + current step info        │
│  2. If task has pending steps:                                  │
│     a. Build step prompt (first step: full context, later: min) │
│     b. Run agent with session resume                            │
│     c. Agent does work → bloom step done → exits                │
│     d. Work loop detects step done, loops back to step 2        │
│  3. When all steps done → post-task git operations              │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

### 1. Extend `task-prompt.ts`

**New types:**
```typescript
interface StepInfo {
  stepId: string;
  stepIndex: number;
  totalSteps: number;
  instruction: string;
  acceptanceCriteria: string[];
  isFirstStep: boolean;
  previousSteps: { id: string; instruction: string }[];
}

interface TaskGetResult {
  // ... existing fields ...
  stepInfo?: StepInfo;  // Present if task has pending steps
  hasMoreSteps?: boolean;  // True if more steps after current
}
```

**New functions:**
- `getCurrentStepForTask(task)` - Get first pending step
- `buildStepPrompt(task, step, gitInfo, taskCli)` - Build step-specific prompt

**Modify:**
- `getTaskForAgent()` - Detect tasks with steps, return step info

### 2. Extend `work-loop.ts`

**Changes:**
- After task/step completes, check if more steps exist
- If yes, build next step prompt and resume session
- If no, proceed to git operations
- Track step execution for timing metrics

**New event types:**
```typescript
type StepStartedEvent = {
  type: "step:started";
  taskId: string;
  stepId: string;
  stepIndex: number;
  totalSteps: number;
};

type StepCompletedEvent = {
  type: "step:completed";
  taskId: string;
  stepId: string;
  duration: number;
};
```

### 3. Step Detection in Work Loop

```typescript
// After agent.run() completes:
if (taskResult.stepInfo) {
  // Agent was working on a step
  const stepId = taskResult.stepInfo.stepId;

  // Check if step is now done
  const tasksData = await loadTasks(tasksFile);
  const task = findTask(tasksData.tasks, taskResult.taskId);
  const step = task?.steps?.find(s => s.id === stepId);

  if (step?.status === "done") {
    // Step completed, check for next step
    const nextStep = getNextPendingStep(task);
    if (nextStep) {
      // Resume session with next step prompt
      const nextPrompt = buildStepPrompt(task, nextStep, ...);
      result = await agent.run({
        sessionId: result.sessionId,  // Resume!
        prompt: nextPrompt,
        ...
      });
    } else {
      // All steps done → proceed to git operations
    }
  }
}
```

## Edge Cases

### 1. Resume from Middle
- Task has steps where some are already "done"
- `getCurrentStepForTask()` returns first non-done step
- Previous steps included in prompt for context

### 2. Step Fails (agent exits with error)
- Keep step in current status (in_progress)
- Clear session_id to force fresh start on retry
- Task stays in_progress for retry

### 3. Agent Doesn't Call `bloom step done`
- Agent exits successfully but step still "in_progress"
- Work loop detects mismatch
- Option A: Assume step complete, mark it done
- Option B: Resume session to ask agent to mark done
- **Decision:** Option A with warning event

### 4. Session Corruption During Steps
- Detect via error patterns (same as current)
- Clear session_id
- Next iteration starts fresh from current step

### 5. All Steps Already Done
- `getCurrentStepForTask()` returns null
- Task treated as regular completion
- Proceed to git operations

### 6. Empty Steps Array or No Steps
- `task.steps` is undefined or empty
- Fall back to `task.instructions`
- Execute as single-step task (current behavior)

### 7. Step Has No Acceptance Criteria
- Build prompt without criteria section
- Use task-level acceptance_criteria as fallback

## Testing Strategy

### Unit Tests (`tests/step-helpers.test.ts`)

```typescript
describe("Step Helpers", () => {
  test("getCurrentStepForTask returns first pending step");
  test("getCurrentStepForTask returns null when all steps done");
  test("getCurrentStepForTask skips done steps");
  test("getNextPendingStep returns step after current");
  test("getNextPendingStep returns null on last step");
  test("buildStepPrompt includes context from previous steps");
  test("buildStepPrompt omits context on first step");
});
```

### Unit Tests (`tests/step-prompt.test.ts`)

```typescript
describe("Step Prompt Building", () => {
  test("first step includes full task context");
  test("subsequent steps include previous step summary");
  test("step prompt includes acceptance criteria if present");
  test("step prompt tells agent to run bloom step done");
  test("last step prompt mentions task will complete");
});
```

### Integration Tests (`tests/step-execution.test.ts`)

```typescript
describe("Step Execution Flow", () => {
  test("task with steps executes steps sequentially");
  test("session is preserved between steps");
  test("git operations only run after all steps");
  test("step timing is recorded (started_at, completed_at)");
  test("resume from middle step works correctly");
  test("step failure stops execution");
  test("session corruption clears session_id");
});
```

### Edge Case Tests (`tests/step-edge-cases.test.ts`)

```typescript
describe("Step Edge Cases", () => {
  test("task with empty steps array uses instructions");
  test("task with all steps done proceeds to git ops");
  test("agent exit without step done marks step complete");
  test("step without acceptance_criteria uses task criteria");
  test("mixed tasks (with/without steps) handled correctly");
});
```

## Files to Modify

1. `src/core/orchestrator/task-prompt.ts`
   - Add step info to TaskGetResult
   - Add buildStepPrompt()
   - Add step helper functions

2. `src/core/orchestrator/work-loop.ts`
   - Add step execution loop
   - Add step events
   - Handle step-by-step resumption

3. `src/core/orchestrator/events.ts`
   - Add step event types

4. `src/tasks.ts`
   - Export step helper functions (findStep, getCurrentStep, etc.)
   - Move from commands/tasks.ts to shared location

5. `tests/step-*.test.ts` (new files)
   - Unit tests for step helpers
   - Integration tests for step execution

## Implementation Order

1. **Phase 1: Step Helpers** (can test independently)
   - Move/add step helpers to `src/tasks.ts`
   - Write unit tests for helpers

2. **Phase 2: Step Prompt Building**
   - Add `buildStepPrompt()` to task-prompt.ts
   - Add step info to `getTaskForAgent()`
   - Write unit tests for prompt building

3. **Phase 3: Work Loop Integration**
   - Add step events
   - Modify work loop for step execution
   - Write integration tests

4. **Phase 4: Edge Cases & Polish**
   - Handle all edge cases
   - Add edge case tests
   - Update event handlers (CLI, TUI)

## Rollback Safety

- Feature is additive (tasks without steps work unchanged)
- No schema migrations needed (steps field already exists)
- Can be tested with specific tasks before general rollout
