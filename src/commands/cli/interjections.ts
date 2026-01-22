// =============================================================================
// Interjection Commands for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";

import { getInterjectionIdsSync } from "../../completions/providers";
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
    .command("interject", "List pending interjections", {
      help: { group: "collab" },
    })
    .on("interject", async () => {
      await cmdInterjections();
    })
    .command("interject list", "List pending interjections", {
      help: { group: "collab" },
    })
    .on("interject list", async () => {
      await cmdInterjections();
    })
    .command("interject resume", "Resume an interjected Claude session", {
      parameters: [
        {
          key: "<id>",
          description: "ID of the interjection to resume",
          completions: {
            handler: (complete) => {
              const ids = getInterjectionIdsSync(getTasksFile());
              for (const id of ids) {
                complete(id, "Interjection ID");
              }
            },
          },
        },
      ],
      help: { group: "collab" },
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
            handler: (complete) => {
              const ids = getInterjectionIdsSync(getTasksFile());
              for (const id of ids) {
                complete(id, "Interjection ID");
              }
            },
          },
        },
      ],
      help: { group: "collab" },
    })
    .on("interject dismiss", async (ctx) => {
      const id = ctx.parameters.id as string;
      await cmdInterjectDismiss(id);
    });
}
