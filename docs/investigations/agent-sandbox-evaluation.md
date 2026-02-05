# Agent Sandbox Technology Evaluation

**Date**: 2026-02-04
**Evaluator**: research-agent
**Primary candidate**: Anthropic srt (sandbox-runtime) v1.0.0
**Test platform**: Fedora 43 Linux, 6.18.6-200.fc43.x86_64, 8 GB RAM
**Raw data**: [srt-raw-findings.md](./srt-raw-findings.md)

---

## 1. Filesystem Isolation

### Requirement
Agents must be confined to a designated workspace directory. No unauthorized reads or writes outside the workspace boundary.

### Findings

**Write isolation: STRONG (allow-list model)**

srt enforces write restrictions via bubblewrap's mount namespace. The entire root filesystem is mounted read-only (`--ro-bind / /`), then specific writable paths are bind-mounted on top. This is kernel-enforced and cannot be bypassed from userspace.

| Test | Result |
|------|--------|
| Write to workspace directory | Allowed |
| Write outside workspace | `Read-only file system` (blocked) |
| Write to `/tmp` | `Read-only file system` (blocked) |
| Write to home directory | `Read-only file system` (blocked) |
| `mkdir` outside workspace | `Read-only file system` (blocked) |
| Delete file in workspace | Allowed |

**Read isolation: MODERATE (deny-list model)**

Read access defaults to permitted. Specific paths must be explicitly denied via `denyRead`. Denied paths are excluded from the mount namespace and appear as non-existent.

| Test | Result |
|------|--------|
| Read workspace file | Allowed |
| Read `/etc/passwd` (denyRead empty) | Allowed |
| Read `~/.ssh/id_ed25519.pub` (denied) | `No such file or directory` (blocked) |
| Read denied directory (ls) | Empty listing (blocked) |

**Multi-agent implication**: By default, agent A can read agent B's workspace. Bloom must dynamically populate each agent's `denyRead` with other agents' workspace paths. This is workable but requires orchestrator-level config management.

### Verdict
Write isolation is production-ready. Read isolation requires Bloom to manage deny-lists per agent but is functionally sound once configured.

---

## 2. Network Control

### Requirement
Deny-all by default. Allow-list specific domains per agent. Prevent raw TCP/UDP bypass of proxy-based filtering.

### Findings

**Architecture (Linux)**: srt removes all network access via `--unshare-net` (kernel-level network namespace isolation), then provides HTTP (port 3128) and SOCKS5 (port 1080) proxies bridged through Unix domain sockets via `socat`. The proxy enforces domain-level filtering.

| Test | Result |
|------|--------|
| HTTP to allowed domain | 200 OK (via CONNECT tunnel through proxy) |
| HTTP to non-allowed domain | 403 Forbidden (`X-Proxy-Error: blocked-by-allowlist`) |
| Empty allow-list (deny all) | `Connection blocked by network allowlist` |
| Raw TCP to IP address (Python socket) | `Network is unreachable` (kernel-blocked) |
| DNS resolution | `Temporary failure in name resolution` (blocked) |
| Wildcard domain (`*.github.com`) | 403 in testing; needs investigation |

**Key strengths:**
- Network namespace isolation blocks all non-proxy traffic at the kernel level
- DNS is unavailable inside the sandbox; only the proxy resolves domains
- Raw TCP/UDP connections fail with "Network is unreachable" even when targeting IPs directly

**Known issue:**
- Wildcard domain matching (`*.github.com`) returned unexpected 403 during CONNECT tunneling. This may be a configuration nuance or curl-specific behavior. Needs further testing with the programmatic API.

### Verdict
Network control is strong. The layered approach (kernel namespace + proxy filtering) prevents bypass. Domain allow-list covers the primary agent use case (allow GitHub/npm registries, block everything else).

---

## 3. Process Isolation

### Requirement
Agents cannot see host processes, escalate privileges, escape the sandbox, or interfere with other agents or the host system.

### Findings

| Test | Result |
|------|--------|
| PID namespace | Isolated; `ps` shows only sandbox processes (bwrap, socat, user command) |
| Linux capabilities | All zero (CapInh/CapPrm/CapEff/CapBnd/CapAmb = 0) |
| Mount filesystem | `must be superuser to use mount` (blocked) |
| Signal host process | `No such process` (PID namespace prevents visibility) |
| `nsenter` escape | `Operation not permitted` |
| Seccomp BPF | Active (`apply-seccomp unix-block.bpf`) |
| Namespace isolation | Separate mnt, net, pid, user, ipc, uts namespaces |

