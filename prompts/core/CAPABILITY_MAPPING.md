# Capability to Conditional Mapping

This document maps capability flags to their corresponding conditional markers in the prompt templates.

## Overview

The prompt system uses conditional markers (`<!-- @if capabilityName -->...<!-- @endif -->`) to include or exclude sections based on the agent's capabilities. This allows the same prompt templates to be used across different agent configurations.

## Capability Registry

| Capability | Conditional Marker | Description | Affected Files |
|------------|-------------------|-------------|----------------|
| `supportsHumanQuestions` | `@if supportsHumanQuestions` | Agent can ask questions to human operators | workflow.md, bloom-commands.md |
| `supportsPlanMode` | `@if supportsPlanMode` | Agent starts in planning mode before implementation | workflow.md |
| `supportsSessionFork` | `@if supportsSessionFork` | Agent can fork sessions to explore alternatives | workflow.md |
| `supportsWebSearch` | `@if supportsWebSearch` | Agent can search the web for information | workflow.md |
| `supportsPRWorkflow` | `@if supportsPRWorkflow` | Agent can create and manage pull requests | git.md |
| `supportsAutoMerge` | `@if supportsAutoMerge` | Orchestrator handles automatic branch merging | git.md |
| `supportsCheckpoints` | `@if supportsCheckpoints` | Agent can request and handle checkpoint validations | bloom-commands.md |
| `supportsLinting` | `@if supportsLinting` | Codebase has linting configured | quality.md |
| `supportsTypeChecking` | `@if supportsTypeChecking` | Codebase has type checking configured | quality.md |
| `supportsFormatting` | `@if supportsFormatting` | Codebase has code formatting configured | quality.md |

## Variable Substitution

In addition to conditionals, the following variables are substituted in templates:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{AGENT_NAME}}` | The agent's identifier | `phase1-prompts` |
| `{{TASK_ID}}` | Current task identifier | `extract-modularize-prompts` |
| `{{TASK_CLI}}` | Full bloom CLI command with task file | `bloom -f /path/to/tasks.yaml` |
| `{{LINT_COMMAND}}` | Project-specific lint command | `bun lint` |
| `{{TYPECHECK_COMMAND}}` | Project-specific typecheck command | `bun typecheck` |
| `{{FORMAT_COMMAND}}` | Project-specific format command | `bun format` |

## File Structure

```
prompts/
  core/
    identity.md          # Agent identity (no conditionals)
    workflow.md          # Task workflow (most conditionals)
    git.md               # Git operations
    bloom-commands.md    # Bloom CLI reference
    quality.md           # Code standards
    CAPABILITY_MAPPING.md # This file
  agent-system.md        # Legacy combined prompt (deprecated)
```

## Usage

The prompt assembler reads capabilities from the task configuration and processes conditionals:

```typescript
// Example capability configuration
const capabilities = {
  supportsHumanQuestions: true,
  supportsPlanMode: false,
  supportsSessionFork: false,
  supportsWebSearch: true,
  supportsPRWorkflow: true,
  supportsAutoMerge: true,
  supportsCheckpoints: true,
  supportsLinting: true,
  supportsTypeChecking: true,
  supportsFormatting: false,
};
```

## Adding New Capabilities

1. Add the capability to the capability registry table above
2. Add the conditional marker to the appropriate prompt file(s)
3. Update the prompt assembler to recognize the new capability
4. Document any new variables needed

## Processing Logic

Conditionals are processed as follows:

1. Parse all `<!-- @if capabilityName -->...<!-- @endif -->` blocks
2. For each block, check if `capabilities[capabilityName]` is truthy
3. If true, include the content (removing the markers)
4. If false, remove the entire block including content
5. Substitute all `{{VARIABLE}}` placeholders with their values
