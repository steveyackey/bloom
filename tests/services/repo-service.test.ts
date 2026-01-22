import { describe, it } from "bun:test";

describe("repo-service", () => {
  describe("formatPullResults", () => {
    it.todo("returns 'Updated: repo1, repo2' line for updated repos (green + cyan)");
    it.todo("returns 'Already up to date: repo1, repo2' line for up-to-date repos (dim)");
    it.todo("returns warning lines for failed repos (yellow + red)");
    it.todo("returns empty array when all arrays are empty");
    it.todo("handles mixed results correctly");
  });

  describe("pullAndLogResults", () => {
    it.todo("calls pullAllDefaultBranches with bloomDir");
    it.todo("logs formatted results to console");
    it.todo("returns the PullAllResult for further use");
  });
});
