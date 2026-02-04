// =============================================================================
// Platform Detection and Backend Selection
// =============================================================================

import { arch, platform } from "node:os";
import type { SandboxConfig } from "../config";
import { sandboxLoggers } from "../logger";
import * as linux from "./linux";
import * as macos from "./macos";

const log = sandboxLoggers.platform;

// =============================================================================
// Types
// =============================================================================

export interface PlatformInfo {
  os: "linux" | "darwin" | "win32" | string;
  arch: string;
}

export interface PlatformBackend {
  checkAvailability(): string | null;
  checkDependencies(): { available: boolean; missing: string[] };
  buildCommand(
    config: SandboxConfig,
    settingsPath: string,
    command: string,
    args: string[]
  ): { cmd: string; args: string[] };
}

// =============================================================================
// Detection
// =============================================================================

/**
 * Detect the current platform at runtime.
 */
export function detectPlatform(): PlatformInfo {
  return {
    os: platform(),
    arch: arch(),
  };
}

/**
 * Get the appropriate platform backend for the detected platform.
 * Returns null if the platform is not supported.
 */
export function getPlatformBackend(info: PlatformInfo): PlatformBackend | null {
  switch (info.os) {
    case "linux":
      log.debug("Selected Linux platform backend (bubblewrap + socat)");
      return linux;
    case "darwin":
      log.debug("Selected macOS platform backend (sandbox-exec)");
      return macos;
    default:
      log.debug(`No sandbox backend for platform: ${info.os}`);
      return null;
  }
}
