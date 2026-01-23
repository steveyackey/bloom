import { describe, expect, test } from "bun:test";
import { spawnTerminal } from "../src/core/terminal";

describe("terminal", () => {
  describe("spawnTerminal", () => {
    test("captures stdout output from spawned process via PTY", async () => {
      const captured: string[] = [];
      const testMessage = "Hello from PTY test";

      const proc = await spawnTerminal(["echo", testMessage], {
        cwd: process.cwd(),
        cols: 80,
        rows: 24,
        onData: (data) => {
          captured.push(data);
        },
      });

      await proc.exited;

      const output = captured.join("");
      expect(output).toContain(testMessage);
    });

    test("captures output from process that writes to stdout multiple times", async () => {
      const captured: string[] = [];

      const proc = await spawnTerminal(["sh", "-c", 'echo "line1"; echo "line2"; echo "line3"'], {
        cwd: process.cwd(),
        cols: 80,
        rows: 24,
        onData: (data) => {
          captured.push(data);
        },
      });

      await proc.exited;

      const output = captured.join("");
      expect(output).toContain("line1");
      expect(output).toContain("line2");
      expect(output).toContain("line3");
    });

    test("captures output from subprocess that writes to its own stdout", async () => {
      // This test simulates the agent scenario: a subprocess spawns another
      // process with pipes, reads from it, and writes to its own stdout.
      // The outer PTY should capture these writes.
      const captured: string[] = [];
      const testMessage = "subprocess-output-test";

      // Use bun to run inline code that writes to stdout
      const proc = await spawnTerminal(["bun", "-e", `process.stdout.write("${testMessage}\\n")`], {
        cwd: process.cwd(),
        cols: 80,
        rows: 24,
        onData: (data) => {
          captured.push(data);
        },
      });

      await proc.exited;

      const output = captured.join("");
      expect(output).toContain(testMessage);
    });

    test("write method sends input to subprocess", async () => {
      const captured: string[] = [];

      // Use cat which echoes stdin to stdout
      const proc = await spawnTerminal(["cat"], {
        cwd: process.cwd(),
        cols: 80,
        rows: 24,
        onData: (data) => {
          captured.push(data);
        },
      });

      // Write to the process and close stdin
      proc.write("test input\n");
      proc.write("\x04"); // Ctrl+D to close stdin

      await proc.exited;

      const output = captured.join("");
      expect(output).toContain("test input");
    });

    test("onExit callback receives exit code", async () => {
      let exitCode: number | undefined;

      const proc = await spawnTerminal(["sh", "-c", "exit 42"], {
        cwd: process.cwd(),
        cols: 80,
        rows: 24,
        onData: () => {},
        onExit: (code) => {
          exitCode = code;
        },
      });

      await proc.exited;

      expect(exitCode).toBe(42);
    });

    test("resize method does not throw", async () => {
      const proc = await spawnTerminal(["sleep", "0.1"], {
        cwd: process.cwd(),
        cols: 80,
        rows: 24,
        onData: () => {},
      });

      // Should not throw
      expect(() => proc.resize(120, 40)).not.toThrow();

      await proc.exited;
    });

    test("kill method terminates process", async () => {
      const proc = await spawnTerminal(["sleep", "10"], {
        cwd: process.cwd(),
        cols: 80,
        rows: 24,
        onData: () => {},
      });

      // Kill immediately
      proc.kill();

      const code = await proc.exited;
      // Process should have been terminated (non-zero or signal)
      expect(code).not.toBe(0);
    });

    test("pid is available", async () => {
      const proc = await spawnTerminal(["sleep", "0.1"], {
        cwd: process.cwd(),
        cols: 80,
        rows: 24,
        onData: () => {},
      });

      expect(proc.pid).toBeDefined();
      expect(typeof proc.pid).toBe("number");
      expect(proc.pid).toBeGreaterThan(0);

      await proc.exited;
    });

    test("respects cwd option", async () => {
      const captured: string[] = [];

      const proc = await spawnTerminal(["pwd"], {
        cwd: "/tmp",
        cols: 80,
        rows: 24,
        onData: (data) => {
          captured.push(data);
        },
      });

      await proc.exited;

      const output = captured.join("");
      expect(output).toContain("/tmp");
    });

    test("respects env option", async () => {
      const captured: string[] = [];
      const testEnvValue = "test-env-value-12345";

      const proc = await spawnTerminal(["sh", "-c", "echo $TEST_VAR"], {
        cwd: process.cwd(),
        cols: 80,
        rows: 24,
        env: { TEST_VAR: testEnvValue },
        onData: (data) => {
          captured.push(data);
        },
      });

      await proc.exited;

      const output = captured.join("");
      expect(output).toContain(testEnvValue);
    });
  });
});
