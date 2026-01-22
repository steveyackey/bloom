import { describe, it } from "bun:test";

describe("project-service", () => {
  describe("formatProjectName", () => {
    // Array input (from variadic CLI args)
    it.todo(
      "converts ['my', 'big', 'idea'] to { slug: 'my-big-idea', displayName: 'my big idea' }",
    );
    it.todo(
      "converts ['My', 'Big', 'Idea'] to { slug: 'my-big-idea', displayName: 'My Big Idea' }",
    );
    it.todo("converts ['project'] to { slug: 'project', displayName: 'project' }");

    // String input (backwards compatibility)
    it.todo(
      "converts 'my big idea' to { slug: 'my-big-idea', displayName: 'my big idea' }",
    );
    it.todo(
      "converts 'My Big Idea' to { slug: 'my-big-idea', displayName: 'My Big Idea' }",
    );
    it.todo("converts 'my-project' to { slug: 'my-project', displayName: 'my-project' }");

    // Edge cases
    it.todo("trims whitespace from string input");
    it.todo("collapses multiple spaces to single space in displayName");
    it.todo("handles empty array by throwing error");
    it.todo("handles empty string by throwing error");
    it.todo("removes special characters from slug (keeps alphanumeric and dashes)");
  });

  describe("createProject", () => {
    it.todo("creates project directory at correct path");
    it.todo("copies template files (PRD.md, plan.md)");
    it.todo("renames CLAUDE.template.md to CLAUDE.md");
    it.todo("returns list of created files in result.created");
    it.todo("returns { success: false } if project directory already exists");
    it.todo("returns { success: false } if template directory not found");
  });
});
