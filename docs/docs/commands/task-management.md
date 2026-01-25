---
sidebar_position: 8
title: Task Management
---

# Task Management Commands

Commands for viewing, monitoring, and managing tasks.

## Viewing Tasks

### bloom list

List all tasks, optionally filtered by status.

```bash
bloom list [status]
```

**Examples:**

```bash
bloom list              # All tasks
bloom list todo         # Only todo
bloom list in_progress  # Currently running
bloom list done         # Completed
bloom list blocked      # Needs intervention
```

**Output:**

```
Phase 1: Setup
  [done]        create-models      Create database models
  [in_progress] implement-service  Implement service layer

Phase 2: API
  [todo]        create-endpoints   Create API endpoints
```

### bloom show

Show detailed information about a task.

```bash
bloom show <taskid>
```

**Output:**

```
Task: implement-service
Title: Implement service layer
Status: in_progress
Phase: 1
Agent: claude-code

Dependencies:
  ✓ create-models (done)

Instructions:
  Create UserService with CRUD operations.

Acceptance Criteria:
  - All methods are async
  - Proper error handling

Notes:
  - Added validation for email
```

### bloom next

Show tasks available for execution.

```bash
bloom next [agent]
```

**Examples:**

```bash
bloom next          # All available tasks
bloom next agent-1  # Tasks for specific agent
```

### bloom agents

List agents and their current tasks.

```bash
bloom agents
```

**Output:**

```
Agents:
  claude-code-1
    Current: implement-service
    Completed: 3

  claude-code-2
    Current: idle
    Completed: 2
```

## Monitoring

### bloom dashboard

Live task monitoring with auto-refresh.

```bash
bloom dashboard
```

Refreshes every 10 seconds showing:
- Task counts by status
- Active tasks
- Recent completions
- Pending questions

### bloom validate

Check tasks for errors.

```bash
bloom validate
```

Checks:
- Unique task IDs
- Valid dependencies
- Required fields
- No circular dependencies

## Status Management

### bloom done

Mark a task as completed.

```bash
bloom done <taskid>
```

### bloom block

Mark a task as blocked.

```bash
bloom block <taskid>
```

Use when a task cannot proceed without human intervention.

### bloom todo

Reset a task to todo status.

```bash
bloom todo <taskid>
```

### bloom ready

Mark a task as ready for agent execution.

```bash
bloom ready <taskid>
```

### bloom start

Mark a task as in progress.

```bash
bloom start <taskid>
```

### bloom assign

Assign a task to a specific agent.

```bash
bloom assign <taskid> <agent>
```

**Example:**

```bash
bloom assign implement-auth claude-code-1
```

## Task Operations

### bloom note

Add a note to a task.

```bash
bloom note <taskid> <note>
```

**Examples:**

```bash
bloom note impl-auth "Using bcrypt with cost factor 12"
bloom note impl-auth "Found edge case with empty passwords"
```

Notes are stored in `ai_notes` and visible to future agents.

### bloom reset

Reset a stuck task.

```bash
bloom reset <taskid>
bloom reset --stuck  # Reset ALL stuck tasks
```

Resets task to `todo` and clears assignment.

## Step Commands

Steps are lightweight sub-instructions within a task that share the same agent session. Use steps when work builds on previous context.

### bloom step done

Mark a step as complete and exit. The agent should call this after completing each step.

```bash
bloom step done <stepid>
```

**Example:**

```bash
bloom step done refactor-auth.1
```

After marking a step done, the agent exits. Bloom will resume the session with the next step, preserving context.

### bloom step start

Mark a step as in progress (records start time for metrics).

```bash
bloom step start <stepid>
```

### bloom step show

Show details about a specific step.

```bash
bloom step show <stepid>
```

**Output:**

```
Step ID:    refactor-auth.1
Task:       refactor-auth - Refactor authentication module
Status:     done
Position:   1 of 3

Instruction:
Extract JWT validation logic from auth.ts into jwt-validator.ts

Acceptance Criteria:
  • jwt-validator.ts exists with validateToken() function
  • auth.ts imports from jwt-validator.ts
```

### bloom step list

List steps for a task or all tasks with steps.

```bash
bloom step list [taskid]
```

**Examples:**

```bash
bloom step list                 # All tasks with steps
bloom step list refactor-auth   # Steps for specific task
```

**Output:**

```
refactor-auth: 1/3 steps done → refactor-auth.2
  ✓ refactor-auth.1: Extract JWT validation...
  → refactor-auth.2: Add unit tests...
  ○ refactor-auth.3: Update documentation...
```

## Examples

### Monitoring Workflow

```bash
# Watch task progress
watch -n 5 bloom list

# Or use dashboard
bloom dashboard
```

### Intervening in Tasks

```bash
# Block a task that needs discussion
bloom block implement-auth

# Add context
bloom note implement-auth "Need to clarify auth requirements"

# After discussion, continue
bloom todo implement-auth
```

### Recovering from Errors

```bash
# Task stuck in_progress
bloom reset stuck-task-id

# Reset all stuck tasks
bloom reset --stuck

# Re-run
bloom run
```

## Related Commands

- [bloom run](/commands/run) — Execute tasks
- [bloom questions](/commands/questions) — Handle agent questions
