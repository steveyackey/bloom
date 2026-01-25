// =============================================================================
// User Configuration - Re-exports from user-config.ts
// =============================================================================
// This module provides the public API for user configuration.
// The implementation lives in user-config.ts at the src root for now.

export type { AgentSection, UserConfig } from "../../user-config";

export {
  ensureGitProtocolConfigured,
  expandRepoUrl,
  extractRepoInfo,
  extractRepoName,
  getAgentConfig,
  getDefaultInteractiveAgent,
  getDefaultModel,
  getDefaultNonInteractiveAgent,
  isShorthandUrl,
  isToolAllowed,
  loadUserConfig,
  normalizeGitUrl,
  saveUserConfig,
  setAgentDefaultModel,
  setDefaultInteractiveAgent,
  setDefaultNonInteractiveAgent,
  setGitProtocol,
} from "../../user-config";
