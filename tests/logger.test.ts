import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createLogger, getLogLevel, type LogLevel, logger, setLogLevel } from "../src/logger";

describe("logger", () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;
  let capturedLogs: { level: string; message: string; args: unknown[] }[];
  let originalLogLevel: LogLevel;

  beforeEach(() => {
    // Save original log level
    originalLogLevel = getLogLevel();

    // Capture console output
    capturedLogs = [];
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;

    console.log = (message: unknown, ...args: unknown[]) => {
      capturedLogs.push({ level: "log", message: String(message), args });
    };
    console.warn = (message: unknown, ...args: unknown[]) => {
      capturedLogs.push({ level: "warn", message: String(message), args });
    };
    console.error = (message: unknown, ...args: unknown[]) => {
      capturedLogs.push({ level: "error", message: String(message), args });
    };
  });

  afterEach(() => {
    // Restore console functions
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;

    // Restore log level
    setLogLevel(originalLogLevel);
  });

  describe("createLogger", () => {
    test("creates logger with context name", () => {
      const log = createLogger("test-context");
      expect(log).toBeDefined();
      expect(typeof log.debug).toBe("function");
      expect(typeof log.info).toBe("function");
      expect(typeof log.warn).toBe("function");
      expect(typeof log.error).toBe("function");
      expect(typeof log.child).toBe("function");
    });

    test("info() logs messages with context", () => {
      setLogLevel("info");
      const log = createLogger("test-context");
      log.info("Test message");

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.message).toContain("[test-context]");
      expect(capturedLogs[0]!.message).toContain("[INFO]");
      expect(capturedLogs[0]!.message).toContain("Test message");
    });

    test("debug() logs messages when level is debug", () => {
      setLogLevel("debug");
      const log = createLogger("test-context");
      log.debug("Debug message");

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.message).toContain("[DEBUG]");
    });

    test("debug() does not log when level is info", () => {
      setLogLevel("info");
      const log = createLogger("test-context");
      log.debug("Debug message");

      expect(capturedLogs.length).toBe(0);
    });

    test("warn() uses console.warn", () => {
      setLogLevel("info");
      const log = createLogger("test-context");
      log.warn("Warning message");

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.level).toBe("warn");
      expect(capturedLogs[0]!.message).toContain("[WARN]");
    });

    test("error() uses console.error", () => {
      setLogLevel("info");
      const log = createLogger("test-context");
      log.error("Error message");

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.level).toBe("error");
      expect(capturedLogs[0]!.message).toContain("[ERROR]");
    });

    test("passes additional arguments to console", () => {
      setLogLevel("info");
      const log = createLogger("test-context");
      log.info("Message with args", { key: "value" }, 123);

      expect(capturedLogs[0]!.args).toHaveLength(2);
      expect(capturedLogs[0]!.args[0]).toEqual({ key: "value" });
      expect(capturedLogs[0]!.args[1]).toBe(123);
    });
  });

  describe("child logger", () => {
    test("creates child logger with combined context", () => {
      setLogLevel("info");
      const parent = createLogger("parent");
      const child = parent.child("child");
      child.info("Child message");

      expect(capturedLogs[0]!.message).toContain("[parent:child]");
    });

    test("child logger respects log level", () => {
      setLogLevel("warn");
      const parent = createLogger("parent");
      const child = parent.child("child");
      child.info("Should not appear");
      child.warn("Should appear");

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.message).toContain("[WARN]");
    });
  });

  describe("setLogLevel", () => {
    test("sets log level to debug", () => {
      setLogLevel("debug");
      expect(getLogLevel()).toBe("debug");
    });

    test("sets log level to info", () => {
      setLogLevel("info");
      expect(getLogLevel()).toBe("info");
    });

    test("sets log level to warn", () => {
      setLogLevel("warn");
      expect(getLogLevel()).toBe("warn");
    });

    test("sets log level to error", () => {
      setLogLevel("error");
      expect(getLogLevel()).toBe("error");
    });
  });

  describe("log level filtering", () => {
    test("debug level shows all messages", () => {
      setLogLevel("debug");
      const log = createLogger("test");
      log.debug("Debug");
      log.info("Info");
      log.warn("Warn");
      log.error("Error");

      expect(capturedLogs.length).toBe(4);
    });

    test("info level hides debug messages", () => {
      setLogLevel("info");
      const log = createLogger("test");
      log.debug("Debug");
      log.info("Info");
      log.warn("Warn");
      log.error("Error");

      expect(capturedLogs.length).toBe(3);
      expect(capturedLogs.some((l) => l.message.includes("[DEBUG]"))).toBe(false);
    });

    test("warn level hides debug and info messages", () => {
      setLogLevel("warn");
      const log = createLogger("test");
      log.debug("Debug");
      log.info("Info");
      log.warn("Warn");
      log.error("Error");

      expect(capturedLogs.length).toBe(2);
      expect(capturedLogs.some((l) => l.message.includes("[DEBUG]"))).toBe(false);
      expect(capturedLogs.some((l) => l.message.includes("[INFO]"))).toBe(false);
    });

    test("error level shows only error messages", () => {
      setLogLevel("error");
      const log = createLogger("test");
      log.debug("Debug");
      log.info("Info");
      log.warn("Warn");
      log.error("Error");

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.message).toContain("[ERROR]");
    });
  });

  describe("pre-configured loggers", () => {
    test("exports pre-configured loggers", () => {
      expect(logger.prime).toBeDefined();
      expect(logger.worktree).toBeDefined();
      expect(logger.setup).toBeDefined();
      expect(logger.orchestrator).toBeDefined();
      expect(logger.reset).toBeDefined();
    });

    test("agent logger factory creates named loggers", () => {
      const agentLog = logger.agent("test-agent");
      expect(agentLog).toBeDefined();
      expect(typeof agentLog.info).toBe("function");

      setLogLevel("info");
      agentLog.info("Test");
      expect(capturedLogs[0]!.message).toContain("[agent:test-agent]");
    });
  });

  describe("message formatting", () => {
    test("includes timestamp in messages", () => {
      setLogLevel("info");
      const log = createLogger("test");
      log.info("Test");

      // Timestamp should be in the format HH:MM:SS
      expect(capturedLogs[0]!.message).toMatch(/\d{1,2}:\d{2}:\d{2}/);
    });

    test("includes level icon in messages", () => {
      setLogLevel("debug");
      const log = createLogger("test");

      log.debug("Test");
      expect(capturedLogs[0]!.message).toContain("·"); // debug icon

      log.info("Test");
      expect(capturedLogs[1]!.message).toContain("›"); // info icon

      log.warn("Test");
      expect(capturedLogs[2]!.message).toContain("⚠"); // warn icon

      log.error("Test");
      expect(capturedLogs[3]!.message).toContain("✗"); // error icon
    });
  });
});
