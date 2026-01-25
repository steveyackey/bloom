// =============================================================================
// Output and Logging Infrastructure
// =============================================================================
// Unified output system combining logging and styled terminal output.

// Re-export colors and styling
export {
  ansi,
  type BorderState,
  CSI,
  cellBgToAnsi,
  cellFgToAnsi,
  chalk,
  getBorderChalk,
  style,
} from "../colors";
// Re-export logger
export { createLogger, logger, setLogLevel } from "../logger";

// =============================================================================
// Semantic Output Helpers
// =============================================================================

import { style } from "../colors";

/**
 * Semantic output helpers for consistent CLI output.
 * Use these instead of raw console.log for better consistency.
 */
export const out = {
  /** Informational message */
  info: (msg: string) => console.log(style.info(msg)),

  /** Success message with checkmark */
  success: (msg: string) => console.log(style.success(`✓ ${msg}`)),

  /** Error message */
  error: (msg: string) => console.error(style.error(`✗ ${msg}`)),

  /** Warning message */
  warn: (msg: string) => console.log(style.warning(`⚠ ${msg}`)),

  /** Step/progress message */
  step: (msg: string) => console.log(style.dim(`› ${msg}`)),

  /** Section heading */
  heading: (msg: string) => console.log(style.header(`\n${msg}`)),

  /** Dimmed/secondary text */
  dim: (msg: string) => console.log(style.dim(msg)),

  /** Plain text (no styling) */
  plain: (msg: string) => console.log(msg),
};
