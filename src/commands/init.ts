// =============================================================================
// Init Command - Initialize a new Bloom workspace
// =============================================================================

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as YAML from "yaml";
import { BLOOM_DIR, isInGitRepo } from "./context";

export interface InitResult {
  success: boolean;
  created: string[];
  skipped: string[];
  error?: string;
}

export async function initWorkspace(dir: string = BLOOM_DIR): Promise<InitResult> {
  const result: InitResult = {
    success: true,
    created: [],
    skipped: [],
  };

  const configFile = join(dir, "bloom.config.yaml");
  const reposDir = join(dir, "repos");
  const tasksFile = join(dir, "tasks.yaml");

  // Create bloom.config.yaml (marks this as a bloom project)
  if (existsSync(configFile)) {
    result.skipped.push("bloom.config.yaml");
  } else {
    const config = {
      version: 1,
      repos: [],
    };
    await Bun.write(configFile, YAML.stringify(config, { indent: 2 }));
    result.created.push("bloom.config.yaml");
  }

  // Create repos directory
  if (existsSync(reposDir)) {
    result.skipped.push("repos/");
  } else {
    mkdirSync(reposDir, { recursive: true });
    result.created.push("repos/");
  }

  // Create tasks.yaml
  if (existsSync(tasksFile)) {
    result.skipped.push("tasks.yaml");
  } else {
    await Bun.write(tasksFile, YAML.stringify({ tasks: [] }, { indent: 2 }));
    result.created.push("tasks.yaml");
  }

  return result;
}

export async function cmdInit(): Promise<void> {
  if (!isInGitRepo()) {
    console.log("Not in a git repository.\n");
    console.log("Bloom works best inside a git repo. Please run:");
    console.log("  git init");
    console.log("  git remote add origin <your-repo-url>");
    console.log("  git push -u origin main\n");
    console.log("Then run 'bloom init' again.");
    process.exit(1);
  }

  console.log(`Initializing Bloom workspace in ${BLOOM_DIR}\n`);

  const result = await initWorkspace();

  if (result.created.length > 0) {
    console.log("Created:");
    for (const item of result.created) {
      console.log(`  + ${item}`);
    }
  }

  if (result.skipped.length > 0) {
    console.log("Already exists:");
    for (const item of result.skipped) {
      console.log(`  - ${item}`);
    }
  }

  console.log("\nWorkspace ready. Next steps:");
  console.log("  bloom repo clone <url>    Add a repository");
  console.log("  bloom plan                Create tasks with Claude");
  console.log("  bloom run                 Start the orchestrator");
}
