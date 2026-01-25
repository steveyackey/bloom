// =============================================================================
// CLI Event Handler
// =============================================================================
// This adapter converts orchestrator events to CLI console output using the logger.

import type { EventHandler, OrchestratorEvent } from "../../core/orchestrator";
import { createLogger, type Logger } from "../../infra/logger";

/**
 * Create a CLI event handler that outputs orchestrator events to the console.
 * Uses the structured logger for consistent formatting.
 *
 * @param agentName - The agent name for logger context
 * @returns An EventHandler function
 */
export function createCLIEventHandler(agentName: string): EventHandler {
  const log = createLogger(`agent:${agentName}`);

  return (event: OrchestratorEvent) => {
    handleEvent(event, log);
  };
}

function handleEvent(event: OrchestratorEvent, log: Logger): void {
  switch (event.type) {
    // Agent lifecycle
    case "agent:started":
      log.info(`Starting work loop (polling every ${event.pollInterval / 1000}s)...`);
      break;

    case "agent:idle":
      log.debug("No work available. Sleeping...");
      break;

    case "agent:output":
      // In CLI mode, output is already streamed by the agent provider
      // This event is for TUI/other adapters that need to capture output
      break;

    case "agent:process_started":
      log.debug(`Agent process started (PID: ${event.pid})`);
      break;

    case "agent:process_ended":
      log.debug(`Agent process ended (PID: ${event.pid}, exit: ${event.exitCode})`);
      break;

    // Task lifecycle
    case "task:found":
      log.info(`Found work: ${event.taskId} - ${event.title}`);
      break;

    case "task:started":
      log.info(`Starting ${event.provider} session in: ${event.workingDir}`);
      if (event.resuming) {
        log.debug("Resuming session");
      }
      break;

    case "task:completed":
      log.info(`Task ${event.taskId} completed successfully (${event.duration}s)`);
      break;

    case "task:failed":
      log.error(`Task ${event.taskId} ended with error after ${event.duration}s: ${event.error}`);
      break;

    case "task:blocked":
      log.error(`Task ${event.taskId} blocked: ${event.reason}`);
      break;

    // Git pull operations
    case "git:pulling":
      log.info(`Pulling latest updates for ${event.repo}...`);
      break;

    case "git:pulled":
      if (event.error) {
        log.warn(`Failed to pull ${event.repo}: ${event.error}`);
        log.info("Proceeding with existing local state...");
      } else if (event.updated) {
        log.info(`Updated ${event.repo} to latest`);
      } else {
        log.debug(`${event.repo} already up to date`);
      }
      break;

    // Worktree operations
    case "worktree:creating":
      log.info(`Creating worktree for branch: ${event.branch}`);
      if (event.baseBranch) {
        log.info(`  Base branch: ${event.baseBranch}`);
      }
      break;

    case "worktree:created":
      if (!event.success) {
        log.error(`Failed to create worktree: ${event.error}`);
      }
      break;

    // Uncommitted changes
    case "git:uncommitted_changes":
      log.warn(`Branch ${event.branch} has uncommitted changes:`);
      if (event.modifiedFiles.length > 0) {
        log.warn(`  Modified: ${event.modifiedFiles.join(", ")}`);
      }
      if (event.untrackedFiles.length > 0) {
        log.warn(`  Untracked: ${event.untrackedFiles.join(", ")}`);
      }
      if (event.stagedFiles.length > 0) {
        log.warn(`  Staged: ${event.stagedFiles.join(", ")}`);
      }
      log.info("Resuming agent to commit remaining changes...");
      break;

    // Commit retries
    case "commit:retry":
      log.warn(`Agent failed to commit changes (attempt ${event.attempt}/${event.maxAttempts})`);
      if (event.attempt < event.maxAttempts) {
        log.info("Clearing session to retry with fresh session...");
      }
      break;

    // Push operations
    case "git:pushing":
      log.info(`Pushing branch ${event.branch} to ${event.remote}...`);
      break;

    case "git:pushed":
      if (event.success) {
        log.info(`Pushed ${event.branch} successfully`);
      } else {
        log.warn(`Failed to push: ${event.error}`);
      }
      break;

    // PR operations
    case "git:pr_creating":
      log.info(`Creating PR: ${event.sourceBranch} -> ${event.targetBranch}...`);
      break;

    case "git:pr_created":
      if (event.url) {
        log.info(`PR created: ${event.url}`);
      } else if (event.alreadyExists) {
        log.info(`PR already exists for ${event.sourceBranch}`);
      } else if (event.error) {
        log.warn(`Failed to create PR: ${event.error}`);
      }
      break;

    // Merge lock operations
    case "merge:lock_waiting":
      log.info(
        `Waiting for merge lock (${Math.round(event.waitTime / 1000)}s) - held by ${event.holder} merging ${event.holderBranch}`
      );
      break;

    case "merge:lock_acquired":
      log.debug(`Acquired merge lock on ${event.targetBranch}`);
      break;

    case "merge:lock_timeout":
      log.warn(`Timed out waiting for merge lock on ${event.targetBranch}. Skipping merge.`);
      break;

    // Merge operations
    case "git:merging":
      log.info(`Merging ${event.sourceBranch} into ${event.targetBranch}...`);
      break;

    case "git:merged":
      log.info(`Merged ${event.sourceBranch} into ${event.targetBranch} successfully`);
      break;

    case "git:merge_conflict":
      log.warn(`Merge failed: ${event.error}`);
      break;

    // Conflict resolution
    case "merge:conflict_resolving":
      log.info("Resuming agent to resolve merge conflicts (merge lock held)...");
      break;

    case "merge:conflict_resolved":
      if (event.success) {
        log.info("Agent resolved merge conflicts successfully");
      } else {
        log.warn("Agent could not resolve merge conflicts. Manual intervention needed.");
      }
      break;

    // Branch cleanup
    case "git:cleanup":
      if (event.deleted.length > 0) {
        log.info(`Deleted merged branches: ${event.deleted.join(", ")}`);
      }
      for (const f of event.failed) {
        log.warn(`Failed to delete ${f.branch}: ${f.error}`);
      }
      break;

    // Session management
    case "session:corrupted":
      log.warn(`Session appears corrupted (was resuming: ${event.wasResuming}), clearing session ID for fresh start`);
      if (event.reason) {
        log.warn(`Detected fatal pattern: ${event.reason}`);
      }
      break;

    // Generic events
    case "error":
      log.error(event.message);
      if (event.context) {
        log.debug(`Context: ${JSON.stringify(event.context)}`);
      }
      break;

    case "log":
      log[event.level](event.message, ...(event.args || []));
      break;

    default: {
      // Exhaustive check - TypeScript will error if we miss an event type
      const _exhaustiveCheck: never = event;
      log.warn(`Unhandled event type: ${(_exhaustiveCheck as OrchestratorEvent).type}`);
    }
  }
}
