// =============================================================================
// Enter Command for Clerc CLI
// =============================================================================

import type { Clerc } from "clerc";
import { BLOOM_DIR } from "../commands/context";
import { cmdEnter, cmdEnterRepo, cmdEnterRepoBranch } from "../commands/enter";
import { getBranchNamesSync, getRepoNamesSync } from "../completions/providers";

// =============================================================================
// Completions Handlers
// =============================================================================

const repoNameCompletions = (complete: (value: string, description: string) => void) => {
  const repos = getRepoNamesSync(BLOOM_DIR);
  for (const repo of repos) {
    complete(repo, "Repository");
  }
};

const branchNameCompletions = (complete: (value: string, description: string) => void) => {
  // Extract the repo name from process.argv to provide context-aware branch completions
  // During shell completion, argv looks like: [..., "enter", "<repo>", "<partial-branch>"]
  const args = process.argv;
  const enterIdx = args.indexOf("enter");
  if (enterIdx === -1 || enterIdx + 1 >= args.length) return;

  const repoName = args[enterIdx + 1];
  if (!repoName) return;

  const branches = getBranchNamesSync(BLOOM_DIR, repoName);
  for (const branch of branches) {
    complete(branch, "Branch");
  }
};

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the enter command with a Clerc CLI instance.
 */
export function registerEnterCommand(cli: Clerc): Clerc {
  return cli
    .command("enter", "Open Claude Code session in project context", {
      parameters: [
        {
          key: "[repo]",
          description: "Repository name",
          completions: {
            handler: repoNameCompletions,
          },
        },
        {
          key: "[branch]",
          description: "Branch name",
          completions: {
            handler: branchNameCompletions,
          },
        },
      ],
      flags: {
        agent: {
          type: String,
          short: "a",
          description: "Override the default agent for this command",
        },
      },
      help: { group: "system" },
    })
    .on("enter", async (ctx) => {
      const agent = ctx.flags.agent as string | undefined;
      const repo = ctx.parameters.repo as string | undefined;
      const branch = ctx.parameters.branch as string | undefined;

      if (repo && branch) {
        await cmdEnterRepoBranch(repo, branch, agent);
      } else if (repo) {
        await cmdEnterRepo(repo, agent);
      } else {
        await cmdEnter(agent);
      }
    });
}
