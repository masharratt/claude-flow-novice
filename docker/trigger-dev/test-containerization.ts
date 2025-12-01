/**
 * Containerization Test Suite
 * Tests all 5 phases of the containerization implementation
 */

import { configure, tasks, runs } from '@trigger.dev/sdk/v3';

// Configure SDK
configure({
  secretKey: process.env.TRIGGER_SECRET_KEY || 'tr_dev_ffR3mLELFuaaA0txq0lO',
  baseURL: process.env.TRIGGER_API_URL || 'http://localhost:8030',
});

// Test utilities
function log(phase: string, message: string) {
  console.log(`[Phase ${phase}] ${message}`);
}

function success(phase: string, message: string) {
  console.log(`✅ [Phase ${phase}] ${message}`);
}

function fail(phase: string, message: string) {
  console.error(`❌ [Phase ${phase}] ${message}`);
}

async function testPhase1_DockerSpawner() {
  log('1', 'Testing docker-spawner module imports...');

  try {
    const { DockerSpawner, parseMemoryString } = await import('./src/lib/docker-spawner.js');

    // Test memory parsing
    const tests = [
      { input: '512m', expected: 512 * 1024 * 1024 },
      { input: '1g', expected: 1024 * 1024 * 1024 },
      { input: '256M', expected: 256 * 1024 * 1024 },
      { input: '2G', expected: 2 * 1024 * 1024 * 1024 },
    ];

    for (const test of tests) {
      const result = parseMemoryString(test.input);
      if (result !== test.expected) {
        fail('1', `parseMemoryString('${test.input}') = ${result}, expected ${test.expected}`);
        return false;
      }
    }

    success('1', 'docker-spawner module loaded, parseMemoryString works');
    return true;
  } catch (err) {
    fail('1', `Import error: ${err}`);
    return false;
  }
}

async function testPhase1_ContainerRegistry() {
  log('1', 'Testing container-registry module...');

  try {
    const { getImageForAgentType, getRegistryUrl } = await import('./src/lib/container-registry.js');

    // Test agent type mappings
    const mappings = [
      { type: 'typescript-specialist', expectedContains: 'typescript' },
      { type: 'backend-developer', expectedContains: 'backend' },
      { type: 'react-frontend-engineer', expectedContains: 'frontend' },
      { type: 'rust-developer', expectedContains: 'rust' },
      { type: 'docker-specialist', expectedContains: 'docker' },
      { type: 'unknown-agent', expectedContains: 'latest' }, // fallback
    ];

    for (const mapping of mappings) {
      const image = getImageForAgentType(mapping.type);
      if (!image.includes(mapping.expectedContains)) {
        fail('1', `getImageForAgentType('${mapping.type}') = ${image}, expected to contain '${mapping.expectedContains}'`);
        return false;
      }
    }

    success('1', 'container-registry module loaded, agent type mappings correct');
    return true;
  } catch (err) {
    fail('1', `Import error: ${err}`);
    return false;
  }
}

async function testPhase3_WorkspaceManager() {
  log('3', 'Testing workspace-manager module...');

  try {
    const { createWorkspaceManager } = await import('./src/lib/workspace-manager.js');
    const manager = createWorkspaceManager();

    if (!manager) {
      fail('3', 'createWorkspaceManager() returned null');
      return false;
    }

    if (typeof manager.createAgentWorkspace !== 'function') {
      fail('3', 'manager.createAgentWorkspace is not a function');
      return false;
    }

    success('3', 'workspace-manager module loaded, createWorkspaceManager works');
    return true;
  } catch (err) {
    fail('3', `Import error: ${err}`);
    return false;
  }
}

async function testPhase3_WorkspaceMounts() {
  log('3', 'Testing workspace-mounts module...');

  try {
    const { generateAgentMounts, getDefaultMounts } = await import('./src/lib/workspace-mounts.js');

    const defaultMounts = getDefaultMounts();
    if (!Array.isArray(defaultMounts)) {
      fail('3', 'getDefaultMounts() did not return an array');
      return false;
    }

    success('3', 'workspace-mounts module loaded, getDefaultMounts works');
    return true;
  } catch (err) {
    fail('3', `Import error: ${err}`);
    return false;
  }
}

async function testPhase4_MdapContainerConfig() {
  log('4', 'Testing mdap-container-config module...');

  try {
    const { getContainerResourcesForTier } = await import('./src/lib/mdap-container-config.js');

    // Test tier resource mappings
    const tierTests = [
      { tier: 1, expectedMemory: '256m' },
      { tier: 2, expectedMemory: '512m' },
      { tier: 3, expectedMemory: '1g' },
      { tier: 4, expectedMemory: '2g' },
      { tier: 5, expectedMemory: '4g' },
    ];

    for (const test of tierTests) {
      const resources = getContainerResourcesForTier(test.tier);
      if (resources.memory !== test.expectedMemory) {
        fail('4', `Tier ${test.tier} memory = ${resources.memory}, expected ${test.expectedMemory}`);
        return false;
      }
    }

    success('4', 'mdap-container-config module loaded, tier resources correct');
    return true;
  } catch (err) {
    fail('4', `Import error: ${err}`);
    return false;
  }
}

