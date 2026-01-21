# Changelog

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
