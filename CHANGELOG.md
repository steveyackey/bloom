# Changelog

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