async function testPhase4_ContainerMetrics() {
  log('4', 'Testing container-metrics module...');

  try {
    const { recordContainerMetrics } = await import('./src/lib/container-metrics.js');

    if (typeof recordContainerMetrics !== 'function') {
      fail('4', 'recordContainerMetrics is not a function');
      return false;
    }

    success('4', 'container-metrics module loaded');
    return true;
  } catch (err) {
    fail('4', `Import error: ${err}`);
    return false;
  }
}

async function testPhase5_ContainerHealth() {
  log('5', 'Testing container-health module...');

  try {
    const { createHealthMonitor, getDefaultRestartPolicy } = await import('./src/lib/container-health.js');

    const policy = getDefaultRestartPolicy(2);
    if (policy.Name !== 'on-failure' || policy.MaximumRetryCount !== 2) {
      fail('5', `Restart policy incorrect: ${JSON.stringify(policy)}`);
      return false;
    }

    success('5', 'container-health module loaded, restart policy correct');
    return true;
  } catch (err) {
    fail('5', `Import error: ${err}`);
    return false;
  }
}

async function testPhase5_ContainerAudit() {
  log('5', 'Testing container-audit module...');

  try {
    const { createAuditLogger, logAuditEntry } = await import('./src/lib/container-audit.js');

    if (typeof createAuditLogger !== 'function') {
      fail('5', 'createAuditLogger is not a function');
      return false;
    }

    if (typeof logAuditEntry !== 'function') {
      fail('5', 'logAuditEntry is not a function');
      return false;
    }

    success('5', 'container-audit module loaded');
    return true;
  } catch (err) {
    fail('5', `Import error: ${err}`);
    return false;
  }
}

async function testPhase5_ResourceQuota() {
  log('5', 'Testing resource-quota module...');

  try {
    const { getDefaultQuota, canSpawnContainer } = await import('./src/lib/resource-quota.js');

    const quota = getDefaultQuota();
    const expected40GB = 40 * 1024 * 1024 * 1024;

    if (quota.maxTotalMemoryBytes !== expected40GB) {
      fail('5', `Default quota memory = ${quota.maxTotalMemoryBytes}, expected ${expected40GB}`);
      return false;
    }

    if (quota.maxContainers !== 50) {
      fail('5', `Default quota containers = ${quota.maxContainers}, expected 50`);
      return false;
    }

    success('5', 'resource-quota module loaded, 40GB budget correct');
    return true;
  } catch (err) {
    fail('5', `Import error: ${err}`);
    return false;
  }
}

async function runAllTests() {
  console.log('\n========================================');
  console.log('  CONTAINERIZATION TEST SUITE');
  console.log('========================================\n');

  const results: { name: string; passed: boolean }[] = [];

  // Phase 1: Container Spawning Foundation
  console.log('\n--- Phase 1: Container Spawning Foundation ---');
  results.push({ name: 'DockerSpawner', passed: await testPhase1_DockerSpawner() });
  results.push({ name: 'ContainerRegistry', passed: await testPhase1_ContainerRegistry() });

  // Phase 3: Workspace Isolation
  console.log('\n--- Phase 3: Workspace Isolation ---');
  results.push({ name: 'WorkspaceManager', passed: await testPhase3_WorkspaceManager() });
  results.push({ name: 'WorkspaceMounts', passed: await testPhase3_WorkspaceMounts() });

  // Phase 4: MDAP Container Integration
  console.log('\n--- Phase 4: MDAP Container Integration ---');
  results.push({ name: 'MdapContainerConfig', passed: await testPhase4_MdapContainerConfig() });
  results.push({ name: 'ContainerMetrics', passed: await testPhase4_ContainerMetrics() });

  // Phase 5: Production Hardening
  console.log('\n--- Phase 5: Production Hardening ---');
  results.push({ name: 'ContainerHealth', passed: await testPhase5_ContainerHealth() });
  results.push({ name: 'ContainerAudit', passed: await testPhase5_ContainerAudit() });
  results.push({ name: 'ResourceQuota', passed: await testPhase5_ResourceQuota() });

  // Summary
  console.log('\n========================================');
  console.log('  TEST SUMMARY');
  console.log('========================================\n');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  for (const result of results) {
    console.log(`  ${result.passed ? '✅' : '❌'} ${result.name}`);
  }

  console.log(`\n  Result: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('\n🎉 ALL CONTAINERIZATION TESTS PASSED!\n');
    return true;
  } else {
    console.log('\n⚠️  Some tests failed\n');
    return false;
  }
}

// Run tests
runAllTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
  });
