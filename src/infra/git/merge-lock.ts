// =============================================================================
// Merge Lock - Prevents concurrent merges to the same branch
// =============================================================================

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface MergeLock {
  agentName: string;
  sourceBranch: string;
  targetBranch: string;
  acquiredAt: string;
  pid: number;
}

function getMergeLockDir(bloomDir: string): string {
  return join(bloomDir, ".merge-locks");
}

function getMergeLockPath(bloomDir: string, repoName: string, targetBranch: string): string {
  // Sanitize branch name for filename
  const safeBranch = targetBranch.replace(/\//g, "_");
  return join(getMergeLockDir(bloomDir), `${repoName}-${safeBranch}.lock`);
}

/**
 * Acquire a merge lock for a target branch. Returns true if lock acquired.
 * If another agent holds the lock, returns false with info about the holder.
 */
export async function acquireMergeLock(
  bloomDir: string,
  repoName: string,
  targetBranch: string,
  agentName: string,
  sourceBranch: string
): Promise<{ acquired: boolean; holder?: MergeLock }> {
  const lockDir = getMergeLockDir(bloomDir);
  const lockPath = getMergeLockPath(bloomDir, repoName, targetBranch);

  // Ensure lock directory exists
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }

  // Check if lock exists
  if (existsSync(lockPath)) {
    try {
      const content = await Bun.file(lockPath).text();
      const holder: MergeLock = JSON.parse(content);

      // Check if lock is stale (older than 10 minutes or process is dead)
      const lockAge = Date.now() - new Date(holder.acquiredAt).getTime();
      const isStale = lockAge > 10 * 60 * 1000; // 10 minutes

      // Check if holder process is still alive
      let processAlive = false;
      try {
        process.kill(holder.pid, 0); // Signal 0 just checks if process exists
        processAlive = true;
      } catch {
        processAlive = false;
      }

      if (!isStale && processAlive) {
        return { acquired: false, holder };
      }
      // Lock is stale or process is dead, we can take it
    } catch {
      // Invalid lock file, we can take it
    }
  }

  // Acquire the lock
  const lock: MergeLock = {
    agentName,
    sourceBranch,
    targetBranch,
    acquiredAt: new Date().toISOString(),
    pid: process.pid,
  };

  await Bun.write(lockPath, JSON.stringify(lock, null, 2));
  return { acquired: true };
}

/**
 * Release a merge lock.
 */
export function releaseMergeLock(bloomDir: string, repoName: string, targetBranch: string): void {
  const lockPath = getMergeLockPath(bloomDir, repoName, targetBranch);
  if (existsSync(lockPath)) {
    rmSync(lockPath);
  }
}

/**
 * Wait for a merge lock to become available, with progress callback.
 * Returns when lock is acquired.
 */
export async function waitForMergeLock(
  bloomDir: string,
  repoName: string,
  targetBranch: string,
  agentName: string,
  sourceBranch: string,
  options?: {
    pollIntervalMs?: number;
    onWaiting?: (holder: MergeLock, waitTimeMs: number) => void;
    maxWaitMs?: number;
  }
): Promise<{ acquired: boolean; timedOut?: boolean }> {
  const pollInterval = options?.pollIntervalMs ?? 5000;
  const maxWait = options?.maxWaitMs ?? 5 * 60 * 1000; // 5 minutes default
  const startTime = Date.now();

  while (true) {
    const result = await acquireMergeLock(bloomDir, repoName, targetBranch, agentName, sourceBranch);

    if (result.acquired) {
      return { acquired: true };
    }

    const waitTime = Date.now() - startTime;

    if (waitTime >= maxWait) {
      return { acquired: false, timedOut: true };
    }

    if (options?.onWaiting && result.holder) {
      options.onWaiting(result.holder, waitTime);
    }

    await Bun.sleep(pollInterval);
  }
}
