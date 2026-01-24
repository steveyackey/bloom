#!/usr/bin/env bash
# Demo script for recording Bloom workflow
# This script is designed to be recorded with asciinema

set -e

# Get the script directory and bloom root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOOM_ROOT="$(dirname "$SCRIPT_DIR")"

# Use bun to run bloom CLI
bloom() {
    bun run "$BLOOM_ROOT/src/cli.ts" "$@"
}

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Typing effect
type_cmd() {
    echo -ne "${CYAN}\$ ${NC}"
    echo "$1" | while IFS= read -r -n1 char; do
        echo -n "$char"
        sleep 0.02
    done
    echo
    sleep 0.2
}

run_cmd() {
    type_cmd "$1"
    eval "$1"
    sleep 0.5
}

clear

# Header
echo -e "${GREEN}"
cat << 'EOF'
        ) )
       ( (
      .------.
      |      |]
      \      /    BLOOM
       `----'     Multi-Agent Task Orchestrator
EOF
echo -e "${NC}"
sleep 1.5

# Create temp workspace
DEMO_DIR=$(mktemp -d)
cd "$DEMO_DIR"

# Initialize git (required by bloom)
git init -q
git config user.email "demo@example.com"
git config user.name "Demo User"

echo -e "\n${YELLOW}Step 1: Initialize a Bloom workspace${NC}\n"
sleep 0.5

# Create config to skip prompt
mkdir -p ~/.bloom
echo "gitProtocol: ssh" > ~/.bloom/config.yaml

type_cmd "bloom init"
bloom init 2>&1 | grep -v "^$" || true
sleep 0.5

echo -e "\n${YELLOW}Step 2: Create project structure${NC}\n"
sleep 0.5

# Create project directory manually (avoiding interactive bloom create)
mkdir -p auth-system
echo -e "${DIM}(Creating project files...)${NC}"
cat > auth-system/PRD.md << 'EOF'
# User Authentication System

## Overview
Implement secure user authentication with JWT tokens.

## Requirements
1. User registration with email/password
2. Login/logout functionality
3. JWT session management
EOF

cat > auth-system/CLAUDE.md << 'EOF'
# Project Guidelines
Use conventional commits. Follow security best practices.
EOF
sleep 0.5

echo -e "\n${YELLOW}Step 3: Define tasks in YAML${NC}\n"
sleep 0.5

# Create tasks.yaml
cat > auth-system/tasks.yaml << 'TASKS'
git:
  push_to_remote: false

tasks:
  - id: setup-auth
    title: Set up authentication module
    status: ready_for_agent
    agent: test
    instructions: |
      Create the authentication module structure
    acceptance_criteria:
      - Auth module created
      - Tests pass

  - id: add-login
    title: Add login functionality
    status: todo
    agent: test
    depends_on: [setup-auth]
    instructions: |
      Implement login with JWT tokens
    acceptance_criteria:
      - Login endpoint works
      - JWT tokens issued

  - id: add-logout
    title: Add logout functionality
    status: todo
    agent: test
    depends_on: [add-login]
    instructions: |
      Implement logout and token invalidation
    acceptance_criteria:
      - Logout endpoint works
      - Tokens invalidated
TASKS

run_cmd "cat auth-system/tasks.yaml"

echo -e "\n${YELLOW}Step 4: List all tasks${NC}\n"
sleep 0.5

run_cmd "bloom list -f auth-system/tasks.yaml"

echo -e "\n${YELLOW}Step 5: Check available tasks${NC}\n"
sleep 0.5

run_cmd "bloom next -f auth-system/tasks.yaml"

echo -e "\n${YELLOW}Step 6: Run the orchestrator${NC}\n"
sleep 0.5

echo -e "${CYAN}\$ bloom run -f auth-system/tasks.yaml${NC}"
sleep 0.3
# Run orchestrator briefly (test agent simulates work)
timeout 6s bun run "$BLOOM_ROOT/src/cli.ts" run -f auth-system/tasks.yaml 2>&1 || true

echo -e "\n${YELLOW}Step 7: Check task status${NC}\n"
sleep 0.5

run_cmd "bloom list -f auth-system/tasks.yaml"

echo -e "\n${GREEN}"
cat << 'EOF'
        ) )
       ( (
      .------.
      |  OK  |]
      \      /    Demo complete!
       `----'
EOF
echo -e "${NC}"
sleep 1.5

# Cleanup
rm -rf "$DEMO_DIR"
