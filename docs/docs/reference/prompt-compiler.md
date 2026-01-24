---
sidebar_position: 5
title: Prompt Compiler
---

# Prompt Compiler

The **Prompt Compiler** is Bloom's system for generating agent-specific prompts based on capabilities. It enables capability-based conditional processing, task context injection, and dynamic variable substitution.

## Overview

Different AI agents have different capabilities. Claude supports web search, Cline has Plan/Act modes, OpenCode has native LSP support, etc. Rather than maintaining separate prompt files for each agent, Bloom uses a single set of prompt templates with conditional sections that are included or excluded based on the agent's capabilities.

## How It Works

The Prompt Compiler:

1. **Loads** a prompt template from `prompts/core/`
2. **Processes** conditional sections based on agent capabilities
3. **Injects** task-specific context and variables
4. **Returns** a compiled prompt customized for the agent

```typescript
import { PromptCompiler } from './prompts/compiler';

const compiler = new PromptCompiler();
const compiled = await compiler.loadAndCompile('agent-system', {
  capabilities: {
    supportsHumanQuestions: true,
    supportsPlanMode: false,
    supportsWebSearch: true,
  },
  variables: {
    AGENT_NAME: 'phase1-agent',
    TASK_ID: 'implement-feature',
    TASK_CLI: 'bloom -f tasks.yaml',
  },
});
```

## Conditional Syntax

### Basic Conditional

Include content only when a capability is enabled:

```markdown
<!-- @if capabilityName -->
Content included when capability is truthy
<!-- @endif -->
```

**Example:**

```markdown
<!-- @if supportsHumanQuestions -->
## Human Questions

You can ask questions to the human operator:

```bash
bloom ask agent-1 "Which approach?" --type choice
```
<!-- @endif -->
```

If `supportsHumanQuestions` is `true`, the section is included. If `false`, the entire block is removed.

### Nested Conditionals

Conditionals can be nested:

```markdown
<!-- @if supportsGit -->
## Git Operations

You have git access.

<!-- @if supportsPRWorkflow -->
### Pull Requests

Create PRs with `gh pr create`.
<!-- @endif -->
<!-- @endif -->
```

The inner PR section is only included if **both** `supportsGit` and `supportsPRWorkflow` are true.

### Validation

The compiler validates conditional structure and reports errors:

```
Error: agent-system.md:line 42: Unclosed conditional @if supportsWebSearch: missing @endif
Error: agent-system.md:line 67: Unexpected @endif: no matching @if found
```

## Variable Syntax

Variables use double curly braces: `{{VARIABLE_NAME}}`

### Standard Variables

These variables are commonly used across prompts:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{AGENT_NAME}}` | Agent identifier | `phase1-prompts` |
| `{{TASK_ID}}` | Current task ID | `extract-modularize-prompts` |
| `{{TASK_CLI}}` | Full CLI command | `bloom -f /path/to/tasks.yaml` |
| `{{TASK_TITLE}}` | Task title | `Extract and modularize prompts` |
| `{{TASK_BRANCH}}` | Task git branch | `feature/prompts` |
| `{{TASKS_FILE}}` | Path to tasks.yaml | `/workspace/tasks.yaml` |

### Custom Variables

Pass custom variables via the `variables` option:

```typescript
const compiled = compiler.compile(content, {
  variables: {
    PROJECT_NAME: 'bloom',
    ENVIRONMENT: 'production',
  },
});
```

Then use in prompts:

```markdown
Project: {{PROJECT_NAME}}
Environment: {{ENVIRONMENT}}
```

### Capability Section Generation

The special `{{CAPABILITIES_SECTION}}` variable generates a formatted list of enabled capabilities:

```markdown
{{CAPABILITIES_SECTION}}
```

Becomes:

```markdown
## Capabilities

