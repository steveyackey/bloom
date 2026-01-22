#!/usr/bin/env bun
// =============================================================================
// Bloom CLI Entry Point (Clerc)
// =============================================================================

import { resolve } from "node:path";
import chalk from "chalk";
import { Clerc, completionsPlugin, friendlyErrorPlugin, helpPlugin, notFoundPlugin, versionPlugin } from "clerc";

import {
  registerAgentCommands,
  registerConfigCommands,
  registerInterjectionCommands,
  registerPlanningCommands,
  registerQuestionCommands,
  registerRepoCommands,
  registerSetupCommands,
  registerTaskCommands,
  registerUtilityCommands,
} from "./commands/cli";
import { setTasksFile } from "./commands/context";
import { type LogLevel, setLogLevel } from "./logger";
import { VERSION } from "./version";

// Valid log levels for validation
const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

// =============================================================================
// Command Groups Definition
// =============================================================================

const COMMAND_GROUPS = {
  commands: [
    ["setup", "Project Setup"],
    ["repo", "Repository Management"],
    ["planning", "Planning & Generation"],
    ["tasks", "Task Management"],
    ["agents", "Agent Operations"],
    ["collab", "Collaboration"],
    ["config", "Configuration"],
  ] as [string, string][],
};

// =============================================================================
// CLI Setup
// =============================================================================

const cli = Clerc.create()
  .name("bloom")
  .scriptName("bloom")
  .description("Multi-agent task orchestrator with YAML-based task management")
  .version(VERSION)
  // Add plugins
  .use(versionPlugin())
  .use(
    helpPlugin({
      groups: COMMAND_GROUPS,
    })
  )
  .use(completionsPlugin())
  .use(friendlyErrorPlugin())
  .use(notFoundPlugin())
  // Global flags
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
        setTasksFile(resolve(file));
      }

      // Handle log level - verbose and quiet take precedence
      if (verbose) {
        setLogLevel("debug");
      } else if (quiet) {
        setLogLevel("error");
      } else if (logLevel) {
        if (!VALID_LOG_LEVELS.includes(logLevel as LogLevel)) {
          console.error(
            `${chalk.red("Error:")} Invalid log level "${logLevel}". Valid levels: ${VALID_LOG_LEVELS.join(", ")}`
          );
          process.exit(1);
        }
        setLogLevel(logLevel as LogLevel);
      }

      return next();
    },
  });

// Register command groups
registerAgentCommands(cli);
registerConfigCommands(cli);
registerInterjectionCommands(cli);
registerPlanningCommands(cli);
registerQuestionCommands(cli);
registerRepoCommands(cli);
registerSetupCommands(cli);
registerTaskCommands(cli);
registerUtilityCommands(cli);

cli.parse();
