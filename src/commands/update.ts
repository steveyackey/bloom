// =============================================================================
// Update Command - Check for and install latest version of Bloom
// =============================================================================

import { VERSION } from "../version";

const REPO = "steveyackey/bloom";

interface Platform {
  os: "linux" | "darwin" | "windows";
  arch: "x64" | "arm64";
}

function detectPlatform(): Platform {
  const platform = process.platform;
  const arch = process.arch;

  let os: Platform["os"];
  switch (platform) {
    case "linux":
      os = "linux";
      break;
    case "darwin":
      os = "darwin";
      break;
    case "win32":
      os = "windows";
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  let normalizedArch: Platform["arch"];
  switch (arch) {
    case "x64":
      normalizedArch = "x64";
      break;
    case "arm64":
      normalizedArch = "arm64";
      break;
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }

  return { os, arch: normalizedArch };
}

async function getLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { tag_name: string };
    return data.tag_name;
  } catch {
    return null;
  }
}

function normalizeVersion(version: string): string {
  // Strip 'bloom-v' or 'v' prefix if present for comparison
  return version.replace(/^(bloom-)?v?/, "");
}

function getInstallCommand(platform: Platform): string {
  if (platform.os === "windows") {
    return "iwr -useb https://raw.githubusercontent.com/steveyackey/bloom/main/install.ps1 | iex";
  }
  return "curl -fsSL https://raw.githubusercontent.com/steveyackey/bloom/main/install.sh | bash";
}

export async function cmdUpdate(): Promise<void> {
  console.log("Checking for updates...\n");

  const latestVersion = await getLatestVersion();

  if (!latestVersion) {
    console.error("Failed to check for updates. Please check your internet connection.");
    process.exit(1);
  }

  const currentNormalized = normalizeVersion(VERSION);
  const latestNormalized = normalizeVersion(latestVersion);

  if (currentNormalized === latestNormalized) {
    console.log(`You're already on the latest version (${VERSION}).`);
    return;
  }

  let platform: Platform;
  try {
    platform = detectPlatform();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  console.log(`Current version: ${VERSION}`);
  console.log(`Latest version:  ${latestVersion}\n`);
  console.log("Updating bloom...\n");

  const installCommand = getInstallCommand(platform);

  if (platform.os === "windows") {
    // On Windows, spawn PowerShell
    const proc = Bun.spawn(["powershell", "-Command", installCommand], {
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      console.error("\nUpdate failed. Please try running manually:");
      console.error(`  ${installCommand}`);
      process.exit(1);
    }
  } else {
    // On Linux/macOS, use bash
    const proc = Bun.spawn(["bash", "-c", installCommand], {
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      console.error("\nUpdate failed. Please try running manually:");
      console.error(`  ${installCommand}`);
      process.exit(1);
    }
  }

  console.log("\nUpdate complete! Run 'bloom --version' to verify.");
}
