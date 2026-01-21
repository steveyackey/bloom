# Bloom installer for Windows PowerShell
# iwr -useb https://raw.githubusercontent.com/steveyackey/bloom/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo = "steveyackey/bloom"
$InstallDir = "$env:USERPROFILE\.local\bin"

function Get-Platform {
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    return "windows-$arch"
}

function Get-LatestVersion {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
    return $response.tag_name
}

function Install-Bloom {
    $platform = Get-Platform
    $version = Get-LatestVersion

    if (-not $version) {
        Write-Error "Failed to get latest version"
        exit 1
    }

    Write-Host ""
    Write-Host "  BLOOM - Multi-Agent Task Orchestrator" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Installing Bloom $version for $platform..."

    $binaryName = "bloom-$platform.exe"
    $url = "https://github.com/$Repo/releases/download/$version/$binaryName"

    # Create install directory
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    $destination = Join-Path $InstallDir "bloom.exe"

    # Remove old binary first to avoid race condition
    if (Test-Path $destination) {
        Remove-Item -Path $destination -Force
    }

    # Download binary
    Write-Host "Downloading from $url..."
    Invoke-WebRequest -Uri $url -OutFile $destination

    Write-Host "Installed to $destination"
}

function Setup-Path {
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

    if ($currentPath -like "*$InstallDir*") {
        return
    }

    $newPath = "$InstallDir;$currentPath"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")

    Write-Host ""
    Write-Host "Added $InstallDir to your PATH."
    Write-Host "Restart your terminal or run:"
    Write-Host "  `$env:Path = `"$InstallDir;`$env:Path`""
}

Install-Bloom
Setup-Path

Write-Host ""
Write-Host "Done! Run 'bloom --help' to get started." -ForegroundColor Green
