import { useState } from 'react'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState<'unix' | 'windows'>('unix')
  const [copied, setCopied] = useState(false)

  const installCommands = {
    unix: 'curl -fsSL https://raw.githubusercontent.com/steveyackey/bloom/main/install.sh | bash',
    windows: 'iwr -useb https://raw.githubusercontent.com/steveyackey/bloom/main/install.ps1 | iex'
  }

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(installCommands[activeTab])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="nav">
        <div className="container nav-container">
          <a href="/" className="nav-logo">
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
        <div className="hero-background">
          <img src="/bloom-hero.jpg" alt="" className="hero-bg-image" />
          <div className="hero-overlay" />
        </div>
        <div className="container hero-container">
          <h1 className="hero-brand">BLOOM</h1>
          <p className="hero-tagline">Multi-Agent Task Orchestration</p>
          <p className="hero-subtitle">
            From PRD to production with AI agents.<br />
            Collaborate on requirements, validate at checkpoints, ship faster.
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
            Structured collaboration for teams. Fast iteration for solo devs.
          </p>
          <div className="features-grid">
            <FeatureCard
              icon={<GitIcon />}
              title="Multi-Repo Planning"
              description="Plan across backend, frontend, and shared libraries in one project. Coordinate cross-repo dependencies automatically."
            />
            <FeatureCard
              icon={<SearchIcon />}
              title="Cross-Repo Exploration"
              description="Use bloom enter to ask questions across all your repos. Debug issues, onboard to codebases, understand system connections."
            />
            <FeatureCard
              icon={<AgentsIcon />}
              title="Team & Solo Friendly"
              description="PMs define PRDs, designers add mockups, developers plan, QA validates. Or move fast as a solo dev with AI assistance."
            />
            <FeatureCard
              icon={<HumanIcon />}
              title="Built-in Checkpoints"
              description="Validate work at phase boundaries. QA and team members review before agents continue. You control the pace."
            />
            <FeatureCard
              icon={<WorkflowIcon />}
              title="Git Worktree Isolation"
              description="No merge conflicts. Each agent works in its own worktree for true parallel development."
            />
            <FeatureCard
              icon={<TerminalIcon />}
              title="Rich Terminal UI"
              description="Monitor all agents in real-time with a beautiful tiled interface. Navigate, restart, control."
            />
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="workflow">
        <div className="container">
          <h2 className="section-title">The Bloom Workflow</h2>
          <div className="workflow-steps">
            <WorkflowStep number="1" title="Initialize" description="Set up workspace with repos" />
            <WorkflowStep number="2" title="Create & Define" description="PMs add PRD, designers add mockups" />
            <WorkflowStep number="3" title="Plan" description="Devs and architects refine approach" />
            <WorkflowStep number="4" title="Generate" description="Convert plan to executable tasks" />
            <WorkflowStep number="5" title="Run & Validate" description="QA validates at checkpoints" />
          </div>
          <div className="workflow-demo">
            <img src="/demo.svg" alt="Bloom Demo" className="demo-animation" />
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

          <div className="install-card">
            <div className="install-tabs-header">
              <button
                className={`install-tab-btn ${activeTab === 'unix' ? 'active' : ''}`}
                onClick={() => setActiveTab('unix')}
              >
                <AppleIcon />
                <span>macOS</span>
                <span className="tab-divider">/</span>
                <TerminalSmallIcon />
                <span>Linux</span>
              </button>
              <button
                className={`install-tab-btn ${activeTab === 'windows' ? 'active' : ''}`}
                onClick={() => setActiveTab('windows')}
              >
                <WindowsIcon />
                <span>Windows</span>
              </button>
            </div>
            <div className="install-code-wrapper">
              <pre className="install-code"><code>{installCommands[activeTab]}</code></pre>
              <button className="copy-btn" onClick={copyToClipboard} title="Copy to clipboard">
                {copied ? <CheckIcon /> : <CopyIcon />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="install-requirements">
            <h4>Requirements</h4>
            <ul>
              <li>
                <strong>Claude Code CLI</strong> — <code>npm install -g @anthropic-ai/claude-code</code>
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
            Whether you're a team or flying solo, start building with AI agents today.
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
            <h3 className="footer-title">Bloom</h3>
            <p className="footer-tagline">Multi-agent task orchestration for teams and solo developers.</p>
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

function TerminalSmallIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

function SearchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  )
}

function WindowsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default App
