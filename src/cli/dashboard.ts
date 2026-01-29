// =============================================================================
// Bloom Queue Command - Web dashboard for daemon task queue
// =============================================================================

import type { Clerc } from "clerc";
import { cmdDashboard } from "../commands/dashboard";

export function registerDashboardCommand(cli: ReturnType<typeof Clerc.create>): void {
  cli
    .command("queue", "Open web dashboard for daemon task queue", {
      alias: "q",
      flags: {
        port: {
          type: Number,
          description: "Port to run the server on",
          default: 3100,
        },
        open: {
          type: Boolean,
          description: "Open browser automatically",
          default: true,
        },
      },
      help: { group: "monitor" },
    })
    .on("queue", async (ctx) => {
      const { port, open } = ctx.flags as { port: number; open: boolean };
      await cmdDashboard({ port, open });
    });
}
