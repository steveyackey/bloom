// =============================================================================
// Init Command - Initialize a new Bloom workspace
// =============================================================================

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as YAML from "yaml";
import { BLOOM_DIR } from "./context";

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

  const reposDir = join(dir, "repos");
  const reposFile = join(dir, "bloom.repos.yaml");
  const tasksFile = join(dir, "tasks.yaml");

  // Create repos directory
  if (existsSync(reposDir)) {
    result.skipped.push("repos/");
  } else {
    mkdirSync(reposDir, { recursive: true });
    result.created.push("repos/");
  }

  // Create bloom.repos.yaml
  if (existsSync(reposFile)) {
    result.skipped.push("bloom.repos.yaml");
  } else {
    await Bun.write(reposFile, YAML.stringify({ repos: [] }, { indent: 2 }));
    result.created.push("bloom.repos.yaml");
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
  console.log("Initializing Bloom workspace...\n");

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
