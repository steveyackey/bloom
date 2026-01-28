// =============================================================================
// Daemon Dashboard UI - HTML/CSS/JS for the daemon web dashboard
// =============================================================================
// Same dark industrial aesthetic as bloom view (src/view/ui.ts)

/**
 * Render the complete HTML page for the daemon dashboard.
 */
export function renderDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bloom Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${getStyles()}</style>
</head>
<body>
  <div class="app">
    <header class="header">
      <div class="header-left">
        <div class="logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <circle cx="12" cy="12" r="4" fill="currentColor"/>
          </svg>
          <span class="logo-text">bloom dashboard</span>
        </div>
      </div>
      <div class="header-center">
        <div class="daemon-status" id="daemon-status"></div>
      </div>
      <div class="header-right">
        <button class="btn btn-refresh" onclick="refresh()" title="Refresh">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          <span>Refresh</span>
        </button>
        <div class="connection-status" id="connection-status">
          <span class="dot"></span>
          <span class="label">Live</span>
        </div>
      </div>
    </header>

    <main class="main">
      <div class="content-area">
        <!-- Overview Cards -->
        <div class="overview-cards" id="overview-cards"></div>

        <!-- Agent Pool -->
        <section class="section" id="section-agents">
          <div class="section-header">
            <h2 class="section-title">Agent Pool</h2>
            <span class="section-badge" id="agents-badge">0/0</span>
          </div>
          <div class="agents-grid" id="agents-grid"></div>
        </section>

        <!-- Active Tasks -->
        <section class="section" id="section-active">
          <div class="section-header">
            <h2 class="section-title">Active</h2>
            <span class="section-badge" id="active-badge">0</span>
          </div>
          <div class="task-list" id="active-list"></div>
        </section>

        <!-- Queued Tasks -->
        <section class="section" id="section-queue">
          <div class="section-header">
            <h2 class="section-title">Queue</h2>
            <span class="section-badge" id="queue-badge">0</span>
          </div>
          <div class="task-list" id="queue-list"></div>
        </section>

        <!-- Completed / Failed -->
        <section class="section" id="section-history">
          <div class="section-header">
            <h2 class="section-title">History</h2>
            <span class="section-badge" id="history-badge">0</span>
          </div>
          <div class="task-list" id="history-list"></div>
        </section>
      </div>

      <!-- Details Panel -->
      <div class="details-panel" id="details-panel">
        <div class="details-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M9 9h6M9 13h6M9 17h4"/>
          </svg>
          <p>Select a task to view details</p>
        </div>
      </div>
    </main>
  </div>

  <script>
${getScript()}
  </script>
</body>
</html>`;
}

function getStyles(): string {
  return `
:root {
  /* Dark industrial palette - matches bloom view */
  --bg-base: #0a0a0b;
  --bg-surface: #111113;
  --bg-elevated: #18181b;
  --bg-hover: #222226;

  --border-subtle: #27272a;
  --border-default: #3f3f46;
  --border-strong: #52525b;

  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --text-tertiary: #71717a;
  --text-muted: #52525b;

  /* Queue status colors */
  --status-queued: #3b82f6;
  --status-active: #f59e0b;
  --status-done: #22c55e;
  --status-failed: #ef4444;
  --status-cancelled: #52525b;

  /* Source type colors */
  --source-workspace: #8b5cf6;
  --source-inbox: #06b6d4;
  --source-research: #10b981;

  /* Priority colors */
  --priority-high: #ef4444;
  --priority-normal: #71717a;
  --priority-low: #3b82f6;

  /* Accent */
  --accent: #6366f1;
  --accent-muted: #4f46e5;

  /* Typography */
  --font-sans: 'Outfit', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* Effects */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.5);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.6);
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Sizing */
  --header-height: 56px;
  --panel-width: 420px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  overflow: hidden;
}

body {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg-base);
  -webkit-font-smoothing: antialiased;
}

/* App Layout */
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* Header - matches bloom view */
.header {
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-5);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.header-center {
  display: flex;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-primary);
}

.logo svg {
  color: var(--accent);
}

.logo-text {
  font-weight: 600;
  font-size: 15px;
  letter-spacing: -0.02em;
}

