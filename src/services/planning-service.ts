/**
 * Planning Service
 * Handles planning, generation, and refinement operations.
 */

/**
 * Builds context from repositories for planning sessions.
 * TODO: Implementation will be moved from plan-session.ts
 */
export async function buildReposContext(
  _workspaceRoot: string,
  _repos: string[],
): Promise<string> {
  throw new Error("Not implemented");
}

/**
 * Runs a planning session with the AI.
 * TODO: Implementation will be moved from plan-command.ts
 */
export async function runPlanSession(
  _projectRoot: string,
): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Runs a task generation session.
 * TODO: Implementation will be moved from generate.ts
 */
export async function runGenerateSession(
  _projectRoot: string,
): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Runs a refinement session for PRD or plan.
 * TODO: Implementation will be moved from refine.ts
 */
export async function runRefineSession(
  _projectRoot: string,
  _target: "prd" | "plan",
): Promise<void> {
  throw new Error("Not implemented");
}
