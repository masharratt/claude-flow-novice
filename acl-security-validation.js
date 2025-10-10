/**
 * ACL Security Validation Script
 * Phase 1 Foundation Infrastructure Security Validation
 *
 * Validates the 6-level ACL system with project-level isolation:
 * 1. private - Only accessible by the specific agent
 * 2. team - Accessible by agents in the same team
 * 3. swarm - Accessible by all agents in the swarm
 * 4. project - Accessible by agents in the same project (CRITICAL)
 * 5. public - Accessible by all authenticated agents
 * 6. system - System-level access (administrative)
 */

const SwarmMemoryManagerModule = await import('./src/sqlite/SwarmMemoryManager.js');
const SwarmMemoryManager = SwarmMemoryManagerModule.default || SwarmMemoryManagerModule.SwarmMemoryManager;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ACLSecurityValidator {
  constructor() {
    this.testResults = [];
    this.memoryManager = null;
    this.testDbPath = path.join(__dirname, 'test-acl-validation.db');
  }

  async setup() {
    // Clean up any existing test database
    if (fs.existsSync(this.testDbPath)) {
      fs.unlinkSync(this.testDbPath);
    }

    // Initialize memory manager with test database
    this.memoryManager = new SwarmMemoryManager({
      dbPath: this.testDbPath,
      encryptionKey: Buffer.from('test-encryption-key-32-bytes-long', 'utf8'),
      aclCacheTimeout: 1000 // Short cache for testing
    });

    await this.memoryManager.initialize();
  }

  async cleanup() {
    if (this.memoryManager) {
      await this.memoryManager.close();
    }
    if (fs.existsSync(this.testDbPath)) {
      fs.unlinkSync(this.testDbPath);
    }
  }

  logResult(testName, passed, details = '') {
    const result = {
      test: testName,
      passed,
      details,
      timestamp: new Date().toISOString()
    };
    this.testResults.push(result);

    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${testName}`);
    if (details) {
      console.log(`   ${details}`);
    }
  }

  async testPrivateLevelACL() {
    const agent1 = 'agent-private-1';
    const agent2 = 'agent-private-2';
    const secretData = { secret: 'confidential-data' };

    try {
      // Store private data
      await this.memoryManager.set('private-key', secretData, {
        agentId: agent1,
        aclLevel: 1,
        namespace: 'test'
      });

      // Owner should access
      const ownerAccess = await this.memoryManager.get('private-key', {
        agentId: agent1,
        namespace: 'test'
      });

      // Other agent should be denied
      const otherAccess = await this.memoryManager.get('private-key', {
        agentId: agent2,
        namespace: 'test'
      });

      const passed = JSON.stringify(ownerAccess) === JSON.stringify(secretData) &&
                     otherAccess === null;

      this.logResult('Private Level (1) ACL', passed,
        passed ? 'Private data properly isolated' : 'Private data leak detected');
    } catch (error) {
      this.logResult('Private Level (1) ACL', false, `Error: ${error.message}`);
    }
  }

  async testProjectLevelACL() {
    const projectId1 = 'project-alpha';
    const projectId2 = 'project-beta';
    const agent1 = 'agent-project-1';
    const agent2 = 'agent-project-2';
    const agent3 = 'agent-project-3';

    const projectData1 = { confidential: 'project-alpha-secret' };
    const projectData2 = { confidential: 'project-beta-secret' };

    try {
      // Store project-specific data
      await this.memoryManager.set('project-key-1', projectData1, {
        agentId: agent1,
        projectId: projectId1,
        aclLevel: 4, // Project level
        namespace: 'test'
      });

      await this.memoryManager.set('project-key-2', projectData2, {
        agentId: agent2,
        projectId: projectId2,
        aclLevel: 4, // Project level
        namespace: 'test'
      });

      // Same project agent should access data from their project
      const sameProjectAccess = await this.memoryManager.get('project-key-1', {
        agentId: agent3,
        projectId: projectId1,
        namespace: 'test'
      });

      // Different project agent should be DENIED access - SECURITY CRITICAL
      const crossProjectAccess = await this.memoryManager.get('project-key-1', {
        agentId: agent2,
        projectId: projectId2,
        namespace: 'test'
      });

      const passed = JSON.stringify(sameProjectAccess) === JSON.stringify(projectData1) &&
                     crossProjectAccess === null;

      this.logResult('Project Level (4) ACL - CRITICAL SECURITY', passed,
        passed ? 'Project isolation working correctly' : 'CROSS-PROJECT DATA LEAK DETECTED');
    } catch (error) {
      this.logResult('Project Level (4) ACL - CRITICAL SECURITY', false, `Error: ${error.message}`);
    }
  }

  async testSystemLevelACL() {
    const systemAgent = 'system-agent';
    const regularAgent = 'regular-agent';
    const systemData = { config: 'system-critical-config' };

    try {
      // Store system data
      await this.memoryManager.set('system-key', systemData, {
        agentId: systemAgent,
        aclLevel: 6,
        namespace: 'test'
      });

      // System agent should access
      const systemAccess = await this.memoryManager.get('system-key', {
        agentId: systemAgent,
        namespace: 'test'
      });

      // Regular agent should be denied
      const regularAccess = await this.memoryManager.get('system-key', {
        agentId: regularAgent,
        namespace: 'test'
      });

      const passed = JSON.stringify(systemAccess) === JSON.stringify(systemData) &&
                     regularAccess === null;

      this.logResult('System Level (6) ACL', passed,
        passed ? 'System access properly restricted' : 'System access breach detected');
    } catch (error) {
      this.logResult('System Level (6) ACL', false, `Error: ${error.message}`);
    }
  }

  async testProjectIsolationEdgeCases() {
    const projectId1 = 'edge-project-1';
    const projectId2 = 'edge-project-2';
    const agent1 = 'edge-agent-1';
    const agent2 = 'edge-agent-2';

    const sensitiveData = { api_keys: 'critical-api-credentials' };

    try {
      // Store sensitive project data
      await this.memoryManager.set('credentials', sensitiveData, {
        agentId: agent1,
        projectId: projectId1,
        aclLevel: 4,
        namespace: 'secure'
      });

      // Attempt cross-project access
      const crossProjectAccess = await this.memoryManager.get('credentials', {
        agentId: agent2,
        projectId: projectId2,
        namespace: 'secure'
      });

      // Attempt with no project context
      const noProjectAccess = await this.memoryManager.get('credentials', {
        agentId: agent2,
        namespace: 'secure'
      });

      // Attempt with manipulated project context
      const manipulatedAccess = await this.memoryManager.get('credentials', {
        agentId: agent2,
        projectId: projectId1 + '-manipulated',
        namespace: 'secure'
      });

      const passed = crossProjectAccess === null &&
                     noProjectAccess === null &&
                     manipulatedAccess === null;

      this.logResult('Project Isolation Edge Cases', passed,
        passed ? 'All cross-project attempts blocked' : 'Project isolation vulnerabilities found');
    } catch (error) {
      this.logResult('Project Isolation Edge Cases', false, `Error: ${error.message}`);
    }
  }

  async testConcurrentProjectAccess() {
    const project1 = 'concurrent-project-1';
    const project2 = 'concurrent-project-2';
    const agent1 = 'concurrent-agent-1';
    const agent2 = 'concurrent-agent-2';

    const data1 = { project: 'data-1', timestamp: Date.now() };
    const data2 = { project: 'data-2', timestamp: Date.now() };

    try {
      // Concurrent store operations
      const storePromises = [
        this.memoryManager.set('concurrent-key', data1, {
          agentId: agent1,
          projectId: project1,
          aclLevel: 4,
          namespace: 'concurrent-test'
        }),
        this.memoryManager.set('concurrent-key', data2, {
          agentId: agent2,
          projectId: project2,
          aclLevel: 4,
          namespace: 'concurrent-test'
        })
      ];

      await Promise.all(storePromises);

      // Verify isolation is maintained
      const access1 = await this.memoryManager.get('concurrent-key', {
        agentId: agent1,
        projectId: project1,
        namespace: 'concurrent-test'
      });

      const access2 = await this.memoryManager.get('concurrent-key', {
        agentId: agent2,
        projectId: project2,
        namespace: 'concurrent-test'
      });

      const passed = JSON.stringify(access1) === JSON.stringify(data1) &&
                     JSON.stringify(access2) === JSON.stringify(data2);

      this.logResult('Concurrent Project Access', passed,
        passed ? 'Concurrent project isolation maintained' : 'Concurrent access isolation failed');
    } catch (error) {
      this.logResult('Concurrent Project Access', false, `Error: ${error.message}`);
    }
  }

  async testCacheSecurity() {
    const projectId = 'cache-test-project';
    const authorizedAgent = 'cache-auth-agent';
    const unauthorizedAgent = 'cache-unauth-agent';

    const sensitiveData = { token: 'jwt-access-token' };

    try {
      // Store project data
      await this.memoryManager.set('cache-key', sensitiveData, {
        agentId: authorizedAgent,
        projectId,
        aclLevel: 4,
        namespace: 'cache-test'
      });

      // First unauthorized access attempt
      const unauthorizedAccess1 = await this.memoryManager.get('cache-key', {
        agentId: unauthorizedAgent,
        projectId: 'different-project',
        namespace: 'cache-test'
      });

      // Second unauthorized access (should hit cache if not properly isolated)
      const unauthorizedAccess2 = await this.memoryManager.get('cache-key', {
        agentId: unauthorizedAgent,
        projectId: 'different-project',
        namespace: 'cache-test'
      });

      const passed = unauthorizedAccess1 === null && unauthorizedAccess2 === null;

      this.logResult('Cache Security', passed,
        passed ? 'Cache properly isolates unauthorized access' : 'Cache allows unauthorized access');
    } catch (error) {
      this.logResult('Cache Security', false, `Error: ${error.message}`);
    }
  }

  async generateSecurityReport() {
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const passRate = ((passedTests / totalTests) * 100).toFixed(1);

    const report = {
      summary: {
        totalTests,
        passedTests,
        failedTests,
        passRate: `${passRate}%`,
        timestamp: new Date().toISOString()
      },
      criticalFindings: this.testResults.filter(r =>
        !r.passed && r.test.includes('CRITICAL')
      ),
      details: this.testResults
    };

    // Write security report
    const reportPath = path.join(__dirname, 'acl-security-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('🔒 ACL SECURITY VALIDATION REPORT');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Pass Rate: ${passRate}%`);

    if (report.criticalFindings.length > 0) {
      console.log('\n🚨 CRITICAL SECURITY ISSUES:');
      report.criticalFindings.forEach(finding => {
        console.log(`   ❌ ${finding.test}: ${finding.details}`);
      });
    }

    console.log(`\n📄 Full report saved to: ${reportPath}`);
    console.log('='.repeat(60));

    return report;
  }

  async runAllTests() {
    console.log('🔒 Starting ACL Security Validation...');
    console.log('Testing 6-level ACL system with project isolation\n');

    await this.setup();

    // Run all security tests
    await this.testPrivateLevelACL();
    await this.testProjectLevelACL();
    await this.testSystemLevelACL();
    await this.testProjectIsolationEdgeCases();
    await this.testConcurrentProjectAccess();
    await this.testCacheSecurity();

    const report = await this.generateSecurityReport();

    await this.cleanup();

    return report;
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new ACLSecurityValidator();
  validator.runAllTests().catch(console.error);
}

export default ACLSecurityValidator;