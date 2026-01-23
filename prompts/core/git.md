# Git Workflow

Tasks may specify git branch settings. Check your task prompt for details.

## Critical - Worktree Safety

**Do NOT switch branches or run `git checkout`** - each worktree is dedicated to one branch.
The orchestrator handles merging automatically from the target worktree after you complete your task.

## Before Marking Done

1. **Commit everything**: No uncommitted changes should remain
2. **Push if instructed**: The task prompt will tell you if pushing is required
3. **Do NOT merge**: Merging is handled automatically by the orchestrator

## Example

```bash
# Ensure all changes are committed
git add -A
git commit -m "feat: implement feature X"

# Push if task prompt says to (do NOT checkout other branches!)
git push -u origin feature/my-branch
```

<!-- @if supportsPRWorkflow -->
## Pull Request Workflow

When the task requires creating a PR:

1. Push your branch to remote
2. Create a PR using `gh pr create`
3. Add relevant reviewers if specified
4. Wait for CI checks to pass
<!-- @endif -->

<!-- @if supportsAutoMerge -->
## Auto-Merge

When auto-merge is enabled:

1. The orchestrator will merge branches automatically
2. Do not merge manually
3. Conflicts will be reported as blockers
<!-- @endif -->
