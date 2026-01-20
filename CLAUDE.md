Always use conventional commits.
We use release-please with this config:
  "changelog-sections": [
    { "type": "feat", "section": "Features" },
    { "type": "fix", "section": "Bug Fixes" },
    { "type": "perf", "section": "Performance Improvements" },
    { "type": "docs", "section": "Documentation" },
    { "type": "chore", "section": "Miscellaneous", "hidden": true }

Always update README.md when adding new commands, changing CLI behavior, or modifying project structure.