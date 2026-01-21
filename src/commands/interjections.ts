// =============================================================================
// Interjection Commands
// =============================================================================

import { spawnSync } from "node:child_process";
import { dismissInterjection, getInterjection, listInterjections, markInterjectionResumed } from "../human-queue";

export async function cmdInterjections(): Promise<void> {
  const interjections = await listInterjections("pending");

  if (interjections.length === 0) {
    console.log("No pending interjections");
    return;
  }

  console.log("Pending Interjections:\n");

  for (const i of interjections) {
    const time = new Date(i.createdAt).toLocaleTimeString();
    const taskInfo = i.taskId ? ` [task: ${i.taskId}]` : "";

    console.log(`${i.id}`);
    console.log(`  Agent: ${i.agentName}${taskInfo}`);
    console.log(`  Time: ${time}`);
    console.log(`  Dir: ${i.workingDirectory}`);
    if (i.sessionId) {
      console.log(`  Session: ${i.sessionId}`);
    }
    if (i.reason) {
      console.log(`  Reason: ${i.reason}`);
    }
    console.log(`  Resume: bloom interject resume ${i.id}`);
    console.log();
  }
}

export async function cmdInterjectResume(id: string): Promise<void> {
  const i = await getInterjection(id);

  if (!i) {
    console.error(`Interjection not found: ${id}`);
    process.exit(1);
  }

  if (i.status !== "pending") {
    console.error(`Interjection already ${i.status}: ${id}`);
    process.exit(1);
  }

  await markInterjectionResumed(id);

  console.log(`Resuming interjected session for ${i.agentName}\n`);
  console.log(`Working directory: ${i.workingDirectory}`);

  if (i.sessionId) {
    console.log(`Session ID: ${i.sessionId}`);
    console.log(`\nStarting interactive Claude session with --resume...\n`);

    spawnSync("claude", ["--resume", i.sessionId], {
      cwd: i.workingDirectory,
      stdio: "inherit",
    });
  } else {
    console.log(`\nNo session ID available. Starting fresh Claude session...\n`);
    console.log(`Task ID: ${i.taskId || "unknown"}`);

    spawnSync("claude", [], {
      cwd: i.workingDirectory,
      stdio: "inherit",
    });
  }
}

export async function cmdInterjectDismiss(id: string): Promise<void> {
  const success = await dismissInterjection(id);

  if (success) {
    console.log(`Dismissed interjection: ${id}`);
  } else {
    console.error(`Interjection not found: ${id}`);
    process.exit(1);
  }
}
