Always use conventional commits.
We use release-please with this config:
  "changelog-sections": [
    { "type": "feat", "section": "Features" },
    { "type": "fix", "section": "Bug Fixes" },
    { "type": "perf", "section": "Performance Improvements" },
    { "type": "docs", "section": "Documentation" },
    { "type": "chore", "section": "Miscellaneous", "hidden": true }

Always update README.md when adding new commands, changing CLI behavior, or modifying project structure.

## Key Definitions

- **Workspace**: A git repo initialized with `bloom init`. Contains template/, repos/, and projects.
- **Repo**: A repository cloned into the workspace with `bloom repo clone`. Repos are shared across projects.
- **Project**: Work to be done on one or more repos. Created with `bloom create`. Contains PRD.md, plan.md, CLAUDE.md, tasks.yaml.
- **template/**: Folder created by `bloom init` containing PRD.md, plan.md, CLAUDE.template.md templates.

Flow: init workspace → clone repos → create project → refine PRD → plan → refine plan → generate → run