# srt (Sandbox Runtime) Raw Evaluation Findings

**Date**: 2026-02-04
**Platform**: Fedora 43, Linux 6.18.6-200.fc43.x86_64
**srt version**: 1.0.0 (npm @anthropic-ai/sandbox-runtime)
**Repository**: https://github.com/anthropic-experimental/sandbox-runtime

## Installation

### Prerequisites (Linux)
- **bubblewrap** (`bwrap`): Available via system package manager
- **socat**: Required for network proxy bridge (TCP-to-Unix socket forwarding)
- **ripgrep** (`rg`): Optional, for path detection
- **Node.js**: Required (srt is a Node.js application)

### Installation Command
```bash
npm install -g @anthropic-ai/sandbox-runtime
# Or local install if no global write access:
npm install --prefix ~/.local @anthropic-ai/sandbox-runtime
```

### macOS Prerequisites
- Uses built-in `sandbox-exec` (Seatbelt profiles) — no additional dependencies beyond Node.js
- Optional: ripgrep for path detection

### WSL2 Prerequisites
- Same as Linux (bubblewrap + socat)
- WSL2 confirmed supported via bubblewrap's Linux/user-namespace path
- WSL1 is NOT supported (missing kernel namespace support)
- `enableWeakerNestedSandbox` option available for Docker-in-WSL2 scenarios

---

## Configuration Format

Settings file: `~/.srt-settings.json` (or specified with `--settings <path>`)

```json
{
  "filesystem": {
    "denyRead": ["~/.ssh", "~/.aws"],
    "allowWrite": ["./workspace"],
    "denyWrite": [".env"]
  },
  "network": {
    "allowedDomains": ["example.com", "*.github.com"],
    "deniedDomains": []
  }
}
```

**Key design decisions:**
- Read access: **deny-list model** (everything readable by default, deny specific paths)
- Write access: **allow-list model** (nothing writable by default, allow specific paths)
- Network: **allow-list model** (nothing accessible by default, allow specific domains)

---

## Filesystem Isolation Tests

### Test 1: Read inside workspace (PASS)
```bash
srt --settings ./settings.json cat workspace/test.txt
# Output: inside-file-content
# Exit: 0
```

### Test 2: Write inside workspace (PASS)
```bash
srt --settings ./settings.json sh -c 'echo "data" > workspace/new.txt && cat workspace/new.txt'
# Output: data
# Exit: 0
```

### Test 3: Write outside workspace (BLOCKED)
```bash
srt --settings ./settings.json sh -c 'echo "escape" > outside/hack.txt'
# Output: /usr/bin/bash: line 1: outside/hack.txt: Read-only file system
# Exit: 1
```

### Test 4: Write to /tmp (BLOCKED)
```bash
srt --settings ./settings.json sh -c 'echo "escape" > /tmp/escape.txt'
# Output: /usr/bin/bash: line 1: /tmp/escape.txt: Read-only file system
# Exit: 1
```

### Test 5: Write to home directory (BLOCKED)
```bash
srt --settings ./settings.json sh -c 'echo "escape" > ~/escape.txt'
# Output: Read-only file system
# Exit: 1
```

### Test 6: mkdir outside workspace (BLOCKED)
```bash
srt --settings ./settings.json mkdir ~/escape_dir
# Output: mkdir: cannot create directory: Read-only file system
# Exit: 1
```

### Test 7: Read denied path (BLOCKED)
```bash
# With denyRead: ["./outside"]
srt --settings ./settings.json cat outside/secret.txt
# Output: cat: outside/secret.txt: No such file or directory
# Exit: 1
```

### Test 8: Read ~/.ssh when denied (BLOCKED)
```bash
# With denyRead: ["~/.ssh"]
srt --settings ./settings.json cat /home/steve/.ssh/id_ed25519.pub
# Output: cat: /home/steve/.ssh/id_ed25519.pub: No such file or directory
# Exit: 1
# Note: ls on the directory returns exit 0 but shows empty listing
```

