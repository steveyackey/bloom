# Bloom Demo - VHS Recording Script
# https://github.com/charmbracelet/vhs
#
# Usage: vhs scripts/demo.tape
# Output: docs/static/img/demo.gif

Output docs/static/img/demo.gif
Set Theme "Catppuccin Mocha"
Set FontFamily "JetBrains Mono"
Set FontSize 14
Set Width 1200
Set Height 800
Set Padding 20
Set TypingSpeed 50ms

# Title
Type "# 🌸 Bloom - Multi-Agent Task Orchestrator"
Enter
Sleep 1s

# Setup
Type "cd $(mktemp -d) && bloom init demo-workspace && cd demo-workspace"
Enter
Sleep 2s

# Create project
Type "bloom create auth-feature --description 'Add user authentication'"
Enter
Sleep 2s

# Show structure
Type "ls -la projects/auth-feature/"
Enter
Sleep 1.5s

# Create sample PRD
Type "cat > projects/auth-feature/PRD.md << 'EOF'"
Enter
Type "# User Authentication"
Enter
Type "## Requirements"
Enter
Type "1. User registration with email/password"
Enter
Type "2. Login/logout functionality"
Enter
Type "3. JWT session management"
Enter
Type "EOF"
Enter
Sleep 1s

# Plan with test agent
Type "bloom plan --project auth-feature --agent test"
Enter
Sleep 3s

# Generate tasks
Type "bloom generate --project auth-feature --agent test"
Enter
Sleep 2s

# List tasks
Type "bloom list --project auth-feature"
Enter
Sleep 2s

# Run orchestrator
Type "bloom run --project auth-feature --agent test --max-tasks 2"
Enter
Sleep 5s

# Final status
Type "bloom list --project auth-feature"
Enter
Sleep 2s

# End
Type "echo '✨ Done! Bloom orchestrated tasks with the test agent.'"
Enter
Sleep 3s