You have access to the following capabilities:
- Web search
- Run terminal commands
- Git operations
- Ask human questions
```

## Capability Definitions

Capabilities are defined in `src/agents/capabilities.ts` for each agent:

```typescript
export const agentCapabilities: Record<AgentName, AgentCapabilities> = {
  claude: {
    supportsFileRead: true,
    supportsFileWrite: true,
    supportsBash: true,
    supportsWebSearch: true,
    supportsHumanQuestions: true,
    supportsPlanMode: false,
    supportsLSP: false,
    // ...
  },
  // ...
};
```

### Capability Types

**Boolean capabilities** (used in conditionals):
- `supportsFileRead`, `supportsFileWrite`, `supportsBash`, `supportsGit`
- `supportsWebSearch`, `supportsWebFetch`
- `supportsSystemPrompt`, `supportsAppendSystemPrompt`
- `supportsSessionResume`, `supportsSessionFork`
- `supportsStructuredOutput`, `supportsStreamingJson`
- `supportsHumanQuestions`, `supportsPlanMode`, `supportsLSP`

**Array capabilities** (special instructions):
- `specialInstructions`: Agent-specific guidance strings

**Number capabilities**:
- `maxPromptLength`: Maximum prompt length in characters (optional)

## Prompt Templates

Templates are stored in `prompts/core/`:

```
prompts/
  core/
    agent-system.md      # Main agent system prompt
    git.md               # Git workflow instructions
    bloom-commands.md    # Bloom CLI reference
    workflow.md          # Task workflow guidance
    quality.md           # Code quality standards
    identity.md          # Agent identity
    CAPABILITY_MAPPING.md # Documentation
```

### Template Structure

A typical template:

```markdown
# Agent System Prompt

You are agent "{{AGENT_NAME}}" working on task {{TASK_ID}}.

## Critical Instructions

1. Complete the assigned task
2. Mark done when complete: `{{TASK_CLI}} done {{TASK_ID}}`

<!-- @if supportsHumanQuestions -->
## Human Questions

Ask when you need input:

```bash
{{TASK_CLI}} ask {{AGENT_NAME}} "Question?" --task {{TASK_ID}}
```
<!-- @endif -->

<!-- @if supportsWebSearch -->
## Web Research

You can search the web for documentation and examples.
<!-- @endif -->
```

## Compilation Process

### Step-by-Step

1. **Load template**: Read markdown from `prompts/core/`
2. **Validate structure**: Check for malformed conditionals
3. **Process conditionals**: Resolve from innermost to outermost
4. **Generate capabilities section**: If `{{CAPABILITIES_SECTION}}` exists
5. **Inject task context**: Replace task-related variables
6. **Substitute variables**: Replace custom variables
7. **Return result**: Fully compiled prompt

### Processing Conditionals

The compiler processes conditionals from innermost to outermost:

```markdown
<!-- @if A -->
A content
  <!-- @if B -->
  B content (inner)
  <!-- @endif -->
A content
<!-- @endif -->
```

First processes `B` (innermost), then `A` (outermost).

### Error Handling

The compiler catches and reports:
- Unclosed conditionals (missing `@endif`)
- Unexpected `@endif` (no matching `@if`)
- Invalid capability names (during compilation)
- Maximum iteration limit (for complex nesting)

## CLI Commands

### View Compiled Prompt

See what prompt an agent receives:

```bash
# Basic compilation
bloom prompt compile claude

# Show capability decisions
bloom prompt compile claude --verbose

# Compare two agents
bloom prompt compile claude --diff opencode

# Include task context
bloom prompt compile claude --task my-task-id
```

### Verbose Output

The `--verbose` flag shows which sections were included/excluded:

```
═══ Prompt Compilation for claude ═══

✓ Included Sections:
  • Human Questions
    Capability enabled for this agent
  • Web Search
    Capability enabled for this agent

✗ Excluded Sections:
  • Plan Mode
    Capability disabled for this agent
  • LSP
    Capability disabled for this agent

═══ Compiled Prompt ═══

[... compiled prompt ...]
```

### Diff Mode

Compare prompts for two agents:

```bash
bloom prompt compile claude --diff opencode
```

Shows:
- Capability differences
- Prompt text differences
- Line counts and statistics

## Usage in Code

### Basic Compilation

```typescript
import { PromptCompiler } from './prompts/compiler';

