import './App.css'

function App() {
  return (
    <div className="app">
      {/* Navigation */}
      <nav className="nav">
        <div className="container nav-container">
          <a href="/" className="nav-logo">
            <img src="/bloom-logo.png" alt="Bloom" className="nav-logo-img" />
            <span>Bloom</span>
          </a>
          <div className="nav-links">
            <a href="https://docs.use-bloom.dev" className="nav-link">Documentation</a>
            <a href="https://github.com/steveyackey/bloom" className="nav-link">GitHub</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="container hero-container">
          <div className="hero-glow" />
          <img src="/bloom-logo.png" alt="Bloom" className="hero-logo" />
          <h1 className="hero-title">
            Multi-Agent<br />Task Orchestration
          </h1>
          <p className="hero-subtitle">
            Orchestrate AI agents in parallel. Define tasks in YAML.<br />
            Let Claude Code do the work while you stay in control.
          </p>
          <div className="hero-actions">
            <a href="#install" className="btn btn-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Install Bloom
            </a>
            <a href="https://docs.use-bloom.dev" className="btn btn-secondary">
              Read the Docs
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features">
        <div className="container">
          <h2 className="section-title">Why Bloom?</h2>
          <p className="section-subtitle">
            From high-level requirements to parallel AI execution
          </p>
          <div className="features-grid">
            <FeatureCard
              icon={<AgentsIcon />}
              title="Multi-Agent Orchestration"
              description="Run multiple Claude Code agents simultaneously. Each works on isolated tasks in separate git worktrees."
            />
            <FeatureCard
              icon={<HumanIcon />}
              title="Human-in-the-Loop"
              description="Stay in control. Agents ask questions and wait for your decisions on critical choices."
            />
            <FeatureCard
              icon={<YamlIcon />}
              title="YAML-Based Tasks"
              description="Define tasks with clear instructions, dependencies, and acceptance criteria in simple YAML."
            />
            <FeatureCard
              icon={<GitIcon />}
              title="Git Worktree Isolation"
              description="No merge conflicts. Each agent works in its own worktree for true parallel development."
            />
            <FeatureCard
              icon={<TerminalIcon />}
              title="Rich Terminal UI"
              description="Monitor all agents in real-time with a beautiful tiled interface. Navigate, restart, control."
            />
            <FeatureCard
              icon={<WorkflowIcon />}
              title="Complete Workflow"
              description="From PRD to plan to tasks to execution. Bloom guides the entire development lifecycle."
            />
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="workflow">
        <div className="container">
          <h2 className="section-title">The Bloom Workflow</h2>
          <div className="workflow-steps">
            <WorkflowStep number="1" title="Initialize" description="Set up your workspace with repos" />
            <WorkflowStep number="2" title="Create" description="Start a project with PRD" />
            <WorkflowStep number="3" title="Plan" description="Claude creates implementation plan" />
            <WorkflowStep number="4" title="Generate" description="Convert plan to executable tasks" />
            <WorkflowStep number="5" title="Run" description="Agents execute in parallel" />
          </div>
          <div className="workflow-code">
            <pre><code>{`# The complete workflow
bloom init                # Initialize workspace
bloom repo clone myorg/api  # Add repositories
bloom create feature-auth   # Create project
bloom plan                  # Generate plan with Claude
bloom generate              # Create tasks from plan
bloom run                   # Execute with parallel agents`}</code></pre>
          </div>
        </div>
      </section>

      {/* Install */}
      <section className="install" id="install">
        <div className="container">
          <h2 className="section-title">Install Bloom</h2>
          <p className="section-subtitle">
            Pre-built binaries for macOS, Linux, and Windows
          </p>

          <div className="install-tabs">
            <div className="install-tab">
              <h3 className="install-tab-title">
                <AppleIcon /> macOS & <LinuxIcon /> Linux
              </h3>
              <pre><code>curl -fsSL https://raw.githubusercontent.com/steveyackey/bloom/main/install.sh | bash</code></pre>
            </div>

            <div className="install-tab">
              <h3 className="install-tab-title">
                <WindowsIcon /> Windows (PowerShell)
              </h3>
              <pre><code>iwr -useb https://raw.githubusercontent.com/steveyackey/bloom/main/install.ps1 | iex</code></pre>
            </div>
          </div>

          <div className="install-requirements">
            <h4>Requirements</h4>
            <ul>
              <li>
                <strong>Claude Code CLI</strong> — <code>npm install -g @anthropic-ai/claude-code</code>
              </li>
              <li>
                <strong>Anthropic API Key</strong> — Set <code>ANTHROPIC_API_KEY</code> environment variable
              </li>
              <li>
                <strong>Git 2.20+</strong> — For worktree support
              </li>
            </ul>
          </div>

          <div className="install-verify">
            <pre><code>{`# Verify installation
bloom version
bloom help`}</code></pre>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <div className="container cta-container">
          <h2 className="cta-title">Ready to orchestrate?</h2>
          <p className="cta-subtitle">
            Start building with multi-agent AI today.
          </p>
          <div className="cta-actions">
            <a href="https://docs.use-bloom.dev/getting-started/quick-start" className="btn btn-primary">
              Get Started
            </a>
            <a href="https://github.com/steveyackey/bloom" className="btn btn-secondary">
              <GithubIcon /> Star on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container footer-container">
          <div className="footer-brand">
            <img src="/bloom-logo.png" alt="Bloom" className="footer-logo" />
            <p className="footer-tagline">Multi-agent task orchestration for AI-powered development.</p>
          </div>
          <div className="footer-links">
            <div className="footer-column">
              <h4>Documentation</h4>
              <a href="https://docs.use-bloom.dev/getting-started/installation">Installation</a>
              <a href="https://docs.use-bloom.dev/getting-started/quick-start">Quick Start</a>
              <a href="https://docs.use-bloom.dev/commands/overview">Commands</a>
            </div>
            <div className="footer-column">
              <h4>Resources</h4>
              <a href="https://docs.use-bloom.dev/best-practices/project-structure">Best Practices</a>
              <a href="https://docs.use-bloom.dev/reference/task-schema">Task Schema</a>
              <a href="https://github.com/steveyackey/bloom">GitHub</a>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} Bloom. Built for developers who move fast.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

// Feature Card Component
interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="feature-card">
      <div className="feature-icon">{icon}</div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-description">{description}</p>
    </div>
  )
}

