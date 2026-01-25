// =============================================================================
// Infrastructure Layer - Public API
// =============================================================================

// Terminal abstraction
export {
  getProcessStatsBatch,
  type ProcessStats,
  spawnTerminal,
  type TerminalProcess,
  type TerminalSpawnOptions,
} from "../terminal";

// User configuration
export * from "./config";
// Git operations
export * from "./git";

// Output and logging
export { ansi, chalk, createLogger, logger, out, setLogLevel, style } from "./output";