**Minor concern: environment variable leakage**

`/proc/1/environ` inside the sandbox reveals the host's full environment (PATH, SSH_CONNECTION, etc.) because PID 1 is the bwrap process itself. This is an information disclosure issue, not a privilege escalation vector. It can be mitigated by sanitizing the environment before spawning srt.

**Nested sandbox limitation**: Running srt inside srt fails (`Failed to create bridge sockets`). This prevents recursive sandboxing but does not affect Bloom's architecture where the orchestrator spawns sandboxed agents.

### Verdict
Process isolation is strong. Zero capabilities, PID namespaces, seccomp filters, and namespace separation prevent all tested escape vectors. The env var leak is minor and mitigatable.

---

## 4. Cross-Platform Support

### Requirement
macOS (Apple Silicon + Intel), Linux (x86_64), and Windows via WSL2.

### Findings

| Platform | Mechanism | Dependencies | Status |
|----------|-----------|-------------|--------|
| **Linux** | bubblewrap + socat proxy | `bubblewrap`, `socat`, `ripgrep` (optional), Node.js | Tested and confirmed |
| **macOS** | `sandbox-exec` (Seatbelt profiles) | Node.js only (sandbox-exec is built-in) | Documented by srt; not hands-on tested |
| **WSL2** | Same as Linux (bubblewrap path) | Same as Linux | Confirmed supported by srt docs and community |
| **WSL1** | Not supported | — | Requires kernel namespace support absent in WSL1 |
| **Native Windows** | Not supported | — | Out of scope for srt and this evaluation |

srt is the only evaluated technology that covers both macOS and Linux from a single codebase. All alternatives (direct bubblewrap, gVisor, Firecracker) are Linux-only.

**macOS notes** (from srt documentation):
- Uses dynamically generated Seatbelt profiles for filesystem restrictions
- Network isolation via localhost port proxies (no network namespace on macOS)
- Violation monitoring available via macOS sandbox violation log store

### Verdict
Cross-platform support is a primary differentiator for srt. Single tool covers all target platforms.

---

## 5. Rootless Operation

### Requirement
No root/admin privileges required for normal operation.

### Findings

| Platform | Root required? | Notes |
|----------|---------------|-------|
| **Linux** | No | bubblewrap uses unprivileged user namespaces |
| **macOS** | No | sandbox-exec is available to unprivileged users |
| **WSL2** | No | Same as Linux |

srt was installed via `npm install --prefix ~/.local` (no sudo) and executed all tests without elevated privileges. The sandbox itself runs as the current user with zero Linux capabilities.

**Kernel requirement**: Linux must support unprivileged user namespaces (`kernel.unprivileged_userns_clone=1`). This is enabled by default on modern distributions (Fedora, Ubuntu 22.04+, Debian 12+). Some hardened distributions may have it disabled.

### Verdict
Fully rootless on all target platforms.

---

## 6. Multi-Instance Overhead

### Requirement
Support 5-10 concurrent agents without degrading the developer experience. Target: 8 GB developer laptop.

### Benchmark Data

#### Startup Time

| Configuration | Average | Notes |
|--------------|---------|-------|
| Bare (`/bin/true`) | ~4 ms | Baseline |
| Direct bubblewrap | ~13 ms | Kernel sandbox only |
| srt | ~1,100 ms | Node.js startup dominates |

The ~1.1s startup cost is entirely Node.js overhead. For agents that run for minutes/hours, this is a one-time negligible cost.

#### Per-Instance Memory (RSS)

| Configuration | Memory |
|--------------|--------|
| Bare process | ~2 MB |
| Direct bubblewrap | ~2.3 MB |
| srt | ~80-90 MB |

#### Concurrent Instance Test (10 instances, 8 GB system)

| Metric | Value |
|--------|-------|
| Instances launched concurrently | 10 |
| All started successfully | Yes |
| Per-instance workspace isolation | Verified (each wrote correct data) |
| Total memory delta | 805 MB |
| Per-instance overhead | ~80 MB |
| System memory remaining | 4,926 MB (62% available) |
| Total wall-clock time (with 10s sleep) | 15.7s |
| Concurrent startup overhead | ~5.7s for 10 instances |
| Post-run cleanup | All processes terminated cleanly |

