import { describe, expect, it } from "bun:test";
import { formatPullResults, type PullAllResult } from "../../src/services/repo-service";

describe("repo-service", () => {
  describe("formatPullResults", () => {
    it("returns 'Updated: repo1, repo2' line for updated repos (green + cyan)", () => {
      const result: PullAllResult = {
        updated: ["repo1", "repo2"],
        upToDate: [],
        failed: [],
      };

      const lines = formatPullResults(result);

      expect(lines.length).toBe(1);
      // Check the raw text content is present (chalk adds ANSI codes around it)
      expect(lines[0]).toContain("Updated:");
      expect(lines[0]).toContain("repo1");
      expect(lines[0]).toContain("repo2");
    });

    it("returns 'Already up to date: repo1, repo2' line for up-to-date repos (dim)", () => {
      const result: PullAllResult = {
        updated: [],
        upToDate: ["repo1", "repo2"],
        failed: [],
      };

      const lines = formatPullResults(result);

      expect(lines.length).toBe(1);
      expect(lines[0]).toContain("Already up to date:");
      expect(lines[0]).toContain("repo1");
      expect(lines[0]).toContain("repo2");
    });

    it("returns warning lines for failed repos (yellow + red)", () => {
      const result: PullAllResult = {
        updated: [],
        upToDate: [],
        failed: [
          { name: "repo1", error: "Connection failed" },
          { name: "repo2", error: "Auth error" },
        ],
      };

      const lines = formatPullResults(result);

      // Should have: warning header, 2 error lines, and proceeding message
      expect(lines.length).toBe(4);
      expect(lines[0]).toContain("Warning: Failed to pull updates for some repos:");
      expect(lines[1]).toContain("repo1");
      expect(lines[1]).toContain("Connection failed");
      expect(lines[2]).toContain("repo2");
      expect(lines[2]).toContain("Auth error");
      expect(lines[3]).toContain("Proceeding with existing local state.");
    });

    it("returns empty array when all arrays are empty", () => {
      const result: PullAllResult = {
        updated: [],
        upToDate: [],
        failed: [],
      };

      const lines = formatPullResults(result);

      expect(lines).toEqual([]);
    });

    it("handles mixed results correctly", () => {
      const result: PullAllResult = {
        updated: ["updated-repo"],
        upToDate: ["uptodate-repo"],
        failed: [{ name: "failed-repo", error: "Network error" }],
      };

      const lines = formatPullResults(result);

      // Should have: updated line, up-to-date line, warning header, error line, proceeding message
      expect(lines.length).toBe(5);
      expect(lines[0]).toContain("Updated:");
      expect(lines[0]).toContain("updated-repo");
      expect(lines[1]).toContain("Already up to date:");
      expect(lines[1]).toContain("uptodate-repo");
      expect(lines[2]).toContain("Warning:");
      expect(lines[3]).toContain("failed-repo");
      expect(lines[3]).toContain("Network error");
      expect(lines[4]).toContain("Proceeding with existing local state.");
    });
  });
});
