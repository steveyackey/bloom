/**
 * Sandbox Logger Tests
 *
 * Tests for sandbox lifecycle event logging including start/stop events,
 * policy violation logging, and output formatting.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getLogLevel, type LogLevel, setLogLevel } from "../../src/infra/logger";
import {
  createStartEvent,
  createStopEvent,
  type FilesystemViolation,
  logPolicyViolation,
  logSandboxCommand,
  logSandboxStart,
  logSandboxStop,
  type NetworkViolation,
  type PolicyViolationEvent,
  parseViolationsFromOutput,
  type SandboxStartEvent,
  type SandboxStopEvent,
  sandboxLogger,
  sandboxLoggers,
} from "../../src/sandbox/logger";

describe("Sandbox Logger", () => {
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

  // ===========================================================================
  // Logger Setup
  // ===========================================================================

  describe("logger setup", () => {
    test("exports sandbox logger", () => {
      expect(sandboxLogger).toBeDefined();
      expect(typeof sandboxLogger.info).toBe("function");
      expect(typeof sandboxLogger.debug).toBe("function");
      expect(typeof sandboxLogger.warn).toBe("function");
      expect(typeof sandboxLogger.error).toBe("function");
    });

    test("exports child loggers", () => {
      expect(sandboxLoggers.config).toBeDefined();
      expect(sandboxLoggers.executor).toBeDefined();
      expect(sandboxLoggers.platform).toBeDefined();
      expect(sandboxLoggers.lifecycle).toBeDefined();
      expect(sandboxLoggers.violations).toBeDefined();
    });

    test("child loggers have correct context", () => {
      setLogLevel("info");
      sandboxLoggers.lifecycle.info("test");

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.message).toContain("[sandbox:lifecycle]");
    });
  });

  // ===========================================================================
  // Sandbox Start Event Logging
  // ===========================================================================

  describe("logSandboxStart", () => {
    test("logs start event at info level", () => {
      setLogLevel("info");

      const event: SandboxStartEvent = {
        agentName: "test-agent",
        workspacePath: "/workspace/project",
        networkPolicy: "deny-all",
        sandboxed: true,
        writablePaths: [],
        denyReadPaths: ["~/.ssh"],
      };

      logSandboxStart(event);

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.message).toContain("[INFO]");
      expect(capturedLogs[0]!.message).toContain("[sandbox:lifecycle]");
      expect(capturedLogs[0]!.message).toContain('agent "test-agent"');
      expect(capturedLogs[0]!.message).toContain("sandboxed=true");
      expect(capturedLogs[0]!.message).toContain("workspace=/workspace/project");
      expect(capturedLogs[0]!.message).toContain("network=deny-all");
    });

    test("includes srt version when available", () => {
      setLogLevel("info");

      const event: SandboxStartEvent = {
        agentName: "test-agent",
        workspacePath: "/workspace",
        networkPolicy: "deny-all",
        sandboxed: true,
        srtVersion: "1.2.3",
        writablePaths: [],
        denyReadPaths: [],
      };

      logSandboxStart(event);

      expect(capturedLogs[0]!.message).toContain("srt=1.2.3");
    });

    test("logs detailed config at debug level", () => {
      setLogLevel("debug");

      const event: SandboxStartEvent = {
        agentName: "test-agent",
        workspacePath: "/workspace",
        networkPolicy: "allow-list",
        sandboxed: true,
        writablePaths: ["/tmp", "/var/cache"],
        denyReadPaths: ["~/.ssh", "~/.aws"],
      };

      logSandboxStart(event);

      // Should have 2 logs: info + debug
      expect(capturedLogs.length).toBe(2);
      expect(capturedLogs[1]!.message).toContain("[DEBUG]");
      expect(capturedLogs[1]!.args[0]).toEqual({
        workspacePath: "/workspace",
        networkPolicy: "allow-list",
        sandboxed: true,
        srtVersion: undefined,
        writablePaths: ["/tmp", "/var/cache"],
        denyReadPaths: ["~/.ssh", "~/.aws"],
      });
    });

    test("does not log debug details at info level", () => {
      setLogLevel("info");

      const event: SandboxStartEvent = {
        agentName: "test-agent",
        workspacePath: "/workspace",
        networkPolicy: "deny-all",
        sandboxed: true,
        writablePaths: ["/tmp"],
        denyReadPaths: ["~/.ssh"],
      };

      logSandboxStart(event);

      // Should only have 1 log at info level
      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.message).toContain("[INFO]");
    });
  });

  // ===========================================================================
  // Sandbox Stop Event Logging
  // ===========================================================================

  describe("logSandboxStop", () => {
    test("logs normal exit at info level", () => {
      setLogLevel("info");

      const event: SandboxStopEvent = {
        agentName: "test-agent",
        exitCode: 0,
        durationMs: 5000,
        killed: false,
      };

      logSandboxStop(event);

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.level).toBe("log");
      expect(capturedLogs[0]!.message).toContain("[INFO]");
      expect(capturedLogs[0]!.message).toContain('agent "test-agent"');
      expect(capturedLogs[0]!.message).toContain("exitCode=0");
      expect(capturedLogs[0]!.message).toContain("duration=5.00s");
    });

    test("logs non-zero exit code at warn level", () => {
      setLogLevel("info");

      const event: SandboxStopEvent = {
        agentName: "test-agent",
        exitCode: 1,
        durationMs: 3500,
        killed: false,
      };

      logSandboxStop(event);

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.level).toBe("warn");
      expect(capturedLogs[0]!.message).toContain("[WARN]");
      expect(capturedLogs[0]!.message).toContain("exitCode=1");
    });

    test("logs killed process at warn level", () => {
      setLogLevel("info");

      const event: SandboxStopEvent = {
        agentName: "test-agent",
        exitCode: null,
        durationMs: 10000,
        killed: true,
      };

      logSandboxStop(event);

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.level).toBe("warn");
      expect(capturedLogs[0]!.message).toContain("[WARN]");
      expect(capturedLogs[0]!.message).toContain("killed=true");
    });

    test("formats duration correctly", () => {
      setLogLevel("info");

      const event: SandboxStopEvent = {
        agentName: "test-agent",
        exitCode: 0,
        durationMs: 12345,
        killed: false,
      };

      logSandboxStop(event);

      expect(capturedLogs[0]!.message).toContain("duration=12.35s");
    });

    test("handles null exit code", () => {
      setLogLevel("info");

      const event: SandboxStopEvent = {
        agentName: "test-agent",
        exitCode: null,
        durationMs: 1000,
        killed: false,
      };

      logSandboxStop(event);

      expect(capturedLogs[0]!.message).toContain("exitCode=null");
    });
  });

  // ===========================================================================
  // Policy Violation Logging
  // ===========================================================================

  describe("logPolicyViolation", () => {
    test("logs filesystem read violation at warn level", () => {
      setLogLevel("info");

      const event: PolicyViolationEvent = {
        agentName: "test-agent",
        timestamp: Date.now(),
        violation: {
          type: "filesystem",
          path: "/etc/passwd",
          operation: "read",
          reason: "Policy denied access",
        },
      };

      logPolicyViolation(event);

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.level).toBe("warn");
      expect(capturedLogs[0]!.message).toContain("[WARN]");
      expect(capturedLogs[0]!.message).toContain("[sandbox:violations]");
      expect(capturedLogs[0]!.message).toContain("Filesystem access blocked");
      expect(capturedLogs[0]!.message).toContain("path=/etc/passwd");
      expect(capturedLogs[0]!.message).toContain("operation=read");
    });

    test("logs filesystem write violation", () => {
      setLogLevel("info");

      const event: PolicyViolationEvent = {
        agentName: "test-agent",
        timestamp: Date.now(),
        violation: {
          type: "filesystem",
          path: "/root/.bashrc",
          operation: "write",
          reason: "Write access denied",
        },
      };

      logPolicyViolation(event);

      expect(capturedLogs[0]!.message).toContain("operation=write");
      expect(capturedLogs[0]!.message).toContain("path=/root/.bashrc");
    });

    test("logs network violation with host and port", () => {
      setLogLevel("info");

      const event: PolicyViolationEvent = {
        agentName: "test-agent",
        timestamp: Date.now(),
        violation: {
          type: "network",
          host: "evil.com",
          port: 443,
          protocol: "tcp",
          reason: "Network access denied",
        },
      };

      logPolicyViolation(event);

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0]!.level).toBe("warn");
      expect(capturedLogs[0]!.message).toContain("Network request blocked");
      expect(capturedLogs[0]!.message).toContain("host=evil.com:443");
      expect(capturedLogs[0]!.message).toContain("(tcp)");
    });

    test("logs network violation without port", () => {
      setLogLevel("info");

      const event: PolicyViolationEvent = {
        agentName: "test-agent",
        timestamp: Date.now(),
        violation: {
          type: "network",
          host: "malware.net",
          reason: "Blocked by policy",
        },
      };

      logPolicyViolation(event);

      expect(capturedLogs[0]!.message).toContain("host=malware.net,");
      // Should not have a port number after the host
      expect(capturedLogs[0]!.message).not.toContain("host=malware.net:");
    });
  });

  // ===========================================================================
  // Sandbox Command Logging
  // ===========================================================================

  describe("logSandboxCommand", () => {
    test("logs command construction at debug level", () => {
      setLogLevel("debug");

      logSandboxCommand("test-agent", "claude", ["--print", "Hello"], "srt", [
        "--settings",
        "/tmp/settings.json",
        "claude",
        "--print",
        "Hello",
      ]);

      expect(capturedLogs.length).toBe(2);
      expect(capturedLogs[0]!.message).toContain("[DEBUG]");
      expect(capturedLogs[0]!.message).toContain("original=claude --print Hello");
      expect(capturedLogs[1]!.message).toContain("srt --settings /tmp/settings.json");
    });

    test("does not log at info level", () => {
      setLogLevel("info");

      logSandboxCommand("test-agent", "claude", ["--print"], "srt", ["--settings", "/tmp/s.json", "claude", "--print"]);

      expect(capturedLogs.length).toBe(0);
    });
  });

  // ===========================================================================
  // Violation Parsing
  // ===========================================================================

  describe("parseViolationsFromOutput", () => {
    test("parses filesystem read violation", () => {
      const output = "BLOCKED: read access to /etc/shadow";

      const violations = parseViolationsFromOutput("test-agent", output);

      expect(violations.length).toBe(1);
      expect(violations[0]!.agentName).toBe("test-agent");
      expect(violations[0]!.violation.type).toBe("filesystem");
      const fsViolation = violations[0]!.violation as FilesystemViolation;
      expect(fsViolation.operation).toBe("read");
      expect(fsViolation.path).toBe("/etc/shadow");
    });

    test("parses filesystem write violation", () => {
      const output = "BLOCKED: write access to /root/.ssh/authorized_keys";

      const violations = parseViolationsFromOutput("test-agent", output);

      expect(violations.length).toBe(1);
      const fsViolation = violations[0]!.violation as FilesystemViolation;
      expect(fsViolation.operation).toBe("write");
      expect(fsViolation.path).toBe("/root/.ssh/authorized_keys");
    });

    test("parses filesystem execute violation", () => {
      const output = "BLOCKED: execute access to /usr/bin/curl";

      const violations = parseViolationsFromOutput("test-agent", output);

      expect(violations.length).toBe(1);
      const fsViolation = violations[0]!.violation as FilesystemViolation;
      expect(fsViolation.operation).toBe("execute");
      expect(fsViolation.path).toBe("/usr/bin/curl");
    });

    test("parses network connection violation with port", () => {
      const output = "BLOCKED: network connection to evil.com:443";

      const violations = parseViolationsFromOutput("test-agent", output);

      expect(violations.length).toBe(1);
      expect(violations[0]!.violation.type).toBe("network");
      const netViolation = violations[0]!.violation as NetworkViolation;
      expect(netViolation.host).toBe("evil.com");
      expect(netViolation.port).toBe(443);
    });

    test("parses network request violation without port", () => {
      const output = "BLOCKED: network request to malware.net";

      const violations = parseViolationsFromOutput("test-agent", output);

      expect(violations.length).toBe(1);
      const netViolation = violations[0]!.violation as NetworkViolation;
      expect(netViolation.host).toBe("malware.net");
      expect(netViolation.port).toBeUndefined();
    });

    test("parses network violation with protocol", () => {
      const output = "BLOCKED: network connection to api.example.com:8080 (tcp)";

      const violations = parseViolationsFromOutput("test-agent", output);

      expect(violations.length).toBe(1);
      const netViolation = violations[0]!.violation as NetworkViolation;
      expect(netViolation.host).toBe("api.example.com");
      expect(netViolation.port).toBe(8080);
      expect(netViolation.protocol).toBe("tcp");
    });

    test("parses multiple violations", () => {
      const output = `
        Some other output
        BLOCKED: read access to /etc/passwd
        More output
        BLOCKED: network connection to evil.com:443
        BLOCKED: write access to /root/.bashrc
      `;

      const violations = parseViolationsFromOutput("test-agent", output);

      expect(violations.length).toBe(3);
      // Filesystem violations are parsed first, then network
      const fsViolations = violations.filter((v) => v.violation.type === "filesystem");
      const netViolations = violations.filter((v) => v.violation.type === "network");
      expect(fsViolations.length).toBe(2);
      expect(netViolations.length).toBe(1);
    });

    test("returns empty array for output with no violations", () => {
      const output = "Process completed successfully\nNo issues found";

      const violations = parseViolationsFromOutput("test-agent", output);

      expect(violations.length).toBe(0);
    });

    test("includes timestamp in parsed violations", () => {
      const beforeParse = Date.now();
      const output = "BLOCKED: read access to /etc/passwd";

      const violations = parseViolationsFromOutput("test-agent", output);
      const afterParse = Date.now();

      expect(violations[0]!.timestamp).toBeGreaterThanOrEqual(beforeParse);
      expect(violations[0]!.timestamp).toBeLessThanOrEqual(afterParse);
    });
  });

  // ===========================================================================
  // Helper Functions
  // ===========================================================================

  describe("createStartEvent", () => {
    test("creates start event from config", () => {
      const config = {
        enabled: true,
        workspacePath: "/workspace",
        networkPolicy: "deny-all" as const,
        allowedDomains: [],
        writablePaths: ["/tmp"],
        denyReadPaths: ["~/.ssh"],
        processLimit: 0,
      };

      const event = createStartEvent("my-agent", config, true, "1.0.0");

      expect(event.agentName).toBe("my-agent");
      expect(event.workspacePath).toBe("/workspace");
      expect(event.networkPolicy).toBe("deny-all");
      expect(event.sandboxed).toBe(true);
      expect(event.srtVersion).toBe("1.0.0");
      expect(event.writablePaths).toEqual(["/tmp"]);
      expect(event.denyReadPaths).toEqual(["~/.ssh"]);
    });

    test("handles missing srt version", () => {
      const config = {
        enabled: false,
        workspacePath: "/workspace",
        networkPolicy: "disabled" as const,
        allowedDomains: [],
        writablePaths: [],
        denyReadPaths: [],
        processLimit: 0,
      };

      const event = createStartEvent("agent", config, false);

      expect(event.srtVersion).toBeUndefined();
      expect(event.sandboxed).toBe(false);
    });
  });

  describe("createStopEvent", () => {
    test("creates stop event with duration calculation", () => {
      const startTime = Date.now() - 5000; // 5 seconds ago

      const event = createStopEvent("my-agent", 0, startTime, false);

      expect(event.agentName).toBe("my-agent");
      expect(event.exitCode).toBe(0);
      expect(event.killed).toBe(false);
      // Duration should be approximately 5000ms (allow some tolerance)
      expect(event.durationMs).toBeGreaterThanOrEqual(4900);
      expect(event.durationMs).toBeLessThanOrEqual(5200);
    });

    test("creates stop event for killed process", () => {
      const startTime = Date.now() - 1000;

      const event = createStopEvent("agent", null, startTime, true);

      expect(event.exitCode).toBeNull();
      expect(event.killed).toBe(true);
    });
  });
});