#### Scaling Projections

| Agents | Est. Memory Overhead | 8 GB System Available | 16 GB System Available |
|--------|---------------------|----------------------|------------------------|
| 3 | ~240 MB | 5.5 GB | 13.5 GB |
| 5 | ~400 MB | 5.3 GB | 13.3 GB |
| 10 | ~800 MB | 4.9 GB | 12.9 GB |
| 15 | ~1.2 GB | 4.5 GB | 12.5 GB |

### Verdict
10 concurrent sandboxes are practical on 8 GB systems. 5 agents is the comfortable sweet spot for developer laptops; 10 is feasible with headroom. Memory overhead is dominated by Node.js (srt runtime), not bubblewrap itself.

---

## 7. WSL2 Support

### Requirement
Windows developers must be supported via WSL2.

### Findings

- srt's Linux path (bubblewrap + socat) works identically on WSL2
- WSL2 provides a full Linux kernel with user namespace support
- Installation: same `apt-get install bubblewrap socat` + `npm install` as native Linux
- `enableWeakerNestedSandbox` option available for Docker Desktop on WSL2 scenarios (reduces security but enables sandboxing inside containers)
- WSL1 is explicitly not supported due to missing kernel namespaces

### Verdict
WSL2 is a first-class supported platform. No special handling needed beyond standard Linux setup.

---

## Gap Analysis Summary

### What works well

| Area | Grade | Notes |
|------|-------|-------|
| Write isolation | A | Kernel-enforced allow-list via bubblewrap mount namespace |
| Network filtering | A | Layered: kernel namespace block + proxy-based domain filter |
| Process isolation | A | PID namespace, zero capabilities, seccomp, nsenter blocked |
| Cross-platform | A | macOS + Linux + WSL2 from single tool |
| Rootless operation | A | No root required on any platform |
| Cleanup | A | All processes terminate cleanly on sandbox exit |
| Configuration | B+ | JSON settings file, sensible defaults, per-instance configs |

### Gaps requiring mitigation

| Gap | Severity | Mitigation |
|-----|----------|-----------|
| Read isolation is deny-list | Medium | Bloom orchestrator dynamically populates `denyRead` per agent with other agents' workspace paths |
| ~1.1s startup per invocation | Low | Agents are long-running; one-time cost is negligible |
| ~80-90 MB memory per instance | Low | Acceptable for 5-10 agents on 8 GB+ systems |
| Host env vars in /proc/1/environ | Low | Sanitize environment before spawning srt; or accept as information-only leak |
| Wildcard domain matching needs investigation | Low | Test with programmatic API; may be curl CONNECT-specific |
| No nested sandboxing | Low | Not needed for Bloom's architecture (orchestrator spawns sandboxes) |
| socat dependency on Linux | Low | Easy to install via package manager; could vendor if needed |

### Alternatives evaluated

| Technology | Startup | Memory | Read allow-list | Network filter | Rootless | Cross-platform | Verdict |
|-----------|---------|--------|----------------|---------------|----------|---------------|---------|
| **srt** | ~1.1s | ~90 MB | No (deny-list) | Yes (proxy) | Yes | macOS + Linux | **Recommended** |
| **Direct bwrap** | ~13 ms | ~2 MB | Yes (selective bind) | No (full deny only) | Yes | Linux only | Use for read isolation layer if needed |
| **gVisor** | ~ms | Low | Yes | Yes (userspace) | Partial (root for net) | Linux only | Too heavy; requires Docker/OCI |
| **Firecracker** | ~125 ms | ~5 MB | Yes (VM) | Yes | No (root/KVM) | Linux only | Overkill; requires root |

---

## Recommendation

### Primary choice: Anthropic srt (sandbox-runtime)

srt is recommended as Bloom's sandboxing layer for the following reasons:

