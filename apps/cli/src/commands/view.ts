// =============================================================================
// View Command Handler
// =============================================================================

import { existsSync } from "node:fs";
import chalk from "chalk";
import { startViewServer } from "../view/server";
import { getTasksFile } from "./context";

export interface ViewOptions {
  port: number;
  open: boolean;
}

export async function cmdView(options: ViewOptions): Promise<void> {
  const tasksFile = getTasksFile();

  if (!existsSync(tasksFile)) {
    console.error(chalk.red(`Error: Tasks file not found: ${tasksFile}`));
    console.error(chalk.gray("Run 'bloom generate' to create tasks from a plan."));
    process.exit(1);
  }

  console.log(chalk.blue("Starting Bloom View..."));
  console.log(chalk.gray(`Tasks file: ${tasksFile}`));

  await startViewServer({
    tasksFile,
    port: options.port,
    open: options.open,
  });
}
