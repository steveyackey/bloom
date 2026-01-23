# Task Workflow

## Your Process

1. Create a TodoWrite checklist from acceptance criteria
2. Implement the task - ONLY this task, nothing else
3. Verify against acceptance criteria
4. Commit all changes with a descriptive message
5. If task specifies a merge target, merge your branch into it
6. Add a note summarizing what you did
7. Mark task as done

## Progress Tracking

Create a TodoWrite checklist from your assigned task's acceptance criteria.
Mark items complete as you work. This helps you stay focused on THIS task only.

## Recording Learnings

Before marking the task as done, add a note with:
```bash
{{TASK_CLI}} note {{TASK_ID}} "Brief summary of approach and any issues"
```
This helps future tasks benefit from your learnings.

<!-- @if supportsHumanQuestions -->
## Human Questions

Use when you need human input - clarification, a decision, or approval.

### 1. YES/NO Questions with Auto-Action

Task status changes automatically based on answer:

```bash
{{TASK_CLI}} ask {{AGENT_NAME}} "Ready to mark as done?" --task {{TASK_ID}} --type yes_no --on-yes done --on-no blocked
```

This will automatically set the task to "done" if human says yes, or "blocked" if no.

### 2. OPEN Questions

Human answers, you read the response on next run:

```bash
{{TASK_CLI}} ask {{AGENT_NAME}} "What approach do you prefer?" --task {{TASK_ID}} --add-note
```

The human's answer will be added as a note to the task. Check the task's `ai_notes` on your next run.

### 3. CHOICE Questions

Human picks from options:

```bash
{{TASK_CLI}} ask {{AGENT_NAME}} "Which framework?" --task {{TASK_ID}} --choices "React,Vue,Svelte"
```

### 4. Wait for Immediate Answer

```bash
{{TASK_CLI}} wait-answer <question-id>
```

The wait command will block until the human answers. Use this for important decisions.

## Context

The human sees all questions in a dedicated pane with visual indicators for question types:
- circle-dot = yes/no
- diamond-dot = choice
- diamond-outline = open
<!-- @endif -->

<!-- @if supportsPlanMode -->
## Planning Mode

You will start in Plan mode. Create a detailed plan before implementing.

1. Analyze the requirements thoroughly
2. Break down the work into clear steps
3. Identify potential risks or blockers
4. Present the plan for approval before proceeding
<!-- @endif -->

<!-- @if supportsSessionFork -->
## Session Forking

You can fork the current session to explore alternatives:

1. Use session forking when you want to try multiple approaches
2. Each fork maintains its own context and state
3. Compare results across forks before choosing the best approach
<!-- @endif -->

<!-- @if supportsWebSearch -->
## Web Search

You can search the web for current information when needed:

1. Use web search for up-to-date documentation
2. Verify API specifications and library versions
3. Research best practices and common patterns
<!-- @endif -->
