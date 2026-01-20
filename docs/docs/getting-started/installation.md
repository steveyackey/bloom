---
sidebar_position: 1
title: Installation
---

# Installation

Bloom provides pre-built binaries for macOS, Linux, and Windows. Choose your platform below.

## macOS & Linux

Run the install script:

```bash
curl -fsSL https://raw.githubusercontent.com/steveyackey/bloom/main/install.sh | bash
```

This will:
1. Detect your OS and architecture
2. Download the appropriate binary
3. Install it to `~/.local/bin`
4. Add the path to your shell config if needed

### Manual Installation

Download the binary for your platform from the [releases page](https://github.com/steveyackey/bloom/releases):

| Platform | Architecture | Download |
|----------|--------------|----------|
| macOS | Apple Silicon (M1/M2/M3) | `bloom-darwin-arm64` |
| macOS | Intel | `bloom-darwin-x64` |
| Linux | x64 | `bloom-linux-x64` |
| Linux | ARM64 | `bloom-linux-arm64` |

```bash
# Download (example for Linux x64)
curl -L -o bloom https://github.com/steveyackey/bloom/releases/latest/download/bloom-linux-x64

# Make executable
chmod +x bloom

# Move to PATH
sudo mv bloom /usr/local/bin/
```

## Windows

Run in PowerShell (as Administrator):

```powershell
iwr -useb https://raw.githubusercontent.com/steveyackey/bloom/main/install.ps1 | iex
```

### Manual Installation (Windows)

1. Download `bloom-windows-x64.exe` from the [releases page](https://github.com/steveyackey/bloom/releases)
2. Rename to `bloom.exe`
3. Move to a directory in your PATH (e.g., `C:\Users\YourName\bin`)
4. Add the directory to your PATH if not already included

## Prerequisites

### Claude Code CLI

Bloom uses Claude Code as its default AI agent. Install it first:

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code
```

You'll need an Anthropic API key. Set it in your environment:

```bash
export ANTHROPIC_API_KEY=your-api-key
```

### Git

Bloom requires Git 2.20+ for worktree support:

```bash
# Check your version
git --version

# macOS (Homebrew)
brew install git

# Ubuntu/Debian
sudo apt install git

# Windows
winget install Git.Git
```

## Verify Installation

```bash
bloom version
# bloom 0.1.8

bloom help
# Shows available commands
```

## Updating

To update to the latest version, run the install script again:

```bash
# macOS/Linux
curl -fsSL https://raw.githubusercontent.com/steveyackey/bloom/main/install.sh | bash

# Windows
iwr -useb https://raw.githubusercontent.com/steveyackey/bloom/main/install.ps1 | iex
```

## Troubleshooting

### Command not found

If `bloom` isn't recognized after installation:

```bash
# Check if ~/.local/bin is in PATH
echo $PATH | grep -q "$HOME/.local/bin" && echo "OK" || echo "Not in PATH"

# Add to PATH (bash)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Add to PATH (zsh)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Permission denied

```bash
chmod +x ~/.local/bin/bloom
```

### Architecture mismatch

Check your architecture:

```bash
# macOS
uname -m  # arm64 for Apple Silicon, x86_64 for Intel

# Linux
uname -m  # x86_64 or aarch64
```

Download the binary matching your architecture.

## Next Steps

- [Quick Start](/getting-started/quick-start) — Create your first project
