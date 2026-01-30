// =============================================================================
// Bloom View Command - Visual Inspector for tasks.yaml
// =============================================================================

import type { Clerc } from "clerc";
import { cmdView } from "../commands/view";

export function registerViewCommands(cli: Clerc): Clerc {
  return cli
    .command("view", "Open visual inspector for tasks.yaml", {
      alias: "v",
      flags: {
        port: {
          type: Number,
          description: "Port to run the server on",
          default: 3000,
        },
        open: {
          type: Boolean,
          description: "Open browser automatically",
          default: true,
        },
      },
      help: { group: "monitor" },
    })
    .on("view", async (ctx) => {
      const { port, open } = ctx.flags as { port: number; open: boolean };
      await cmdView({ port, open });
    });
}
