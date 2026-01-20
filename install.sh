#!/usr/bin/env bash
# Bloom installer - works on Linux, macOS, and Windows (Git Bash/WSL)
# curl -fsSL https://raw.githubusercontent.com/steveyackey/bloom/main/install.sh | bash

set -e

REPO="steveyackey/bloom"
INSTALL_DIR="$HOME/.local/bin"

# Detect OS and architecture
detect_platform() {
  local os arch

  case "$(uname -s)" in
    Linux*)  os="linux" ;;
    Darwin*) os="darwin" ;;
    MINGW*|MSYS*|CYGWIN*) os="windows" ;;
    *)
      echo "Unsupported OS: $(uname -s)"
      exit 1
      ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)
      echo "Unsupported architecture: $(uname -m)"
      exit 1
      ;;
  esac

  echo "${os}-${arch}"
}

# Get latest release tag
get_latest_version() {
  curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/'
}

# Download and install
install_bloom() {
  local platform version binary_name url

  platform=$(detect_platform)
  version=$(get_latest_version)

  if [ -z "$version" ]; then
    echo "Failed to get latest version"
    exit 1
  fi

  echo "Installing Bloom ${version} for ${platform}..."

  # Determine binary name
  if [[ "$platform" == windows-* ]]; then
    binary_name="bloom-${platform}.exe"
  else
    binary_name="bloom-${platform}"
  fi

  url="https://github.com/${REPO}/releases/download/${version}/${binary_name}"

  # Create install directory
  mkdir -p "$INSTALL_DIR"

  # Download binary
  echo "Downloading from ${url}..."
  if [[ "$platform" == windows-* ]]; then
    curl -fsSL "$url" -o "$INSTALL_DIR/bloom.exe"
    chmod +x "$INSTALL_DIR/bloom.exe"
  else
    curl -fsSL "$url" -o "$INSTALL_DIR/bloom"
    chmod +x "$INSTALL_DIR/bloom"
  fi

  echo "Installed to $INSTALL_DIR/bloom"
}

# Ensure ~/.local/bin is in PATH
setup_path() {
  local shell_rc=""
  local path_line='export PATH="$HOME/.local/bin:$PATH"'

  # Already in PATH?
  if echo "$PATH" | grep -q "$HOME/.local/bin"; then
    return
  fi

  # Detect shell config file
  case "$SHELL" in
    */zsh)  shell_rc="$HOME/.zshrc" ;;
    */bash)
      if [ -f "$HOME/.bash_profile" ]; then
        shell_rc="$HOME/.bash_profile"
      else
        shell_rc="$HOME/.bashrc"
      fi
      ;;
    */fish)
      shell_rc="$HOME/.config/fish/config.fish"
      path_line='set -gx PATH $HOME/.local/bin $PATH'
      ;;
    *)
      echo ""
      echo "Add this to your shell config:"
      echo "  $path_line"
      return
      ;;
  esac

  # Check if already added
  if [ -f "$shell_rc" ] && grep -q '.local/bin' "$shell_rc"; then
    return
  fi

  echo "" >> "$shell_rc"
  echo "# Added by Bloom installer" >> "$shell_rc"
  echo "$path_line" >> "$shell_rc"

  echo "Added $INSTALL_DIR to PATH in $shell_rc"
  echo ""
  echo "Run this to use bloom now:"
  echo "  source $shell_rc"
}

main() {
  echo ""
  echo "  ██████╗ ██╗      ██████╗  ██████╗ ███╗   ███╗"
  echo "  ██╔══██╗██║     ██╔═══██╗██╔═══██╗████╗ ████║"
  echo "  ██████╔╝██║     ██║   ██║██║   ██║██╔████╔██║"
  echo "  ██╔══██╗██║     ██║   ██║██║   ██║██║╚██╔╝██║"
  echo "  ██████╔╝███████╗╚██████╔╝╚██████╔╝██║ ╚═╝ ██║"
  echo "  ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝     ╚═╝"
  echo ""

  install_bloom
  setup_path

  echo ""
  echo "Done! Run 'bloom --help' to get started."
}

main
