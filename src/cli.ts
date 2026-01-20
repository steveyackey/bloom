#!/usr/bin/env bun
// =============================================================================
// Bloom CLI Entry Point
// =============================================================================

import { main } from "./index";

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