const compiler = new PromptCompiler();
const compiled = await compiler.loadAndCompile('agent-system', {
  capabilities: {
    supportsHumanQuestions: true,
    supportsWebSearch: true,
  },
});
```

### With Task Context

```typescript
const compiled = await compiler.loadAndCompile('agent-system', {
  capabilities: agentCapabilities,
  task: {
    id: 'implement-auth',
    title: 'Implement authentication',
    branch: 'feature/auth',
    tasksFile: '/workspace/tasks.yaml',
  },
});
```

### With Variables

```typescript
const compiled = await compiler.loadAndCompile('agent-system', {
  capabilities: agentCapabilities,
  variables: {
    AGENT_NAME: 'auth-agent',
    TASK_CLI: 'bloom -f tasks.yaml',
  },
});
```

### Compile String Directly

```typescript
const content = `# Prompt\n\n<!-- @if supportsWebSearch -->Search enabled<!-- @endif -->`;
const compiled = compiler.compile(content, {
  capabilities: { supportsWebSearch: true },
});
```

### Generate Capabilities Section

```typescript
import { generateCapabilitiesSection } from './prompts/compiler';

const section = generateCapabilitiesSection({
  supportsBash: true,
  supportsGit: true,
  supportsWebSearch: true,
});

console.log(section);
// ## Capabilities
// 
// You have access to the following capabilities:
// - Run terminal commands
// - Git operations
// - Web search
```

## Adding New Capabilities

### 1. Define Capability

Add to `src/agents/capabilities.ts`:

```typescript
export interface AgentCapabilities {
  // ... existing capabilities ...
  supportsNewFeature: boolean;
}

export const agentCapabilities: Record<AgentName, AgentCapabilities> = {
  claude: {
    // ... existing capabilities ...
    supportsNewFeature: true,
  },
  // ... other agents ...
};
```

### 2. Add to Description Map

In `src/prompts/compiler.ts`:

```typescript
const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  // ... existing descriptions ...
  supportsNewFeature: "New feature description",
};
```

### 3. Use in Templates

Add conditional sections in prompt templates:

```markdown
<!-- @if supportsNewFeature -->
## New Feature

Instructions for using the new feature...
<!-- @endif -->
```

### 4. Document

Update `prompts/core/CAPABILITY_MAPPING.md`:

```markdown
| `supportsNewFeature` | `@if supportsNewFeature` | Description | affected-file.md |
```

## Best Practices

### Keep Templates DRY

Use conditionals to avoid duplication:

```markdown
<!-- Bad: Duplicated content -->
# Agent System (Claude version)
[Instructions for Claude]

# Agent System (OpenCode version)
[Same instructions for OpenCode]

<!-- Good: Conditional sections -->
# Agent System

[Common instructions]

<!-- @if supportsLSP -->
Use LSP for navigation...
<!-- @endif -->
```

### Group Related Sections

Group related conditionals together:

```markdown
<!-- @if supportsGit -->
## Git Operations

### Committing
[...]

### Pushing
[...]

<!-- @if supportsPRWorkflow -->
### Pull Requests
[...]
<!-- @endif -->
<!-- @endif -->
```

### Test Compilation

Test prompts for each agent:

```bash
for agent in claude copilot codex cline opencode; do
  bloom prompt compile $agent --verbose
done
```

### Validate Before Commit

Ensure no broken conditionals:

```bash
# Compile all prompts to check for errors
bloom prompt compile claude
bloom prompt compile opencode
```

## Troubleshooting

### Unclosed Conditional

```
Error: agent-system.md:line 42: Unclosed conditional @if supportsWebSearch: missing @endif
```

**Fix**: Add missing `<!-- @endif -->` after the conditional section.

### Unexpected @endif

```
Error: agent-system.md:line 67: Unexpected @endif: no matching @if found
```

**Fix**: Remove the extra `@endif` or add the missing `@if`.

### Variable Not Replaced

If `{{VARIABLE}}` appears in output:

1. Check variable name spelling
2. Ensure variable is passed in `variables` option
3. Verify variable is not inside a removed conditional

### Empty Capability Section

If `{{CAPABILITIES_SECTION}}` shows "No special capabilities enabled":

1. Check that capabilities are defined
2. Ensure boolean capabilities are `true`
3. Verify capability names match `CAPABILITY_DESCRIPTIONS`

## See Also

- [Agent Reference](/reference/agents) - Agent capabilities and configuration
- [Task Schema](/reference/task-schema) - Task-level configuration
