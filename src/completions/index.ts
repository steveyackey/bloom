// =============================================================================
// Completions Module - Dynamic completion providers for CLI arguments
// =============================================================================

export {
  type CompletionItem,
  type CompletionProvider,
  getAgentNames,
  getAgentNamesSync,
  getInterjectionIds,
  getInterjectionIdsSync,
  getQuestionIds,
  getQuestionIdsSync,
  getRepoNames,
  getRepoNamesSync,
  getTaskIds,
  getTaskIdsSync,
  getTaskStatuses,
} from "./providers";
