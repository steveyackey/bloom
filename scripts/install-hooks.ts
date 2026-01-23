#!/usr/bin/env bun
/**
 * Install git hooks - works with both regular repos and bare repo worktrees
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const HOOKS = {
  "pre-commit": "bun run fix && git add -u",
};

function getGitDir(): string {
  const gitPath = join(process.cwd(), ".git");

  if (!existsSync(gitPath)) {
    throw new Error("Not a git repository");
  }

  // Check if .git is a file (worktree) or directory (regular repo)
  const stat = Bun.file(gitPath);

  // If it's a file, read the gitdir path from it
  if (existsSync(gitPath) && !require("fs").statSync(gitPath).isDirectory()) {
    const content = readFileSync(gitPath, "utf-8").trim();
    const match = content.match(/^gitdir:\s*(.+)$/);
    if (match) {
      // For worktrees, hooks should go in the main bare repo's hooks dir
      // gitdir points to something like: /path/to/repo.git/worktrees/branch-name
      // We want: /path/to/repo.git/hooks
      const worktreeGitDir = match[1];
      const bareRepoPath = dirname(dirname(worktreeGitDir)); // Go up from worktrees/branch to repo.git
      return bareRepoPath;
    }
  }

  return gitPath;
}

function installHooks() {
  try {
    const gitDir = getGitDir();
    const hooksDir = join(gitDir, "hooks");

    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
    }

    for (const [hookName, command] of Object.entries(HOOKS)) {
      const hookPath = join(hooksDir, hookName);
      const hookContent = `#!/bin/sh
${command}
`;
      writeFileSync(hookPath, hookContent);
      chmodSync(hookPath, 0o755);
      console.log(`Installed ${hookName} hook at ${hookPath}`);
    }
  } catch (error) {
    // Silently fail if not in a git repo (e.g., during npm pack)
    if (error instanceof Error && error.message.includes("Not a git repository")) {
      console.log("Skipping git hooks installation (not a git repository)");
      return;
    }
    console.error("Failed to install git hooks:", error);
  }
}

installHooks();
