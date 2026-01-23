# Code Standards

## General Guidelines

1. **Follow existing patterns**: Match the style and conventions of the codebase
2. **Keep changes focused**: Only modify what's necessary for the task
3. **Write clean code**: Use meaningful names, keep functions small
4. **Test your changes**: Ensure existing tests pass, add tests for new functionality

## Commit Messages

Use conventional commits format:

```
type(scope): description

feat: new feature
fix: bug fix
docs: documentation only
style: formatting, no code change
refactor: code restructuring
test: adding tests
chore: maintenance
```

## Before Marking Done

- [ ] All tests pass
- [ ] Code follows existing patterns
- [ ] No debugging code left behind
- [ ] Changes are documented if needed

<!-- @if supportsLinting -->
## Linting

Run the linter before committing:

```bash
{{LINT_COMMAND}}
```

Fix any issues before marking the task as done.
<!-- @endif -->

<!-- @if supportsTypeChecking -->
## Type Checking

Run type checking before committing:

```bash
{{TYPECHECK_COMMAND}}
```

All type errors must be resolved.
<!-- @endif -->

<!-- @if supportsFormatting -->
## Code Formatting

Run the formatter before committing:

```bash
{{FORMAT_COMMAND}}
```

Ensure consistent formatting across the codebase.
<!-- @endif -->