.daemon-status {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  font-size: 13px;
  font-family: var(--font-mono);
}

.daemon-stat {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
}

.daemon-stat-value {
  font-weight: 500;
  color: var(--text-primary);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-default);
}

.btn-refresh svg {
  transition: transform 0.3s ease;
}

.btn-refresh:hover svg {
  transform: rotate(180deg);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 12px;
  color: var(--text-tertiary);
}

.connection-status .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--status-done);
  animation: pulse 2s infinite;
}

.connection-status.disconnected .dot {
  background: var(--status-failed);
  animation: none;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Main Content */
.main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* Overview Cards */
.overview-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}

.overview-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-4) var(--space-5);
  transition: border-color 0.15s ease;
}

.overview-card:hover {
  border-color: var(--border-default);
}

.overview-card-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-2);
}

.overview-card-value {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1;
}

.overview-card-sub {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: var(--space-2);
  font-family: var(--font-mono);
}

.card-accent-active .overview-card-value { color: var(--status-active); }
.card-accent-queued .overview-card-value { color: var(--status-queued); }
.card-accent-done .overview-card-value { color: var(--status-done); }
.card-accent-failed .overview-card-value { color: var(--status-failed); }

/* Sections */
.section {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-badge {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
}

/* Agent Pool Grid */
.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
  padding: var(--space-4);
}

.agent-slot {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  transition: all 0.15s ease;
}

.agent-slot:hover {
  border-color: var(--border-default);
}

.agent-slot.busy {
  border-left: 3px solid var(--status-active);
}

.agent-slot.idle {
  border-left: 3px solid var(--border-subtle);
  opacity: 0.6;
}

.agent-slot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.agent-slot-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
}

.agent-slot-status {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}

.agent-slot-status.busy {
  color: var(--status-active);
  background: rgba(245, 158, 11, 0.1);
}

.agent-slot-status.idle {
  color: var(--text-muted);
  background: var(--bg-hover);
}

.agent-slot-provider {
  font-size: 13px;
  font-weight: 500;
  color: var(--accent);
  margin-bottom: var(--space-1);
}

.agent-slot-detail {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Task List */
.task-list {
  padding: 0;
}

.task-list-empty {
  padding: var(--space-6);
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.task-row {
  display: grid;
  grid-template-columns: 32px auto 1fr auto auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background 0.1s ease;
}

.task-row:last-child {
  border-bottom: none;
}

.task-row:hover {
  background: var(--bg-hover);
}

.task-row.selected {
  background: var(--bg-elevated);
  box-shadow: inset 3px 0 0 var(--accent);
}

.task-row-status {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  justify-self: center;
}

.task-row-source {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  white-space: nowrap;
}

.source-workspace {
  color: var(--source-workspace);
  background: rgba(139, 92, 246, 0.1);
}

.source-inbox {
  color: var(--source-inbox);
  background: rgba(6, 182, 212, 0.1);
}

.source-research {
  color: var(--source-research);
  background: rgba(16, 185, 129, 0.1);
}

.task-row-label {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-row-workspace {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
}

.task-row-time {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  min-width: 50px;
  text-align: right;
}

/* Status indicator colors */
.bg-queued { background: var(--status-queued); }
.bg-active { background: var(--status-active); }
.bg-done { background: var(--status-done); }
.bg-failed { background: var(--status-failed); }
.bg-cancelled { background: var(--status-cancelled); }

/* Details Panel */
.details-panel {
  width: var(--panel-width);
  background: var(--bg-surface);
  border-left: 1px solid var(--border-subtle);
  overflow-y: auto;
  flex-shrink: 0;
}

.details-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-4);
  color: var(--text-tertiary);
}

.details-header {
  padding: var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
  position: sticky;
  top: 0;
  background: var(--bg-surface);
  z-index: 1;
}

.details-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-1);
  word-break: break-word;
}

.details-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
}

.details-badges {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
  flex-wrap: wrap;
}

.detail-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
}

.badge-status {
  background: var(--bg-elevated);
}

.badge-source {
  background: var(--bg-elevated);
}

.badge-priority-high {
  color: var(--priority-high);
  background: rgba(239, 68, 68, 0.1);
}

