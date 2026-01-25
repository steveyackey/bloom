// =============================================================================
// Prompt Builder for View - Reuses real Bloom prompt generation logic
// =============================================================================

import { dirname, resolve } from "node:path";
import { PromptCompiler } from "../prompts/compiler";
import { getWorktreePath } from "../repos";
import type { TaskGraph, TaskNode } from "./graph";

/**
 * Build the system prompt for a task.
 * Uses the real PromptCompiler to load and compile agent-system.md.
 */
export async function buildSystemPrompt(node: TaskNode, tasksFile: string): Promise<string> {
  const compiler = new PromptCompiler();
  const taskCli = `bloom -f "${tasksFile}"`;

  try {
    return await compiler.loadAndCompile("agent-system", {
      variables: {
        AGENT_NAME: node.agent || "agent",
        TASK_ID: node.id,
        TASK_CLI: taskCli,
      },
    });
  } catch (err) {
    // If prompt file doesn't exist, return a placeholder
    return `# System Prompt\n\nCould not load agent-system prompt: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Build the user prompt for a task.
 * This mirrors the logic in orchestrator.ts:getTaskForAgent() lines 125-180.
 */
export async function buildTaskPrompt(node: TaskNode, graph: TaskGraph): Promise<string> {
  const taskCli = `bloom -f "tasks.yaml"`;
  let prompt = `# Task: ${node.title}\n\n## Task ID: ${node.id}\n\n`;

  if (node.instructions) {
    prompt += `## Instructions\n${node.instructions}\n\n`;
  }

  if (node.acceptanceCriteria.length > 0) {
    prompt += `## Acceptance Criteria\n${node.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}\n\n`;
  }

  if (node.dependsOn.length > 0) {
    // Show dependency titles for context
    const depTitles = node.dependsOn.map((depId) => {
      const depNode = graph.nodes.find((n) => n.id === depId);
      return depNode ? `- ${depId}: ${depNode.title}` : `- ${depId}`;
    });
    prompt += `## Dependencies\n${depTitles.join("\n")}\n\n`;
  }

  if (node.aiNotes.length > 0) {
    prompt += `## Previous Notes\n${node.aiNotes.map((n) => `- ${n}`).join("\n")}\n\n`;
  }

  // Add git workflow instructions if applicable
  if (node.branch && node.repo) {
    prompt += `## Git Workflow\n`;
    prompt += `- **Working branch**: \`${node.branch}\`\n`;
    if (node.baseBranch) {
      prompt += `- **Base branch**: \`${node.baseBranch}\`\n`;
    }

    if (node.openPr && node.mergeInto) {
      prompt += `- **PR target**: \`${node.mergeInto}\` (PR will be created automatically after task completes)\n\n`;
    } else if (node.mergeInto) {
      prompt += `- **Merge target**: \`${node.mergeInto}\` (handled automatically after task completes)\n\n`;
    }

    prompt += `### Important - Worktree Safety\n`;
    prompt += `**Do NOT switch branches or run \`git checkout\`** - this worktree is dedicated to \`${node.branch}\`.\n`;
    prompt += `The merge will be handled automatically by the orchestrator after you mark the task done.\n\n`;

    prompt += `### Before marking done:\n`;
    prompt += `1. Commit all changes with a descriptive message\n`;
    prompt += `2. Ensure all tests pass\n\n`;
  }

  prompt += `## Your Mission
Complete this task according to the instructions and acceptance criteria above.
When finished, mark the task as done using:
  ${taskCli} done ${node.id}

If you encounter blockers, mark it as blocked:
  ${taskCli} block ${node.id}

Begin working on the task now.`;

  return prompt;
}

/**
 * Compute the working directory for a task.
 * This mirrors the logic in orchestrator.ts:runAgentWorkLoop() lines 256-319.
 */
export function computeWorkingDirectory(node: TaskNode, tasksFile: string): string {
  const bloomDir = dirname(tasksFile);

  if (!node.repo) {
    return bloomDir;
  }

  const isPath = node.repo.startsWith("./") || node.repo.startsWith("/");

  if (isPath) {
    // Direct path - resolve relative to BLOOM_DIR
    return resolve(bloomDir, node.repo);
  }

  // Repo name - use worktree architecture
  if (node.branch) {
    return getWorktreePath(bloomDir, node.repo, node.branch);
  }

  // No branch - would use default branch worktree
  // For the preview, show the repos directory since we don't know the default branch
  return `${bloomDir}/repos/${node.repo}/worktrees/<default-branch>`;
}