### Test 9: Default read of /etc/passwd (ALLOWED)
```bash
# With empty denyRead: []
srt --settings ./settings.json head -1 /etc/passwd
# Output: root:x:0:0:Super User:/root:/bin/bash
# Exit: 0
```

**Filesystem isolation mechanism (Linux):** bubblewrap uses `--ro-bind / /` for the root filesystem (read-only), then `--bind` for specific writable paths. Denied read paths are simply not mounted into the sandbox namespace, making them invisible.

---

## Network Control Tests

### Network Architecture (Linux)
srt uses:
1. `--unshare-net` (bubblewrap) to completely remove network access
2. Unix domain sockets bridged via `socat` for HTTP (port 3128) and SOCKS5 (port 1080) proxies
3. Environment variables (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`) set to route traffic through local proxy
4. The proxy enforces domain allow-list filtering

### Test: Deny-all (empty allowedDomains)
```bash
# allowedDomains: []
srt --settings ./settings.json curl -v https://example.com
# Result: "Connection blocked by network allowlist"
# Proxy returns the block message as response body
```

### Test: Allow-list with specific domain (PASS)
```bash
# allowedDomains: ["example.com"]
srt --settings ./settings.json curl -v https://example.com
# Result: HTTP/1.1 200 Connection Established (through CONNECT tunnel)
# Full page content returned successfully
```

### Test: Allow-list blocking non-allowed domain (PASS)
```bash
# allowedDomains: ["example.com"]
srt --settings ./settings.json curl -v https://google.com
# Result: HTTP/1.1 403 Forbidden
# Header: X-Proxy-Error: blocked-by-allowlist
```

### Test: Wildcard domain support
```bash
# allowedDomains: ["*.github.com", "github.com"]
srt --settings ./settings.json curl https://api.github.com
# Result: 403 CONNECT tunnel failed (wildcard matching may need investigation)
```
**Note:** Wildcard domains showed 403 in testing. May be a configuration issue or curl CONNECT behavior. Needs further investigation.

### Test: Raw TCP connection bypass (BLOCKED)
```python
# Python socket test - direct IP connection
import socket
s = socket.socket()
s.connect(("93.184.216.34", 80))
# Result: [Errno 101] Network is unreachable
```
**Raw TCP is blocked at the kernel level** via network namespace isolation, not just the proxy.

### Test: DNS resolution (BLOCKED)
```python
# Python DNS test
import socket
socket.getaddrinfo("example.com", 80)
# Result: [Errno -3] Temporary failure in name resolution
```
**DNS is blocked** — no DNS resolver available inside the isolated network namespace. Only the HTTP/SOCKS proxy can resolve domains.

---

## Process Isolation Tests

### PID Namespace (ISOLATED)
```bash
srt --settings ./settings.json ps aux
# Shows only: bwrap (PID 1), bash, socat x2, and the user command
# Host processes are NOT visible
```

### Namespace isolation
```bash
srt --settings ./settings.json ls -la /proc/self/ns/
# Separate namespaces for: cgroup, ipc, mnt, net, pid, user, uts
# All have different inode numbers from host
```

### Privilege escalation (BLOCKED)
```bash
srt --settings ./settings.json mount -t tmpfs tmpfs /mnt
# Output: mount: must be superuser to use mount
```

### Capabilities (ZERO)
```bash
srt --settings ./settings.json cat /proc/self/status | grep Cap
# CapInh: 0000000000000000
# CapPrm: 0000000000000000
# CapEff: 0000000000000000
# CapBnd: 0000000000000000
# CapAmb: 0000000000000000
```
All Linux capabilities are dropped.

### Signal host processes (BLOCKED)
```bash
# Host tmux PID 1640
srt --settings ./settings.json kill -0 1640
# Output: kill: (1640) - No such process
# PID namespace prevents seeing/signaling host processes
```

### nsenter escape (BLOCKED)
```bash
srt --settings ./settings.json nsenter --target 1 --mount --pid
# Output: reassociate to namespaces failed: Operation not permitted
```

### Seccomp filtering
srt applies seccomp BPF filters via `apply-seccomp unix-block.bpf`. This blocks specific syscalls beyond what namespace isolation provides.

### Environment variable leakage (CONCERN)
```bash
srt --settings ./settings.json cat /proc/1/environ
# Returns: Full host environment including SSH_CONNECTION, PATH, etc.
```
PID 1 inside the sandbox is the bwrap process, which inherits the host environment. This is a **minor information leak** — the sandboxed process can see what environment variables were set on the host.

### Sandbox detection
```bash
srt --settings ./settings.json echo $SANDBOX_RUNTIME
# Output: 1
```
The `SANDBOX_RUNTIME=1` environment variable is set inside the sandbox.

### Nested sandbox (FAILS)
```bash
srt --settings ./settings.json srt --settings ./settings.json echo "nested"
# Error: Failed to create bridge sockets after 5 attempts
```
Cannot run srt inside srt (bridge socket creation fails in isolated network namespace).

---

## Benchmark Data

### Startup Time (10 runs each)

| Run | Bare (/bin/true) | srt + /bin/true | Direct bwrap + /bin/true |
|-----|-----------------|-----------------|--------------------------|
| 1 | 3ms | 1112ms | 15ms |
| 2 | 4ms | 1149ms | 14ms |
| 3 | 4ms | 1152ms | 14ms |
| 4 | 6ms | 1104ms | 12ms |
| 5 | 4ms | 1037ms | 11ms |
| 6 | 3ms | 1032ms | — |
| 7 | 4ms | 1225ms | — |
| 8 | 4ms | 1022ms | — |
| 9 | 3ms | 1021ms | — |
| 10 | 2ms | 1141ms | — |
| **Avg** | **~3.7ms** | **~1100ms** | **~13ms** |

### Memory Overhead (Maximum RSS)

| Configuration | Max RSS |
|--------------|---------|
| Bare `/bin/echo` | 1,964 KB (~2 MB) |
| srt + `/bin/echo` | 91,224 KB (~89 MB) |
| Direct bwrap + `/bin/echo` | 2,340 KB (~2.3 MB) |

### CPU Time (single invocation, /bin/true)

| Configuration | real | user | sys |
|--------------|------|------|-----|
| Bare | 0.002s | 0.000s | 0.002s |
| srt | 1.131s | 1.235s | 0.159s |

### Compute Task (seq 1 100000 | wc -l)

| Configuration | real | user | sys |
|--------------|------|------|-----|
| Bare | 0.005s | 0.003s | 0.005s |
| srt | 1.058s | 1.170s | 0.143s |

### Sustained Process (sleep 1)

| Configuration | real | user | sys |
|--------------|------|------|-----|
| Bare | 1.003s | 0.001s | 0.002s |
| srt | 2.044s | 1.173s | 0.125s |

**Key insight:** The ~1.1s overhead is almost entirely Node.js startup cost for srt itself, not sandbox setup. The actual bubblewrap containerization adds only ~10ms. For long-running agent processes, this startup cost is negligible.

---

## Multi-Instance Concurrent Test (10 instances)

### Test Setup
- 10 sandbox instances launched concurrently
- Each with its own workspace directory and settings file
- Each runs for 10 seconds (sleep), writes to its workspace

### Results

| Metric | Value |
|--------|-------|
| Instances launched | 10 |
| All started successfully | Yes |
| All wrote to workspace correctly | Yes (verified per-instance) |
| Total wall-clock time | 15,706ms (10s sleep + ~5.7s concurrent startup) |
| Baseline system RSS | 2,559 MB |
| Running RSS (10 instances) | 3,365 MB |
| **Delta RSS** | **805 MB** |
| **Per-instance overhead** | **~80 MB** |
| Post-run cleanup | All bwrap/socat processes terminated cleanly |

### System Specs
- Total RAM: 7,909 MB
- Available with 10 instances: 4,926 MB (still 62% available)

### Cross-Instance Isolation Finding
**WARNING:** Instance 1 CAN read Instance 2's workspace when `denyRead` is empty.

This is by design — srt's read model is deny-list, not allow-list. The `allowWrite` setting only restricts writes. For multi-agent isolation where agents should not read each other's files, **each agent's config must explicitly include other agents' workspaces in `denyRead`**.

Alternatively, Bloom could use bubblewrap directly with `--ro-bind` only for specific paths to achieve allow-list read isolation.

---

## Gap Analysis

### What works well
1. **Write isolation**: Strong, allow-list model, enforced at kernel level via bubblewrap mount namespace
2. **Network filtering**: Proxy-based domain allow-list works for HTTP/HTTPS, raw TCP/UDP fully blocked by network namespace
3. **Process isolation**: Full PID namespace isolation, zero capabilities, seccomp filters, nsenter blocked
4. **Cross-platform**: Linux (bubblewrap) and macOS (sandbox-exec) supported from single tool
5. **Configuration**: JSON settings file, sensible defaults
6. **Cleanup**: Processes cleaned up properly on exit
7. **Rootless operation**: Works without root/sudo

### Gaps and concerns
1. **Read isolation model**: Deny-list, not allow-list. Must explicitly deny paths for multi-agent isolation.
2. **Startup overhead**: ~1.1s per invocation due to Node.js. Acceptable for long-running agents, poor for many short commands.
3. **Memory overhead**: ~80-90MB per instance. 10 instances = ~800MB. Acceptable for 8GB+ laptops but tight for lower-spec machines.
4. **Environment variable leakage**: Host env vars visible via /proc/1/environ inside sandbox.
5. **Wildcard domain matching**: Showed unexpected 403 in testing with curl CONNECT. May need investigation.
6. **No nested sandboxing**: Cannot run srt inside srt.
7. **socat dependency**: Required on Linux but not always available by default.

### Alternatives evaluated

| Technology | Startup | Memory | Read Allow-list | Network Filter | Rootless | Cross-platform |
|-----------|---------|--------|----------------|---------------|----------|---------------|
| **srt** | ~1.1s | ~90MB | No (deny-list) | Yes (domain proxy) | Yes | macOS + Linux |
| **Direct bwrap** | ~13ms | ~2MB | Yes (selective bind) | No (only full deny) | Yes | Linux only |
| **gVisor (runsc)** | ~ms range | Low | Yes | Yes (userspace net stack) | Partial (needs root for net) | Linux only |
| **Firecracker** | ~125ms | ~5MB | Yes (VM level) | Yes | No (requires root/KVM) | Linux only |

### Recommendation rationale for srt
Despite the overhead, srt is the right choice for Bloom because:
1. **Cross-platform**: Only option covering both macOS and Linux from a single codebase
2. **Network domain filtering**: The HTTP proxy approach is essential for agent network control (allow GitHub but block everything else)
3. **Maintained by Anthropic**: Active development, designed specifically for AI agent sandboxing
4. **Acceptable overhead for agents**: Agents run for minutes/hours — 1.1s startup is negligible
5. **10 concurrent instances**: Tested and works within 800MB additional memory

For specific gaps:
- **Read isolation**: Bloom should manage `denyRead` lists dynamically, adding other agents' workspace paths
- **Startup time**: Not a concern for long-running agent processes
- **Environment leakage**: Can be mitigated by srt's `--setenv` or by sanitizing the environment before spawning

---

## Commands Reference

```bash
# Install
npm install -g @anthropic-ai/sandbox-runtime

# Linux dependencies
apt-get install bubblewrap socat ripgrep  # Debian/Ubuntu
dnf install bubblewrap socat ripgrep      # Fedora

# Basic usage
srt echo "hello"
srt --settings ./config.json npm install
srt --debug curl https://example.com
srt -c "complex command string"

# Version & help
srt --version   # 1.0.0
srt --help

# Environment detection inside sandbox
echo $SANDBOX_RUNTIME  # "1" if inside sandbox
```
