---
sidebar_position: 7
title: Sandbox Troubleshooting
---

# Sandbox Troubleshooting

This guide covers common sandbox issues and how to resolve them.

## Quick Diagnostics

Run these commands to check your sandbox setup:

```bash
# Check if srt is installed
srt --version

# Check if bubblewrap is available (Linux/WSL2)
which bwrap

# Check if socat is available (Linux/WSL2)
which socat

# Check Bloom's view of sandbox status
bloom agent check
```

## Common Issues

### "srt not found" or "command not found: srt"

**Cause:** The sandbox runtime isn't installed or isn't in your PATH.

**Solution:**

```bash
# Install srt globally
npm install -g @anthropic-ai/sandbox-runtime

# Verify it's in PATH
which srt

# If not found, check npm global bin directory
npm config get prefix
# Add <prefix>/bin to your PATH
```

If you installed with a non-standard prefix:

```bash
# Check where npm installs global packages
ls $(npm config get prefix)/bin/

# Add to PATH in your shell config
export PATH="$(npm config get prefix)/bin:$PATH"
```

### "bubblewrap (bwrap) not found" (Linux/WSL2)

**Cause:** The bubblewrap package isn't installed.

**Solution:**

```bash
# Ubuntu/Debian
sudo apt-get install bubblewrap

# Fedora
sudo dnf install bubblewrap

# Arch Linux
sudo pacman -S bubblewrap
```

### "socat not found" (Linux/WSL2)

**Cause:** The socat package isn't installed.

**Solution:**

```bash
# Ubuntu/Debian
sudo apt-get install socat

# Fedora
sudo dnf install socat

# Arch Linux
sudo pacman -S socat
```

### "Operation not permitted" when starting sandbox

**Cause:** User namespaces are disabled on your system.

**Solution:**

```bash
# Check if user namespaces are enabled
cat /proc/sys/kernel/unprivileged_userns_clone

# If output is 0, enable them:
sudo sysctl kernel.unprivileged_userns_clone=1

# To make permanent, add to /etc/sysctl.conf:
echo "kernel.unprivileged_userns_clone=1" | sudo tee -a /etc/sysctl.conf
```

**Note:** Some distributions (like Debian with AppArmor profiles) may have additional restrictions. Check your distribution's documentation.

### "Network is unreachable" when domain should be allowed

**Cause:** Domain isn't correctly specified in allowedDomains, or wildcard syntax is incorrect.

**Solution:**

Check your `~/.bloom/config.yaml`:

```yaml
sandbox:
  networkPolicy: allow-list
  allowedDomains:
    # Wrong: wildcards at the end
    - github.*          # This won't work

    # Correct: wildcards at the start
    - "*.github.com"    # Matches subdomains
    - github.com        # Matches exact domain
```

Test with curl inside the sandbox:

```bash
srt --settings <(echo '{"network":{"allowedDomains":["github.com"]}}') \
  -- curl -v https://github.com
```

### "Read-only file system" when writing to workspace

**Cause:** The workspace path isn't correctly passed to the sandbox.

**Solution:**

Verify your workspace path is absolute and accessible:

```bash
# Check the path exists
ls -la /path/to/your/workspace

# Test with explicit settings
srt --settings <(echo '{"filesystem":{"allowWrite":["/path/to/your/workspace"]}}') \
  -- touch /path/to/your/workspace/test.txt
```

### Agent can read sensitive files (sandbox not working)

**Cause:** Sandbox is not enabled in your configuration.

**Solution:**

Check `~/.bloom/config.yaml`:

```yaml
agent:
  claude:
    sandbox:
      enabled: true  # Must be true
      denyReadPaths:
        - ~/.ssh
        - ~/.aws
```

Verify sandbox is active in agent output:

```bash
bloom agent validate claude
# Should show: "Sandbox: Active"
```

### "Failed to create bridge sockets" (nested sandbox)

**Cause:** Attempting to run a sandbox inside another sandbox.

**Solution:**

This occurs when:
- Running Bloom inside a Docker container that's already sandboxed
- Running srt inside another srt instance

For Docker environments, you have two options:

