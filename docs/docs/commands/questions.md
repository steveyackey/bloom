---
sidebar_position: 9
title: Questions
---

# Question Commands

Commands for managing the human question queue.

## Overview

Agents can ask questions during execution. These commands help you view and answer them.

## Viewing Questions

### bloom questions

Show pending questions.

```bash
bloom questions [--all]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--all` | Include answered questions |

**Output:**

```
Pending Questions:
  [q-abc123] agent-1 (implement-auth)
    ◉ Is the implementation complete?
    Type: yes_no

  [q-def456] agent-2 (create-ui)
    ◈ Which color scheme should I use?
    Type: choice
    Choices: light, dark, auto

  [q-ghi789] agent-1 (setup-db)
    ◇ What should the table prefix be?
    Type: open
```

**Question Type Symbols:**

| Symbol | Type | Description |
|--------|------|-------------|
| ◉ | yes_no | Binary choice |
| ◈ | choice | Select from options |
| ◇ | open | Free-form text |

### bloom questions-dashboard

Interactive questions interface.

```bash
bloom questions-dashboard
```

Provides a TUI for viewing and answering questions.

## Answering Questions

### bloom answer

Answer a pending question.

```bash
bloom answer <question-id> <response>
```

**Examples:**

```bash
# Yes/no question
bloom answer q-abc123 "yes"

# Choice question
bloom answer q-def456 "dark"

# Open question
bloom answer q-ghi789 "tbl_"
```

### bloom wait-answer

Wait for a question to be answered.

```bash
bloom wait-answer <question-id> [timeout-secs]
```

Used by agents to pause until human responds.

**Example:**

```bash
bloom wait-answer q-abc123 300  # Wait up to 5 minutes
```

## Asking Questions

### bloom ask

Ask a question (typically used by agents).

```bash
bloom ask <agent> <question> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--task <id>` | Associate with task |
| `--type <type>` | Question type (yes_no, choice, open) |
| `--choices <list>` | Comma-separated choices |
| `--on-yes <status>` | Status if answered yes |
| `--on-no <status>` | Status if answered no |

**Examples:**

```bash
# Yes/no with auto-status
bloom ask agent-1 "Is the auth implementation complete?" \
  --task implement-auth \
  --type yes_no \
  --on-yes done \
  --on-no blocked

# Choice question
bloom ask agent-1 "Which hashing algorithm?" \
  --task implement-auth \
  --type choice \
  --choices "bcrypt,argon2,scrypt"

# Open question
bloom ask agent-1 "What should the JWT expiry be?" \
  --task implement-auth \
  --type open
```

## Management

### bloom clear-answered

Remove answered questions from the queue.

```bash
bloom clear-answered
```

## Interjection

Interrupt running agent sessions.

### bloom interject list

List active sessions that can be interjected.

```bash
bloom interject list
```

### bloom interject `<agent>`

Send a message to a running agent.

```bash
bloom interject <agent> "<message>"
```

**Example:**

```bash
bloom interject agent-1 "Stop current task, we need to discuss the approach"
```

### bloom interject resume

Resume an interjected session.

```bash
bloom interject resume <agent>
```

### bloom interject dismiss

Dismiss an interjected session.

```bash
bloom interject dismiss <agent>
```

## Workflow

### Monitoring Questions

```bash
# In one terminal
bloom run

# In another terminal
watch -n 5 bloom questions
```

### Interactive Mode

```bash
# Better experience
bloom questions-dashboard
```

### Quick Answers

```bash
# View pending
bloom questions

# Answer quickly
bloom answer q-abc123 "yes"
bloom answer q-def456 "bcrypt"
```

## Best Practices

### 1. Answer Promptly

Agents wait for answers. Quick responses keep work flowing.

### 2. Use Auto-Status Questions

For completion checks:

```bash
bloom ask agent-1 "Is it done?" \
  --type yes_no \
  --on-yes done \
  --on-no blocked
```

### 3. Provide Context in Answers

For open questions, give detailed answers:

```bash
bloom answer q-123 "Use bcrypt with cost factor 12. See docs at..."
```

## Related Commands

- [bloom run](/commands/run) — Start orchestrator
- [bloom dashboard](/commands/task-management) — Monitor tasks