.badge-priority-normal {
  color: var(--text-secondary);
  background: var(--bg-elevated);
}

.badge-priority-low {
  color: var(--priority-low);
  background: rgba(59, 130, 246, 0.1);
}

.details-content {
  padding: var(--space-4);
}

.info-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2) var(--space-4);
  font-size: 13px;
}

.info-label {
  color: var(--text-tertiary);
}

.info-value {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  word-break: break-all;
}

/* Accordion - matches bloom view */
.accordion {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-3);
  overflow: hidden;
}

.accordion-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-3) var(--space-4);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--bg-elevated);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

.accordion-trigger:hover {
  background: var(--bg-hover);
}

.accordion-trigger svg {
  color: var(--text-tertiary);
  transition: transform 0.2s ease;
}

.accordion.open .accordion-trigger svg {
  transform: rotate(180deg);
}

.accordion-content {
  display: none;
  padding: var(--space-4);
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.accordion.open .accordion-content {
  display: block;
}

.accordion-content pre {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

/* Offline state */
.offline-banner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
  text-align: center;
  gap: var(--space-4);
  color: var(--text-tertiary);
  min-height: 300px;
}

.offline-banner svg {
  opacity: 0.3;
}

.offline-banner p {
  max-width: 360px;
}

.offline-banner code {
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 2px 6px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  color: var(--accent);
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--border-strong);
}

/* Responsive */
@media (max-width: 1200px) {
  .overview-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 900px) {
  .details-panel {
    display: none;
  }
}
`;
}

function getScript(): string {
  return `
// =============================================================================
// Bloom Dashboard Client-Side JavaScript
// =============================================================================

let state = {
  status: null,
  connected: false,
  version: 0,
  selectedEntryId: null,
};

// =============================================================================
// SSE for Live Updates
// =============================================================================

let eventSource = null;

function connectSSE() {
  eventSource = new EventSource('/api/events');

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.version !== state.version) {
      loadStatus();
    }
  };

  eventSource.onerror = () => {
    document.getElementById('connection-status').classList.add('disconnected');
    document.querySelector('#connection-status .label').textContent = 'Reconnecting...';
    setTimeout(() => {
      eventSource.close();
      connectSSE();
    }, 3000);
  };

  eventSource.onopen = () => {
    document.getElementById('connection-status').classList.remove('disconnected');
    document.querySelector('#connection-status .label').textContent = 'Live';
  };
}

// =============================================================================
// API
// =============================================================================

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    state.status = data.status;
    state.connected = data.connected;
    state.version = data.version;

    render();
  } catch (err) {
    console.error('Failed to load status:', err);
  }
}

async function refresh() {
  const btn = document.querySelector('.btn-refresh');
  btn.disabled = true;
  try {
    await fetch('/api/refresh', { method: 'POST' });
    await loadStatus();
  } finally {
    btn.disabled = false;
  }
}

// =============================================================================
// Rendering
// =============================================================================

function render() {
  renderDaemonStatus();
  renderOverview();
  renderAgentPool();
  renderActiveList();
  renderQueueList();
  renderHistoryList();

  // Re-select entry if it still exists
  if (state.selectedEntryId && state.status) {
    const entry = state.status.queue.entries.find(e => e.id === state.selectedEntryId);
    if (entry) {
      renderDetails(entry);
    }
  }
}

function renderDaemonStatus() {
  const el = document.getElementById('daemon-status');
  if (!state.connected || !state.status) {
    el.innerHTML = '<span class="daemon-stat" style="color: var(--status-failed);">Daemon offline</span>';
    return;
  }

  const s = state.status;
  const hours = Math.floor(s.uptime / 3600);
  const minutes = Math.floor((s.uptime % 3600) / 60);
  const uptime = hours > 0 ? hours + 'h ' + minutes + 'm' : minutes + 'm';

  el.innerHTML =
    '<span class="daemon-stat">' +
      '<span class="daemon-stat-value" style="color: var(--status-done);">running</span>' +
      '<span style="color: var(--text-muted);">pid ' + s.pid + '</span>' +
    '</span>' +
    '<span class="daemon-stat">' +
      '<span style="color: var(--text-muted);">uptime</span>' +
      '<span class="daemon-stat-value">' + uptime + '</span>' +
    '</span>';
}

