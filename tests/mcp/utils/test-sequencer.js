/**
 * Custom Jest Test Sequencer for MCP Tests
 * Optimizes test execution order for better performance and reliability
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Sequencer = require('@jest/test-sequencer').default;

export default class McpTestSequencer extends Sequencer {
  /**
   * Sort tests to optimize execution order
   */
  sort(tests) {
    // Define test priority order (higher priority runs first)
    const testPriorities = new Map([
      // Fast unit tests first
      ['unit/mcp-config-manager.test.js', 100],

      // Setup and fixture tests
      ['setup/test-setup.test.js', 90],
      ['mocks/claude-cli-mock.test.js', 85],
      ['fixtures/config-samples.test.js', 80],

      // Integration tests (dependent on mocks being stable)
      ['integration/claude-cli-integration.test.js', 70],

      // Security tests (isolated, can run in parallel)
      ['security/security-vulnerabilities.test.js', 60],

      // Error scenarios (may create temporary files)
      ['error-scenarios/error-recovery.test.js', 50],

      // Performance tests last (resource intensive)
      ['performance/performance-benchmarks.test.js', 10]
    ]);

    // Sort by priority, then by file path for consistency
    return tests.sort((testA, testB) => {
      const pathA = this.getTestPath(testA.path);
      const pathB = this.getTestPath(testB.path);

      const priorityA = this.getTestPriority(pathA, testPriorities);
      const priorityB = this.getTestPriority(pathB, testPriorities);

      // Sort by priority first (higher priority first)
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }

      // Then by path for consistent ordering
      return pathA.localeCompare(pathB);
    });
  }

  /**
   * Extract relative test path from full path
   */
  getTestPath(fullPath) {
    const mcpTestsIndex = fullPath.indexOf('tests/mcp/');
    if (mcpTestsIndex !== -1) {
      return fullPath.substring(mcpTestsIndex + 'tests/mcp/'.length);
    }
    return fullPath;
  }

  /**
   * Get priority for a test path
   */
  getTestPriority(testPath, priorities) {
    // Check for exact match
    if (priorities.has(testPath)) {
      return priorities.get(testPath);
    }

    // Check for partial matches
    for (const [pattern, priority] of priorities.entries()) {
      if (testPath.includes(pattern)) {
        return priority;
      }
    }

    // Default priority for unknown tests
    return 50;
  }

  /**
   * Determine if tests should run in parallel or sequential
   */
  shard(tests, { shardIndex, shardCount }) {
    // For MCP tests, we want to ensure certain tests run in specific order
    const sortedTests = this.sort(tests);

    // Split tests into shards while maintaining some ordering
    const testsPerShard = Math.ceil(sortedTests.length / shardCount);
    const startIndex = shardIndex * testsPerShard;
    const endIndex = Math.min(startIndex + testsPerShard, sortedTests.length);

    return sortedTests.slice(startIndex, endIndex);
  }
}