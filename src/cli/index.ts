// =============================================================================
// CLI Commands Module - Re-exports all command registrations
// =============================================================================
// Each file is named after the top-level command it represents:
// - agent.ts → `bloom agent *` commands
// - config.ts → `bloom config *` commands
// - task.ts → `bloom list`, `bloom show`, etc. (task management)
// =============================================================================

export { registerAgentCommands } from "./agent";
export { registerConfigCommands } from "./config";
export { registerCreateCommand } from "./create";
export { registerDaemonCommands } from "./daemon";
export { registerDashboardCommand } from "./dashboard";
export { registerEnterCommand } from "./enter";
export { registerGenerateCommand } from "./generate";
export { registerInboxCommand } from "./inbox";
export { registerInitCommand } from "./init";
export { registerInterjectCommands } from "./interject";
export { registerPlanCommand } from "./plan";
export { registerPromptCommands } from "./prompt";
export { registerQuestionCommands } from "./questions";
export { registerRefineCommand } from "./refine";
export { registerRepoCommands } from "./repo";
export { registerResearchCommand } from "./research";
export { registerRunCommand } from "./run";
export { registerSetupCommand } from "./setup";
export { registerTaskCommands } from "./task";
export { registerUpdateCommand } from "./update";
export { registerViewCommands } from "./view";
