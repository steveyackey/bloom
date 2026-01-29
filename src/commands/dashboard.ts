// =============================================================================
// Dashboard Command Handler
// =============================================================================

import chalk from "chalk";
import { isDaemonRunning } from "../daemon";
import { startDashboardServer } from "../daemon/dashboard/server";

export interface DashboardOptions {
  port: number;
  open: boolean;
}

export async function cmdDashboard(options: DashboardOptions): Promise<void> {
  const running = await isDaemonRunning();

  console.log(chalk.blue("Starting Bloom Queue..."));
  if (!running) {
    console.log(
      chalk.yellow("Daemon is not running.") +
        chalk.gray(" Queue view will show offline state until you run ") +
        chalk.cyan("bloom daemon start")
    );
  }

  await startDashboardServer({
    port: options.port,
    open: options.open,
  });
}