1. **Only cross-platform option**: Covers macOS (sandbox-exec) and Linux (bubblewrap) from one codebase. All alternatives are Linux-only.
2. **Network domain filtering**: The proxy-based approach enables per-agent domain allow-lists — essential for letting agents access specific APIs while blocking everything else.
3. **Designed for AI agents**: Built by Anthropic specifically for sandboxing AI coding agents. Active development, research preview with community feedback.
4. **Rootless**: Works without root on all platforms.
5. **Proven at scale**: 10 concurrent instances tested on 8 GB system with 62% memory remaining.
6. **Clean API**: JSON configuration, CLI interface, and programmatic TypeScript/JavaScript library (`SandboxManager`).

### Architecture for Bloom integration

```
Bloom Orchestrator
  ├── Agent 1: srt --settings agent1-settings.json <agent-command>
  ├── Agent 2: srt --settings agent2-settings.json <agent-command>
  └── Agent N: srt --settings agentN-settings.json <agent-command>
```

Each agent gets a per-instance settings file with:
- `allowWrite`: Only that agent's workspace directory
- `denyRead`: All other agents' workspace directories + sensitive host paths
- `allowedDomains`: Agent-specific network allow-list (e.g., GitHub for code agents, npm registry for build agents)

### Mitigation plan for gaps

| Gap | Action | Phase |
|-----|--------|-------|
| Read isolation | Orchestrator generates `denyRead` lists dynamically per agent | Phase 2 (Prototype) |
| Startup time | Accept; agent processes are long-lived | N/A |
| Memory overhead | Document minimum system requirements (8 GB recommended) | Phase 3 (Docs) |
| Env var leakage | Sanitize env before srt invocation or accept risk | Phase 2 |
| Wildcard domains | Test with programmatic API; file upstream issue if needed | Phase 2 |

---

## Answers to PRD Open Questions

### Q1: Does srt cover all three isolation dimensions on both macOS and Linux?

**Yes.** On Linux, srt uses bubblewrap for filesystem/process isolation and a proxy for network filtering. On macOS, it uses sandbox-exec (Seatbelt) for filesystem/process isolation and a localhost proxy for network filtering. All three dimensions (filesystem, network, process) are covered on both platforms.

### Q2: Per-instance resource overhead of srt? Can 10 concurrent instances run on a developer laptop?

**Yes.** Each srt instance uses approximately:
- **Startup**: ~1.1 seconds (one-time Node.js cost)
- **Memory**: ~80-90 MB per instance
- **CPU**: Negligible after startup

10 concurrent instances were tested on an 8 GB system. Total memory overhead was ~800 MB, leaving 62% of RAM available. This is practical for developer laptops with 8 GB+ RAM. On 16 GB systems, 10+ agents are comfortable.

### Q3: Rootless operation possibility on all platforms?

**Yes.** srt operates entirely without root/admin privileges on all target platforms:
- **Linux**: bubblewrap uses unprivileged user namespaces
- **macOS**: sandbox-exec is available to non-root users
- **WSL2**: Same as Linux

The only requirement is that the Linux kernel supports unprivileged user namespaces, which is the default on modern distributions.

### Q4: Sandbox-per-agent vs. shared sandbox model?

**Recommendation: Sandbox-per-agent.** Each agent gets its own srt instance with dedicated settings. This provides:
- Independent filesystem boundaries (each agent's workspace is isolated)
- Per-agent network policies (different agents may need different domains)
- Clean process isolation (no cross-agent process visibility)
- Independent lifecycle (one agent crashing doesn't affect others)

A shared sandbox would reduce memory overhead but loses per-agent policy granularity. Given that 10 instances are practical on 8 GB systems, the per-agent model is feasible.

### Q5: Network policy scoping — per agent type, per task, or global?

**Recommendation: Per-agent-type with task-level overrides.**

- **Global baseline**: Deny all network access by default
- **Per agent type**: Define standard domain allow-lists (e.g., "code-agent" gets `github.com`, `*.githubusercontent.com`; "build-agent" gets `registry.npmjs.org`, `pypi.org`)
- **Task-level override**: Allow task definitions to add domains for specific requirements

This maps naturally to srt's per-instance `--settings` configuration. The orchestrator generates settings files based on agent type plus any task-specific overrides.

### Q6: WSL2 support for srt?

**Confirmed supported.** srt uses the same bubblewrap + socat path on WSL2 as native Linux. WSL2 provides a full Linux kernel with user namespace support. Installation is identical to native Linux. WSL1 is not supported.

The `enableWeakerNestedSandbox` option is available for Docker Desktop on WSL2 scenarios but reduces security guarantees.
