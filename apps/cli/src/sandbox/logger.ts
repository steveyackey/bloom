// =============================================================================
// Sandbox Lifecycle Event Logging
// =============================================================================

import { createLogger } from "../infra/logger";

export const sandboxLogger = createLogger("sandbox");

export const sandboxLoggers = {
  config: sandboxLogger.child("config"),
  executor: sandboxLogger.child("executor"),
  platform: sandboxLogger.child("platform"),
};
