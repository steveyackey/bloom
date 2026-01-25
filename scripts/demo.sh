#!/usr/bin/env bash
#
# Bloom Demo Script
#
# This script demonstrates the full Bloom workflow using the test agent.
# Run this script and record it with a tool like asciinema or vhs to create a GIF.
#
# Prerequisites:
#   - Bloom installed (bun link or npm install -g)
#   - Git configured
#
# Usage:
#   ./scripts/demo.sh
#
# Recording with VHS (https://github.com/charmbracelet/vhs):
#   vhs scripts/demo.tape
#
# Recording with asciinema:
#   asciinema rec demo.cast -c "./scripts/demo.sh"
#   agg demo.cast demo.gif
#

set -e

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Typing effect for commands
type_cmd() {
  local cmd="$1"
  echo -ne "${CYAN}❯${NC} "
  for ((i=0; i<${#cmd}; i++)); do
    echo -n "${cmd:$i:1}"
    sleep 0.03
  done
  echo
  sleep 0.3
}

# Print section header
section() {
  echo
  echo -e "${BOLD}${GREEN}━━━ $1 ━━━${NC}"
  echo
  sleep 0.5
}

# Run command with typing effect
run() {
  type_cmd "$1"
  eval "$1"
  sleep 0.5
}

# Pause for effect
pause() {
  sleep "${1:-1}"
}

# Setup demo directory
DEMO_DIR=$(mktemp -d)
cd "$DEMO_DIR"

echo -e "${BOLD}${YELLOW}"
cat << 'EOF'

        ) )
       ( (
      .------.
      |      |]
      \      /    ☕ B L O O M
       `----'     Multi-Agent Task Orchestrator

EOF
echo -e "${NC}"
pause 2

# Initialize workspace
section "1. Initialize a Bloom Workspace"
run "bloom init my-workspace"
run "cd my-workspace"
run "ls -la"

# Create a project
section "2. Create a New Project"
run "bloom create my-feature --description 'Add user authentication feature'"
run "ls -la projects/my-feature/"

# Show PRD
section "3. View the PRD Template"
run "head -30 projects/my-feature/PRD.md"

# Edit PRD with sample content
section "4. Define Requirements in PRD"
cat > projects/my-feature/PRD.md << 'EOF'
# User Authentication Feature

## Overview
Add secure user authentication to the application.

## Requirements

### Functional Requirements
1. Users can register with email and password
2. Users can log in with credentials
3. Users can log out
4. Password reset via email

### Technical Requirements
- Use bcrypt for password hashing
- JWT tokens for session management
- Rate limiting on auth endpoints

## Success Criteria
- All auth endpoints return proper status codes
- Passwords are never stored in plain text
- Sessions expire after 24 hours
EOF

run "cat projects/my-feature/PRD.md"

# Generate plan
section "5. Generate Implementation Plan"
echo -e "${YELLOW}(Using test agent to simulate planning)${NC}"
run "bloom plan --project my-feature --agent test"

# Show generated plan
section "6. View Generated Plan"
run "cat projects/my-feature/plan.md"

# Generate tasks
section "7. Generate Tasks from Plan"
run "bloom generate --project my-feature --agent test"

# List tasks
section "8. View Generated Tasks"
run "bloom list --project my-feature"
run "bloom show task-1 --project my-feature"

# Run orchestrator
section "9. Run the Orchestrator"
echo -e "${YELLOW}(Using test agent for demonstration)${NC}"
run "bloom run --project my-feature --agent test --max-tasks 2"

# Show progress
section "10. Check Progress"
run "bloom list --project my-feature"

# Cleanup message
section "Demo Complete!"
echo -e "${YELLOW}"
cat << 'EOF'
        ) )
       ( (        ☕ Fresh brew complete!
      .------.
      |      |]   Bloom orchestrated your tasks
      \      /    across multiple agents.
       `----'
EOF
echo -e "${NC}"
echo
echo "Key features demonstrated:"
echo "  ✓ Workspace initialization"
echo "  ✓ Project creation with PRD template"
echo "  ✓ AI-powered planning"
echo "  ✓ Task generation from plan"
echo "  ✓ Multi-agent orchestration"
echo
echo -e "Learn more: ${CYAN}https://use-bloom.dev${NC}"
echo

# Cleanup
cd /
rm -rf "$DEMO_DIR"
