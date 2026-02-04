---
sidebar_position: 4
title: Sandbox Policy Reference
---

# Sandbox Policy Reference

This reference documents all sandbox configuration options, including per-agent policies, network modes, and filesystem access controls.

## Configuration Location

Sandbox policies are configured in `~/.bloom/config.yaml` under each agent's `sandbox` section:

```yaml
agent:
  claude:
    sandbox:
      enabled: true
      networkPolicy: allow-list
      allowedDomains:
        - github.com
        - api.anthropic.com
      writablePaths:
        - /tmp/build
      denyReadPaths:
        - ~/.ssh
        - ~/.aws
```

## Configuration Options

### enabled

**Type:** `boolean`
**Default:** `false`

Controls whether the agent runs inside a sandbox. When `false`, agents run with full system access.

```yaml
sandbox:
  enabled: true
```

### networkPolicy

**Type:** `"deny-all" | "allow-list" | "monitor" | "disabled"`
**Default:** `"deny-all"`

Controls network access for sandboxed agents.

| Mode | Description |
|------|-------------|
| `deny-all` | No network access. Agents cannot make any network requests. |
| `allow-list` | Only domains in `allowedDomains` are reachable. |
| `monitor` | Network is available but all requests are logged. (Future) |
| `disabled` | No network restrictions. Use for development only. |

```yaml
sandbox:
  networkPolicy: allow-list
  allowedDomains:
    - github.com
    - registry.npmjs.org
```

### allowedDomains

**Type:** `string[]`
**Default:** `[]`

Domains the agent can access when `networkPolicy` is `"allow-list"`. Only used when networkPolicy is set to `allow-list`.

```yaml
sandbox:
  networkPolicy: allow-list
  allowedDomains:
    - github.com
    - "*.githubusercontent.com"
    - api.openai.com
    - registry.npmjs.org
    - pypi.org
```

**How it works:**
- HTTP/HTTPS requests are routed through a proxy that enforces the domain allow-list
- DNS resolution is blocked inside the sandbox; only the proxy resolves domains
- Raw TCP/UDP connections to IP addresses are blocked at the kernel level

**Wildcard support:**
- Use `*` for subdomain wildcards: `*.github.com` matches `raw.githubusercontent.com`
- Wildcards only work at the start of a domain

### writablePaths

**Type:** `string[]`
**Default:** `[]` (only workspace is writable)

Additional filesystem paths the agent can write to, beyond its workspace directory.

```yaml
sandbox:
  writablePaths:
    - /tmp/build
    - /tmp/cache
```

**Notes:**
- The agent's workspace directory is always writable
- Use sparingly - each additional path weakens isolation
- Paths are bind-mounted with write access

### denyReadPaths

**Type:** `string[]`
**Default:** `["~/.ssh", "~/.aws", "~/.gnupg"]`

Filesystem paths the agent cannot read. These paths appear as non-existent inside the sandbox.

```yaml
sandbox:
  denyReadPaths:
    - ~/.ssh
    - ~/.aws
    - ~/.gnupg
    - ~/.config/gh
    - ~/.netrc
```

**Default denied paths:**
- `~/.ssh` - SSH keys and configuration
- `~/.aws` - AWS credentials and configuration
- `~/.gnupg` - GPG keys

**Best practices:**
- Always deny access to credential storage directories
- Consider denying `~/.config/gh` (GitHub CLI tokens)
- Consider denying other agents' workspace directories for multi-agent isolation

### processLimit

**Type:** `number`
**Default:** `0` (no limit)

Maximum number of processes the agent can spawn. Reserved for future use.

```yaml
sandbox:
  processLimit: 50
```

## Per-Agent vs Global Policies

Each agent can have its own sandbox configuration. This allows different trust levels for different agents:

```yaml
agent:
  # Conservative policy for autonomous code agents
  claude:
    sandbox:
      enabled: true
      networkPolicy: allow-list
      allowedDomains:
        - github.com
        - api.anthropic.com

  # Relaxed policy for interactive exploration
  copilot:
    sandbox:
      enabled: true
      networkPolicy: disabled  # Allow all network for exploration

  # Strict isolation for untrusted tasks
  codex:
    sandbox:
      enabled: true
      networkPolicy: deny-all
      denyReadPaths:
        - ~/.ssh
        - ~/.aws
        - ~/.gnupg
        - ~/Documents
```

## Common Policy Patterns

### Development Agent

Allow package registries and common development services:

```yaml
sandbox:
  enabled: true
  networkPolicy: allow-list
  allowedDomains:
    # GitHub
    - github.com
    - "*.githubusercontent.com"
    - api.github.com
    # Package registries
    - registry.npmjs.org
    - pypi.org
    - crates.io
    - rubygems.org
    # AI providers
    - api.anthropic.com
    - api.openai.com
```

### Research Agent

Read-only access with web search:

```yaml
sandbox:
  enabled: true
  networkPolicy: allow-list
  allowedDomains:
    - "*.google.com"
    - "*.stackoverflow.com"
    - "*.github.com"
  writablePaths: []  # Read-only filesystem
```

### Build Agent

Access to package registries but no code repositories:

```yaml
sandbox:
  enabled: true
  networkPolicy: allow-list
  allowedDomains:
    - registry.npmjs.org
    - pypi.org
    - crates.io
  writablePaths:
    - /tmp/build
    - ~/.cache/npm
    - ~/.cache/pip
```

### Offline Agent

Complete network isolation:

```yaml
sandbox:
  enabled: true
  networkPolicy: deny-all
```

## Multi-Agent Isolation

When running multiple agents concurrently, each agent should be prevented from reading other agents' workspaces:

```yaml
agent:
  agent-a:
    sandbox:
      enabled: true
      denyReadPaths:
        - ~/.ssh
        - ~/projects/agent-b-workspace
        - ~/projects/agent-c-workspace

  agent-b:
    sandbox:
      enabled: true
      denyReadPaths:
        - ~/.ssh
        - ~/projects/agent-a-workspace
        - ~/projects/agent-c-workspace
```

Bloom's orchestrator automatically manages these deny-lists when running parallel agents through `bloom run`.

## Settings File Format

When sandbox is enabled, Bloom generates a settings file for the srt runtime:

```json
{
  "filesystem": {
    "denyRead": ["~/.ssh", "~/.aws", "~/.gnupg"],
    "allowWrite": ["/home/user/workspace", "/tmp/build"]
  },
  "network": {
    "allowedDomains": ["github.com", "registry.npmjs.org"]
  }
}
```

This file is written to `/tmp/bloom-sandbox/` and passed to srt via `--settings <path>`.

## Task-Level Overrides

Task definitions in `tasks.yaml` can override agent-level sandbox settings:

```yaml
tasks:
  - id: fetch-dependencies
    agent_name: build-agent
    sandbox:
      allowedDomains:
        - registry.npmjs.org
        - pypi.org
    instructions: |
      Install project dependencies...
```

Task-level settings are merged with agent-level settings:
- Arrays (`allowedDomains`, `writablePaths`, `denyReadPaths`) are combined
- Scalars (`enabled`, `networkPolicy`) are overridden

## Environment Variables

The sandbox configuration can be influenced by environment variables:

| Variable | Description |
|----------|-------------|
| `BLOOM_SANDBOX_DISABLED` | Set to `1` to disable sandbox globally (for debugging) |
| `BLOOM_SANDBOX_VERBOSE` | Set to `1` for verbose sandbox logging |

## See Also

- [Sandbox Setup](/guides/sandbox-setup) - Installation and platform setup
- [Troubleshooting](/guides/sandbox-troubleshooting) - Common issues and solutions
