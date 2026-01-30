// =============================================================================
// Bloom View UI - HTML/CSS/JS for the visual inspector
// =============================================================================

import type { TaskGraph } from "./graph";

/**
 * Render the complete HTML page for the view.
 */
export function renderHTML(_graph: TaskGraph | null, _error: string | null): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bloom View</title>
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
          <span class="logo-text">bloom view</span>
        </div>
      </div>
      <div class="header-center">
        <div class="stats" id="stats"></div>
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
      <div class="graph-container" id="graph-container">
        <div class="graph-canvas" id="graph-canvas"></div>
      </div>
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
  /* Dark industrial palette */
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

  /* Status colors - muted but distinctive */
  --status-todo: #52525b;
  --status-ready: #3b82f6;
  --status-assigned: #8b5cf6;
  --status-in-progress: #f59e0b;
  --status-done-pending: #10b981;
  --status-done: #22c55e;
  --status-blocked: #ef4444;

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

  /* Sizing */
  --header-height: 56px;
  --panel-width: 480px;
  --node-width: 200px;
  --node-gap: 24px;
  --layer-gap: 120px;

  /* Effects */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.5);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.6);
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
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

/* Header */
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

.stats {
  display: flex;
  gap: var(--space-4);
  font-size: 13px;
  font-family: var(--font-mono);
}

.stat {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
}

.stat-value {
  font-weight: 500;
  color: var(--text-primary);
}

.stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
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
  background: var(--status-blocked);
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

/* Graph Container */
.graph-container {
  flex: 1;
  overflow: auto;
  background:
    linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px),
    linear-gradient(var(--border-subtle) 1px, transparent 1px);
  background-size: 40px 40px;
  background-position: -1px -1px;
}

.graph-canvas {
  position: relative;
  min-width: 100%;
  min-height: 100%;
  padding: var(--space-8);
}

/* Task Nodes */
.task-node {
  position: absolute;
  width: var(--node-width);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: var(--shadow-sm);
}

.task-node:hover {
  border-color: var(--border-default);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.task-node.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), var(--shadow-md);
}

.task-node-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3) var(--space-2);
}

.task-status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}

.task-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-primary);
  word-break: break-word;
}

.task-node-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: 0 var(--space-3) var(--space-3);
}

.task-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
}

.task-tag.agent {
  color: var(--accent);
}

.task-tag.phase {
  color: var(--status-ready);
}

.task-tag.checkpoint {
  color: var(--status-in-progress);
}

.task-tag.steps {
  color: var(--status-done-pending);
}

/* Status Colors */
.status-todo { background: var(--status-todo); }
.status-ready_for_agent { background: var(--status-ready); }
.status-assigned { background: var(--status-assigned); }
.status-in_progress { background: var(--status-in-progress); }
.status-done_pending_merge { background: var(--status-done-pending); }
.status-done { background: var(--status-done); }
.status-blocked { background: var(--status-blocked); }

/* Edges (SVG) */
.edge-canvas {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  overflow: visible;
}

.edge {
  stroke: var(--border-default);
  stroke-width: 1.5;
  fill: none;
}

.edge-arrow {
  fill: var(--border-default);
}

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
  margin-bottom: var(--space-2);
}

.details-id {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-tertiary);
}

.details-status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-1) var(--space-3);
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
}

.details-content {
  padding: var(--space-4);
}

/* Accordion Sections */
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

.accordion-content .loading {
  color: var(--text-tertiary);
  font-style: italic;
}

.accordion-content .error {
  color: var(--status-blocked);
}

/* Info Grid */
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
}

/* Criteria List */
.criteria-list {
  list-style: none;
  font-size: 13px;
}

.criteria-list li {
  position: relative;
  padding-left: var(--space-5);
  margin-bottom: var(--space-2);
  color: var(--text-secondary);
}

.criteria-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

/* Scrollbar Styling */
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

/* Error State */
.error-banner {
  padding: var(--space-4);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid var(--status-blocked);
  border-radius: var(--radius-md);
  margin: var(--space-4);
  color: var(--status-blocked);
  font-family: var(--font-mono);
  font-size: 13px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-4);
  color: var(--text-tertiary);
  text-align: center;
  padding: var(--space-8);
}