1. **Disable sandbox inside container** (simpler):
   ```yaml
   sandbox:
     enabled: false
   ```

2. **Enable weaker nested sandbox** (maintains some isolation):
   ```yaml
   sandbox:
     enabled: true
     enableWeakerNestedSandbox: true
   ```

### Sandbox works but agent is slow

**Cause:** The 1.1-second startup overhead is expected for the Node.js srt runtime.

**Explanation:**

- srt uses Node.js, which has inherent startup time (~1.1s)
- This is a one-time cost per agent spawn
- Long-running agents amortize this cost
- This is acceptable for agents that run for minutes/hours

**If startup time is critical:**

For one-off quick tasks, you might disable sandbox:

```yaml
agent:
  quick-tasks:
    sandbox:
      enabled: false  # Skip sandbox for quick tasks
```

## Disabling Sandbox for Debugging

### Temporary Disable (Environment Variable)

```bash
# Disable sandbox for this session only
BLOOM_SANDBOX_DISABLED=1 bloom run
```

### Permanent Disable (Configuration)

```yaml
# ~/.bloom/config.yaml
agent:
  claude:
    sandbox:
      enabled: false
```

### Per-Task Disable

Override sandbox settings in your tasks.yaml:

```yaml
tasks:
  - id: debug-task
    sandbox:
      enabled: false
    instructions: |
      Debug task without sandbox...
```

## Diagnosing Policy Violations

### Enable Verbose Logging

```bash
BLOOM_SANDBOX_VERBOSE=1 bloom run
```

This shows:
- Which paths are being accessed
- Network requests and their outcomes
- Policy decisions (allowed/blocked)

### Check macOS Sandbox Violations

On macOS, sandbox violations are logged to the system log:

```bash
# View recent sandbox violations
log show --predicate 'process == "sandboxd"' --last 5m

# Filter for bloom-related violations
log show --predicate 'process == "sandboxd" AND message CONTAINS "bloom"' --last 5m
```

### Check Linux Seccomp Logs

On Linux, seccomp violations may appear in kernel logs:

```bash
# Check dmesg for seccomp violations
dmesg | grep -i seccomp

# Or journalctl
journalctl -k | grep -i seccomp
```

### Manual Testing

Test specific operations outside of Bloom:

```bash
# Test filesystem access
srt --settings <(echo '{"filesystem":{"allowWrite":["/tmp/test"]}}') \
  -- ls -la ~/sensitive-dir

# Test network access
srt --settings <(echo '{"network":{"allowedDomains":["example.com"]}}') \
  -- curl https://blocked-domain.com

# Test with your actual config
srt --settings ~/.bloom/sandbox-settings.json \
  -- your-command-here
```

## Platform-Specific Issues

### macOS: "sandbox-exec" Deprecation Warnings

Apple has deprecated `sandbox-exec` but it still works. These warnings can be ignored:

```
warning: sandbox-exec is deprecated
```

srt uses sandbox-exec for macOS isolation; there's no alternative until Apple provides one.

### WSL2: Slow File Access on /mnt/c

**Cause:** Accessing Windows drives through /mnt is slow due to 9P filesystem translation.

**Solution:**

Keep your workspaces in the Linux filesystem:

```bash
# Bad: slow
/mnt/c/Users/you/projects/

# Good: fast
~/projects/
```

### WSL2: Network Issues with VPN

**Cause:** VPN software can interfere with WSL2's networking.

**Solution:**

1. Check if your VPN has WSL2 integration settings
2. Try restarting WSL2: `wsl --shutdown`
3. Some VPNs require split tunneling configuration

## Getting Help

If you're still having issues:

1. Check the [GitHub Issues](https://github.com/steveyackey/bloom/issues) for similar problems
2. Run diagnostics and include output in your issue:
   ```bash
   bloom agent check
   srt --version
   cat ~/.bloom/config.yaml
   ```
3. Include your platform details:
   ```bash
   uname -a
   node --version
   npm --version
   ```

## See Also

- [Sandbox Setup](/guides/sandbox-setup) - Installation guide
- [Policy Configuration](/reference/sandbox-policy) - All configuration options
