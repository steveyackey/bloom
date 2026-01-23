#!/usr/bin/env bun
// =============================================================================
// Bloom CLI - Main Entry Point (Vertical Slice Architecture)
// =============================================================================
//
// This CLI is organized into vertical slices where each feature contains
// both its command registration and implementation together.
//
// Structure:
//   src/
//   ├── cli.ts               # CLI entry point (imports this file)
//   ├── features/            # Vertical slices (command + logic together)
//   │   ├── init/           # bloom init
//   │   ├── create/         # bloom create
//   │   ├── repo/           # bloom repo *
//   │   ├── tasks/          # bloom list, show, next, etc.
//   │   ├── planning/       # bloom plan, refine, generate, enter
//   │   ├── run/            # bloom run (orchestrator)
//   │   ├── questions/      # bloom questions, ask, answer
//   │   ├── interjections/  # bloom interject
//   │   ├── config/         # bloom config
//   │   └── update/         # bloom update
//   └── core/               # Shared domain models and utilities
//       ├── tasks/          # Task schema and operations
//       ├── repos/          # Repo schema and git operations
//       ├── questions/      # Questions/interjections queue
//       ├── agents/         # Agent providers (Claude, OpenCode)
//       ├── config/         # User configuration
//       ├── logger.ts       # Logging utilities
//       ├── colors.ts       # Terminal colors
//       ├── terminal.ts     # PTY abstraction
//       ├── context.ts      # Workspace context
//       └── prompts.ts      # Prompt loading
// =============================================================================

import { Clerc, completionsPlugin, helpPlugin, versionPlugin } from "clerc";
import { setTasksFile } from "./core/context";
import { type LogLevel, setLogLevel } from "./core/logger";
import { register as registerConfig } from "./features/config";
import { register as registerCreate } from "./features/create";
// Import feature registrations
import { register as registerInit } from "./features/init";
import { register as registerInterjections } from "./features/interjections";
import { register as registerPlanning } from "./features/planning";
import { register as registerQuestions } from "./features/questions";
import { register as registerRepo } from "./features/repo";
import { register as registerRun } from "./features/run";
import { register as registerTasks } from "./features/tasks";
import { register as registerUpdate } from "./features/update";
import { VERSION } from "./version";

// =============================================================================
// Help Groups
// =============================================================================

// Groups are ordered by frequency of human use - common commands first
const helpGroups = {
  commands: [
    ["workflow", "Workflow"],
    ["monitor", "Monitoring"],
    ["tasks", "Task Management"],
    ["repo", "Repository"],
    ["questions", "Questions"],
    ["interjections", "Interjections"],
    ["system", "System"],
  ] as [string, string][],
};

// =============================================================================
// CLI Setup
// =============================================================================

let cli = Clerc.create()
  .name("bloom")
  .scriptName("bloom")
  .description("Orchestrate AI agents across your codebase")
  .version(VERSION)
  .use(helpPlugin({ groups: helpGroups }))
  .use(versionPlugin())
  .use(completionsPlugin());

// Global flags and interceptor
cli = cli
  .globalFlag("file", "Path to tasks file", {
    short: "f",
    type: String,
  })
  .globalFlag("logLevel", "Log level (debug, info, warn, error)", {
    short: "l",
    type: String,
  })
  .globalFlag("verbose", "Enable debug logging", {
    short: "v",
    type: Boolean,
  })
  .globalFlag("quiet", "Enable error-only logging", {
    short: "q",
    type: Boolean,
  })
  .interceptor({
    enforce: "pre",
    handler: (ctx, next) => {
      const { file, logLevel, verbose, quiet } = ctx.flags as {
        file?: string;
        logLevel?: string;
        verbose?: boolean;
        quiet?: boolean;
      };

      // Handle tasks file path
      if (file) {
        setTasksFile(file);
      }

      // Handle log level
      if (verbose) {
        setLogLevel("debug");
      } else if (quiet) {
        setLogLevel("error");
      } else if (logLevel) {
        const validLevels = ["debug", "info", "warn", "error"];
        if (validLevels.includes(logLevel)) {
          setLogLevel(logLevel as LogLevel);
        }
      }

      return next();
    },
  });

// =============================================================================
// Register Features
// =============================================================================

// Workflow
cli = registerInit(cli);
cli = registerCreate(cli);
cli = registerPlanning(cli);
cli = registerRun(cli);

// Repository
cli = registerRepo(cli);

// Task management
cli = registerTasks(cli);

// Human-in-the-loop
cli = registerQuestions(cli);
cli = registerInterjections(cli);

// System
cli = registerConfig(cli);
cli = registerUpdate(cli);

// =============================================================================
// Parse and Run
// =============================================================================

cli.parse();