.empty-state svg {
  opacity: 0.3;
}
`;
}

function getScript(): string {
  return `
// =============================================================================
// Bloom View Client-Side JavaScript
// =============================================================================

let state = {
  graph: null,
  selectedTaskId: null,
  version: 0,
  promptCache: new Map(),
};

// =============================================================================
// Event Source for Live Updates
// =============================================================================

let eventSource = null;

function connectSSE() {
  eventSource = new EventSource('/api/events');

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.version !== state.version) {
      loadGraph();
    }
  };

  eventSource.onerror = () => {
    document.getElementById('connection-status').classList.add('disconnected');
    document.querySelector('#connection-status .label').textContent = 'Reconnecting...';

    // Reconnect after delay
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
// API Functions
// =============================================================================

async function loadGraph() {
  try {
    const res = await fetch('/api/tasks');
    const data = await res.json();

    if (data.error) {
      showError(data.error);
      return;
    }

    state.graph = data.graph;
    state.version = data.version;
    state.promptCache.clear();

    renderGraph();
    renderStats();

    // Re-select if still exists
    if (state.selectedTaskId) {
      const node = state.graph.nodes.find(n => n.id === state.selectedTaskId);
      if (node) {
        selectTask(node);
      } else {
        clearSelection();
      }
    }
  } catch (err) {
    showError('Failed to load tasks: ' + err.message);
  }
}

async function loadPrompts(taskId) {
  if (state.promptCache.has(taskId)) {
    return state.promptCache.get(taskId);
  }

  try {
    const res = await fetch('/api/task/' + encodeURIComponent(taskId) + '/prompt');
    const data = await res.json();

    if (data.error) {
      return { error: data.error };
    }

    state.promptCache.set(taskId, data);
    return data;
  } catch (err) {
    return { error: err.message };
  }
}

async function refresh() {
  const btn = document.querySelector('.btn-refresh');
  btn.disabled = true;

  try {
    await fetch('/api/refresh', { method: 'POST' });
    await loadGraph();
  } finally {
    btn.disabled = false;
  }
}

// =============================================================================
// Rendering
// =============================================================================

function renderStats() {
  const stats = state.graph?.stats;
  if (!stats) return;

  const statusLabels = {
    todo: 'To Do',
    ready_for_agent: 'Ready',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    done_pending_merge: 'Pending Merge',
    done: 'Done',
    blocked: 'Blocked',
  };

  const html = Object.entries(stats.byStatus)
    .filter(([_, count]) => count > 0)
    .map(([status, count]) => \`
      <div class="stat">
        <span class="stat-dot status-\${status}"></span>
        <span class="stat-value">\${count}</span>
        <span>\${statusLabels[status] || status}</span>
      </div>
    \`).join('');

  document.getElementById('stats').innerHTML = html;
}

function renderGraph() {
  const container = document.getElementById('graph-canvas');
  if (!state.graph || state.graph.nodes.length === 0) {
    container.innerHTML = \`
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M9 9h6M9 13h6M9 17h4"/>
        </svg>
        <p>No tasks found</p>
        <p style="font-size: 13px;">Run <code>bloom generate</code> to create tasks from a plan.</p>
      </div>
    \`;
    return;
  }

  // Compute layout
  const layers = computeLayers(state.graph);
  const positions = computePositions(state.graph, layers);

  // Determine canvas size
  const maxX = Math.max(...Object.values(positions).map(p => p.x)) + 250;
  const maxY = Math.max(...Object.values(positions).map(p => p.y)) + 100;
  container.style.minWidth = maxX + 'px';
  container.style.minHeight = maxY + 'px';

  // Render edges first (as SVG)
  const edgesSvg = renderEdges(state.graph, positions);

  // Render nodes
  const nodesHtml = state.graph.nodes.map(node => {
    const pos = positions[node.id];
    if (!pos) return '';

    const isSelected = node.id === state.selectedTaskId;
    const tags = [];
    if (node.agent) tags.push(\`<span class="task-tag agent">\${node.agent}</span>\`);
    if (node.phase) tags.push(\`<span class="task-tag phase">P\${node.phase}</span>\`);
    if (node.checkpoint) tags.push(\`<span class="task-tag checkpoint">checkpoint</span>\`);
    if (node.hasSteps) {
      const doneSteps = node.steps.filter(s => s.status === 'done').length;
      tags.push(\`<span class="task-tag steps">\${doneSteps}/\${node.steps.length} steps</span>\`);
    }

    return \`
      <div class="task-node\${isSelected ? ' selected' : ''}"
           data-id="\${node.id}"
           style="left: \${pos.x}px; top: \${pos.y}px;"
           onclick="onNodeClick('\${node.id}')">
        <div class="task-node-header">
          <div class="task-status-indicator status-\${node.status}"></div>
          <div class="task-title">\${escapeHtml(node.title)}</div>
        </div>
        \${tags.length > 0 ? \`<div class="task-node-meta">\${tags.join('')}</div>\` : ''}
      </div>
    \`;
  }).join('');

  container.innerHTML = edgesSvg + nodesHtml;
}

function computeLayers(graph) {
  const layers = new Map();
  const inDegree = new Map();
  const adjacency = new Map();

  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    const neighbors = adjacency.get(edge.from) || [];
    neighbors.push(edge.to);
    adjacency.set(edge.from, neighbors);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  let currentLayer = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      currentLayer.push(id);
      layers.set(id, 0);
    }
  }

  let layerNum = 1;
  while (currentLayer.length > 0) {
    const nextLayer = [];
    for (const id of currentLayer) {
      const neighbors = adjacency.get(id) || [];
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          nextLayer.push(neighbor);
          layers.set(neighbor, layerNum);
        }
      }
    }
    currentLayer = nextLayer;
    layerNum++;
  }

  return layers;
}

function computePositions(graph, layers) {
  const positions = {};
  const layerGap = 240;
  const nodeGap = 80;
  const startX = 40;
  const startY = 40;

  // Group nodes by layer
  const layerGroups = new Map();
  for (const node of graph.nodes) {
    const layer = layers.get(node.id) ?? 0;
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer).push(node);
  }

  // Sort layers and position nodes
  const sortedLayers = [...layerGroups.keys()].sort((a, b) => a - b);

  for (const layer of sortedLayers) {
    const nodes = layerGroups.get(layer);
    // Sort by phase, then by agent, then by id
    nodes.sort((a, b) => {
      if (a.phase !== b.phase) return (a.phase || 999) - (b.phase || 999);
      if (a.agent !== b.agent) return (a.agent || '').localeCompare(b.agent || '');
      return a.id.localeCompare(b.id);
    });

    for (let i = 0; i < nodes.length; i++) {
      positions[nodes[i].id] = {
        x: startX + layer * layerGap,
        y: startY + i * nodeGap,
      };
    }
  }

  return positions;
}

function renderEdges(graph, positions) {
  const maxX = Math.max(...Object.values(positions).map(p => p.x)) + 250;
  const maxY = Math.max(...Object.values(positions).map(p => p.y)) + 100;

  const nodeWidth = 200;
  const nodeHeight = 60; // Approximate

  const paths = graph.edges.map(edge => {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) return '';

    // Connect from right side of source to left side of target
    const x1 = from.x + nodeWidth;
    const y1 = from.y + nodeHeight / 2;
    const x2 = to.x;
    const y2 = to.y + nodeHeight / 2;

    // Bezier control points for smooth curves
    const dx = (x2 - x1) / 2;
    const path = \`M \${x1} \${y1} C \${x1 + dx} \${y1}, \${x2 - dx} \${y2}, \${x2} \${y2}\`;

    // Arrowhead
    const arrowSize = 6;
    const arrow = \`M \${x2 - arrowSize} \${y2 - arrowSize} L \${x2} \${y2} L \${x2 - arrowSize} \${y2 + arrowSize}\`;

    return \`
      <path class="edge" d="\${path}"/>
      <path class="edge-arrow" d="\${arrow}" stroke="var(--border-default)" stroke-width="1.5" fill="none"/>
    \`;
  }).join('');

  return \`<svg class="edge-canvas" width="\${maxX}" height="\${maxY}">\${paths}</svg>\`;
}

// =============================================================================
// Selection & Details
// =============================================================================

function onNodeClick(taskId) {
  const node = state.graph.nodes.find(n => n.id === taskId);
  if (node) {
    selectTask(node);
  }
}

function selectTask(node) {
  state.selectedTaskId = node.id;

  // Update node selection visuals
  document.querySelectorAll('.task-node').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === node.id);
  });

  // Render details panel
  renderDetails(node);
}

function clearSelection() {
  state.selectedTaskId = null;
  document.querySelectorAll('.task-node').forEach(el => {
    el.classList.remove('selected');
  });
  document.getElementById('details-panel').innerHTML = \`
    <div class="details-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M9 9h6M9 13h6M9 17h4"/>
      </svg>
      <p>Select a task to view details</p>
    </div>
  \`;
}

async function renderDetails(node) {
  const panel = document.getElementById('details-panel');

  const statusLabels = {
    todo: 'To Do',
    ready_for_agent: 'Ready for Agent',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    done_pending_merge: 'Done (Pending Merge)',
    done: 'Done',
    blocked: 'Blocked',
  };

  const infoRows = [];
  if (node.agent) infoRows.push(['Agent', node.agent]);
  if (node.repo) infoRows.push(['Repository', node.repo]);
  if (node.branch) infoRows.push(['Branch', node.branch]);
  if (node.baseBranch) infoRows.push(['Base Branch', node.baseBranch]);
  if (node.mergeInto) infoRows.push(['Merge Into', node.mergeInto]);
  if (node.phase) infoRows.push(['Phase', node.phase]);
  if (node.dependsOn.length) infoRows.push(['Dependencies', node.dependsOn.join(', ')]);

  const infoGrid = infoRows.length > 0 ? \`
    <div class="info-grid">
      \${infoRows.map(([label, value]) => \`
        <span class="info-label">\${label}</span>
        <span class="info-value">\${escapeHtml(String(value))}</span>
      \`).join('')}
    </div>
  \` : '';

  const criteria = node.acceptanceCriteria.length > 0 ? \`
    <ul class="criteria-list">
      \${node.acceptanceCriteria.map(c => \`<li>\${escapeHtml(c)}</li>\`).join('')}
    </ul>
  \` : '<span style="color: var(--text-tertiary)">None specified</span>';

  panel.innerHTML = \`
    <div class="details-header">
      <div class="details-title">\${escapeHtml(node.title)}</div>
      <div class="details-id">\${node.id}</div>
      <div class="details-status">
        <span class="stat-dot status-\${node.status}"></span>
        \${statusLabels[node.status] || node.status}
      </div>
    </div>
    <div class="details-content">
      <div class="accordion open" id="acc-summary">
        <button class="accordion-trigger" onclick="toggleAccordion('acc-summary')">
          <span>Summary</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <div class="accordion-content">
          \${infoGrid || '<span style="color: var(--text-tertiary)">No additional info</span>'}
        </div>
      </div>

      <div class="accordion\${node.instructions ? ' open' : ''}" id="acc-instructions">
        <button class="accordion-trigger" onclick="toggleAccordion('acc-instructions')">
          <span>Instructions</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <div class="accordion-content">
          <pre>\${node.instructions ? escapeHtml(node.instructions) : '<span style="color: var(--text-tertiary)">No instructions</span>'}</pre>
        </div>
      </div>

      <div class="accordion" id="acc-criteria">
        <button class="accordion-trigger" onclick="toggleAccordion('acc-criteria')">
          <span>Acceptance Criteria</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <div class="accordion-content">
          \${criteria}
        </div>
      </div>

      \${node.hasSteps ? \`
        <div class="accordion open" id="acc-steps">
          <button class="accordion-trigger" onclick="toggleAccordion('acc-steps')">
            <span>Steps (\${node.steps.length})</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          <div class="accordion-content">
            \${renderSteps(node.steps)}
          </div>
        </div>
      \` : ''}

      <div class="accordion" id="acc-working-dir">
        <button class="accordion-trigger" onclick="toggleAccordion('acc-working-dir'); loadPromptSection('\${node.id}', 'pwd')">
          <span>Working Directory</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <div class="accordion-content" id="prompt-pwd-\${node.id}">
          <span class="loading">Click to load...</span>
        </div>
      </div>

      <div class="accordion" id="acc-system-prompt">
        <button class="accordion-trigger" onclick="toggleAccordion('acc-system-prompt'); loadPromptSection('\${node.id}', 'system')">
          <span>System Prompt</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <div class="accordion-content" id="prompt-system-\${node.id}">
          <span class="loading">Click to load...</span>
        </div>
      </div>

      <div class="accordion" id="acc-user-prompt">
        <button class="accordion-trigger" onclick="toggleAccordion('acc-user-prompt'); loadPromptSection('\${node.id}', 'user')">
          <span>User Prompt</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <div class="accordion-content" id="prompt-user-\${node.id}">
          <span class="loading">Click to load...</span>
        </div>
      </div>

      \${node.aiNotes.length > 0 ? \`
        <div class="accordion" id="acc-notes">
          <button class="accordion-trigger" onclick="toggleAccordion('acc-notes')">
            <span>AI Notes</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          <div class="accordion-content">
            <ul class="criteria-list">
              \${node.aiNotes.map(n => \`<li>\${escapeHtml(n)}</li>\`).join('')}
            </ul>
          </div>
        </div>
      \` : ''}
    </div>
  \`;
}

function toggleAccordion(id) {
  const acc = document.getElementById(id);
  if (acc) {
    acc.classList.toggle('open');
  }
}

async function loadPromptSection(taskId, type) {
  const container = document.getElementById(\`prompt-\${type}-\${taskId}\`);
  if (!container || container.dataset.loaded === 'true') return;

  container.innerHTML = '<span class="loading">Loading...</span>';

  const prompts = await loadPrompts(taskId);

  if (prompts.error) {
    container.innerHTML = \`<span class="error">Error: \${escapeHtml(prompts.error)}</span>\`;
  } else {
    let content;
    if (type === 'system') {
      content = prompts.systemPrompt;
    } else if (type === 'user') {
      content = prompts.userPrompt;
    } else if (type === 'pwd') {
      content = prompts.workingDirectory || 'Unknown';
    }
    container.innerHTML = \`<pre>\${escapeHtml(content)}</pre>\`;
    container.dataset.loaded = 'true';
  }
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

function showError(message) {
  const container = document.getElementById('graph-canvas');
  container.innerHTML = \`
    <div class="error-banner">
      <strong>Error:</strong> \${escapeHtml(message)}
    </div>
  \`;
}

function renderSteps(steps) {
  if (!steps || steps.length === 0) return '<span style="color: var(--text-tertiary)">No steps</span>';

  const stepStatusIcon = (status) => {
    switch (status) {
      case 'done': return '<span style="color: var(--status-done)">✓</span>';
      case 'in_progress': return '<span style="color: var(--status-in-progress)">▶</span>';
      default: return '<span style="color: var(--text-tertiary)">○</span>';
    }
  };

  return \`
    <div class="steps-list">
      \${steps.map((step, i) => \`
        <div class="step-item" style="margin-bottom: var(--space-3); padding: var(--space-2); background: var(--bg-elevated); border-radius: var(--radius-sm);">
          <div style="display: flex; align-items: flex-start; gap: var(--space-2);">
            <span style="flex-shrink: 0;">\${stepStatusIcon(step.status)}</span>
            <div style="flex: 1;">
              <div style="font-size: 12px; color: var(--text-tertiary); font-family: var(--font-mono);">Step \${i + 1}: \${step.id}</div>
              <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">\${escapeHtml(step.instruction)}</div>
              \${step.acceptanceCriteria && step.acceptanceCriteria.length > 0 ? \`
                <ul style="margin: var(--space-2) 0 0 var(--space-4); font-size: 12px; color: var(--text-tertiary);">
                  \${step.acceptanceCriteria.map(c => \`<li>\${escapeHtml(c)}</li>\`).join('')}
                </ul>
              \` : ''}
            </div>
          </div>
        </div>
      \`).join('')}
    </div>
  \`;
}

// =============================================================================
// Initialize
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  loadGraph();
  connectSSE();
});
`;
}
