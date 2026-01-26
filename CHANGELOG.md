# Changelog

## [0.3.8](https://github.com/steveyackey/bloom/compare/bloom-v0.3.7...bloom-v0.3.8) (2026-01-26)


### Features

* auto-cleanup merged branches, worktrees, and remote branches ([0dfecee](https://github.com/steveyackey/bloom/commit/0dfecee1e7be049b079857f3d48134863175d697))
* default to integration branch workflow with auto-cleanup ([341846a](https://github.com/steveyackey/bloom/commit/341846a2440b6b76889d734055def50ff89bc263))
* let agent decide parallelization strategy ([5550d53](https://github.com/steveyackey/bloom/commit/5550d53fca62b9878605855549003f9e22a3c890))


### Documentation

* update README with integration branch workflow ([b73677e](https://github.com/steveyackey/bloom/commit/b73677ef0fa8b4f4f40b11156787ccc5f5a8c2fc))

## [0.3.7](https://github.com/steveyackey/bloom/compare/bloom-v0.3.6...bloom-v0.3.7) (2026-01-26)


### Bug Fixes

* handle streaming events for all agents in TUI dashboard ([d2bc5bd](https://github.com/steveyackey/bloom/commit/d2bc5bd9e241f4a49f2ad2bc2cfcbd45d40e113b))

## [0.3.6](https://github.com/steveyackey/bloom/compare/bloom-v0.3.5...bloom-v0.3.6) (2026-01-26)


### Features

* add final verification step and improve push_to_remote prompting ([8799929](https://github.com/steveyackey/bloom/commit/87999290d86b993aed58222e0270279bc31a23e8))


### Documentation

* simplify agent setup section in README to link to documentation ([18779fc](https://github.com/steveyackey/bloom/commit/18779fc577595619c0d1df41c9fdd958b183c710))
* update copilot installation guide to point to official GitHub docs ([9762d4d](https://github.com/steveyackey/bloom/commit/9762d4d4d084cb4c04cd584ebf625fcb680d8455))

## [0.3.5](https://github.com/steveyackey/bloom/compare/bloom-v0.3.4...bloom-v0.3.5) (2026-01-26)


### Bug Fixes

* add validation for push_to_remote and open_pr configuration ([077251e](https://github.com/steveyackey/bloom/commit/077251ed80263d09bb9f1fdab9b5f721e8a376b3))
* add validation for redundant checkpoint patterns ([105453f](https://github.com/steveyackey/bloom/commit/105453f70d226f33020cd9a9faab35f35775ec5e))

## [0.3.4](https://github.com/steveyackey/bloom/compare/bloom-v0.3.3...bloom-v0.3.4) (2026-01-26)


### Features

* consolidate prompts to embedded-only, remove prompts/ folder ([a53e67c](https://github.com/steveyackey/bloom/commit/a53e67c28df42fb6e8d834b4c07e064f94935546))
* consolidate workspace templates to embedded, remove template/ folder ([9f97305](https://github.com/steveyackey/bloom/commit/9f97305f949bb50b71eaad9b80e07cc3b465ce0b))


### Bug Fixes

* update create.test.ts to use embedded templates ([e0c14d5](https://github.com/steveyackey/bloom/commit/e0c14d5798b69fda2f4260cc8758757f629c5b5a))

## [0.3.3](https://github.com/steveyackey/bloom/compare/bloom-v0.3.2...bloom-v0.3.3) (2026-01-25)


### Features

* add steps display to bloom view and TUI dashboard ([3c6de69](https://github.com/steveyackey/bloom/commit/3c6de697569e1768dd85cd38a8cf42a5b2288464))


### Bug Fixes

* improve session handling and add TUI questions/dashboard ([62811f9](https://github.com/steveyackey/bloom/commit/62811f930fcf780af8a391aeec5ec0849e4710c7))

## [0.3.2](https://github.com/steveyackey/bloom/compare/bloom-v0.3.1...bloom-v0.3.2) (2026-01-25)


### Features

* add step commands and timing metrics for session reuse ([ae3545f](https://github.com/steveyackey/bloom/commit/ae3545f586f4328fc2a7c68f2004a60a7983bf39))
* add TaskStep schema for agent session reuse ([26c732b](https://github.com/steveyackey/bloom/commit/26c732bc17c101768dbe63bf428bad9eb613fe27))
* implement event-driven orchestrator architecture ([bc7d74e](https://github.com/steveyackey/bloom/commit/bc7d74ee8a7735806d3c48ec80f9aa2e039f241b))
* implement event-driven TUI architecture (Phase 5) ([9dfbe54](https://github.com/steveyackey/bloom/commit/9dfbe5407ad41cd549bf83d8bb669c79d0008634))
* implement step-aware work loop for session reuse ([09b266d](https://github.com/steveyackey/bloom/commit/09b266d06d6a1515edb14350c57f3f4e61d9fd89))
* refactor project architecture (Option 4) ([cafdccb](https://github.com/steveyackey/bloom/commit/cafdccb3f82085d6ddff6ed05e8ace6b4cddc1dd))
* **web:** polish landing page with Outfit font and updated copy ([56b2112](https://github.com/steveyackey/bloom/commit/56b21126a8f950841a67dec44ed85733f1ed9211))


### Bug Fixes

* add approval bypass flag for interactive mode ([07e0046](https://github.com/steveyackey/bloom/commit/07e004607be38461074b6d227cfa9b011992ee7a))
* add optional chaining for array access in tests ([08de364](https://github.com/steveyackey/bloom/commit/08de364f9c66565978fccb762a0a04d94c096ef4))
* remove unused imports after logging refactor ([c1647c3](https://github.com/steveyackey/bloom/commit/c1647c3be9c331bb54d8c6c74da74c1569d4b324))


### Documentation

* add comprehensive CLI command reference to CLAUDE.md ([8756e69](https://github.com/steveyackey/bloom/commit/8756e6917a9e2e13534bea2aedb68451cdd7cb92))
* define logging standards and refactor for compliance ([8bfb255](https://github.com/steveyackey/bloom/commit/8bfb2556a5abbb084d66b71945c4be6ad29e19f3))
* fix obsolete command in test-agent README ([38820d5](https://github.com/steveyackey/bloom/commit/38820d502f5e1acbadf1e75bcf3de629ed32e329))
* improve architecture docs and add --agent flag documentation ([3bf1d5c](https://github.com/steveyackey/bloom/commit/3bf1d5c02c86d11e0d4ec7b47d37f425177f0313))
* remove web adapter from planned architecture ([cd2f81f](https://github.com/steveyackey/bloom/commit/cd2f81f7de455d791d34410c45f498bf3331c5c5))

## [0.3.1](https://github.com/steveyackey/bloom/compare/bloom-v0.3.0...bloom-v0.3.1) (2026-01-25)


### Bug Fixes

* Revise plan document by removing questions section ([ba25599](https://github.com/steveyackey/bloom/commit/ba25599bbc5d78b7430d4602205b085da1a58597))
* update prompt tests to match adjusted prompt content ([97e7932](https://github.com/steveyackey/bloom/commit/97e79326c60f12b96dc52ae4d2b13d021fa7310c))

## [0.3.0](https://github.com/steveyackey/bloom/compare/bloom-v0.2.8...bloom-v0.3.0) (2026-01-25)


### ⚠ BREAKING CHANGES

* Config format changed from legacy interactiveAgent/nonInteractiveAgent to new agent.defaultInteractive/defaultNonInteractive structure

### Features

* add --agent flag and improve goose JSON output parsing ([a80e4eb](https://github.com/steveyackey/bloom/commit/a80e4ebc5e3ca1f372d7d5b7e82dff04f39d60a4))
* add agent check and validate commands ([7e2ee38](https://github.com/steveyackey/bloom/commit/7e2ee387bf0f9135a93cc601023ff09f1fb17a2d))
* add bloom view command for visual DAG inspector ([281e84c](https://github.com/steveyackey/bloom/commit/281e84cd9878f26844b39aa1e371908444a734c8))
* add demo script and e2e tests for test agent ([7c21abd](https://github.com/steveyackey/bloom/commit/7c21abd8779a9a6ccf1659282ae80c012797e09d))
* add Goose agent provider support ([ced1438](https://github.com/steveyackey/bloom/commit/ced1438f0617fc322ef1f6736c0bc63d6571e911))
* add Goose to docs navigation sidebar ([1b2c1c5](https://github.com/steveyackey/bloom/commit/1b2c1c570e04c0afc1b04ad4d6bb67d328536b6d))
* add model discovery for copilot and static models for claude ([9114d2b](https://github.com/steveyackey/bloom/commit/9114d2bdbdcd0963a46543649887ed1a05deb86e))
* add test agent for e2e testing without LLM ([3c352b2](https://github.com/steveyackey/bloom/commit/3c352b2573e5245235449c4f00aa526983f5ced8))
* add YAML schema-based agent definition system ([ca64799](https://github.com/steveyackey/bloom/commit/ca6479940fb88403b43938f2041767f9ba7726c9))
* refactor agent config with separate interactive/non-interactive defaults ([361fa5e](https://github.com/steveyackey/bloom/commit/361fa5eb12688b890712f32c586aed539f6c9443))
* remove Cline agent support and add ADDING_NEW_AGENTS guide ([e8b4f19](https://github.com/steveyackey/bloom/commit/e8b4f19564c25061aee546256a38b447f433a42a))
* set GOOSE_MODE=auto for goose autonomous execution ([9b0157d](https://github.com/steveyackey/bloom/commit/9b0157d87b4860225d2704b5d21d2794b3d80550))
* **view:** show working directory in prompt preview ([6463c9f](https://github.com/steveyackey/bloom/commit/6463c9fc43bef174fc3d537c3f9f5d17a0138861))
* **view:** show working directory in prompt preview ([ce75d11](https://github.com/steveyackey/bloom/commit/ce75d117490e88bae1ae5fea6e8f092ccb8d29bc))


### Bug Fixes

* always pass --with-builtin developer to goose ([54f9216](https://github.com/steveyackey/bloom/commit/54f921640aa97685edd14a21ee3b6c7805edc0ff))
* detect API errors in plain text output for session recovery ([b99bade](https://github.com/steveyackey/bloom/commit/b99bade3dc8af758f03e73135a4a4eb9ef253b8b))
* handle goose toolResponse camelCase content blocks ([90d7fa9](https://github.com/steveyackey/bloom/commit/90d7fa91cd470264bc0005428fd6bdb4c44a3a8a))
* more aggressive session clearing on resume failures ([05376f3](https://github.com/steveyackey/bloom/commit/05376f37d6f7013a0d6c3870fcfcad93f0c5b963))
* prevent infinite loop when agent fails to commit changes ([b8f9a6e](https://github.com/steveyackey/bloom/commit/b8f9a6e7054091745b222e4feecd2e5dcb8469fa))
* resolve TypeScript errors in e2e tests ([1b53c5b](https://github.com/steveyackey/bloom/commit/1b53c5bda3a4310cca4c20dbfa28acc20c7734e1))
* update OpenCode JSON parsing for stream-json format ([504b925](https://github.com/steveyackey/bloom/commit/504b9256b17b65d27035f7f540476ea7e83da208))
* use --yolo flag for copilot approval bypass ([456f067](https://github.com/steveyackey/bloom/commit/456f067f4461291dc7926d3a4547cf8f45936886))
* use correct help group syntax for view command ([1ea5482](https://github.com/steveyackey/bloom/commit/1ea5482b9e667d785f50b04c688e392536fbddac))


### Documentation

* add agent validation steps to ADDING_NEW_AGENTS.md ([5e5e4ce](https://github.com/steveyackey/bloom/commit/5e5e4ce51829802c47cfb2728e92c4318f3454fb))
* add animated demo to README, docs, and landing page ([837cf15](https://github.com/steveyackey/bloom/commit/837cf15e1b57e1b964893c212790eecece4a77ce))
* add bloom view command documentation ([689c34b](https://github.com/steveyackey/bloom/commit/689c34b0235818cb0881096a8e7132452b1885e3))
* add sample tasks and view preview for screenshots ([ed9c37f](https://github.com/steveyackey/bloom/commit/ed9c37f576febcdfd65bd92b918f904558bdfb64))
* clarify how capabilities are used in ADDING_NEW_AGENTS guide ([3af03a3](https://github.com/steveyackey/bloom/commit/3af03a3a628f6514a2aa09b09053532324701752))
* clarify non-interactive and approval bypass as required for agents ([2eef420](https://github.com/steveyackey/bloom/commit/2eef4201e09b064cebb0963706deb968b8d09ece))
* show real install in demo, remove unused VHS file ([81dd270](https://github.com/steveyackey/bloom/commit/81dd270692b44ff021d2f593e41f5e88462c78d9))
* update all documentation for new agent config system ([a7de2e5](https://github.com/steveyackey/bloom/commit/a7de2e533c0a1b1767411e4092a76a62953ec913))
* update Copilot CLI documentation link ([58a2fdc](https://github.com/steveyackey/bloom/commit/58a2fdc248caf7edb4fcd4c5f7a183ac369e0b34))
* update demo with full Bloom workflow ([51de8aa](https://github.com/steveyackey/bloom/commit/51de8aa9b2e9782ad3ecaf5c1b4d99c9a2a17b89))

## [0.2.8](https://github.com/steveyackey/bloom/compare/bloom-v0.2.7...bloom-v0.2.8) (2026-01-24)


### Bug Fixes

* update agent CLI integrations and session handling ([899dd56](https://github.com/steveyackey/bloom/commit/899dd56ee9b4a0f858a725fb43f8c58113756ba7))
* update Codex type exports and remove unused method ([adb79dc](https://github.com/steveyackey/bloom/commit/adb79dcdc03778d2d68ee4abe7faa603251b94b8))

## [0.2.7](https://github.com/steveyackey/bloom/compare/bloom-v0.2.6...bloom-v0.2.7) (2026-01-23)


### Features

* add done_pending_merge status for merge recovery ([07b1fab](https://github.com/steveyackey/bloom/commit/07b1fab6404c5419c68af0260435e14dbf3bdd36))
* implement per-task agent provider selection ([3d67554](https://github.com/steveyackey/bloom/commit/3d675542b08afd506f8e7fcde0ecaa7ebdd7c33b))


### Bug Fixes

* clarify merge requirements in plan/generate prompts ([51af19f](https://github.com/steveyackey/bloom/commit/51af19f3fb0dbcfeb7bf5b53bde013f1567ee354))
* emphasize PRs as primary workflow over direct merges ([db64a9b](https://github.com/steveyackey/bloom/commit/db64a9b9ed97586729291ffaab44de25a5149c4c))
* remove unused imports and prefix unused parameter ([c4cd45b](https://github.com/steveyackey/bloom/commit/c4cd45b978fcd774138cdfb58518fd4f33d665d0))
* resolve broken docs link and type errors in integration tests ([6951edf](https://github.com/steveyackey/bloom/commit/6951edff14419d8c1fd6b62c5435d01d804d7d94))
* resolve multi-agent orchestrator bugs and test schema issues ([65b5ddf](https://github.com/steveyackey/bloom/commit/65b5ddf911fc8ee6190d73f2b85cd2e82e1c9afb))

## [0.2.6](https://github.com/steveyackey/bloom/compare/bloom-v0.2.5...bloom-v0.2.6) (2026-01-23)


### Features

* custom git hooks installer for bare repo worktrees ([32115ac](https://github.com/steveyackey/bloom/commit/32115ac64a99d822239573c01ff58b406393b94e))


### Bug Fixes

* prevent duplicate repo entries when syncing ([d15d2f2](https://github.com/steveyackey/bloom/commit/d15d2f261b811ca47280f9c1c2e629d333f75568))
* protect default branch from cleanup deletion ([8b8917b](https://github.com/steveyackey/bloom/commit/8b8917b010ffe7b4698a05454c9345cffc9df38b))
* strip + prefix from worktree branches in getMergedBranches ([edcdcba](https://github.com/steveyackey/bloom/commit/edcdcba1c2785cc9f63591addea5e3a62ba3f0d1))
* track repos/ folder with .gitkeep so cloned workspaces work ([d41cf2a](https://github.com/steveyackey/bloom/commit/d41cf2a7159686e167d57ef382c3cf9512bfd8c6))

## [0.2.5](https://github.com/steveyackey/bloom/compare/bloom-v0.2.4...bloom-v0.2.5) (2026-01-23)


### Features

* add 'bloom create .' command for in-place project creation ([#67](https://github.com/steveyackey/bloom/issues/67)) ([0ce817c](https://github.com/steveyackey/bloom/commit/0ce817c55dcbf62e99003c003ef68444ea821189))
* add agent abstraction layer with factory pattern ([#66](https://github.com/steveyackey/bloom/issues/66)) ([00a01ec](https://github.com/steveyackey/bloom/commit/00a01ecd01ba4ec07c9dec41e53a463cafa7ae3c))
* add open_pr support for GitHub PR creation ([dec4a23](https://github.com/steveyackey/bloom/commit/dec4a23b74884c5ddc6a52dfe02c1dee5299e552))
* add workspace and repos context to create prompts ([f785a96](https://github.com/steveyackey/bloom/commit/f785a966121e927740e18fdde7e80c5b01165d19))
* improve validation, dashboard, and agent management ([be0c43d](https://github.com/steveyackey/bloom/commit/be0c43da0be7af0300e62c3fd42e1b4dfb0a45e8))
* load PRD and plan templates from workspace ([08a69d9](https://github.com/steveyackey/bloom/commit/08a69d9096e54aa683367416a72cb5670cd1b574))
* reorganize CLI help menu and add Windows process stats ([ff74b9a](https://github.com/steveyackey/bloom/commit/ff74b9adeac6675383c0b6870ee9b3cc9533d5f0))
* validate branch naming conflicts in tasks.yaml ([b89316c](https://github.com/steveyackey/bloom/commit/b89316c841e3a5f70e900634dc976c53398e7992))


### Bug Fixes

* add create-in-place prompt to embedded prompts ([80fa164](https://github.com/steveyackey/bloom/commit/80fa16409d37d518a6dfcdd9927495a672b3df13))
* add null checks for regex match array access ([7740055](https://github.com/steveyackey/bloom/commit/77400557dbc2c8e0be607346d40507bf31e7374d))
* auto-create merge target worktree when it doesn't exist ([148c37b](https://github.com/steveyackey/bloom/commit/148c37b72383c69263e6f15cc1f3f0d5da2ba82a))
* batch process stats collection and fix Windows CPU calculation ([f324950](https://github.com/steveyackey/bloom/commit/f324950fd1bf0e0ef56f3e6617cf6dcdea336029))
* condense repos context to single line per repo ([34f19c0](https://github.com/steveyackey/bloom/commit/34f19c017698c37b09f323bf2f131aa77883d761))
* create merge target branch from default when it doesn't exist ([9bc17b3](https://github.com/steveyackey/bloom/commit/9bc17b3057f120cc0e6880a01c3feb70316a6c2c))
* fall back to default branch when base branch doesn't exist ([8989231](https://github.com/steveyackey/bloom/commit/898923133303678731b4f8ef006b78f0ec252cb0))
* handle existing branch when creating worktree ([f942d42](https://github.com/steveyackey/bloom/commit/f942d4274a308780a66da303944cee21b4031122))
* improve checkpoint prompts, auto mode, and cross-platform stats ([3b95a5c](https://github.com/steveyackey/bloom/commit/3b95a5c4c701f8dbd42e2bd90e59d1e4a921eb31))
* parse /proc/stat correctly when process name contains spaces ([cfeea74](https://github.com/steveyackey/bloom/commit/cfeea747f99935da07d0a4439d214dcabdeb33be))
* remove dead code and add missing error handling ([3dca275](https://github.com/steveyackey/bloom/commit/3dca2751b8a839648ad1fa20033f32638a76af14))
* remove stdin: pipe from PTY spawn to fix agent output display ([2ef222c](https://github.com/steveyackey/bloom/commit/2ef222c7bc7b17503a454bc954ee7cf403c71f04))
* sync external prompt files with embedded prompts ([402b690](https://github.com/steveyackey/bloom/commit/402b6903d94ab1316436f1aa8c1c1f1cec91f4d0))

## [0.2.4](https://github.com/steveyackey/bloom/compare/bloom-v0.2.3...bloom-v0.2.4) (2026-01-22)


### Features

* **services:** add service layer structure with placeholder stubs ([d42de46](https://github.com/steveyackey/bloom/commit/d42de465268102f2469c6d97f36f2231b05f9db3))
* **services:** implement planning-service with buildReposContext, runPlanSession, runGenerateSession, runRefineSession ([dbc156e](https://github.com/steveyackey/bloom/commit/dbc156eb0f891538a5ab66d045a889bde8ccbf40))
* **services:** implement project-service with formatProjectName ([89c9a23](https://github.com/steveyackey/bloom/commit/89c9a23da2fb3a3ed37d748ec75bfc8d9486f80f))
* **services:** implement repo-service with formatPullResults, pullAndLogResults ([6eae49c](https://github.com/steveyackey/bloom/commit/6eae49cb6850e1cf3a5c7e91542e19f37e87be48))

## [0.2.3](https://github.com/steveyackey/bloom/compare/bloom-v0.2.2...bloom-v0.2.3) (2026-01-22)


### Bug Fixes

* **cli:** correct global flag positioning for Clerc parser ([d50f79a](https://github.com/steveyackey/bloom/commit/d50f79a1d7db5681e91779c6ebfbed63935f86ff))

## [0.2.2](https://github.com/steveyackey/bloom/compare/bloom-v0.2.1...bloom-v0.2.2) (2026-01-22)


### Features

* **cli:** add beautiful error handling and command grouping ([5ccc699](https://github.com/steveyackey/bloom/commit/5ccc699426876517299d49c1ff4a422691ac1b29))

## [0.2.1](https://github.com/steveyackey/bloom/compare/bloom-v0.2.0...bloom-v0.2.1) (2026-01-22)


### Features

* add clerc CLI framework dependencies ([1950985](https://github.com/steveyackey/bloom/commit/1950985952a993b351da7281eda110fcba23289c))
* add Clerc command modules for all command groups ([9410b2c](https://github.com/steveyackey/bloom/commit/9410b2c6ddbbdb68dae320f4522ec8125c251685))
* add config commands to Clerc CLI ([9398fc5](https://github.com/steveyackey/bloom/commit/9398fc5bf0c188f0fe641a22c350270791a354b1))
* add dynamic completion providers for CLI arguments ([a858a39](https://github.com/steveyackey/bloom/commit/a858a39d6cfea61a4b5b6a5788c897f5cc447efe))
* add global flags to Clerc CLI ([8cdd817](https://github.com/steveyackey/bloom/commit/8cdd817df5213a675a555fb7f13f09bd05978c69))
* add interject list subcommand to Clerc CLI ([f8b37b8](https://github.com/steveyackey/bloom/commit/f8b37b829831248fe2a1f0c862af8a3c18e16df9))
* create Clerc CLI skeleton with help and completions plugins ([f8b7ee2](https://github.com/steveyackey/bloom/commit/f8b7ee277c9924ea8eea06b7420f0e8db6a3c4b4))
* create command module structure for Clerc migration ([ac16b29](https://github.com/steveyackey/bloom/commit/ac16b2960b2651106b6f40414e01307be3a60626))
* migrate CLI to Clerc framework with shell completions ([09050a1](https://github.com/steveyackey/bloom/commit/09050a1cb0095d43b6c60401030dfadbf8cc1d08))
* prompt about push_to_remote during task generation ([ec94ecf](https://github.com/steveyackey/bloom/commit/ec94ecf2209c6dfcb21e17304dd50611064cbaf9))
* wire up Clerc CLI as main entry point ([162ed25](https://github.com/steveyackey/bloom/commit/162ed25e9f69c0a6bfefc030152484255b9e6057))


### Bug Fixes

* apply linting fixes to Clerc command modules ([1cd1da4](https://github.com/steveyackey/bloom/commit/1cd1da42c6227c73438b062090689c6a7b2be0d2))
* make completion handlers synchronous for shell integration ([48ca68e](https://github.com/steveyackey/bloom/commit/48ca68ee92b55828ea0ee427ac9a43efa73f7d27))


### Documentation

* add shell completion setup instructions to README ([ca06d42](https://github.com/steveyackey/bloom/commit/ca06d42853fad94ff47479af932693a0fe7e6d06))
* add shell completions to installation guide ([07d928e](https://github.com/steveyackey/bloom/commit/07d928e172826354e508d370dc94430ab7afe222))

## [0.2.0](https://github.com/steveyackey/bloom/compare/bloom-v0.1.19...bloom-v0.2.0) (2026-01-22)


### ⚠ BREAKING CHANGES

* The `worktree` field on tasks is removed. Use `branch` instead.

### Features

* add deterministic git workflow with lazy worktree creation ([5753269](https://github.com/steveyackey/bloom/commit/57532693a4528ba62ae9adb45ed4c136de7e7659))
* deterministic git workflow with lazy worktree creation ([bd094c9](https://github.com/steveyackey/bloom/commit/bd094c9d049678c8f31204a3f405e0bd61f2f792))
* improve agent session management and worktree safety ([c317169](https://github.com/steveyackey/bloom/commit/c317169a37f8e4484fa24ec5f1dab6f53c82923e))
* pull latest updates before generate and refine commands ([0a29a93](https://github.com/steveyackey/bloom/commit/0a29a93966385dc4d15223f254c9dca635a4596b))


### Bug Fixes

* configure git user for CI environments ([de91348](https://github.com/steveyackey/bloom/commit/de91348db5c9adddd7abcedf8e95ce6dd29617a3))
* remove conflicting merge instructions from agent system prompt ([0ca30ec](https://github.com/steveyackey/bloom/commit/0ca30ecd296ce8c40bef2b1ea7ebc65c941ee3d5))
* sanitize slashes in worktree branch names to prevent nested directories ([00b625a](https://github.com/steveyackey/bloom/commit/00b625a520dc270aceed4ee22ea7a013991ae56c))
* sanitize slashes in worktree branch names to prevent nested directories ([fb18d6e](https://github.com/steveyackey/bloom/commit/fb18d6edc2d3a6bd705586614020e524e2965850))

## [0.1.19](https://github.com/steveyackey/bloom/compare/bloom-v0.1.18...bloom-v0.1.19) (2026-01-22)


### Features

* search upward for bloom.config.yaml to find workspace root ([52b5c4b](https://github.com/steveyackey/bloom/commit/52b5c4bf99d779fed0286d5b8a502fa8f0133da4))
* **web:** redesign hero section with full-width background image ([30247ef](https://github.com/steveyackey/bloom/commit/30247ef54d0b65fe40af9d36af700747e462466c))

## [0.1.18](https://github.com/steveyackey/bloom/compare/bloom-v0.1.17...bloom-v0.1.18) (2026-01-21)


### Features

* add checkpoint field to task schema ([6635424](https://github.com/steveyackey/bloom/commit/6635424288a745b87c1340788b687f573a29f3ed))
* add install:local script for local testing ([7591e06](https://github.com/steveyackey/bloom/commit/7591e063cdcfdc0ec965f1e3908fa34bb65e19a1))
* add structured process, progress tracking, and learning capture to agent prompt ([ea2fad9](https://github.com/steveyackey/bloom/commit/ea2fad9bf3de63c19fd5dec16c11c33a00678fd4))


### Bug Fixes

* checkpoint question creation and storage location ([408994f](https://github.com/steveyackey/bloom/commit/408994f1bcad5ee27dc5f444c97e7d99e6a5e198))
* increase agent activity timeout from 2 to 10 minutes ([a9eeea1](https://github.com/steveyackey/bloom/commit/a9eeea1317bf50a2cad134e608b812c435445d01))
* remove colors from logging output ([417503d](https://github.com/steveyackey/bloom/commit/417503d94692ba6ac14ce097114874bbe1397126))
* TUI color rendering and default pane selection ([4ac90a0](https://github.com/steveyackey/bloom/commit/4ac90a0ac7f7438f5103954aa2d34f2a07c8b94a))

## [0.1.17](https://github.com/steveyackey/bloom/compare/bloom-v0.1.16...bloom-v0.1.17) (2026-01-21)


### Bug Fixes

* bloom run uses pwd for tasks.yaml and fix PullResult type usage ([5ff0092](https://github.com/steveyackey/bloom/commit/5ff0092e668a9e2d5f80dd1bdcd6f74e35af29db))

## [0.1.16](https://github.com/steveyackey/bloom/compare/bloom-v0.1.15...bloom-v0.1.16) (2026-01-21)


### Features

* pull latest updates from default branches before bloom run ([7f80b8e](https://github.com/steveyackey/bloom/commit/7f80b8e8d76bb6631117b5b69ed1d560967617ce))


### Bug Fixes

* improve TUI colors for dark terminal backgrounds ([4d06a2c](https://github.com/steveyackey/bloom/commit/4d06a2c6817395b12444fa93ef0ca38155b3b9a5))
* only pull repos referenced in tasks.yaml before bloom run ([024b0cb](https://github.com/steveyackey/bloom/commit/024b0cbcab3c9ae458e0e2319eb668fa5c5084d5))
* use pwd for tasks.yaml and generate, notify on checkpoint tasks ([bec6c91](https://github.com/steveyackey/bloom/commit/bec6c916f429adb988d28acbbff5411d3c276f26))

## [0.1.15](https://github.com/steveyackey/bloom/compare/bloom-v0.1.14...bloom-v0.1.15) (2026-01-21)


### Features

* add cd prompt after project creation ([c016882](https://github.com/steveyackey/bloom/commit/c0168824cab22604222364a969044fd219b0be6b))
* prompt for git protocol on first shorthand repo clone ([88b6a8c](https://github.com/steveyackey/bloom/commit/88b6a8cff7ae02199b177751bf9e93ef86abe07e))
* pull updates from default branches before bloom plan ([0e07616](https://github.com/steveyackey/bloom/commit/0e0761678b4864a392259deab208f5d86491a901))


### Bug Fixes

* change default git protocol from HTTPS to SSH ([efb9392](https://github.com/steveyackey/bloom/commit/efb9392c22d34dd0eec5370429a9fb062a2afaa1))
* **docs:** add mobile sidebar styling for proper display ([fef453f](https://github.com/steveyackey/bloom/commit/fef453fd6ceba3536526a61b5672b46108971c1b))
* resolve TypeScript errors in pull-repos tests ([d83a1fa](https://github.com/steveyackey/bloom/commit/d83a1fac18e5050a56c54b9d4127645fb786dcf6))
* use current directory for tasks.yaml path in generate command ([082c0fd](https://github.com/steveyackey/bloom/commit/082c0fde99be31855767cf18ed5591231c771a0d))


### Documentation

* update documentation to reflect new bare repo location ([aa936d8](https://github.com/steveyackey/bloom/commit/aa936d81317ddf4d21f07c565efe5596c1b1588f))

## [0.1.14](https://github.com/steveyackey/bloom/compare/bloom-v0.1.13...bloom-v0.1.14) (2026-01-21)


### Features

* change default git protocol recommendation to SSH ([c55f797](https://github.com/steveyackey/bloom/commit/c55f7976b0c26e0ec4470841f527a47d3b925231))
* pass initial prompt to Claude in interactive mode ([d1db4d4](https://github.com/steveyackey/bloom/commit/d1db4d4e57c4ae21dc20fc851d2597922274e03c))


### Bug Fixes

* correct broken footer links in docs site ([c6cb9f1](https://github.com/steveyackey/bloom/commit/c6cb9f1cc0970cdca3cab36c69adbd5f2391b61b))
* prevent Claude from building during PRD creation phase ([0af1b1d](https://github.com/steveyackey/bloom/commit/0af1b1d23ff83f228880a4bfd9fb518906d3cbae))
* remove unused YamlIcon component from web landing page ([093e9c0](https://github.com/steveyackey/bloom/commit/093e9c085ee48f1cc9c3b16f9994f315fbf98b7a))


### Documentation

* add release version and Bun badges to README ([c808339](https://github.com/steveyackey/bloom/commit/c808339061a9917ffdf52553199e73986784cb64))
* add website and documentation links to README ([6a77bd5](https://github.com/steveyackey/bloom/commit/6a77bd5022e6e271c4d89f965f754b00197122bd))
* update documentation to reflect SSH as recommended default ([cbfa57c](https://github.com/steveyackey/bloom/commit/cbfa57c08769e8e8a8228cd560dd005418b2f3dd))

## [0.1.13](https://github.com/steveyackey/bloom/compare/bloom-v0.1.12...bloom-v0.1.13) (2026-01-21)


### Documentation

* add cross-repo exploration with bloom enter ([4966c88](https://github.com/steveyackey/bloom/commit/4966c887a3a1af3b2a9cdd13fac607e74e2ccb53))
* clarify team collaboration and solo developer workflows ([deacc3a](https://github.com/steveyackey/bloom/commit/deacc3a2a98c0ed5ebe80138e5e3284308d86a6c))
* highlight multi-repository planning as key differentiator ([59fb1d2](https://github.com/steveyackey/bloom/commit/59fb1d2d461a6561a4940afa63af99c66a6453e4))

## [0.1.12](https://github.com/steveyackey/bloom/compare/bloom-v0.1.11...bloom-v0.1.12) (2026-01-20)


### Bug Fixes

* **commands:** add file selection to refine and proactive prompts to all commands ([18427c4](https://github.com/steveyackey/bloom/commit/18427c4761d037004ed0e5ce60e8d178eb2a1e70))


### Documentation

* add refine and enter command documentation ([752d826](https://github.com/steveyackey/bloom/commit/752d826857ec57f43bd89480663cad81e437a05b))
* document .gitignore generation in init command ([ff890fc](https://github.com/steveyackey/bloom/commit/ff890fc924fbf4ecea58b3c0ab89403b111f6a12))

## [0.1.11](https://github.com/steveyackey/bloom/compare/bloom-v0.1.10...bloom-v0.1.11) (2026-01-20)


### Bug Fixes

* **agents:** don't use --print flag in interactive mode ([b49b404](https://github.com/steveyackey/bloom/commit/b49b404cb72d6a458407bc3647d843983af5a362))
* **update:** correctly parse tag_name from GitHub API response ([ab1de6d](https://github.com/steveyackey/bloom/commit/ab1de6d1a11f9fde1adeead49b17471e9f4ace3f))

## [0.1.10](https://github.com/steveyackey/bloom/compare/bloom-v0.1.9...bloom-v0.1.10) (2026-01-20)


### Bug Fixes

* **prompts:** embed prompts for bundled binary support ([e6669e1](https://github.com/steveyackey/bloom/commit/e6669e1fc8f6c2787c4ce539f2b5deb8cc756811))
* **repos:** add fallback for git worktree without --orphan support ([ba0f74c](https://github.com/steveyackey/bloom/commit/ba0f74c7b6eb12eddf122c9fee4c69e2ee8050ba))

## [0.1.9](https://github.com/steveyackey/bloom/compare/bloom-v0.1.8...bloom-v0.1.9) (2026-01-20)


### Features

* **cli:** add update command for self-updating bloom ([70d4a12](https://github.com/steveyackey/bloom/commit/70d4a127b248d64fb9b2bdd7563fbc6106f51618))

## [0.1.8](https://github.com/steveyackey/bloom/compare/bloom-v0.1.7...bloom-v0.1.8) (2026-01-20)


### Features

* **init:** prompt for SSH/HTTPS preference during workspace setup ([9a13342](https://github.com/steveyackey/bloom/commit/9a13342cb20e949ae1f23773aca5e85a0a0ad307))
* **repo:** add org/repo shorthand for clone and repo create command ([9ebb579](https://github.com/steveyackey/bloom/commit/9ebb5796a78afb0435b3abcde8c4bfbb5b82573e))

## [0.1.7](https://github.com/steveyackey/bloom/compare/bloom-v0.1.6...bloom-v0.1.7) (2026-01-20)


### Features

* **init:** generate .gitignore that ignores repos/ folder ([d9a016e](https://github.com/steveyackey/bloom/commit/d9a016e06b28f2a457a4ae7b7c0f568fe045b070))
* **init:** generate .gitignore that ignores repos/ folder ([ffdb354](https://github.com/steveyackey/bloom/commit/ffdb3543d8b22e928fdab31fd62896883c5af722))

## [0.1.6](https://github.com/steveyackey/bloom/compare/bloom-v0.1.5...bloom-v0.1.6) (2026-01-20)


### Features

* add bloom enter command and improve refine ([facf061](https://github.com/steveyackey/bloom/commit/facf061b965660329242c8243f863bbbee0cf18a))
* restructure workspace setup and add refine command ([678c029](https://github.com/steveyackey/bloom/commit/678c0298af5be2ddb78bf859f41445bcc77a85e5))


### Documentation

* clarify that repos are managed separately from projects ([e5af260](https://github.com/steveyackey/bloom/commit/e5af260309ab10b9fb4dacfa0cb5ec2efe51a21f))
* fix README flow - workspace first, then repos, then projects ([caab689](https://github.com/steveyackey/bloom/commit/caab68920b6a96d542d6c4fc34dc9161c0ebddbf))
* fix README flow to clarify project-first approach ([a5922d0](https://github.com/steveyackey/bloom/commit/a5922d0acc48e46360bfbc14d6c7d3f914557b20))
* update CLAUDE.md and add tests for refine/enter commands ([646e830](https://github.com/steveyackey/bloom/commit/646e830942afc591fe315a891c6c941232c97cf8))

## [0.1.5](https://github.com/steveyackey/bloom/compare/bloom-v0.1.4...bloom-v0.1.5) (2026-01-20)


### Features

* add create, plan, and generate commands for new workflow ([c9393d1](https://github.com/steveyackey/bloom/commit/c9393d133a1669d598f615d17ad68c6178b4077c))
* use /template folder for project scaffolding ([89b5d16](https://github.com/steveyackey/bloom/commit/89b5d163864aa1629eed0ee9fb7ce2289d7ab87f))


### Bug Fixes

* make plan and generate prompts explicitly read project context files ([13184da](https://github.com/steveyackey/bloom/commit/13184da70940af439c9e44d89b95d542ee32edec))
* remove backticks from file paths in prompts to avoid slash command parsing ([7f5a2cd](https://github.com/steveyackey/bloom/commit/7f5a2cd97ae58d67ed92606f8cad07425111f0d9))


### Documentation

* clarify that bloom run auto-creates worktrees ([04dfe85](https://github.com/steveyackey/bloom/commit/04dfe853e0e020702d30dde3b538e09c4ce00256))
* explain worktrees and how they enable parallel agents ([ed9f976](https://github.com/steveyackey/bloom/commit/ed9f97691426ffa51140b03ed446f55b1ca91892))
* fix project structure in README to show PRD.md at root ([2d9a051](https://github.com/steveyackey/bloom/commit/2d9a0510d8dc302fed9b4a4299607b3c9dd45e70))
* improve getting started guide with bloom init workflow ([0d95c1f](https://github.com/steveyackey/bloom/commit/0d95c1f999387bcbc6885d2624ff56b258085658))

## [0.1.4](https://github.com/steveyackey/bloom/compare/bloom-v0.1.3...bloom-v0.1.4) (2026-01-20)


### Features

* add version command ([373f0fa](https://github.com/steveyackey/bloom/commit/373f0fa12dc4fa0edca609613e2856c00212c37d))


### Documentation

* add header image to README ([c98a898](https://github.com/steveyackey/bloom/commit/c98a8985fd78b329b2741aee873858c6c025e36e))

## [0.1.3](https://github.com/steveyackey/bloom/compare/bloom-v0.1.2...bloom-v0.1.3) (2026-01-20)


### Features

* add install scripts and improve project detection ([af9b8a9](https://github.com/steveyackey/bloom/commit/af9b8a9aa8c48a73d693115005c236ea16f0daf1))


### Documentation

* add ASCII art header to README ([cdfa650](https://github.com/steveyackey/bloom/commit/cdfa650678071123e927324becea6be83ef2432c))
* add README update guideline to CLAUDE.md ([20e2f08](https://github.com/steveyackey/bloom/commit/20e2f084e398c423eea9304843f4c128611d7147))

## [0.1.2](https://github.com/steveyackey/bloom/compare/bloom-v0.1.1...bloom-v0.1.2) (2026-01-20)


### Bug Fixes

* correct release-please output references for root package ([c292a5f](https://github.com/steveyackey/bloom/commit/c292a5f8a4dbe09a03a700cf8081e12b47e9ee16))

## [0.1.1](https://github.com/steveyackey/bloom/compare/bloom-v0.1.0...bloom-v0.1.1) (2026-01-20)


### Features

* add init command for workspace setup ([8d6521a](https://github.com/steveyackey/bloom/commit/8d6521af1497b56eb752e52b03a5b37610a82eca))


### Bug Fixes

* correct release-please package path to root ([dee53eb](https://github.com/steveyackey/bloom/commit/dee53eb5e3e3a06fc31f2c73a559f359ff42f262))
* update release-please manifest path ([42fd11c](https://github.com/steveyackey/bloom/commit/42fd11c9e8da540a71cb37dc94b28ec6528351c6))
* use correct package:all script in release workflow ([fa61543](https://github.com/steveyackey/bloom/commit/fa615438553760ab4a42da26a312304bac4276a7))
