import type { EpicDoc, DAG } from './types.js';

function resolveDepId(depSlug: string, nodeIds: string[]): string {
  if (nodeIds.includes(depSlug)) return depSlug;
  const prefix = depSlug + '-';
  const match = nodeIds.find((id) => id.startsWith(prefix));
  return match ?? depSlug;
}

export function buildDAG(epic: EpicDoc): DAG {
  const nodes = epic.phases.map((p) => p.id);
  const edges = new Map<string, string[]>();
  for (const phase of epic.phases) {
    edges.set(phase.id, phase.dependencies.map((dep) => resolveDepId(dep, nodes)));
  }
  return { nodes, edges };
}

export function topologicalLevels(dag: DAG): string[][] {
  if (dag.nodes.length === 0) return [];

  const inDegree = new Map<string, number>();
  const reverseAdj = new Map<string, string[]>();

  for (const node of dag.nodes) {
    inDegree.set(node, 0);
    reverseAdj.set(node, []);
  }

  for (const node of dag.nodes) {
    const deps = dag.edges.get(node) ?? [];
    inDegree.set(node, deps.length);
    for (const dep of deps) {
      const existing = reverseAdj.get(dep) ?? [];
      existing.push(node);
      reverseAdj.set(dep, existing);
    }
  }

  const levels: string[][] = [];
  let current = dag.nodes.filter((n) => (inDegree.get(n) ?? 0) === 0);

  while (current.length > 0) {
    levels.push(current);
    const next: string[] = [];
    for (const node of current) {
      for (const dependent of reverseAdj.get(node) ?? []) {
        const deg = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, deg);
        if (deg === 0) next.push(dependent);
      }
    }
    current = next;
  }

  return levels;
}

export function detectCycles(dag: DAG): string[] {
  if (dag.nodes.length === 0) return [];

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const cycleNodes = new Set<string>();

  for (const node of dag.nodes) color.set(node, WHITE);

  function dfs(node: string): boolean {
    color.set(node, GRAY);
    for (const dep of dag.edges.get(node) ?? []) {
      if (color.get(dep) === GRAY) {
        cycleNodes.add(dep);
        cycleNodes.add(node);
        return true;
      }
      if (color.get(dep) === WHITE) {
        if (dfs(dep)) {
          cycleNodes.add(node);
          return true;
        }
      }
    }
    color.set(node, BLACK);
    return false;
  }

  for (const node of dag.nodes) {
    if (color.get(node) === WHITE) dfs(node);
  }

  return Array.from(cycleNodes);
}

export function criticalPath(dag: DAG): string[] {
  if (dag.nodes.length === 0) return [];

  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();

  for (const node of dag.nodes) {
    dist.set(node, 0);
    prev.set(node, null);
  }

  const levels = topologicalLevels(dag);
  const order = levels.flat();

  for (const node of order) {
    for (const dep of dag.edges.get(node) ?? []) {
      const candidate = (dist.get(dep) ?? 0) + 1;
      if (candidate > (dist.get(node) ?? 0)) {
        dist.set(node, candidate);
        prev.set(node, dep);
      }
    }
  }

  let endNode = dag.nodes[0];
  let maxDist = dist.get(endNode) ?? 0;
  for (const node of dag.nodes) {
    const d = dist.get(node) ?? 0;
    if (d > maxDist) {
      maxDist = d;
      endNode = node;
    }
  }

  const path: string[] = [];
  let cursor: string | null = endNode;
  while (cursor !== null) {
    path.unshift(cursor);
    cursor = prev.get(cursor) ?? null;
  }

  return path;
}