// Workflow Step Component
interface WorkflowStepProps {
  number: string
  title: string
  description: string
}

function WorkflowStep({ number, title, description }: WorkflowStepProps) {
  return (
    <div className="workflow-step">
      <div className="workflow-number">{number}</div>
      <div className="workflow-content">
        <h4 className="workflow-title">{title}</h4>
        <p className="workflow-description">{description}</p>
      </div>
    </div>
  )
}

// Icons
function AgentsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function HumanIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function YamlIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function GitIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </svg>
  )
}

function TerminalIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}

function WorkflowIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  )
}

function LinuxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.311.001-.465.003-.653.014-1.302.065-1.94.153-1.271.175-2.498.512-3.642 1.004-.574.247-1.127.532-1.654.852-.528.32-1.029.676-1.498 1.063-.94.775-1.745 1.685-2.387 2.704-.32.509-.604 1.042-.85 1.594-.247.553-.454 1.124-.62 1.709-.331 1.168-.514 2.383-.545 3.609-.006.242-.009.485-.009.728 0 .244.003.487.009.729.031 1.226.214 2.441.545 3.609.166.585.373 1.156.62 1.709.246.552.53 1.085.85 1.594.642 1.019 1.447 1.929 2.387 2.704.469.387.97.743 1.498 1.063.527.32 1.08.605 1.654.852 1.144.492 2.371.829 3.642 1.004.638.088 1.287.139 1.94.153.154.002.31.003.465.003.155 0 .311-.001.465-.003.653-.014 1.302-.065 1.94-.153 1.271-.175 2.498-.512 3.642-1.004.574-.247 1.127-.532 1.654-.852.528-.32 1.029-.676 1.498-1.063.94-.775 1.745-1.685 2.387-2.704.32-.509.604-1.042.85-1.594.247-.553.454-1.124.62-1.709.331-1.168.514-2.383.545-3.609.006-.242.009-.485.009-.729 0-.243-.003-.486-.009-.728-.031-1.226-.214-2.441-.545-3.609-.166-.585-.373-1.156-.62-1.709-.246-.552-.53-1.085-.85-1.594-.642-1.019-1.447-1.929-2.387-2.704-.469-.387-.97-.743-1.498-1.063-.527-.32-1.08-.605-1.654-.852-1.144-.492-2.371-.829-3.642-1.004-.638-.088-1.287-.139-1.94-.153-.154-.002-.31-.003-.465-.003zm0 1.5c.146 0 .292.001.437.003.602.013 1.2.06 1.787.14 1.166.161 2.295.47 3.346.921.527.227 1.035.489 1.52.783.484.294.943.62 1.373.973.86.71 1.597 1.544 2.186 2.479.295.468.556.958.782 1.466.227.508.418 1.033.572 1.57.306 1.072.475 2.188.503 3.315.006.222.008.445.008.668 0 .223-.002.446-.008.668-.028 1.127-.197 2.243-.503 3.315-.154.537-.345 1.062-.572 1.57-.226.508-.487.998-.782 1.466-.589.935-1.326 1.769-2.186 2.479-.43.353-.889.679-1.373.973-.485.294-.993.556-1.52.783-1.051.451-2.18.76-3.346.921-.587.08-1.185.127-1.787.14-.145.002-.291.003-.437.003-.146 0-.292-.001-.437-.003-.602-.013-1.2-.06-1.787-.14-1.166-.161-2.295-.47-3.346-.921-.527-.227-1.035-.489-1.52-.783-.484-.294-.943-.62-1.373-.973-.86-.71-1.597-1.544-2.186-2.479-.295-.468-.556-.958-.782-1.466-.227-.508-.418-1.033-.572-1.57-.306-1.072-.475-2.188-.503-3.315-.006-.222-.008-.445-.008-.668 0-.223.002-.446.008-.668.028-1.127.197-2.243.503-3.315.154-.537.345-1.062.572-1.57.226-.508.487-.998.782-1.466.589-.935 1.326-1.769 2.186-2.479.43-.353.889-.679 1.373-.973.485-.294.993-.556 1.52-.783 1.051-.451 2.18-.76 3.346-.921.587-.08 1.185-.127 1.787-.14.145-.002.291-.003.437-.003z"/>
    </svg>
  )
}

function WindowsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
    </svg>
  )
}

export default App
