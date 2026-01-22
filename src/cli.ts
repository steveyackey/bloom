#!/usr/bin/env bun
// =============================================================================
// Bloom CLI Entry Point
// =============================================================================
// This file routes all commands through the Clerc CLI framework.
// The old switch-case router is preserved below (commented out) as a fallback
// in case we need to quickly revert.
// =============================================================================

import "./cli-clerc";

// =============================================================================
// Legacy CLI Entry Point (commented out - kept for fallback)
// =============================================================================
// To revert to the old CLI, uncomment the code below and comment out the
// import "./cli-clerc" line above.
// =============================================================================

/*
import { main } from "./index";

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
*/
