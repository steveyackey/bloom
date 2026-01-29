# Bloom Demo - https://github.com/charmbracelet/vhs
# Records a real demo of bloom in action
# Mirrors the original asciinema demo script

Output assets/demo.gif
Output assets/demo.webm

Set Shell "bash"
Set FontSize 14
Set Width 1200
Set Height 700
Set Theme "Catppuccin Mocha"
Set TypingSpeed 30ms

# Setup temp directory (hidden)
Hide
Type "export DEMO_DIR=$(mktemp -d) && cd $DEMO_DIR"
Enter
Sleep 200ms
Type "export PATH=$HOME/.local/bin:$PATH"
Enter
Sleep 200ms
Show

# ============================================================================
# STEP 1: Install Bloom
# ============================================================================
Type "# Step 1: Install Bloom"
Enter
Sleep 500ms

Type "curl -fsSL https://use-bloom.dev/install.sh | bash"
Enter
Sleep 8s

# ============================================================================
# STEP 2: Create workspace
# ============================================================================
Type ""
Enter
Type "# Step 2: Create Workspace"
Enter
Sleep 500ms

Type "mkdir my-workspace && cd my-workspace"
Enter
Sleep 500ms

Type "git init"
Enter
Sleep 500ms

Hide
Type "git config user.email 'demo@example.com' && git config user.name 'Demo User'"
Enter
Sleep 200ms
Show

# ============================================================================
# STEP 3: Initialize Bloom
# ============================================================================
Type ""
Enter
Type "# Step 3: Initialize Bloom"
Enter
Sleep 500ms

Type "bloom init"
Enter
Sleep 2s

# ============================================================================
# STEP 4: Clone repositories (simulated)
# ============================================================================
Type ""
Enter
Type "# Step 4: Clone Repositories"
Enter
Sleep 500ms

Type "bloom repo clone myorg/backend"
Enter
Sleep 1s

# Simulate the repo structure
Hide
Type "mkdir -p repos/backend/backend.git repos/backend/main/src"
Enter
Type "echo '# Backend API' > repos/backend/main/README.md"
Enter
Sleep 200ms
Show

Type "bloom repo clone myorg/frontend"
Enter
Sleep 1s

Hide
Type "mkdir -p repos/frontend/frontend.git repos/frontend/main/src"
Enter
Type "echo '# Frontend App' > repos/frontend/main/README.md"
Enter
Sleep 200ms
Show

Type "bloom repo list"
Enter
Sleep 1s

# ============================================================================
# STEP 5: Create a project
# ============================================================================
Type ""
Enter
Type "# Step 5: Create a Project"
Enter
Sleep 500ms

Type "bloom create auth-feature"
Enter
Sleep 1s

# Create the project files
Hide
Type "mkdir -p auth-feature"
Enter
Type@0ms "cat > auth-feature/PRD.md << 'EOF'\n# User Authentication Feature\n\n## Overview\nAdd secure user authentication across our backend API and frontend application.\n\n## Requirements\n1. User Registration - Email/password signup with validation\n2. Login/Logout - JWT-based session management\n3. Protected Routes - Frontend route guards for authenticated users\n\n## Success Criteria\n- Users can register and login\n- Sessions persist across page refreshes\n- Unauthorized access is properly blocked\nEOF"
Enter
Sleep 200ms
Type@0ms "cat > auth-feature/plan.md << 'EOF'\n# Implementation Plan\n\n## Phase 1: Backend Auth\n1. Set up JWT utilities\n2. Create user model and database schema\n3. Implement registration endpoint\n4. Implement login endpoint\n\n## Phase 2: Frontend Auth\n1. Create auth context and hooks\n2. Build login/register forms\n3. Add route protection\n4. Connect to backend API\nEOF"
Enter
Sleep 200ms
Show

Type "cat auth-feature/PRD.md"
Enter
Sleep 2s

# ============================================================================
# STEP 6: Plan the implementation
# ============================================================================
Type ""
Enter
Type "# Step 6: Plan Implementation"
Enter
Sleep 500ms

Type "cat auth-feature/plan.md"
Enter
Sleep 2s

# ============================================================================
# STEP 7: Generate tasks
# ============================================================================
Type ""
Enter
Type "# Step 7: Generate Tasks"
Enter
Sleep 500ms

# Create tasks.yaml
Hide
Type@0ms "cat > auth-feature/tasks.yaml << 'EOF'\ngit:\n  push_to_remote: false\n\ntasks:\n  - id: jwt-utils\n    title: Set up JWT utilities\n    status: ready_for_agent\n    repo: backend\n    branch: feature/auth\n    base_branch: main\n    agent_name: backend\n    instructions: |\n      Create JWT token generation and verification utilities.\n    acceptance_criteria:\n      - JWT utilities created in src/utils/jwt.ts\n      - Unit tests pass\n\n  - id: user-model\n    title: Create user model\n    status: todo\n    repo: backend\n    branch: feature/auth\n    depends_on: [jwt-utils]\n    agent_name: backend\n    instructions: |\n      Create user model with password hashing.\n    acceptance_criteria:\n      - User model with email, password hash\n\n  - id: auth-endpoints\n    title: Implement auth endpoints\n    status: todo\n    repo: backend\n    branch: feature/auth\n    depends_on: [user-model]\n    merge_into: main\n    agent_name: backend\n    instructions: |\n      Create /register and /login endpoints.\n    acceptance_criteria:\n      - POST /register works\n      - POST /login returns JWT\n\n  - id: auth-context\n    title: Create auth context\n    status: todo\n    repo: frontend\n    branch: feature/auth\n    base_branch: main\n    depends_on: [auth-endpoints]\n    agent_name: frontend\n    instructions: |\n      Create React context for auth state management.\n    acceptance_criteria:\n      - AuthContext created\n      - useAuth hook available\n\n  - id: auth-ui\n    title: Build auth UI components\n    status: todo\n    repo: frontend\n    branch: feature/auth\n    depends_on: [auth-context]\n    merge_into: main\n    agent_name: frontend\n    instructions: |\n      Create login and register forms.\n    acceptance_criteria:\n      - Login form works\n      - Register form works\nEOF"
Enter
Sleep 200ms
Show

Type "bloom task list -f auth-feature/tasks.yaml"
Enter
Sleep 2s

# ============================================================================
# STEP 8: Run the orchestrator
# ============================================================================
Type ""
Enter
Type "# Step 8: Run the Orchestrator"
Enter
Sleep 500ms

Type "bloom run -f auth-feature/tasks.yaml"
Enter
Sleep 5s

Ctrl+C
Sleep 500ms

# ============================================================================
# Final
# ============================================================================
Type ""
Enter
Type "# Workflow: init -> repo -> create -> plan -> generate -> run"
Enter
Sleep 1s
Type "# Learn more: https://use-bloom.dev"
Enter
Sleep 2s

# Cleanup (hidden)
Hide
Type "cd / && rm -rf $DEMO_DIR"
Enter
Show
