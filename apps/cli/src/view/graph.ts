// =============================================================================
// Task Graph Builder - Converts tasks.yaml into a DAG structure
// =============================================================================

import type { Task, TaskStatus, TasksFile } from "../task-schema";

// =============================================================================
// Types
// =============================================================================

export interface TaskStepNode {
  id: string;
  instruction: string;
  status: "pending" | "in_progress" | "done";
  acceptanceCriteria: string[];
  startedAt?: string;
  completedAt?: string;
}

export interface TaskNode {
  id: string;
  title: string;
  status: TaskStatus;
  phase?: number;
  agent?: string;
  repo?: string;
  branch?: string;
  baseBranch?: string;
  mergeInto?: string;
  openPr?: boolean;
  instructions?: string;
  acceptanceCriteria: string[];
  aiNotes: string[];
  dependsOn: string[];
  checkpoint?: boolean;
  hasSubtasks: boolean;
  hasSteps: boolean;
  steps: TaskStepNode[];
  parentId?: string;
  depth: number; // Nesting depth for subtasks
}

export interface TaskEdge {
  from: string;
  to: string;
}

export interface TaskGraph {
  nodes: TaskNode[];
  edges: TaskEdge[];
  phases: number[]; // Unique phases in order
  agents: string[]; // Unique agents
  repos: string[]; // Unique repos
  stats: {
    total: number;
    byStatus: Record<TaskStatus, number>;
  };
}

// =============================================================================
// Graph Building
// =============================================================================

function flattenTasks(tasks: Task[], parentId?: string, depth = 0): TaskNode[] {
  const nodes: TaskNode[] = [];

  for (const task of tasks) {
    // Convert steps to TaskStepNode format
    const steps: TaskStepNode[] = (task.steps || []).map((step) => ({
      id: step.id,
      instruction: step.instruction,
      status: step.status,
      acceptanceCriteria: step.acceptance_criteria,
      startedAt: step.started_at,
      completedAt: step.completed_at,
    }));

    nodes.push({
      id: task.id,
      title: task.title,
      status: task.status,
      phase: task.phase,
      agent: task.agent_name,
      repo: task.repo,
      branch: task.branch,
      baseBranch: task.base_branch,
      mergeInto: task.merge_into,
      openPr: task.open_pr,
      instructions: task.instructions,
      acceptanceCriteria: task.acceptance_criteria,
      aiNotes: task.ai_notes,
      dependsOn: task.depends_on,
      checkpoint: task.checkpoint,
      hasSubtasks: task.subtasks.length > 0,
      hasSteps: steps.length > 0,
      steps,
      parentId,
      depth,
    });

    // Recursively add subtasks
    if (task.subtasks.length > 0) {
      nodes.push(...flattenTasks(task.subtasks, task.id, depth + 1));
    }
  }

  return nodes;
}

function buildEdges(nodes: TaskNode[]): TaskEdge[] {
  const edges: TaskEdge[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const node of nodes) {
    for (const depId of node.dependsOn) {
      // Only add edge if both nodes exist
      if (nodeIds.has(depId)) {
        edges.push({ from: depId, to: node.id });
      }
    }
  }

  return edges;
}

function computeStats(nodes: TaskNode[]): TaskGraph["stats"] {
  const byStatus: Record<TaskStatus, number> = {
    todo: 0,
    ready_for_agent: 0,
    assigned: 0,
    in_progress: 0,
    done_pending_merge: 0,
    done: 0,
    blocked: 0,
  };

  for (const node of nodes) {
    byStatus[node.status]++;
  }

  return {
    total: nodes.length,
    byStatus,
  };
}

export function buildTaskGraph(tasksFile: TasksFile, _filePath: string): TaskGraph {
  const nodes = flattenTasks(tasksFile.tasks);
  const edges = buildEdges(nodes);

  // Collect unique values
  const phases = [...new Set(nodes.map((n) => n.phase).filter((p): p is number => p !== undefined))].sort(
    (a, b) => a - b
  );
  const agents = [...new Set(nodes.map((n) => n.agent).filter((a): a is string => !!a))].sort();
  const repos = [...new Set(nodes.map((n) => n.repo).filter((r): r is string => !!r))].sort();

  return {
    nodes,
    edges,
    phases,
    agents,
    repos,
    stats: computeStats(nodes),
  };
}

// =============================================================================
// Graph Layout Computation
// =============================================================================

/**
 * Compute topological layers for DAG visualization.
 * Returns a map of taskId -> layer (column) number.
 */
export function computeLayers(graph: TaskGraph): Map<string, number> {
  const layers = new Map<string, number>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  // Build adjacency and in-degree
  for (const edge of graph.edges) {
    const neighbors = adjacency.get(edge.from) || [];
    neighbors.push(edge.to);
    adjacency.set(edge.from, neighbors);

    const deg = inDegree.get(edge.to) || 0;
    inDegree.set(edge.to, deg + 1);
  }

  // BFS for layer assignment
  let currentLayer: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      currentLayer.push(id);
      layers.set(id, 0);
    }
  }

  let layerNum = 1;
  while (currentLayer.length > 0) {
    const nextLayer: string[] = [];

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