function renderOverview() {
  const el = document.getElementById('overview-cards');
  if (!state.connected || !state.status) {
    el.innerHTML =
      '<div class="offline-banner">' +
        '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
          '<circle cx="12" cy="12" r="10"/>' +
          '<line x1="15" y1="9" x2="9" y2="15"/>' +
          '<line x1="9" y1="9" x2="15" y2="15"/>' +
        '</svg>' +
        '<p style="font-size: 15px; font-weight: 500; color: var(--text-secondary);">Daemon not running</p>' +
        '<p>Start the daemon to see task queue status.</p>' +
        '<p>Run <code>bloom start</code> to begin.</p>' +
      '</div>';
    return;
  }

  const s = state.status;
  el.innerHTML =
    '<div class="overview-card card-accent-active">' +
      '<div class="overview-card-label">Active</div>' +
      '<div class="overview-card-value">' + s.agents.active + '</div>' +
      '<div class="overview-card-sub">' + s.agents.active + ' / ' + s.agents.max + ' slots</div>' +
    '</div>' +
    '<div class="overview-card card-accent-queued">' +
      '<div class="overview-card-label">Queued</div>' +
      '<div class="overview-card-value">' + s.queue.pending + '</div>' +
      '<div class="overview-card-sub">waiting for agent</div>' +
    '</div>' +
    '<div class="overview-card card-accent-done">' +
      '<div class="overview-card-label">Completed Today</div>' +
      '<div class="overview-card-value">' + s.queue.completedToday + '</div>' +
      '<div class="overview-card-sub">tasks finished</div>' +
    '</div>' +
    '<div class="overview-card card-accent-failed">' +
      '<div class="overview-card-label">Failed</div>' +
      '<div class="overview-card-value">' + countByStatus('failed') + '</div>' +
      '<div class="overview-card-sub">need attention</div>' +
    '</div>';
}

function renderAgentPool() {
  const grid = document.getElementById('agents-grid');
  const badge = document.getElementById('agents-badge');

  if (!state.status) {
    grid.innerHTML = '<div class="task-list-empty">No daemon connected</div>';
    badge.textContent = '0/0';
    return;
  }

  const slots = state.status.agents.slots;
  badge.textContent = state.status.agents.active + '/' + state.status.agents.max;

  if (slots.length === 0) {
    grid.innerHTML = '<div class="task-list-empty">No agent slots configured</div>';
    return;
  }

  grid.innerHTML = slots.map(function(slot) {
    var isBusy = slot.status === 'busy';
    var duration = slot.duration ? formatDuration(slot.duration) : '';
    return '<div class="agent-slot ' + slot.status + '">' +
      '<div class="agent-slot-header">' +
        '<span class="agent-slot-id">Slot #' + slot.id + '</span>' +
        '<span class="agent-slot-status ' + slot.status + '">' + slot.status + '</span>' +
      '</div>' +
      (isBusy
        ? '<div class="agent-slot-provider">' + escapeHtml(slot.provider || '?') + '</div>' +
          '<div class="agent-slot-detail">' + escapeHtml(shortPath(slot.workspace || '')) + '</div>' +
          (slot.taskId ? '<div class="agent-slot-detail">' + escapeHtml(slot.taskId) + '</div>' : '') +
          (duration ? '<div class="agent-slot-detail" style="color: var(--status-active);">' + duration + '</div>' : '')
        : '<div class="agent-slot-detail" style="color: var(--text-muted);">Waiting for task</div>'
      ) +
    '</div>';
  }).join('');
}

function renderActiveList() {
  var el = document.getElementById('active-list');
  var badge = document.getElementById('active-badge');
  if (!state.status) {
    el.innerHTML = '<div class="task-list-empty">No daemon connected</div>';
    badge.textContent = '0';
    return;
  }

  var entries = state.status.queue.entries.filter(function(e) { return e.status === 'active'; });
  badge.textContent = String(entries.length);

  if (entries.length === 0) {
    el.innerHTML = '<div class="task-list-empty">No active tasks</div>';
    return;
  }

  el.innerHTML = entries.map(function(e) { return renderTaskRow(e); }).join('');
}

