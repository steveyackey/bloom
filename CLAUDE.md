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

## CLI Commands

CLI commands are organized by top-level command name in `src/cli/`. Each file is named after the command it implements:

| File | Commands | Flags |
|------|----------|-------|
| `agent.ts` | `agent list`, `agents`, `agent interject <name>`, `agent check`, `agent validate [name]` | `--streaming/-s` |
| `config.ts` | `config` (alias: `cfg`), `config set-protocol`, `config set-interactive`, `config set-noninteractive`, `config set-model`, `config models` | `--discover/-d`, `--save/-s` |
| `create.ts` | `create [name...]` | |
| `enter.ts` | `enter` | `--agent/-a` |
| `generate.ts` | `generate` | `--agent/-a` |
| `init.ts` | `init` | |
| `interject.ts` | `interject`, `interject list`, `interject resume <id>`, `interject dismiss <id>` | |
| `plan.ts` | `plan` | `--agent/-a` |
| `prompt.ts` | `prompt compile <agent>` | `--task/-t`, `--prompt/-p` |
| `questions.ts` | `questions` (alias: `qs`), `questions-dashboard` (alias: `qd`), `ask`, `answer`, `wait-answer`, `clear-answered` | `--all/-a`, `--task/-t`, `--type`, `--choices/-c`, `--on-yes`, `--on-no`, `--add-note` |
| `refine.ts` | `refine` | `--agent/-a` |
| `repo.ts` | `repo clone`, `repo create`, `repo list`, `repo sync`, `repo remove`, `repo worktree add/remove/list` | `--name`, `--create` |
| `run.ts` | `run` | `--agent/-a` |
| `setup.ts` | `setup` | |
| `task.ts` | `list`, `show`, `dashboard`, `validate`, `next`, `ready`, `start`, `done`, `block`, `todo`, `assign`, `note`, `reset` | `--stuck/-s` |
| `update.ts` | `update` | |
| `view.ts` | `view` (alias: `v`) | `--port`, `--open` |

**Global flags** (all commands): `--file/-f`, `--logLevel/-l`, `--verbose/-v`, `--quiet/-q`

**Adding a new top-level command:**
1. Create `src/cli/<command>.ts`
2. Export `register<Command>Command(cli: Clerc)`
3. Add export to `src/cli/index.ts`
4. Register in `src/cli.ts`

Entry point: `src/cli.ts` (Clerc setup + command registration)

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