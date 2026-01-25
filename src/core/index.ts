// =============================================================================
// Core Layer - Business Logic
// =============================================================================

// Context and paths
export {
  BLOOM_DIR,
  DEFAULT_TASKS_FILE,
  findGitRoot,
  getTasksFile,
  isInGitRepo,
  POLL_INTERVAL_MS,
  REPOS_DIR,
  setTasksFile,
} from "../commands/context";
// Project creation
export { cmdCreate, createProject } from "../commands/create";
// Enter session
export { cmdEnter, runEnterSession } from "../commands/enter";
export { cmdGenerate } from "../commands/generate";
// Workspace initialization
export type { InitResult } from "../commands/init";
export { cmdInit, initWorkspace } from "../commands/init";
// Interjections
export { cmdInterjectDismiss, cmdInterjections, cmdInterjectResume } from "../commands/interjections";

// Planning commands
export { buildReposContext, cmdPlan, runPlanSession } from "../commands/plan-command";
// Questions
export { cmdAnswer, cmdAsk, cmdClearAnswered, cmdQuestions, cmdWaitAnswer } from "../commands/questions";
export type { RefineFile } from "../commands/refine";
export { cmdRefine, runRefineSession } from "../commands/refine";
// Task operations
export { cmdAgents, cmdDashboard, cmdList, cmdNext, cmdShow } from "../commands/tasks";
// Update
export { cmdUpdate } from "../commands/update";
// View
export type { ViewOptions } from "../commands/view";
export { cmdView } from "../commands/view";
// Services
export {
  createDashboardService,
  createProject as createProjectService,
  formatProjectName,
  formatPullResults,
  pullAndLogResults,
  runCreateSession,
  runGenerateSession,
} from "../services";
// Orchestrator
export { runAgentWorkLoop, startOrchestrator } from "./orchestrator";
// TUI
export type { InProcessService } from "./tui";
export { OrchestratorTUI } from "./tui";
