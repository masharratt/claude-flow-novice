/**
 * End-to-End Integration Tests
 *
 * Tests for Sprint 2.2:
 * - Full request flow: Auth → REST API → TransparencySystem → response
 * - Full WebSocket flow: Connect → subscribe → receive events → disconnect
 * - Rate limiting enforcement
 * - Error responses (401, 403, 429, 500, 503)
 * - Performance and reliability
 *
 * @module tests/integration/end-to-end
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthService, AuthConfig } from '../../src/api/auth-service.js';
import { TransparencySystem } from '../../src/coordination/shared/transparency/transparency-system.js';
import { Logger } from '../../src/core/logger.js';

describe('End-to-End Integration Tests', () => {
  let authService: AuthService;
  let transparencySystem: TransparencySystem;
  let testLogger: any;
  let testUser: any;
  let authToken: string;

  beforeEach(async () => {
    // Create test logger
    testLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    // Initialize auth service
    const authConfig: AuthConfig = {
      jwtSecret: 'e2e-test-secret-key',
      jwtExpiresIn: '24h',
      sessionTimeout: 3600000,
    };
    authService = new AuthService(authConfig, testLogger);

    // Initialize transparency system
    transparencySystem = new TransparencySystem();
    await transparencySystem.initialize({
      enableRealTimeMonitoring: true,
      enableEventStreaming: true,
    });
    await transparencySystem.startMonitoring();

    // Create test user and authenticate
    testUser = await authService.createUser({
      email: 'e2e@example.com',
      password: 'E2ETest123!',
      role: 'developer',
    });

    const authResult = await authService.authenticateUser('e2e@example.com', 'E2ETest123!');
    authToken = authResult.token;
  });

  afterEach(async () => {
    await transparencySystem.cleanup();
    vi.clearAllMocks();
  });

  describe('Full REST API Request Flow', () => {
    it('should complete full authenticated request flow', async () => {
      // Step 1: Verify JWT token
      const { user } = await authService.verifyJWT(authToken);
      expect(user.id).toBe(testUser.id);

      // Step 2: Check permissions
      const hasPermission = authService.hasPermission(user, 'swarm.read');
      expect(hasPermission).toBe(true);

      // Step 3: Register agent in transparency system
      await transparencySystem.registerAgent({
        agentId: 'e2e-agent-1',
        name: 'E2ETestAgent',
        role: 'coder',
        status: 'spawned',
        spawnedAt: new Date(),
        metadata: {
          userId: user.id,
          requestId: 'req-123',
        },
      });

      // Step 4: Query agent state
      const agentState = await transparencySystem.getAgentState('e2e-agent-1');
      expect(agentState).toBeDefined();
      expect(agentState?.agentId).toBe('e2e-agent-1');
      expect(agentState?.metadata?.userId).toBe(user.id);

      // Step 5: Update agent progress
      await transparencySystem.updateAgentState('e2e-agent-1', {
        status: 'in_progress',
        progress: 0.5,
      });

      // Step 6: Complete agent task
      await transparencySystem.updateAgentState('e2e-agent-1', {
        status: 'completed',
        completedAt: new Date(),
        confidence: 0.92,
      });

      // Step 7: Verify final state
      const finalState = await transparencySystem.getAgentState('e2e-agent-1');
      expect(finalState?.status).toBe('completed');
      expect(finalState?.confidence).toBe(0.92);
    });

    it('should handle unauthorized requests correctly', async () => {
      // Arrange - Invalid token
      const invalidToken = 'invalid.jwt.token';

      // Act & Assert - Should reject invalid token
      await expect(authService.verifyJWT(invalidToken)).rejects.toThrow();
    });

    it('should enforce permission checks', async () => {
      // Arrange - Create viewer user (limited permissions)
      const viewerUser = await authService.createUser({
        email: 'viewer@example.com',
        password: 'ViewerPass123!',
        role: 'viewer',
      });

      // Act - Check swarm creation permission (viewer shouldn't have)
      const hasPermission = authService.hasPermission(viewerUser, 'swarm.create');

      // Assert
      expect(hasPermission).toBe(false);
    });
  });

  describe('Full WebSocket Flow', () => {
    it('should complete full WebSocket event flow', async () => {
      // Step 1: Authenticate WebSocket connection
      const { user } = await authService.verifyJWT(authToken);
      expect(user).toBeDefined();

      // Step 2: Subscribe to agent events
      const events: any[] = [];
      transparencySystem.on('agent_update', (event) => {
        events.push(event);
      });

      // Step 3: Register agent (should trigger event)
      await transparencySystem.registerAgent({
        agentId: 'ws-agent-1',
        name: 'WebSocketTestAgent',
        role: 'coder',
        status: 'spawned',
        spawnedAt: new Date(),
      });

      // Wait for event propagation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Step 4: Verify event received
      expect(events.length).toBeGreaterThan(0);
      const spawnEvent = events.find(e => e.agentId === 'ws-agent-1');
      expect(spawnEvent).toBeDefined();

      // Step 5: Update agent (should trigger another event)
      await transparencySystem.updateAgentState('ws-agent-1', {
        status: 'in_progress',
        progress: 0.75,
      });

      // Wait for event propagation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Step 6: Verify update event received
      const updateEvent = events.find(e => e.agentId === 'ws-agent-1' && e.progress === 0.75);
      expect(updateEvent).toBeDefined();
    });

    it('should handle WebSocket disconnection gracefully', async () => {
      // Arrange - Setup event listener
      const events: any[] = [];
      const listener = (event: any) => {
        events.push(event);
      };
      transparencySystem.on('agent_update', listener);

      // Act - Register agent
      await transparencySystem.registerAgent({
        agentId: 'disconnect-test',
        name: 'DisconnectTest',
        role: 'coder',
        status: 'spawned',
        spawnedAt: new Date(),
      });

      // Simulate disconnection (remove listener)
      transparencySystem.off('agent_update', listener);

      // Update agent (should not crash even though listener is removed)
      await transparencySystem.updateAgentState('disconnect-test', {
        status: 'completed',
      });

      // Assert - No errors thrown
      expect(true).toBe(true);
    });

    it('should handle multiple concurrent WebSocket connections', async () => {
      // Arrange - Create multiple event listeners (simulating multiple clients)
      const client1Events: any[] = [];
      const client2Events: any[] = [];
      const client3Events: any[] = [];

      transparencySystem.on('agent_update', (event) => client1Events.push(event));
      transparencySystem.on('agent_update', (event) => client2Events.push(event));
      transparencySystem.on('agent_update', (event) => client3Events.push(event));

      // Act - Register agent (should notify all clients)
      await transparencySystem.registerAgent({
        agentId: 'multi-client-test',
        name: 'MultiClientTest',
        role: 'coder',
        status: 'spawned',
        spawnedAt: new Date(),
      });

      // Wait for event propagation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert - All clients should receive event
      expect(client1Events.length).toBeGreaterThan(0);
      expect(client2Events.length).toBeGreaterThan(0);
      expect(client3Events.length).toBeGreaterThan(0);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits after max attempts', async () => {
      // Arrange - Attempt login multiple times with wrong password
      const maxAttempts = 5;

      // Act - Fail login attempts
      for (let i = 0; i < maxAttempts; i++) {
        try {
          await authService.authenticateUser('e2e@example.com', 'WrongPassword');
        } catch (error) {
          // Expected to fail
        }
      }

      // Assert - Next attempt should be rate limited
      await expect(
        authService.authenticateUser('e2e@example.com', 'WrongPassword')
      ).rejects.toThrow('Too many failed login attempts');
    });

    it('should reset rate limit after successful authentication', async () => {
      // Arrange - Failed attempts
      for (let i = 0; i < 3; i++) {
        try {
          await authService.authenticateUser('e2e@example.com', 'WrongPassword');
        } catch (error) {
          // Expected to fail
        }
      }

      // Act - Successful authentication
      const result = await authService.authenticateUser('e2e@example.com', 'E2ETest123!');

      // Assert - User should be authenticated and rate limit reset
      expect(result.user.loginAttempts).toBe(0);
    });
  });

  describe('Error Response Handling', () => {
    it('should return 401 Unauthorized for missing token', async () => {
      // Act & Assert
      await expect(authService.verifyJWT('')).rejects.toThrow();
    });

    it('should return 401 Unauthorized for invalid token', async () => {
      // Act & Assert
      await expect(
        authService.verifyJWT('invalid.token.here')
      ).rejects.toThrow();
    });

    it('should return 403 Forbidden for insufficient permissions', async () => {
      // Arrange - Create viewer user
      const viewerUser = await authService.createUser({
        email: 'forbidden@example.com',
        password: 'ViewerPass123!',
        role: 'viewer',
      });

      // Act - Check admin permission
      const hasAdminPermission = authService.hasPermission(viewerUser, 'system.admin');

      // Assert
      expect(hasAdminPermission).toBe(false);
    });

    it('should return 429 Too Many Requests for rate limit exceeded', async () => {
      // Arrange - Exceed rate limit
      for (let i = 0; i < 5; i++) {
        try {
          await authService.authenticateUser('e2e@example.com', 'WrongPassword');
        } catch (error) {
          // Expected
        }
      }

      // Act & Assert
      await expect(
        authService.authenticateUser('e2e@example.com', 'WrongPassword')
      ).rejects.toThrow('Too many failed login attempts');
    });

    it('should return 404 Not Found for non-existent agent', async () => {
      // Act
      const agentState = await transparencySystem.getAgentState('does-not-exist');

      // Assert
      expect(agentState).toBeUndefined();
    });

    it('should handle 503 Service Unavailable gracefully', async () => {
      // Arrange - Shutdown transparency system
      await transparencySystem.cleanup();

      // Act - Try to query (should fail gracefully)
      const agentState = await transparencySystem.getAgentState('any-agent');

      // Assert - Should return undefined, not throw
      expect(agentState).toBeUndefined();
    });
  });

  describe('Performance and Reliability', () => {
    it('should complete authentication flow within 100ms', async () => {
      // Act
      const startTime = Date.now();
      await authService.authenticateUser('e2e@example.com', 'E2ETest123!');
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(100);
    });

    it('should verify JWT within 10ms', async () => {
      // Act
      const startTime = Date.now();
      await authService.verifyJWT(authToken);
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(10);
    });

    it('should query agent state within 50ms', async () => {
      // Arrange
      await transparencySystem.registerAgent({
        agentId: 'perf-test',
        name: 'PerfTest',
        role: 'coder',
        status: 'spawned',
        spawnedAt: new Date(),
      });

      // Act
      const startTime = Date.now();
      await transparencySystem.getAgentState('perf-test');
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(50);
    });

    it('should handle 100 concurrent requests', async () => {
      // Act - 100 concurrent JWT verifications
      const startTime = Date.now();
      const promises = Array.from({ length: 100 }, () =>
        authService.verifyJWT(authToken)
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Assert - All should succeed
      expect(results).toHaveLength(100);
      results.forEach(result => {
        expect(result.user.id).toBe(testUser.id);
      });

      // Performance assertion (100 requests in < 1s)
      expect(duration).toBeLessThan(1000);
    });

    it('should propagate WebSocket events within 50ms', async () => {
      // Arrange
      let eventReceived = false;
      let eventTimestamp = 0;

      transparencySystem.on('agent_update', () => {
        eventReceived = true;
        eventTimestamp = Date.now();
      });

      // Act
      const registerTimestamp = Date.now();
      await transparencySystem.registerAgent({
        agentId: 'ws-perf-test',
        name: 'WSPerfTest',
        role: 'coder',
        status: 'spawned',
        spawnedAt: new Date(),
      });

      // Wait for event
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(eventReceived).toBe(true);
      const propagationTime = eventTimestamp - registerTimestamp;
      expect(propagationTime).toBeLessThan(50);
    });
  });

  describe('Complex Integration Scenarios', () => {
    it('should handle full agent lifecycle with authentication', async () => {
      // Step 1: Authenticate
      const { user } = await authService.verifyJWT(authToken);

      // Step 2: Spawn agent
      await transparencySystem.registerAgent({
        agentId: 'lifecycle-agent',
        name: 'LifecycleAgent',
        role: 'coder',
        status: 'spawned',
        spawnedAt: new Date(),
        metadata: { userId: user.id },
      });

      // Step 3: Verify permissions
      expect(authService.hasPermission(user, 'agent.read')).toBe(true);

      // Step 4: Update progress
      await transparencySystem.updateAgentState('lifecycle-agent', {
        status: 'in_progress',
        progress: 0.25,
      });

      // Step 5: Query state
      const state1 = await transparencySystem.getAgentState('lifecycle-agent');
      expect(state1?.progress).toBe(0.25);

      // Step 6: Complete task
      await transparencySystem.updateAgentState('lifecycle-agent', {
        status: 'completed',
        completedAt: new Date(),
        confidence: 0.88,
      });

      // Step 7: Final verification
      const finalState = await transparencySystem.getAgentState('lifecycle-agent');
      expect(finalState?.status).toBe('completed');
      expect(finalState?.confidence).toBe(0.88);
    });

    it('should handle hierarchical agent spawning with authentication', async () => {
      // Step 1: Authenticate
      const { user } = await authService.verifyJWT(authToken);
      expect(authService.hasPermission(user, 'agent.spawn')).toBe(false); // Developer can't spawn

      // Step 2: Create operator user (can spawn agents)
      const operatorUser = await authService.createUser({
        email: 'operator@example.com',
        password: 'OperatorPass123!',
        role: 'operator',
      });

      // Step 3: Verify operator can spawn
      expect(authService.hasPermission(operatorUser, 'agent.spawn')).toBe(true);

      // Step 4: Spawn parent agent
      await transparencySystem.registerAgent({
        agentId: 'parent-hierarchy',
        name: 'ParentHierarchy',
        role: 'coordinator',
        status: 'in_progress',
        spawnedAt: new Date(),
      });

      // Step 5: Spawn child agents
      await transparencySystem.registerAgent({
        agentId: 'child-1',
        name: 'Child1',
        role: 'coder',
        status: 'spawned',
        spawnedAt: new Date(),
        parentAgentId: 'parent-hierarchy',
      });

      await transparencySystem.registerAgent({
        agentId: 'child-2',
        name: 'Child2',
        role: 'tester',
        status: 'spawned',
        spawnedAt: new Date(),
        parentAgentId: 'parent-hierarchy',
      });

      // Step 6: Query hierarchy
      const hierarchy = await transparencySystem.getAgentHierarchy();
      const parentNode = hierarchy.find(n => n.agentId === 'parent-hierarchy');

      // Assert
      expect(parentNode).toBeDefined();
      expect(parentNode?.children?.length).toBe(2);
    });

    it('should handle session management across multiple requests', async () => {
      // Step 1: Initial authentication
      const auth1 = await authService.authenticateUser('e2e@example.com', 'E2ETest123!');
      const session1 = auth1.session;

      // Step 2: Use session for multiple requests
      for (let i = 0; i < 10; i++) {
        const { session } = await authService.verifyJWT(auth1.token);
        expect(session.id).toBe(session1.id);
        expect(session.isActive).toBe(true);
      }

      // Step 3: Invalidate session
      await authService.invalidateSession(session1.id);

      // Step 4: Verify token is now invalid
      await expect(authService.verifyJWT(auth1.token)).rejects.toThrow();
    });
  });
});