function renderQueueList() {
  var el = document.getElementById('queue-list');
  var badge = document.getElementById('queue-badge');
  if (!state.status) {
    el.innerHTML = '<div class="task-list-empty">No daemon connected</div>';
    badge.textContent = '0';
    return;
  }

  var entries = state.status.queue.entries.filter(function(e) { return e.status === 'queued'; });
  badge.textContent = String(entries.length);

  if (entries.length === 0) {
    el.innerHTML = '<div class="task-list-empty">No queued tasks</div>';
    return;
  }

  el.innerHTML = entries.map(function(e) { return renderTaskRow(e); }).join('');
}

function renderHistoryList() {
  var el = document.getElementById('history-list');
  var badge = document.getElementById('history-badge');
  if (!state.status) {
    el.innerHTML = '<div class="task-list-empty">No daemon connected</div>';
    badge.textContent = '0';
    return;
  }

  var entries = state.status.queue.entries.filter(function(e) {
    return e.status === 'done' || e.status === 'failed' || e.status === 'cancelled';
  });
  // Most recent first
  entries.sort(function(a, b) {
    return (b.startedAt || b.enqueuedAt).localeCompare(a.startedAt || a.enqueuedAt);
  });
  entries = entries.slice(0, 50);

  badge.textContent = String(entries.length);

  if (entries.length === 0) {
    el.innerHTML = '<div class="task-list-empty">No completed tasks yet</div>';
    return;
  }

  el.innerHTML = entries.map(function(e) { return renderTaskRow(e); }).join('');
}

function renderTaskRow(entry) {
  var label = entry.instruction
    ? entry.instruction.slice(0, 80)
    : (entry.taskId || entry.id.slice(0, 8));
  var workspace = entry.workspace ? shortPath(entry.workspace) : '';
  var time = '';
  if (entry.status === 'active' && entry.startedAt) {
    var secs = Math.floor((Date.now() - new Date(entry.startedAt).getTime()) / 1000);
    time = formatDuration(secs);
  } else if (entry.status === 'queued') {
    var waitSecs = Math.floor((Date.now() - new Date(entry.enqueuedAt).getTime()) / 1000);
    time = formatDuration(waitSecs) + ' ago';
  } else if (entry.startedAt) {
    time = relativeTime(entry.startedAt);
  }

  var selected = state.selectedEntryId === entry.id;

  return '<div class="task-row' + (selected ? ' selected' : '') + '" onclick="onEntryClick(\\'' + entry.id + '\\')">' +
    '<div class="task-row-status bg-' + entry.status + '"></div>' +
    '<span class="task-row-source source-' + entry.source + '">' + entry.source + '</span>' +
    '<span class="task-row-label">' + escapeHtml(label) + '</span>' +
    '<span class="task-row-workspace">' + escapeHtml(workspace) + '</span>' +
    '<span class="task-row-time">' + time + '</span>' +
  '</div>';
}

// =============================================================================
// Selection & Details
// =============================================================================

