Always use conventional commits.
We use release-please with this config:
  "changelog-sections": [
    { "type": "feat", "section": "Features" },
    { "type": "fix", "section": "Bug Fixes" },
    { "type": "perf", "section": "Performance Improvements" },
    { "type": "docs", "section": "Documentation" },
    { "type": "chore", "section": "Miscellaneous", "hidden": true }

Always update README.md when adding new commands, changing CLI behavior, or modifying project structure.

## Documentation & Website Maintenance

When making changes to bloom:
- **README.md**: Update for any new commands, CLI behavior changes, or project structure modifications
- **docs/**: Update the Docusaurus documentation site (docs.use-bloom.dev) with detailed guides and API references
- **web/**: Update the landing page (use-bloom.dev) for any changes to installation instructions or major feature announcements

Installation changes must be reflected in:
1. README.md (quick start)
2. docs/ (detailed installation guide)
3. web/ landing page (all platform instructions: macOS, Linux, Windows)

## Key Definitions

- **Workspace**: A git repo initialized with `bloom init`. Contains template/, repos/, and projects.
- **Repo**: A repository cloned into the workspace with `bloom repo clone`. Repos are shared across projects.
- **Project**: Work to be done on one or more repos. Created with `bloom create`. Contains PRD.md, plan.md, CLAUDE.md, tasks.yaml.
- **template/**: Folder created by `bloom init` containing PRD.md, plan.md, CLAUDE.template.md templates.

Flow: init workspace → clone repos → create project → refine PRD → plan → refine plan → generate → run

## TUI Colors

Use `chalk` for all terminal colors. For xterm.js cell rendering, use helper methods (`isFgDefault()`, `isFgPalette()`, `isFgRGB()`) not raw color mode values.

## Agent Providers

When adding or modifying agent providers, refer to `ADDING_NEW_AGENTS.md` for the complete checklist and implementation guide.

Key files for agent management:
- `src/agents/` - Provider implementations
- `src/agents/capabilities.ts` - Agent capabilities registry
- `src/agents/factory.ts` - Agent creation factory
- `src/agents/availability.ts` - CLI availability checking
- `src/user-config.ts` - User configuration schemas
- `docs/docs/agents/` - Agent documentation pages

When changing agent support, update ADDING_NEW_AGENTS.md if the process changes.

## Building Docs and Web

When editing files in `docs/` or `web/` directories, always run `bun install` and `bun run build` in the respective directory before committing to ensure the changes compile correctly.

```bash
# For docs changes
cd docs && bun install && bun run build

# For web changes
cd web && bun install && bun run build
```