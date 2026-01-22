// =============================================================================
// Interjection Commands for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";

import { getInterjectionIds } from "../../completions/providers";
import { getTasksFile } from "../context";
import { cmdInterjectDismiss, cmdInterjections, cmdInterjectResume } from "../interjections";

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register interjection commands with a Clerc CLI instance.
 */
export function registerInterjectionCommands(cli: Clerc): Clerc {
  return cli
    .command("interject", "List pending interjections")
    .on("interject", async () => {
      await cmdInterjections();
    })
    .command("interject resume", "Resume an interjected Claude session", {
      parameters: [
        {
          key: "<id>",
          description: "ID of the interjection to resume",
          completions: {
            handler: async (complete) => {
              const ids = await getInterjectionIds(getTasksFile());
              for (const id of ids) {
                complete(id, "Interjection ID");
              }
            },
          },
        },
      ],
    })
    .on("interject resume", async (ctx) => {
      const id = ctx.parameters.id as string;
      await cmdInterjectResume(id);
    })
    .command("interject dismiss", "Dismiss an interjection", {
      parameters: [
        {
          key: "<id>",
          description: "ID of the interjection to dismiss",
          completions: {
            handler: async (complete) => {
              const ids = await getInterjectionIds(getTasksFile());
              for (const id of ids) {
                complete(id, "Interjection ID");
              }
            },
          },
        },
      ],
    })
    .on("interject dismiss", async (ctx) => {
      const id = ctx.parameters.id as string;
      await cmdInterjectDismiss(id);
    });
}
