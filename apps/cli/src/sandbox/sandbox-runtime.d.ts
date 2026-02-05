/**
 * Type declarations for @anthropic-ai/sandbox-runtime.
 *
 * This is an optional dependency that may not be installed. The executor
 * lazy-imports it with a try/catch. These declarations allow TypeScript
 * to understand the API shape without requiring the package to be present.
 */
declare module "@anthropic-ai/sandbox-runtime" {
  export interface SandboxRuntimeConfig {
    filesystem?: {
      denyRead?: string[];
      allowWrite?: string[];
      denyWrite?: string[];
    };
    network?: {
      allowedDomains?: string[];
      deniedDomains?: string[];
      allowLocalBinding?: boolean;
      allowUnixSockets?: string[];
      allowAllUnixSockets?: boolean;
    };
    ignoreViolations?: Record<string, string[]>;
    enableWeakerNestedSandbox?: boolean;
  }

  export class SandboxManager {
    static isSupportedPlatform(): boolean;
    static checkDependencies(): Promise<void>;
    static initialize(config: SandboxRuntimeConfig): Promise<void>;
    static wrapWithSandbox(command: string): Promise<string>;
    static reset(): Promise<void>;
  }

  export class SandboxViolationStore {
    static getViolations(): unknown[];
  }
}
