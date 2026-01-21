// =============================================================================
// Structured Logger for Bloom
// =============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, context: string, message: string): string {
  const levelTag = level.toUpperCase().padEnd(5);
  return `[${timestamp()}] [${levelTag}] [${context}] ${message}`;
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  child(subContext: string): Logger;
}

export function createLogger(context: string): Logger {
  return {
    debug(message: string, ...args: unknown[]) {
      if (shouldLog("debug")) {
        console.log(formatMessage("debug", context, message), ...args);
      }
    },

    info(message: string, ...args: unknown[]) {
      if (shouldLog("info")) {
        console.log(formatMessage("info", context, message), ...args);
      }
    },

    warn(message: string, ...args: unknown[]) {
      if (shouldLog("warn")) {
        console.warn(formatMessage("warn", context, message), ...args);
      }
    },

    error(message: string, ...args: unknown[]) {
      if (shouldLog("error")) {
        console.error(formatMessage("error", context, message), ...args);
      }
    },

    child(subContext: string): Logger {
      return createLogger(`${context}:${subContext}`);
    },
  };
}

// Pre-configured loggers for common modules
export const logger = {
  prime: createLogger("prime"),
  worktree: createLogger("worktree"),
  setup: createLogger("setup"),
  orchestrator: createLogger("orchestrator"),
  reset: createLogger("reset"),
  agent: (name: string) => createLogger(`agent:${name}`),
};

export default createLogger;
