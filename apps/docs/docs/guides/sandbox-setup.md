---
sidebar_position: 6
title: Sandbox Setup
---

# Sandbox Setup

Bloom can run agents inside a security sandbox that isolates them from the rest of your system. This guide covers setting up the sandbox on each supported platform.

## Overview

The sandbox provides three layers of protection:

1. **Filesystem isolation** - Agents can only write to their workspace directory
2. **Network filtering** - Agents can only access domains you explicitly allow
3. **Process isolation** - Agents cannot see or interact with other processes on your system

Bloom uses the [`@anthropic-ai/sandbox-runtime`](https://github.com/anthropics/sandbox-runtime) library for isolation, which uses platform-native sandboxing technologies:

| Platform | Isolation Technology | Dependencies |
|----------|---------------------|--------------|
| **Linux** | bubblewrap + socat | `bubblewrap`, `socat` |
| **macOS** | sandbox-exec (Seatbelt) | None (built-in) |
| **WSL2** | Same as Linux | `bubblewrap`, `socat` |

## macOS Setup

### Prerequisites

- macOS 10.15 (Catalina) or later
- Apple Silicon (M1/M2/M3) or Intel processor

### Installation

macOS includes `sandbox-exec` by default, so no additional system dependencies are required. The `@anthropic-ai/sandbox-runtime` library is included as an optional dependency of Bloom and is loaded automatically when sandbox is enabled.

### Verify Sandbox Works

Run Bloom's built-in sandbox check to verify everything is working:

```bash
bloom agent check
```

### Apple Silicon vs Intel

The sandbox works identically on both Apple Silicon (M1/M2/M3) and Intel Macs. The runtime automatically detects your architecture.

### Enabling in Bloom

Enable sandboxing in your Bloom config:

```yaml
# ~/.bloom/config.yaml
agent:
  claude:
    sandbox:
      enabled: true
      networkPolicy: deny-all
```

## Linux Setup

### Prerequisites

- Modern Linux distribution (kernel 4.x+)
- Unprivileged user namespaces enabled (default on most distributions)

### Installation

Install the required system dependencies:

```bash
# Ubuntu/Debian
sudo apt-get install bubblewrap socat

# Fedora
sudo dnf install bubblewrap socat

# Arch Linux
sudo pacman -S bubblewrap socat
```

The `@anthropic-ai/sandbox-runtime` library is included as an optional dependency of Bloom and is loaded automatically when sandbox is enabled.

### Check User Namespaces

The sandbox requires unprivileged user namespaces. Verify they're enabled:

```bash
# Check if user namespaces are enabled
cat /proc/sys/kernel/unprivileged_userns_clone
# Should output: 1

# If it outputs 0, enable temporarily (requires root):
sudo sysctl kernel.unprivileged_userns_clone=1

# To enable permanently, add to /etc/sysctl.conf:
# kernel.unprivileged_userns_clone=1
```

**Note:** Most modern distributions (Ubuntu 22.04+, Fedora 36+, Debian 12+) have user namespaces enabled by default.

### Verify Sandbox Works

Run Bloom's built-in sandbox check to verify your system dependencies:

```bash
bloom agent check
```

### Enabling in Bloom

Enable sandboxing in your config:

```yaml
# ~/.bloom/config.yaml
agent:
  claude:
    sandbox:
      enabled: true
      networkPolicy: deny-all
```

## Windows (WSL2) Setup

### Prerequisites

- Windows 10 version 2004+ or Windows 11
- WSL2 with a Linux distribution (Ubuntu recommended)
- Node.js 18+ (inside WSL2)

### WSL2 Configuration

The sandbox runs inside WSL2 using the same bubblewrap approach as native Linux. First, ensure you're using WSL2 (not WSL1):

```powershell
# In PowerShell, check your WSL version
wsl --list --verbose

# If using WSL1, convert to WSL2
wsl --set-version <distro-name> 2
```

### Installation (Inside WSL2)

```bash
# Inside your WSL2 terminal

# Install system dependencies
sudo apt-get update
sudo apt-get install bubblewrap socat
```

The `@anthropic-ai/sandbox-runtime` library is included as an optional dependency of Bloom and is loaded automatically.

### Known Limitations

1. **File system performance** - WSL2 has slower file system access to Windows drives (`/mnt/c/`). Keep your workspace inside the Linux filesystem (`~/projects/`) for best performance.

2. **Network bridging** - WSL2 uses NAT networking. The sandbox's network isolation works correctly, but if you're debugging network issues, be aware of the additional NAT layer.

3. **Docker Desktop conflict** - If you use Docker Desktop with WSL2 integration, you may need to use the `enableWeakerNestedSandbox` option. This reduces security but allows sandboxing inside Docker containers:

   ```yaml
   # ~/.bloom/config.yaml
   agent:
     claude:
       sandbox:
         enabled: true
         enableWeakerNestedSandbox: true  # Only if needed for Docker
   ```

4. **WSL1 not supported** - WSL1 lacks the kernel namespace support required for the sandbox. You must use WSL2.

### Verify Sandbox Works

```bash
bloom agent check
```

### Enabling in Bloom

Same as Linux - enable in your config:

```yaml
# ~/.bloom/config.yaml
agent:
  claude:
    sandbox:
      enabled: true
      networkPolicy: deny-all
```

## Verifying Your Setup

After installation, run Bloom's built-in sandbox check:

```bash
# Check if sandbox dependencies are available
bloom agent check

# Output will show sandbox status:
# Sandbox: Available (bubblewrap, socat)
```

You can also validate a specific agent with sandbox enabled:

```bash
bloom agent validate claude
```

## Resource Requirements

The sandbox has minimal overhead:

| Resource | Per-Agent Overhead |
|----------|-------------------|
| Startup time | &lt;1 second (one-time) |
| Memory | ~80-90 MB per agent |
| CPU | Negligible after startup |

**Concurrent agents:** 10 sandboxed agents run comfortably on an 8 GB system, leaving ~60% memory free. For 16 GB systems, 15+ agents are practical.

## Next Steps

- [Policy Configuration](/reference/sandbox-policy) - Configure filesystem and network policies
- [Troubleshooting](/guides/sandbox-troubleshooting) - Common issues and solutions
