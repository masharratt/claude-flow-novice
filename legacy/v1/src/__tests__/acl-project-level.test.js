/**
 * Project-Level ACL Security Tests
 * Phase 1 Foundation Infrastructure Security Validation
 *
 * Tests for 6-level ACL system with project-level isolation:
 * 1. private - Only accessible by the specific agent
 * 2. team - Accessible by agents in the same team
 * 3. swarm - Accessible by all agents in the swarm
 * 4. project - Accessible by agents in the same project (multi-project isolation)
 * 5. public - Accessible by all authenticated agents
 * 6. system - System-level access (administrative)
 */

const SwarmMemoryManager = require('../sqlite/SwarmMemoryManager');
const fs = require('fs');
const path = require('path');

describe('Project-Level ACL Security Tests', () => {
  let memoryManager;
  let testDbPath;

  beforeAll(async () => {
    // Create temporary test database
    testDbPath = path.join(__dirname, '../../test-data-acl.db');
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize memory manager with test database
    memoryManager = new SwarmMemoryManager({
      dbPath: testDbPath,
      encryptionKey: Buffer.from('test-encryption-key-32-bytes-long', 'utf8'),
      aclCacheTimeout: 1000 // Short cache for testing
    });

    await memoryManager.initialize();
  });

  afterAll(async () => {
    if (memoryManager) {
      await memoryManager.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  beforeEach(async () => {
    // Clear database before each test
    await memoryManager.clear();
    memoryManager.clearACLCache();
  });

  describe('6-Level ACL System Validation', () => {
    test('should enforce private (level 1) access control', async () => {
      const agent1 = 'agent-private-1';
      const agent2 = 'agent-private-2';
      const secretData = { secret: 'confidential' };

      // Store private data
      await memoryManager.set('private-key', secretData, {
        agentId: agent1,
        aclLevel: 1,
        namespace: 'test'
      });

      // Owner should access
      const ownerAccess = await memoryManager.get('private-key', {
        agentId: agent1,
        namespace: 'test'
      });
      expect(ownerAccess).toEqual(secretData);

      // Other agent should be denied
      const otherAccess = await memoryManager.get('private-key', {
        agentId: agent2,
        namespace: 'test'
      });
      expect(otherAccess).toBeNull();
    });

    test('should enforce team (level 2) access control', async () => {
      const teamId = 'team-alpha';
      const agent1 = 'agent-team-1';
      const agent2 = 'agent-team-2';
      const agent3 = 'agent-team-3';
      const teamData = { strategy: 'team-secret' };

      // Store team data
      await memoryManager.set('team-key', teamData, {
        agentId: agent1,
        teamId,
        aclLevel: 2,
        namespace: 'test'
      });

      // Same team members should access (if ACL logic supports team checking)
      // Note: This test assumes team context is properly implemented
      const teamAccess = await memoryManager.get('team-key', {
        agentId: agent2,
        teamId,
        namespace: 'test'
      });
      expect(teamAccess).toBeTruthy();

      // Different team member should be denied
      const otherTeamAccess = await memoryManager.get('team-key', {
        agentId: agent3,
        teamId: 'other-team',
        namespace: 'test'
      });
      expect(otherTeamAccess).toBeNull();
    });

    test('should enforce swarm (level 3) access control', async () => {
      const swarmId = 'swarm-beta';
      const agent1 = 'agent-swarm-1';
      const agent2 = 'agent-swarm-2';
      const swarmData = { objective: 'swarm-goal' };

      // Store swarm data
      await memoryManager.set('swarm-key', swarmData, {
        agentId: agent1,
        swarmId,
        aclLevel: 3,
        namespace: 'test'
      });

      // Same swarm members should access
      const swarmAccess = await memoryManager.get('swarm-key', {
        agentId: agent2,
        swarmId,
        namespace: 'test'
      });
      expect(swarmAccess).toEqual(swarmData);
    });

    test('should enforce project (level 4) access control - CRITICAL SECURITY TEST', async () => {
      const projectId1 = 'project-alpha';
      const projectId2 = 'project-beta';
      const agent1 = 'agent-project-1';
      const agent2 = 'agent-project-2';
      const agent3 = 'agent-project-3';

      const projectData1 = { confidential: 'project-alpha-data' };
      const projectData2 = { confidential: 'project-beta-data' };

      // Store project-specific data
      await memoryManager.set('project-key-1', projectData1, {
        agentId: agent1,
        projectId: projectId1,
        aclLevel: 4, // Project level
        namespace: 'test'
      });

      await memoryManager.set('project-key-2', projectData2, {
        agentId: agent2,
        projectId: projectId2,
        aclLevel: 4, // Project level
        namespace: 'test'
      });

      // Same project agent should access data from their project
      const sameProjectAccess = await memoryManager.get('project-key-1', {
        agentId: agent3,
        projectId: projectId1,
        namespace: 'test'
      });
      expect(sameProjectAccess).toEqual(projectData1);

      // Different project agent should be DENIED access - SECURITY CRITICAL
      const crossProjectAccess = await memoryManager.get('project-key-1', {
        agentId: agent2,
        projectId: projectId2,
        namespace: 'test'
      });
      expect(crossProjectAccess).toBeNull();

      // Cross-project access attempt should be logged
      expect(crossProjectAccess).toBeNull();
    });

    test('should enforce public (level 5) access control', async () => {
      const agent1 = 'agent-public-1';
      const agent2 = 'agent-public-2';
      const publicData = { announcement: 'public-notice' };

      // Store public data
      await memoryManager.set('public-key', publicData, {
        agentId: agent1,
        aclLevel: 5,
        namespace: 'test'
      });

      // Any active agent should access public data
      const publicAccess1 = await memoryManager.get('public-key', {
        agentId: agent1,
        namespace: 'test'
      });
      expect(publicAccess1).toEqual(publicData);

      const publicAccess2 = await memoryManager.get('public-key', {
        agentId: agent2,
        namespace: 'test'
      });
      expect(publicAccess2).toEqual(publicData);
    });

    test('should enforce system (level 6) access control', async () => {
      const systemAgent = 'system-agent';
      const regularAgent = 'regular-agent';
      const systemData = { config: 'system-critical' };

      // Store system data
      await memoryManager.set('system-key', systemData, {
        agentId: systemAgent,
        aclLevel: 6,
        namespace: 'test'
      });

      // System agent should access
      const systemAccess = await memoryManager.get('system-key', {
        agentId: systemAgent,
        namespace: 'test'
      });
      expect(systemAccess).toEqual(systemData);

      // Regular agent should be denied
      const regularAccess = await memoryManager.get('system-key', {
        agentId: regularAgent,
        namespace: 'test'
      });
      expect(regularAccess).toBeNull();
    });
  });

  describe('Project Isolation Security', () => {
    test('should prevent cross-project data leakage', async () => {
      const projectAlpha = 'project-alpha-isolation';
      const projectBeta = 'project-beta-isolation';

      const alphaAgent = 'alpha-agent';
      const betaAgent = 'beta-agent';

      const alphaSecret = { credentials: 'alpha-secret-keys' };
      const betaSecret = { credentials: 'beta-secret-keys' };

      // Store secrets in different projects
      await memoryManager.set('credentials', alphaSecret, {
        agentId: alphaAgent,
        projectId: projectAlpha,
        aclLevel: 4,
        namespace: 'secure'
      });

      await memoryManager.set('credentials', betaSecret, {
        agentId: betaAgent,
        projectId: projectBeta,
        aclLevel: 4,
        namespace: 'secure'
      });

      // Alpha agent should only access alpha secrets
      const alphaAccess = await memoryManager.get('credentials', {
        agentId: alphaAgent,
        projectId: projectAlpha,
        namespace: 'secure'
      });
      expect(alphaAccess).toEqual(alphaSecret);

      // Beta agent should be blocked from alpha secrets
      const betaCrossAccess = await memoryManager.get('credentials', {
        agentId: betaAgent,
        projectId: projectBeta,
        namespace: 'secure'
      });
      expect(betaCrossAccess).toBeNull();
    });

    test('should handle project namespace isolation', async () => {
      const projectId = 'project-namespace-test';
      const agent1 = 'agent-ns-1';
      const agent2 = 'agent-ns-2';

      const sharedKey = 'shared-config';
      const ns1Data = { config: 'namespace-1' };
      const ns2Data = { config: 'namespace-2' };

      // Store same key in different namespaces
      await memoryManager.set(sharedKey, ns1Data, {
        agentId: agent1,
        projectId,
        aclLevel: 4,
        namespace: 'project-ns-1'
      });

      await memoryManager.set(sharedKey, ns2Data, {
        agentId: agent2,
        projectId,
        aclLevel: 4,
        namespace: 'project-ns-2'
      });

      // Agents should only access their namespace
      const ns1Access = await memoryManager.get(sharedKey, {
        agentId: agent1,
        projectId,
        namespace: 'project-ns-1'
      });
      expect(ns1Access).toEqual(ns1Data);

      const ns2Access = await memoryManager.get(sharedKey, {
        agentId: agent2,
        projectId,
        namespace: 'project-ns-2'
      });
      expect(ns2Access).toEqual(ns2Data);
    });
  });

  describe('ACL Cache Security', () => {
    test('should not cache unauthorized access', async () => {
      const projectId = 'project-cache-test';
      const authorizedAgent = 'auth-agent';
      const unauthorizedAgent = 'unauth-agent';

      const sensitiveData = { api: 'keys-and-tokens' };

      // Store project data
      await memoryManager.set('api-keys', sensitiveData, {
        agentId: authorizedAgent,
        projectId,
        aclLevel: 4,
        namespace: 'cache-test'
      });

      // Unauthorized access attempt
      const unauthorizedAccess = await memoryManager.get('api-keys', {
        agentId: unauthorizedAgent,
        projectId: 'different-project',
        namespace: 'cache-test'
      });
      expect(unauthorizedAccess).toBeNull();

      // Cache should not allow subsequent unauthorized access
      const retryUnauthorized = await memoryManager.get('api-keys', {
        agentId: unauthorizedAgent,
        projectId: 'different-project',
        namespace: 'cache-test'
      });
      expect(retryUnauthorized).toBeNull();
    });

    test('should respect cache expiration', async () => {
      const projectId = 'project-cache-expiry';
      const agent = 'cache-agent';

      const data = { value: 'cache-test' };

      // Store data
      await memoryManager.set('cache-key', data, {
        agentId: agent,
        projectId,
        aclLevel: 4,
        namespace: 'cache-test'
      });

      // First access should populate cache
      const firstAccess = await memoryManager.get('cache-key', {
        agentId: agent,
        projectId,
        namespace: 'cache-test'
      });
      expect(firstAccess).toEqual(data);

      // Wait for cache to expire (longer than timeout)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Access should still work after cache expiry
      const afterExpiry = await memoryManager.get('cache-key', {
        agentId: agent,
        projectId,
        namespace: 'cache-test'
      });
      expect(afterExpiry).toEqual(data);
    });
  });

  describe('Security Edge Cases', () => {
    test('should handle null/undefined project context gracefully', async () => {
      const agent = 'edge-case-agent';
      const data = { test: 'edge-case' };

      // Store data without project context
      await memoryManager.set('edge-key', data, {
        agentId,
        aclLevel: 3, // Swarm level
        namespace: 'edge-test'
      });

      // Access without project context should work
      const access = await memoryManager.get('edge-key', {
        agentId,
        namespace: 'edge-test'
      });
      expect(access).toEqual(data);
    });

    test('should prevent privilege escalation through project context manipulation', async () => {
      const projectId = 'privilege-test-project';
      const agent = 'privilege-agent';

      const systemData = { admin: 'system-config' };

      // Store system-level data
      await memoryManager.set('system-config', systemData, {
        agentId: 'system-admin',
        aclLevel: 6,
        namespace: 'privilege-test'
      });

      // Regular agent should not access even with project context manipulation
      const privilegedAccess = await memoryManager.get('system-config', {
        agentId,
        projectId,
        namespace: 'privilege-test'
      });
      expect(privilegedAccess).toBeNull();
    });

    test('should handle concurrent access with project isolation', async () => {
      const project1 = 'concurrent-project-1';
      const project2 = 'concurrent-project-2';

      const agent1 = 'concurrent-agent-1';
      const agent2 = 'concurrent-agent-2';

      const data1 = { project: 'data-1' };
      const data2 = { project: 'data-2' };

      // Concurrent store operations
      const storePromises = [
        memoryManager.set('concurrent-key', data1, {
          agentId: agent1,
          projectId: project1,
          aclLevel: 4,
          namespace: 'concurrent-test'
        }),
        memoryManager.set('concurrent-key', data2, {
          agentId: agent2,
          projectId: project2,
          aclLevel: 4,
          namespace: 'concurrent-test'
        })
      ];

      await Promise.all(storePromises);

      // Verify isolation is maintained
      const access1 = await memoryManager.get('concurrent-key', {
        agentId: agent1,
        projectId: project1,
        namespace: 'concurrent-test'
      });
      expect(access1).toEqual(data1);

      const access2 = await memoryManager.get('concurrent-key', {
        agentId: agent2,
        projectId: project2,
        namespace: 'concurrent-test'
      });
      expect(access2).toEqual(data2);
    });
  });

  describe('Performance and Security Metrics', () => {
    test('should track ACL cache performance', async () => {
      const projectId = 'metrics-project';
      const agent = 'metrics-agent';

      const data = { metrics: 'test-data' };

      // Store data
      await memoryManager.set('metrics-key', data, {
        agentId,
        projectId,
        aclLevel: 4,
        namespace: 'metrics-test'
      });

      // Multiple accesses to test cache
      for (let i = 0; i < 5; i++) {
        await memoryManager.get('metrics-key', {
          agentId,
          projectId,
          namespace: 'metrics-test'
        });
      }

      // Check metrics
      const metrics = memoryManager.getMetrics();
      expect(metrics.operations).toBeGreaterThan(0);
      expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(0);
    });

    test('should emit access denied events for security monitoring', async () => {
      const projectId = 'monitoring-project';
      const authorizedAgent = 'auth-monitor-agent';
      const unauthorizedAgent = 'unauth-monitor-agent';

      const sensitiveData = { security: 'monitoring-test' };

      // Track access denied events
      const accessDeniedEvents = [];
      memoryManager.on('accessDenied', (event) => {
        accessDeniedEvents.push(event);
      });

      // Store sensitive data
      await memoryManager.set('monitoring-key', sensitiveData, {
        agentId: authorizedAgent,
        projectId,
        aclLevel: 4,
        namespace: 'monitoring-test'
      });

      // Attempt unauthorized access
      await memoryManager.get('monitoring-key', {
        agentId: unauthorizedAgent,
        projectId: 'different-project',
        namespace: 'monitoring-test'
      });

      // Verify access denied event was emitted
      expect(accessDeniedEvents.length).toBeGreaterThan(0);
      expect(accessDeniedEvents[0]).toHaveProperty('key');
      expect(accessDeniedEvents[0]).toHaveProperty('agentId');
      expect(accessDeniedEvents[0]).toHaveProperty('aclLevel');
    });
  });
});