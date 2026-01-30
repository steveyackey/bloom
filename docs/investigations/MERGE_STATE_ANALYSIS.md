# Merge State Persistence Analysis

This document analyzes the merge operation state persistence in bloom's task orchestrator,
identifying gaps that can cause issues on restart.

## Current Architecture

### Merge Workflow Overview

1. **Agent completes task work** (`in_progress` status)
2. **Pre-merge**: Status set to `done_pending_merge` (persisted to tasks.yaml)
3. **Merge lock acquired** (in-memory, not persisted)
4. **Target worktree ensured** (file system state)
5. **Merge performed** (git operation)
6. **On success**: Status set to `done` (persisted to tasks.yaml)
7. **Lock released** (in-memory)

### Key Files

- `src/core/orchestrator/work-loop.ts:656-791` - `handleMerge()` function
- `src/core/orchestrator/post-task.ts:198-262` - State persistence functions
- `src/tasks.ts:87-136` - `getAvailableTasks()` including merge-only detection
- `src/core/orchestrator/task-prompt.ts:82-182` - `getTaskForAgent()` merge-only handling

### State Persistence Points

| State | Persisted | Location |
|-------|-----------|----------|
| Task status (`done_pending_merge`) | Yes | tasks.yaml |
| Merge lock | No | In-memory only |
| Target worktree | Yes | File system |
| Session ID | Yes | tasks.yaml |

## Recent Fix (commit f21129d)

The recent fix addressed merge resumption after restart:
- `done_pending_merge` tasks are now returned by `getAvailableTasks()` for the same agent
- `mergeOnly` flag skips agent work and goes directly to merge operations
- Works correctly for the resumption case

## Identified Gap: Premature Dependency Unblocking

### The Problem

In `src/tasks.ts`, `done_pending_merge` is treated as "completed" for dependency checking:

```typescript
// Line 92-94 in getAvailableTasks()
// done_pending_merge counts as completed for dependency purposes
if (task.status === "done" || task.status === "done_pending_merge")
  completedIds.add(task.id);

// Line 207-208 in primeTasks()
// done_pending_merge counts as completed for dependency purposes
if (task.status === "done" || task.status === "done_pending_merge")
  completedIds.add(task.id);
```

### Impact

Consider this scenario:
1. Task A completes agent work, status becomes `done_pending_merge`
2. Task B depends on Task A (`depends_on: [task-a]`)
3. Task B becomes `ready_for_agent` because `done_pending_merge` counts as "completed"
4. Task B starts running **before Task A's merge is complete**

This causes problems when:
- Task B needs Task A's code to be in the target branch (it won't be there yet)
- Task B merges to the same target, potentially causing conflicts
- A restart occurs during Task A's merge, and Task B has already started

### Why This Design Exists

The current design likely exists because:
1. From the "agent work" perspective, the task IS complete
2. Blocking dependent tasks on merge would serialize work unnecessarily
3. For simple workflows without merge conflicts, this works fine

### When This Matters

This is a problem when:
1. **Restart during merge**: Task B may have started while Task A was merging
2. **Same merge target**: Both tasks merge to the same branch
3. **Code dependencies**: Task B's code depends on Task A's merged code

## Missing Test Coverage

There are no tests for `done_pending_merge` scenarios:
- No tests for restart during merge
- No tests for dependent task behavior during merge
- No tests for multiple tasks merging to the same target

## Recommended Fix Approach

### Option 1: Differentiate "completed for agent work" vs "completed for merge"

Add a new consideration: tasks with `merge_into` should only unblock dependents after the merge completes (status = `done`), not when in `done_pending_merge`.

**Pros**: Prevents premature unblocking
**Cons**: Serializes work when merge is slow

### Option 2: Track merge state separately

Add explicit merge tracking:
- `merge_status: pending | in_progress | done | failed`
- Persist merge progress state
- Resume from specific merge phase

**Pros**: Fine-grained control, better restart handling
**Cons**: More complex, more state to manage

### Option 3: Only block same-target merges

Keep current behavior but serialize only when dependent tasks share the same `merge_into` target.

**Pros**: Minimal performance impact
**Cons**: Doesn't address code dependency issues

## Recommendation

For immediate fix (Option 1):
- Change `primeTasks()` to NOT count `done_pending_merge` as completed
- Keep `getAvailableTasks()` returning `done_pending_merge` for merge resumption
- This ensures dependent tasks wait for merge completion

For long-term (Option 2):
- Implement explicit merge state tracking for better visibility and control
