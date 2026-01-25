// =============================================================================
// Init Command - Initialize a new Bloom workspace
// =============================================================================

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import * as YAML from "yaml";
import { getUserConfigPath, loadUserConfig, setGitProtocol } from "../infra/config";
import { BLOOM_DIR, isInGitRepo } from "./context";
import { DEFAULT_PLAN_TEMPLATE, DEFAULT_PRD_TEMPLATE } from "../prompts-embedded";

// Path to template folder (relative to this file's package)
const PACKAGE_TEMPLATE_DIR = resolve(import.meta.dirname ?? ".", "..", "..", "template");

export interface InitResult {
  success: boolean;
  created: string[];
  skipped: string[];
  error?: string;
}

export async function initWorkspace(dir: string = BLOOM_DIR): Promise<InitResult> {
  const result: InitResult = {
    success: true,
    created: [],
    skipped: [],
  };

  const configFile = join(dir, "bloom.config.yaml");
  const reposDir = join(dir, "repos");
  const templateDir = join(dir, "template");

  // Create bloom.config.yaml (marks this as a bloom project)
  if (existsSync(configFile)) {
    result.skipped.push("bloom.config.yaml");
  } else {
    const config = {
      version: 1,
      repos: [],
    };
    await Bun.write(configFile, YAML.stringify(config, { indent: 2 }));
    result.created.push("bloom.config.yaml");
  }

  // Create repos directory with .gitkeep
  const gitkeepPath = join(reposDir, ".gitkeep");
  if (existsSync(reposDir)) {
    result.skipped.push("repos/");
    // Ensure .gitkeep exists even if repos/ already exists
    if (!existsSync(gitkeepPath)) {
      await Bun.write(gitkeepPath, "");
      result.created.push("repos/.gitkeep");
    }
  } else {
    mkdirSync(reposDir, { recursive: true });
    await Bun.write(gitkeepPath, "");
    result.created.push("repos/");
    result.created.push("repos/.gitkeep");
  }

  // Add repos/* and !repos/.gitkeep to .gitignore (create or append)
  const gitignorePath = join(dir, ".gitignore");
  const reposIgnorePattern = "repos/*";
  const gitkeepException = "!repos/.gitkeep";
  if (existsSync(gitignorePath)) {
    let gitignoreContent = readFileSync(gitignorePath, "utf-8");
    // Check if already has the new pattern
    if (gitignoreContent.includes(reposIgnorePattern)) {
      result.skipped.push(".gitignore (repos/* already present)");
    } else {
      // Remove old "repos/" entry if present (handles with or without trailing newline)
      gitignoreContent = gitignoreContent.replace(/^repos\/\n?/m, "");
      const newline = gitignoreContent.endsWith("\n") ? "" : "\n";
      gitignoreContent += `${newline}${reposIgnorePattern}\n${gitkeepException}\n`;
      await Bun.write(gitignorePath, gitignoreContent);
      result.created.push(".gitignore (added repos/*, !repos/.gitkeep)");
    }
  } else {
    await Bun.write(gitignorePath, `${reposIgnorePattern}\n${gitkeepException}\n`);
    result.created.push(".gitignore");
  }

  // Create template directory and copy template files
  if (existsSync(templateDir)) {
    result.skipped.push("template/");
  } else {
    mkdirSync(templateDir, { recursive: true });
    result.created.push("template/");

    // Copy template files from package to workspace template/
    if (existsSync(PACKAGE_TEMPLATE_DIR)) {
      const templateFiles = readdirSync(PACKAGE_TEMPLATE_DIR);
      for (const file of templateFiles) {
        const srcPath = join(PACKAGE_TEMPLATE_DIR, file);
        const destPath = join(templateDir, file);
        cpSync(srcPath, destPath, { recursive: true });
        result.created.push(`template/${file}`);
      }
    } else {
      // Fallback: use embedded templates (for bundled binary where package template dir doesn't exist)
      await Bun.write(join(templateDir, "PRD.md"), DEFAULT_PRD_TEMPLATE);
      result.created.push("template/PRD.md");

      await Bun.write(join(templateDir, "plan.md"), DEFAULT_PLAN_TEMPLATE);
      result.created.push("template/plan.md");

      const claudeContent = `# Project Guidelines

## Commit Style
Always use conventional commits.

## Development Workflow
1. Review the PRD in PRD.md
2. Check the plan in plan.md
3. Follow the tasks in tasks.yaml

## Code Standards
- Write clear, maintainable code
- Add tests for new functionality
- Update documentation as needed
`;

      await Bun.write(join(templateDir, "CLAUDE.template.md"), claudeContent);
      result.created.push("template/CLAUDE.template.md");
    }
  }

  return result;
}

async function promptGitProtocol(): Promise<"ssh" | "https"> {
  const select = (await import("@inquirer/select")).default;

  const protocol = await select({
    message: "How do you want to clone repositories?",
    choices: [
      {
        name: chalk.cyan("SSH") + chalk.dim(" (recommended)"),
        value: "ssh",
        description: "Uses SSH keys, preferred for most developers",
      },
      {
        name: "HTTPS",
        value: "https",
        description: "Works without SSH keys, uses personal access tokens",
      },
    ],
    default: "ssh",
  });

  return protocol as "ssh" | "https";
}

export async function cmdInit(): Promise<void> {
  if (!isInGitRepo()) {
    console.log(chalk.yellow("Not in a git repository.\n"));
    console.log(chalk.dim("Bloom works best inside a git repo. Please run:"));
    console.log(`  ${chalk.cyan("git init")}`);
    console.log(`  ${chalk.cyan("git remote add origin")} ${chalk.yellow("<your-repo-url>")}`);
    console.log(`  ${chalk.cyan("git push -u origin main")}\n`);
    console.log(chalk.dim("Then run 'bloom init' again."));
    process.exit(1);
  }

  console.log(`${chalk.bold.cyan("Initializing Bloom workspace")} in ${chalk.dim(BLOOM_DIR)}\n`);

  const result = await initWorkspace();

  if (result.created.length > 0) {
    console.log(chalk.bold("Created:"));
    for (const item of result.created) {
      console.log(`  ${chalk.green("+")} ${item}`);
    }
  }

  if (result.skipped.length > 0) {
    console.log(chalk.bold("Already exists:"));
    for (const item of result.skipped) {
      console.log(`  ${chalk.dim("-")} ${chalk.dim(item)}`);
    }
  }

  // Prompt for git protocol preference if user config doesn't exist yet
  const configExists = existsSync(getUserConfigPath());
  if (!configExists) {
    console.log("");
    const protocol = await promptGitProtocol();
    await setGitProtocol(protocol);
    console.log(`\n${chalk.bold("Git protocol set to:")} ${chalk.cyan(protocol)}`);
    console.log(chalk.dim("  To change later: bloom config set-protocol <ssh|https>"));
  } else {
    const userConfig = await loadUserConfig();
    console.log(`\n${chalk.dim("Using existing git protocol preference:")} ${chalk.cyan(userConfig.gitProtocol)}`);
    console.log(chalk.dim("  To change: bloom config set-protocol <ssh|https>"));
  }

  console.log(`\n${chalk.green.bold("Workspace ready.")} ${chalk.bold("Next steps:")}`);
  console.log(`  ${chalk.cyan("bloom repo clone")} ${chalk.yellow("<url>")}    Add repositories to work on`);
  console.log(`  ${chalk.cyan("bloom create")} ${chalk.yellow("<name>")}       Create a new project`);
}