function onEntryClick(entryId) {
  if (!state.status) return;
  var entry = state.status.queue.entries.find(function(e) { return e.id === entryId; });
  if (!entry) return;

  state.selectedEntryId = entryId;

  // Update selection visuals
  document.querySelectorAll('.task-row').forEach(function(el) {
    el.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');

  renderDetails(entry);
}

function renderDetails(entry) {
  var panel = document.getElementById('details-panel');

  var label = entry.instruction
    ? entry.instruction.slice(0, 120)
    : (entry.taskId || 'Task ' + entry.id.slice(0, 8));

  var statusColor = {
    queued: 'var(--status-queued)',
    active: 'var(--status-active)',
    done: 'var(--status-done)',
    failed: 'var(--status-failed)',
    cancelled: 'var(--status-cancelled)',
  }[entry.status] || 'var(--text-muted)';

  var priorityLabel = entry.priority <= 10 ? 'high' : entry.priority >= 90 ? 'low' : 'normal';
  var priorityClass = 'badge-priority-' + priorityLabel;

  var infoRows = [];
  infoRows.push(['Status', entry.status]);
  infoRows.push(['Source', entry.source]);
  infoRows.push(['Priority', priorityLabel + ' (' + entry.priority + ')']);
  if (entry.workspace) infoRows.push(['Workspace', shortPath(entry.workspace)]);
  if (entry.taskId) infoRows.push(['Task ID', entry.taskId]);
  infoRows.push(['Enqueued', formatTimestamp(entry.enqueuedAt)]);
  if (entry.startedAt) infoRows.push(['Started', formatTimestamp(entry.startedAt)]);

  if (entry.status === 'active' && entry.startedAt) {
    var elapsed = Math.floor((Date.now() - new Date(entry.startedAt).getTime()) / 1000);
    infoRows.push(['Elapsed', formatDuration(elapsed)]);
  }

  var infoGrid = '<div class="info-grid">' +
    infoRows.map(function(row) {
      return '<span class="info-label">' + row[0] + '</span>' +
        '<span class="info-value">' + escapeHtml(String(row[1])) + '</span>';
    }).join('') +
  '</div>';

  var chevronSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';

  var instructionSection = '';
  if (entry.instruction) {
    instructionSection =
      '<div class="accordion open" id="acc-instruction">' +
        '<button class="accordion-trigger" onclick="toggleAccordion(\\'acc-instruction\\')">' +
          '<span>Instruction</span>' + chevronSvg +
        '</button>' +
        '<div class="accordion-content">' +
          '<pre>' + escapeHtml(entry.instruction) + '</pre>' +
        '</div>' +
      '</div>';
  }

  panel.innerHTML =
    '<div class="details-header">' +
      '<div class="details-title">' + escapeHtml(label) + '</div>' +
      '<div class="details-id">' + entry.id + '</div>' +
      '<div class="details-badges">' +
        '<span class="detail-badge badge-status" style="color: ' + statusColor + ';">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:' + statusColor + ';display:inline-block;"></span> ' +
          entry.status +
        '</span>' +
        '<span class="detail-badge badge-source source-' + entry.source + '">' + entry.source + '</span>' +
        '<span class="detail-badge ' + priorityClass + '">' + priorityLabel + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="details-content">' +
      '<div class="accordion open" id="acc-info">' +
        '<button class="accordion-trigger" onclick="toggleAccordion(\\'acc-info\\')">' +
          '<span>Info</span>' + chevronSvg +
        '</button>' +
        '<div class="accordion-content">' +
          infoGrid +
        '</div>' +
      '</div>' +
      instructionSection +
    '</div>';
}

function toggleAccordion(id) {
  var acc = document.getElementById(id);
  if (acc) acc.classList.toggle('open');
}

// =============================================================================
// Utilities
// =============================================================================

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shortPath(path) {
  if (!path) return '';
  // Remove home dir prefix for display
  var home = '';
  try {
    // Best effort: detect common home patterns
    var parts = path.split('/');
    if (parts[1] === 'home' || parts[1] === 'Users') {
      home = '/' + parts[1] + '/' + parts[2];
    }
  } catch(e) {}
  if (home && path.startsWith(home)) {
    return '~' + path.slice(home.length);
  }
  return path;
}

function formatDuration(seconds) {
  if (seconds < 60) return seconds + 's';
  var min = Math.floor(seconds / 60);
  var sec = seconds % 60;
  if (min < 60) return sec > 0 ? min + 'm ' + sec + 's' : min + 'm';
  var hr = Math.floor(min / 60);
  min = min % 60;
  return hr + 'h ' + min + 'm';
}

function formatTimestamp(iso) {
  try {
    var d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch(e) {
    return iso;
  }
}

function relativeTime(iso) {
  try {
    var secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return secs + 's ago';
    var min = Math.floor(secs / 60);
    if (min < 60) return min + 'm ago';
    var hr = Math.floor(min / 60);
    return hr + 'h ago';
  } catch(e) {
    return '';
  }
}

function countByStatus(status) {
  if (!state.status) return 0;
  return state.status.queue.entries.filter(function(e) { return e.status === status; }).length;
}

// =============================================================================
// Initialize
// =============================================================================

document.addEventListener('DOMContentLoaded', function() {
  loadStatus();
  connectSSE();
});
`;
}
