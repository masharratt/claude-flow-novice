/**
 * Dependency Graph System for Cross-Functional Task Resolution
 *
 * Phase 2 Auto-Scaling & Resource Management
 * Supports up to 10,000 nodes with <10ms resolution time
 */

/**
 * Dependency Node - represents a task or resource in the dependency graph
 */
class DependencyNode {
  constructor(id, data = {}) {
    this.id = id;
    this.data = {
      type: 'task',
      priority: 0,
      estimatedDuration: 0,
      requiredResources: [],
      ...data
    };
    this.dependencies = new Set(); // Nodes this node depends on
    this.dependents = new Set(); // Nodes that depend on this node
    this.state = 'pending'; // pending, ready, in-progress, completed, failed
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  addDependency(nodeId) {
    if (!this.dependencies.has(nodeId)) {
      this.dependencies.add(nodeId);
      this.updatedAt = Date.now();
    }
  }

  removeDependency(nodeId) {
    if (this.dependencies.has(nodeId)) {
      this.dependencies.delete(nodeId);
      this.updatedAt = Date.now();
    }
  }

  addDependent(nodeId) {
    if (!this.dependents.has(nodeId)) {
      this.dependents.add(nodeId);
      this.updatedAt = Date.now();
    }
  }

  removeDependent(nodeId) {
    if (this.dependents.has(nodeId)) {
      this.dependents.delete(nodeId);
      this.updatedAt = Date.now();
    }
  }

  isReady() {
    return this.state === 'pending' && this.dependencies.size === 0;
  }

  canExecute() {
    return this.dependencies.size === 0 && this.state !== 'completed';
  }

  updateState(newState) {
    this.state = newState;
    this.updatedAt = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      data: this.data,
      dependencies: Array.from(this.dependencies),
      dependents: Array.from(this.dependents),
      state: this.state,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Dependency Graph - manages the complete dependency structure
 */
class DependencyGraph {
  constructor() {
    this.nodes = new Map();
    this.adjacencyList = new Map(); // For fast lookups
    this.reverseAdjacencyList = new Map(); // For reverse lookups
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  addNode(node) {
    if (!(node instanceof DependencyNode)) {
      node = new DependencyNode(node.id, node.data);
    }

    this.nodes.set(node.id, node);
    this.adjacencyList.set(node.id, new Set());
    this.reverseAdjacencyList.set(node.id, new Set());
    this.updatedAt = Date.now();

    return node;
  }

  removeNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    // Remove all dependencies
    for (const depId of node.dependencies) {
      this.removeDependency(nodeId, depId);
    }

    // Remove all dependents
    for (const dependentId of node.dependents) {
      this.removeDependency(dependentId, nodeId);
    }

    this.nodes.delete(nodeId);
    this.adjacencyList.delete(nodeId);
    this.reverseAdjacencyList.delete(nodeId);
    this.updatedAt = Date.now();

    return true;
  }

  addDependency(fromId, toId) {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);

    if (!fromNode || !toNode) {
      throw new Error(`Cannot add dependency: node(s) not found (${fromId} -> ${toId})`);
    }

    // Check for cycles
    if (this.wouldCreateCycle(fromId, toId)) {
      throw new Error(`Cannot add dependency: would create cycle (${fromId} -> ${toId})`);
    }

    fromNode.addDependency(toId);
    toNode.addDependent(fromId);

    this.adjacencyList.get(fromId).add(toId);
    this.reverseAdjacencyList.get(toId).add(fromId);
    this.updatedAt = Date.now();

    return true;
  }

  removeDependency(fromId, toId) {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);

    if (!fromNode || !toNode) return false;

    fromNode.removeDependency(toId);
    toNode.removeDependent(fromId);

    this.adjacencyList.get(fromId).delete(toId);
    this.reverseAdjacencyList.get(toId).delete(fromId);
    this.updatedAt = Date.now();

    return true;
  }

  getNode(nodeId) {
    return this.nodes.get(nodeId);
  }

  getDependencies(nodeId) {
    const node = this.nodes.get(nodeId);
    return node ? Array.from(node.dependencies) : [];
  }

  getDependents(nodeId) {
    const node = this.nodes.get(nodeId);
    return node ? Array.from(node.dependents) : [];
  }

  getReadyNodes() {
    return Array.from(this.nodes.values()).filter(node => node.isReady());
  }

  getNodesByState(state) {
    return Array.from(this.nodes.values()).filter(node => node.state === state);
  }

  wouldCreateCycle(fromId, toId) {
    const visited = new Set();
    const recursionStack = new Set();

    const hasCycle = (nodeId) => {
      if (recursionStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const dependencies = this.adjacencyList.get(nodeId) || new Set();
      for (const depId of dependencies) {
        if (hasCycle(depId)) return true;
      }

      recursionStack.delete(nodeId);
      return false;
    };

    // Temporarily add the edge and check for cycles
    this.adjacencyList.get(fromId).add(toId);
    const hasCycleResult = hasCycle(fromId);
    this.adjacencyList.get(fromId).delete(toId);

    return hasCycleResult;
  }

  getStats() {
    const nodesByState = {};
    for (const node of this.nodes.values()) {
      nodesByState[node.state] = (nodesByState[node.state] || 0) + 1;
    }

    return {
      totalNodes: this.nodes.size,
      totalEdges: Array.from(this.adjacencyList.values())
        .reduce((sum, deps) => sum + deps.size, 0),
      nodesByState,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()).map(node => node.toJSON()),
      stats: this.getStats(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  static fromJSON(json) {
    const graph = new DependencyGraph();

    for (const nodeData of json.nodes) {
      const node = new DependencyNode(nodeData.id, nodeData.data);
      node.state = nodeData.state;
      node.createdAt = nodeData.createdAt;
      node.updatedAt = nodeData.updatedAt;
      graph.addNode(node);
    }

    // Rebuild dependencies
    for (const nodeData of json.nodes) {
      for (const depId of nodeData.dependencies) {
        graph.addDependency(nodeData.id, depId);
      }
    }

    return graph;
  }
}

/**
 * Tarjan's Algorithm Implementation for Cycle Detection
 */
class TarjanCycleDetector {
  constructor(graph) {
    this.graph = graph;
    this.index = 0;
    this.stack = [];
    this.indexMap = new Map();
    this.lowLinkMap = new Map();
    this.onStack = new Set();
    this.sccs = []; // Strongly Connected Components
  }

  detectCycles() {
    this.reset();

    for (const node of this.graph.nodes.values()) {
      if (!this.indexMap.has(node.id)) {
        this.strongConnect(node.id);
      }
    }

    // Any SCC with more than one node represents a cycle
    return this.sccs.filter(scc => scc.length > 1);
  }

  hasCycles() {
    return this.detectCycles().length > 0;
  }

  reset() {
    this.index = 0;
    this.stack = [];
    this.indexMap.clear();
    this.lowLinkMap.clear();
    this.onStack.clear();
    this.sccs = [];
  }

  strongConnect(nodeId) {
    this.indexMap.set(nodeId, this.index);
    this.lowLinkMap.set(nodeId, this.index);
    this.index++;
    this.stack.push(nodeId);
    this.onStack.add(nodeId);

    const node = this.graph.nodes.get(nodeId);
    for (const dependentId of node.dependents) {
      if (!this.indexMap.has(dependentId)) {
        this.strongConnect(dependentId);
        this.lowLinkMap.set(nodeId,
          Math.min(this.lowLinkMap.get(nodeId), this.lowLinkMap.get(dependentId)));
      } else if (this.onStack.has(dependentId)) {
        this.lowLinkMap.set(nodeId,
          Math.min(this.lowLinkMap.get(nodeId), this.indexMap.get(dependentId)));
      }
    }

    // If nodeId is a root node, pop the stack and generate an SCC
    if (this.lowLinkMap.get(nodeId) === this.indexMap.get(nodeId)) {
      const scc = [];
      let w;
      do {
        w = this.stack.pop();
        this.onStack.delete(w);
        scc.push(w);
      } while (w !== nodeId);

      if (scc.length > 0) {
        this.sccs.push(scc);
      }
    }
  }
}

/**
 * Topological Sorter for dependency resolution
 */
class TopologicalSorter {
  constructor(graph) {
    this.graph = graph;
  }

  sort() {
    const visited = new Set();
    const visiting = new Set();
    const result = [];

    const visit = (nodeId) => {
      if (visiting.has(nodeId)) {
        throw new Error(`Cycle detected involving node: ${nodeId}`);
      }

      if (visited.has(nodeId)) {
        return;
      }

      visiting.add(nodeId);

      const node = this.graph.nodes.get(nodeId);
      for (const depId of node.dependencies) {
        visit(depId);
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      result.push(nodeId);
    };

    for (const node of this.graph.nodes.values()) {
      if (!visited.has(node.id)) {
        visit(node.id);
      }
    }

    return result;
  }

  getExecutionLevels() {
    const levels = [];
    const visited = new Set();
    const nodeLevels = new Map();

    const getNodeLevel = (nodeId) => {
      if (nodeLevels.has(nodeId)) {
        return nodeLevels.get(nodeId);
      }

      const node = this.graph.nodes.get(nodeId);
      if (node.dependencies.size === 0) {
        nodeLevels.set(nodeId, 0);
        return 0;
      }

      let maxDepLevel = -1;
      for (const depId of node.dependencies) {
        const depLevel = getNodeLevel(depId);
        maxDepLevel = Math.max(maxDepLevel, depLevel);
      }

      const level = maxDepLevel + 1;
      nodeLevels.set(nodeId, level);
      return level;
    };

    // Group nodes by their execution level
    for (const node of this.graph.nodes.values()) {
      const level = getNodeLevel(node.id);
      if (!levels[level]) {
        levels[level] = [];
      }
      levels[level].push(node.id);
    }

    return levels;
  }
}

export {
  DependencyNode,
  DependencyGraph,
  TarjanCycleDetector,
  TopologicalSorter
};