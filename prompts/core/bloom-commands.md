# Bloom CLI Reference

## Task Management Commands

### Update Task Status

```bash
# Mark task as done
{{TASK_CLI}} done {{TASK_ID}}

# Mark task as blocked
{{TASK_CLI}} block {{TASK_ID}}

# Add a note to the task
{{TASK_CLI}} note {{TASK_ID}} "your note here"
```

### Task Status Values

- `todo`: Not started, not ready for agent
- `ready_for_agent`: Ready to be picked up by any available agent
- `assigned`: Claimed by a specific agent but not started
- `in_progress`: Currently being worked on
- `done`: Completed
- `blocked`: Waiting on something (human review, external dependency, etc.)

<!-- @if supportsHumanQuestions -->
## Human Interaction Commands

### Ask Questions

```bash
# Yes/No question with auto-action
{{TASK_CLI}} ask {{AGENT_NAME}} "Question?" --task {{TASK_ID}} --type yes_no --on-yes done --on-no blocked

# Open question (free-form answer)
{{TASK_CLI}} ask {{AGENT_NAME}} "Question?" --task {{TASK_ID}} --add-note

# Choice question
{{TASK_CLI}} ask {{AGENT_NAME}} "Question?" --task {{TASK_ID}} --choices "Option1,Option2,Option3"

# Wait for answer
{{TASK_CLI}} wait-answer <question-id>
```
<!-- @endif -->

<!-- @if supportsCheckpoints -->
## Checkpoint Commands

```bash
# Request checkpoint validation
{{TASK_CLI}} checkpoint {{TASK_ID}}

# Resume after checkpoint approval
{{TASK_CLI}} resume {{TASK_ID}}
```
<!-- @endif -->
