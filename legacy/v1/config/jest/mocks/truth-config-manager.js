/**
 * Mock Truth Config Manager for Jest Testing
 * Provides mock implementation for missing truth-config-manager module
 */

export class UserConfigurationManager {
  constructor(options = {}) {
    this.configPath = options.configPath || '/tmp/test-config';
    this.frameworks = new Map();
    this.initialized = false;
  }

  async initialize() {
    this.initialized = true;
    // Set up default frameworks for testing
    this.frameworks.set('tdd-basic', {
      id: 'tdd-basic',
      name: 'Test-Driven Development',
      type: 'TDD',
      truth_threshold: 0.85,
      test_coverage_requirement: 0.90,
      validation_rules: ['test_first', 'red_green_refactor'],
      quality_gates: ['unit_tests', 'integration_tests']
    });

    return true;
  }

  async shutdown() {
    this.frameworks.clear();
    this.initialized = false;
    return true;
  }

  async registerFramework(framework) {
    if (!this.initialized) {
      throw new Error('ConfigurationManager not initialized');
    }

    this.frameworks.set(framework.id, framework);
    return true;
  }

  async getFramework(id) {
    if (!this.initialized) {
      throw new Error('ConfigurationManager not initialized');
    }

    return this.frameworks.get(id);
  }

  async getAllFrameworks() {
    if (!this.initialized) {
      throw new Error('ConfigurationManager not initialized');
    }

    return Array.from(this.frameworks.values());
  }

  async validateConfiguration(config) {
    if (!this.initialized) {
      throw new Error('ConfigurationManager not initialized');
    }

    // Basic validation logic
    const required = ['id', 'name', 'type', 'truth_threshold'];
    const missing = required.filter(field => !config[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    return { valid: true, warnings: [] };
  }

  async saveConfiguration(config) {
    if (!this.initialized) {
      throw new Error('ConfigurationManager not initialized');
    }

    // Mock save operation
    return { success: true, path: this.configPath };
  }

  async loadConfiguration(path) {
    if (!this.initialized) {
      throw new Error('ConfigurationManager not initialized');
    }

    // Mock load operation
    return {
      frameworks: Array.from(this.frameworks.values()),
      settings: {
        default_threshold: 0.85,
        auto_validate: true
      }
    };
  }
}

export default UserConfigurationManager;