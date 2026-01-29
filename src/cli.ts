#!/usr/bin/env bun
// =============================================================================
// Bloom CLI Entry Point
// =============================================================================

// Handle special daemon entry mode (used by compiled binary to spawn daemon)
// Must be checked before Clerc initialization
if (process.argv.includes("--_daemon-entry")) {
  // Remove the flag and run daemon entry directly
  const idx = process.argv.indexOf("--_daemon-entry");
  process.argv.splice(idx, 1);

  // Import daemon entry - it starts the server which keeps the process alive.
  // Block forever after import to prevent the rest of cli.ts from running.
  await import("./daemon/entry");
  // Keep the process alive - the server is running but we need to prevent
  // the rest of this module from executing and calling cli.parse()
  await new Promise(() => {}); // Never resolves
}

import { resolve } from "node:path";
import chalk from "chalk";
import { Clerc, completionsPlugin, friendlyErrorPlugin, helpPlugin, notFoundPlugin, versionPlugin } from "clerc";

import {
  registerAgentCommands,
  registerConfigCommands,
  registerCreateCommand,
  registerDaemonCommands,
  registerDashboardCommand,
  registerEnterCommand,
  registerGenerateCommand,
  registerInboxCommand,
  registerInitCommand,
  registerInterjectCommands,
  registerPlanCommand,
  registerPromptCommands,
  registerQuestionCommands,
  registerRefineCommand,
  registerRepoCommands,
  registerResearchCommand,
  registerRunCommand,
  registerSetupCommand,
  registerTaskCommands,
  registerUpdateCommand,
  registerViewCommands,
} from "./cli/index";
import { setTasksFile } from "./commands/context";
import { type LogLevel, setLogLevel } from "./infra/logger";
import { VERSION } from "./version";

// Valid log levels for validation
const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

// =============================================================================
// Command Groups Definition
// =============================================================================

// Groups are ordered by frequency of human use - common commands first
const COMMAND_GROUPS = {
  commands: [
    // Most common human commands
    ["workflow", "Workflow"],
    ["monitor", "Monitor & Interact"],
    ["repo", "Repository Management"],
    // Less common / mixed human-AI
    ["tasks", "Task Operations"],
    // Primarily AI-used commands
    ["agent-ops", "Agent Operations"],
    ["collab", "Agent Collaboration"],
    // System/config
    ["system", "System"],
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

// =============================================================================
// Register Commands
// =============================================================================
// Each registration function is in src/cli/<command>.ts
// Files are named after the top-level command they represent

registerAgentCommands(cli);
registerConfigCommands(cli);
registerCreateCommand(cli);
registerDaemonCommands(cli);
registerDashboardCommand(cli);
registerEnterCommand(cli);
registerGenerateCommand(cli);
registerInboxCommand(cli);
registerInitCommand(cli);
registerInterjectCommands(cli);
registerPlanCommand(cli);
registerPromptCommands(cli);
registerQuestionCommands(cli);
registerRefineCommand(cli);
registerRepoCommands(cli);
registerResearchCommand(cli);
registerRunCommand(cli);
registerSetupCommand(cli);
registerTaskCommands(cli);
registerUpdateCommand(cli);
registerViewCommands(cli);

cli.parse();
