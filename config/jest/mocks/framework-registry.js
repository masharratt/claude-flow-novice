/**
 * Mock Framework Registry for Jest Testing
 * Provides mock implementation for missing framework-registry module
 */

export class FrameworkRegistry {
  constructor(options = {}) {
    this.frameworks = new Map();
    this.initialized = false;
  }

  async initialize() {
    this.initialized = true;

    // Register some default frameworks for testing
    await this.registerFramework({
      id: 'tdd-basic',
      name: 'Test-Driven Development',
      type: 'TDD',
      truth_threshold: 0.85,
      test_coverage_requirement: 0.90,
      validation_rules: ['test_first', 'red_green_refactor'],
      quality_gates: ['unit_tests', 'integration_tests']
    });

    await this.registerFramework({
      id: 'bdd-basic',
      name: 'Behavior-Driven Development',
      type: 'BDD',
      truth_threshold: 0.80,
      scenario_coverage_requirement: 0.85,
      validation_rules: ['given_when_then', 'acceptance_criteria'],
      quality_gates: ['scenario_tests', 'stakeholder_review']
    });

    return true;
  }

  async close() {
    this.frameworks.clear();
    this.initialized = false;
    return true;
  }

  async registerFramework(framework) {
    if (!this.initialized) {
      throw new Error('FrameworkRegistry not initialized');
    }

    // Validate framework structure
    const required = ['id', 'name', 'type'];
    const missing = required.filter(field => !framework[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    this.frameworks.set(framework.id, {
      ...framework,
      registeredAt: new Date().toISOString(),
      version: framework.version || '1.0.0'
    });

    return true;
  }

  async getFramework(id) {
    if (!this.initialized) {
      throw new Error('FrameworkRegistry not initialized');
    }

    return this.frameworks.get(id);
  }

  async getAllFrameworks() {
    if (!this.initialized) {
      throw new Error('FrameworkRegistry not initialized');
    }

    return Array.from(this.frameworks.values());
  }

  async updateFramework(id, updates) {
    if (!this.initialized) {
      throw new Error('FrameworkRegistry not initialized');
    }

    const existing = this.frameworks.get(id);
    if (!existing) {
      throw new Error(`Framework with id '${id}' not found`);
    }

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.frameworks.set(id, updated);
    return updated;
  }

  async removeFramework(id) {
    if (!this.initialized) {
      throw new Error('FrameworkRegistry not initialized');
    }

    const removed = this.frameworks.delete(id);
    return removed;
  }

  async searchFrameworks(query) {
    if (!this.initialized) {
      throw new Error('FrameworkRegistry not initialized');
    }

    const frameworks = Array.from(this.frameworks.values());
    const lowerQuery = query.toLowerCase();

    return frameworks.filter(framework =>
      framework.name.toLowerCase().includes(lowerQuery) ||
      framework.type.toLowerCase().includes(lowerQuery) ||
      framework.id.toLowerCase().includes(lowerQuery)
    );
  }

  async getFrameworkStats() {
    if (!this.initialized) {
      throw new Error('FrameworkRegistry not initialized');
    }

    const frameworks = Array.from(this.frameworks.values());
    const types = {};

    frameworks.forEach(framework => {
      types[framework.type] = (types[framework.type] || 0) + 1;
    });

    return {
      totalFrameworks: frameworks.length,
      types: types,
      lastUpdated: new Date().toISOString()
    };
  }
}

export default FrameworkRegistry;