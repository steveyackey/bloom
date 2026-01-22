#!/usr/bin/env bun
// =============================================================================
// Bloom CLI Entry Point (Clerc)
// =============================================================================

import { Cli, completionsPlugin } from "clerc";

import { VERSION } from "./version";

const cli = Cli()
  .name("bloom")
  .scriptName("bloom")
  .description("Multi-agent task orchestrator with YAML-based task management")
  .version(VERSION)
  .use(completionsPlugin());

cli.parse();
