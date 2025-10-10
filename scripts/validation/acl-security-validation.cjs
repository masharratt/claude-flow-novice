/**
 * ACL Security Validation Script
 * Phase 1 Foundation Infrastructure Security Validation
 *
 * Validates the 6-level ACL system with project-level isolation
 */

const SwarmMemoryManager = require('./src/sqlite/SwarmMemoryManager.cjs');
const fs = require('fs');
const path = require('path');

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

  async testBasicACL() {
    const agent1 = 'agent-basic-1';
    const agent2 = 'agent-basic-2';
    const data = { test: 'basic-data' };

    try {
      // Store private data
      await this.memoryManager.set('basic-key', data, {
        agentId: agent1,
        aclLevel: 1,
        namespace: 'test'
      });

      // Owner should access
      const ownerAccess = await this.memoryManager.get('basic-key', {
        agentId: agent1,
        namespace: 'test'
      });

      // Other agent should be denied
      const otherAccess = await this.memoryManager.get('basic-key', {
        agentId: agent2,
        namespace: 'test'
      });

      const passed = JSON.stringify(ownerAccess) === JSON.stringify(data) &&
                     otherAccess === null;

      this.logResult('Basic Private ACL', passed,
        passed ? 'Private access working' : 'Private access failure');
    } catch (error) {
      this.logResult('Basic Private ACL', false, `Error: ${error.message}`);
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

    // Run security tests
    await this.testBasicACL();
    await this.testProjectLevelACL();

    const report = await this.generateSecurityReport();

    await this.cleanup();

    return report;
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new ACLSecurityValidator();
  validator.runAllTests().catch(console.error);
}

module.exports = ACLSecurityValidator;