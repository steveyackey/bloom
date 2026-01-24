#!/usr/bin/env bash
# Demo script for recording Bloom workflow
# This script is designed to be recorded with asciinema
# Shows the complete Bloom workflow from install to execution

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
BOLD='\033[1m'
NC='\033[0m' # No Color

# Typing effect - simulates human typing
type_cmd() {
    echo -ne "${CYAN}\$ ${NC}"
    echo "$1" | while IFS= read -r -n1 char; do
        echo -n "$char"
        sleep 0.025
    done
    echo
    sleep 0.3
}

# Type and execute command
run_cmd() {
    type_cmd "$1"
    eval "$1"
    sleep 0.8
}

# Show a comment/note
show_note() {
    echo -e "${DIM}# $1${NC}"
    sleep 0.5
}

clear

# Header
echo -e "${GREEN}${BOLD}"
cat << 'EOF'
        ) )
       ( (
      .------.
      |      |]
      \      /    BLOOM
       `----'     Multi-Agent Task Orchestrator
EOF
echo -e "${NC}"
sleep 2

# ============================================================================
# STEP 1: Install (informational)
# ============================================================================
echo -e "\n${YELLOW}${BOLD}━━━ Step 1: Install Bloom ━━━${NC}\n"
sleep 0.5

show_note "Install with a single command (macOS/Linux)"
type_cmd "curl -fsSL https://raw.githubusercontent.com/steveyackey/bloom/main/install.sh | bash"
echo -e "${DIM}(Already installed for this demo)${NC}"
sleep 1

# ============================================================================
# STEP 2: Create workspace
# ============================================================================
echo -e "\n${YELLOW}${BOLD}━━━ Step 2: Create Workspace ━━━${NC}\n"
sleep 0.5

# Create temp directory for demo
DEMO_DIR=$(mktemp -d)
cd "$DEMO_DIR"

run_cmd "mkdir my-workspace && cd my-workspace"
cd my-workspace 2>/dev/null || mkdir -p my-workspace && cd my-workspace

run_cmd "git init"
git init -q
git config user.email "demo@example.com"
git config user.name "Demo User"

# ============================================================================
# STEP 3: Initialize Bloom
# ============================================================================
echo -e "\n${YELLOW}${BOLD}━━━ Step 3: Initialize Bloom ━━━${NC}\n"
sleep 0.5

# Pre-create config to skip interactive prompt
mkdir -p ~/.bloom
echo "gitProtocol: ssh" > ~/.bloom/config.yaml

type_cmd "bloom init"
bloom init 2>&1 | grep -v "^$" || true
sleep 1

# ============================================================================
# STEP 4: Clone repositories
# ============================================================================
echo -e "\n${YELLOW}${BOLD}━━━ Step 4: Clone Repositories ━━━${NC}\n"
sleep 0.5

show_note "Clone repos you'll be working on"
type_cmd "bloom repo clone myorg/backend"
echo -e "${DIM}Cloning into 'repos/backend'...${NC}"
sleep 0.3

# Simulate repo structure
mkdir -p repos/backend/backend.git
mkdir -p repos/backend/main/src
echo "# Backend API" > repos/backend/main/README.md
echo 'console.log("Hello")' > repos/backend/main/src/index.js

echo -e "${GREEN}✓${NC} Cloned backend (bare repo with main worktree)"
sleep 0.5

type_cmd "bloom repo clone myorg/frontend"
echo -e "${DIM}Cloning into 'repos/frontend'...${NC}"
sleep 0.3

mkdir -p repos/frontend/frontend.git
mkdir -p repos/frontend/main/src
echo "# Frontend App" > repos/frontend/main/README.md
echo '<div>App</div>' > repos/frontend/main/src/App.tsx

echo -e "${GREEN}✓${NC} Cloned frontend (bare repo with main worktree)"
sleep 0.5

run_cmd "bloom repo list"

# ============================================================================
# STEP 5: Create a project
# ============================================================================
echo -e "\n${YELLOW}${BOLD}━━━ Step 5: Create a Project ━━━${NC}\n"
sleep 0.5

show_note "Create a project to plan work across repos"
type_cmd "bloom create auth-feature"

# Simulate bloom create output
echo -e "Creating project 'auth-feature'..."
sleep 0.3
mkdir -p auth-feature
echo -e "\n${GREEN}Created:${NC}"
echo "  + auth-feature/"
echo "  + CLAUDE.md"
echo "  + plan.md"
echo "  + PRD.md"
sleep 0.5

# Create the actual files
cat > auth-feature/PRD.md << 'PRDEOF'
# User Authentication Feature

## Overview
Add secure user authentication across our backend API and frontend application.

## Requirements
1. **User Registration** - Email/password signup with validation
2. **Login/Logout** - JWT-based session management
3. **Protected Routes** - Frontend route guards for authenticated users

## Technical Constraints
- Backend: Node.js/Express with JWT tokens
- Frontend: React with context-based auth state
- Shared types between frontend and backend

## Success Criteria
- Users can register and login
- Sessions persist across page refreshes
- Unauthorized access is properly blocked
PRDEOF

cat > auth-feature/CLAUDE.md << 'CLAUDEEOF'
# Project Guidelines

Use conventional commits. Follow security best practices for auth.
Run tests before marking tasks complete.
CLAUDEEOF

cat > auth-feature/plan.md << 'PLANEOF'
# Implementation Plan

## Phase 1: Backend Auth
1. Set up JWT utilities
2. Create user model and database schema
3. Implement registration endpoint
4. Implement login endpoint

## Phase 2: Frontend Auth
1. Create auth context and hooks
2. Build login/register forms
3. Add route protection
4. Connect to backend API
PLANEOF

echo -e "\n${DIM}Starting project creation session...${NC}"
echo -e "${DIM}Claude will help you define your project and fill out the PRD.${NC}"
sleep 1
echo -e "\n${GREEN}✓${NC} PRD.md created with requirements"
sleep 0.5

run_cmd "cat auth-feature/PRD.md"

# ============================================================================
# STEP 6: Plan the implementation
# ============================================================================
echo -e "\n${YELLOW}${BOLD}━━━ Step 6: Plan Implementation ━━━${NC}\n"
sleep 0.5

show_note "Claude helps create a detailed implementation plan"
type_cmd "bloom plan"
echo -e "${DIM}Analyzing PRD and repositories...${NC}"
sleep 0.5
echo -e "${DIM}Generating implementation plan...${NC}"
sleep 0.5
echo -e "\n${GREEN}✓${NC} plan.md updated with detailed implementation steps"
sleep 0.5

run_cmd "cat auth-feature/plan.md"

# ============================================================================
# STEP 7: Generate tasks
# ============================================================================
echo -e "\n${YELLOW}${BOLD}━━━ Step 7: Generate Tasks ━━━${NC}\n"
sleep 0.5

show_note "Convert the plan into executable YAML tasks"
type_cmd "bloom generate"
echo -e "${DIM}Converting plan to tasks.yaml...${NC}"
sleep 0.5

# Create tasks.yaml
cat > auth-feature/tasks.yaml << 'TASKSEOF'
git:
  push_to_remote: false
  auto_cleanup_merged: false

tasks:
  # Phase 1: Backend
  - id: jwt-utils
    title: Set up JWT utilities
    status: ready_for_agent
    agent: claude
    repo: backend
    branch: feature/auth
    base_branch: main
    instructions: |
      Create JWT token generation and verification utilities.
      Include access and refresh token support.
    acceptance_criteria:
      - JWT utilities created in src/utils/jwt.ts
      - Unit tests pass

  - id: user-model
    title: Create user model
    status: todo
    agent: claude
    repo: backend
    branch: feature/auth
    depends_on: [jwt-utils]
    instructions: |
      Create user model with password hashing.
    acceptance_criteria:
      - User model with email, password hash
      - Password hashing implemented

  - id: auth-endpoints
    title: Implement auth endpoints
    status: todo
    agent: claude
    repo: backend
    branch: feature/auth
    depends_on: [user-model]
    merge_into: main
    instructions: |
      Create /register and /login endpoints.
    acceptance_criteria:
      - POST /register works
      - POST /login returns JWT

  # Phase 2: Frontend
  - id: auth-context
    title: Create auth context
    status: todo
    agent: claude
    repo: frontend
    branch: feature/auth
    base_branch: main
    depends_on: [auth-endpoints]
    instructions: |
      Create React context for auth state management.
    acceptance_criteria:
      - AuthContext created
      - useAuth hook available

  - id: auth-ui
    title: Build auth UI components
    status: todo
    agent: claude
    repo: frontend
    branch: feature/auth
    depends_on: [auth-context]
    merge_into: main
    instructions: |
      Create login and register forms.
    acceptance_criteria:
      - Login form works
      - Register form works
      - Route protection in place
TASKSEOF

echo -e "\n${GREEN}✓${NC} tasks.yaml generated with 5 tasks across 2 repos"
sleep 0.5

run_cmd "bloom list -f auth-feature/tasks.yaml"

# ============================================================================
# STEP 8: Run the orchestrator
# ============================================================================
echo -e "\n${YELLOW}${BOLD}━━━ Step 8: Run the Orchestrator ━━━${NC}\n"
sleep 0.5

show_note "Execute tasks with parallel agents"
type_cmd "bloom run"
echo -e "${DIM}Starting orchestrator...${NC}"
sleep 0.5

# Run briefly to show the TUI
timeout 5s bun run "$BLOOM_ROOT/src/cli.ts" run -f auth-feature/tasks.yaml 2>&1 || true

sleep 1

# ============================================================================
# Final
# ============================================================================
echo -e "\n${GREEN}${BOLD}"
cat << 'EOF'
        ) )
       ( (
      .------.
      | DONE |]
      \      /
       `----'

    Workflow Complete!

    bloom init      → Initialize workspace
    bloom repo      → Manage repositories
    bloom create    → Create projects
    bloom plan      → Plan with AI
    bloom generate  → Create tasks
    bloom run       → Execute with agents
EOF
echo -e "${NC}"
sleep 2

# Cleanup
rm -rf "$DEMO_DIR"
