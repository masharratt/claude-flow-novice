// Stub: agent loader (JavaScript)
// Created to satisfy test imports

export class AgentLoader {
  constructor(options = {}) {
    this.options = options;
    this.agents = new Map();
  }

  async load(agentName) {
    // Stub implementation
    return {
      name: agentName,
      type: 'stub',
      config: {},
    };
  }

  async loadAll() {
    // Stub implementation
    return Array.from(this.agents.values());
  }

  async reload(agentName) {
    return this.load(agentName);
  }
}

export function loadAgent(agentName) {
  const loader = new AgentLoader();
  return loader.load(agentName);
}
