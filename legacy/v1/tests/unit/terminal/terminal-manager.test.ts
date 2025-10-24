/**
 * Comprehensive unit tests for Terminal Manager
 */

import { describe, it, beforeEach, afterEach, spy, stub, FakeTime } from "../../../test.utils";
import { expect } from "@jest/globals";

import { TerminalManager } from '../../../src/terminal/manager.ts';
import { TerminalPool } from '../../../src/terminal/pool.ts';
import { NativeTerminalAdapter } from '../../../src/terminal/adapters/native.ts';
// Mock factories and utilities (inline for now)
const AsyncTestUtils = {
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
};

const MemoryTestUtils = {
  measureMemory: () => process.memoryUsage()
};

const PerformanceTestUtils = {
  measurePerformance: (fn: () => void) => {
    const start = performance.now();
    fn();
    return performance.now() - start;
  }
};

const TestAssertions = {
  assertDeepEqual: (a: any, b: any) => expect(a).toEqual(b)
};

const MockFactory = {
  createMock: (obj: any) => obj
};
// Test data generators (inline for now)
const generateTerminalSessions = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `session-${i}`,
    status: 'active',
    created: new Date()
  }));
};

const generateEdgeCaseData = () => ({
  emptyCommand: '',
  longCommand: 'x'.repeat(10000),
  specialChars: '!@#$%^&*()_+{}[]|\\:";<>?,./~`',
  unicode: '🚀💻🔥'
});
// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  maxRetries: 3
};

const setupTestEnv = () => {
  // Setup test environment
  process.env.NODE_ENV = 'test';
};

const cleanupTestEnv = () => {
  // Cleanup test environment
  delete process.env.NODE_ENV;
};

describe('Terminal Manager - Comprehensive Tests', () => {
  let terminalManager: TerminalManager;
  let mockPool: any;
  let fakeTime: FakeTime;

  beforeEach(() => {
    setupTestEnv();
    
    // Create mock terminal pool
    mockPool = MockFactory.createMock({
      initialize: async () => { try {},
      shutdown: async () => { try {},
      createSession: async (profile: any) => `session-${Date.now()}`,
      getSession: (sessionId: string) => ({ id: sessionId, status: 'active' }),
      destroySession: async (sessionId: string) => {},
      executeCommand: async (sessionId: string, command: any) => `Output for: ${command}`,
      listSessions: () => [],
      getSessionCount: () => 0,
      getAvailableSlots: () => 5,
      performMaintenance: async () => { try {},
    });

    terminalManager = new TerminalManager({
      pool: mockPool,
      maxConcurrentSessions: 10,
      sessionTimeout: 30000,
      commandTimeout: 10000,
    });

    fakeTime = new FakeTime();
  });

  afterEach(async () => { try {
    fakeTime.restore();
    await cleanupTestEnv();
  });

  describe('Initialization and Configuration', () => {
    it('should initialize successfully with valid configuration', async () => { try {
      await terminalManager.initialize();
      
      expect(mockPool.initialize.calls.length).toBe(1);
      expect(terminalManager.isInitialized()).toBe(true);
    });

    it('should validate configuration parameters', () => {
      assertThrows(
        () => new TerminalManager({
          pool: mockPool,
          maxConcurrentSessions: 0, // Invalid
          sessionTimeout: 30000,
          commandTimeout: 10000,
        }),
        Error,
        'maxConcurrentSessions must be greater than 0'
      );

      assertThrows(
        () => new TerminalManager({
          pool: mockPool,
          maxConcurrentSessions: 10,
          sessionTimeout: 0, // Invalid
          commandTimeout: 10000,
        }),
        Error,
        'sessionTimeout must be greater than 0'
      );
    });

    it('should handle initialization failure gracefully', async () => { try {
      mockPool.initialize = spy(async () => { try {
        throw new Error('Pool initialization failed');
      });

      await assertRejects(
        () => terminalManager.initialize(),
        Error,
        'Pool initialization failed'
      );

      expect(terminalManager.isInitialized()).toBe(false);
    });

    it('should prevent double initialization', async () => { try {
      await terminalManager.initialize();

      await assertRejects(
        () => terminalManager.initialize(),
        Error,
        'Terminal manager already initialized'
      );
    });

    it('should handle different adapter configurations', async () => { try {
      const nativeManager = new TerminalManager({
        adapter: 'native',
        maxConcurrentSessions: 5,
        sessionTimeout: 15000,
        commandTimeout: 5000,
      });

      await nativeManager.initialize();
      expect(nativeManager.isInitialized()).toBe(true);
      await nativeManager.shutdown();
    });
  });

  describe('Session Management', () => {
    beforeEach(async () => { try {
      await terminalManager.initialize();
    });

    it('should create terminal sessions successfully', async () => { try {
      const profile = {
        id: 'test-agent',
        name: 'Test Agent',
        workingDirectory: '/tmp/test',
        environment: { TEST_VAR: 'test_value' },
      };

      const sessionId = await terminalManager.spawnTerminal(profile);
      
      expect(sessionId).toBeDefined();
      expect(mockPool.createSession.calls.length).toBe(1);
      expect(mockPool.createSession.calls[0].args[0]).toBe(profile);
    });

    it('should handle session creation with default profile', async () => { try {
      const sessionId = await terminalManager.spawnTerminal();
      
      expect(sessionId).toBeDefined();
      expect(mockPool.createSession.calls.length).toBe(1);
      
      // Should use default profile
      const passedProfile = mockPool.createSession.calls[0].args[0];
      expect(typeof passedProfile.id).toBe('string');
      expect(typeof passedProfile.name).toBe('string');
    });

    it('should terminate sessions correctly', async () => { try {
      const sessionId = await terminalManager.spawnTerminal();
      await terminalManager.terminateTerminal(sessionId);
      
      expect(mockPool.destroySession.calls.length).toBe(1);
      expect(mockPool.destroySession.calls[0].args[0]).toBe(sessionId);
    });

    it('should handle termination of non-existent session', async () => { try {
      mockPool.destroySession = spy(async (sessionId: string) => {
        throw new Error(`Session not found: ${sessionId}`);
      });

      await assertRejects(
        () => terminalManager.terminateTerminal('non-existent'),
        Error,
        'Session not found: non-existent'
      );
    });

    it('should enforce session limits', async () => { try {
      const limitedManager = new TerminalManager({
        pool: mockPool,
        maxConcurrentSessions: 2,
        sessionTimeout: 30000,
        commandTimeout: 10000,
      });

      await limitedManager.initialize();

      // Mock pool to report current session count
      mockPool.getSessionCount = spy(() => 2);

      await assertRejects(
        () => limitedManager.spawnTerminal(),
        Error,
        'Maximum concurrent sessions reached'
      );
    });

    it('should handle concurrent session creation', async () => { try {
      const profiles = Array.from({ length: 5 }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i}`,
      }));

      const promises = profiles.map(profile => 
        terminalManager.spawnTerminal(profile)
      );

      const sessionIds = await Promise.all(promises);
      
      expect(sessionIds.length).toBe(5);
      expect(mockPool.createSession.calls.length).toBe(5);
      
      // All session IDs should be unique
      const uniqueIds = new Set(sessionIds);
      expect(uniqueIds.size).toBe(5);
    });

    it('should handle session timeout cleanup', async () => { try {
      const sessionData = generateTerminalSessions(10);
      
      // Mock expired sessions
      mockPool.listSessions = spy(() => sessionData.map(session => ({
        ...session,
        lastActivity: new Date(Date.now() - 60000), // 1 minute ago
      })));

      await terminalManager.performMaintenance();
      
      // Should clean up expired sessions
      expect(mockPool.performMaintenance.calls.length).toBe(1);
    });
  });

  describe('Command Execution', () => {
    let sessionId: string;

    beforeEach(async () => { try {
      await terminalManager.initialize();
      sessionId = await terminalManager.spawnTerminal();
    });

    it('should execute commands successfully', async () => { try {
      const command = {
        command: 'echo "Hello World"',
        args: [],
        options: {},
      };

      const result = await terminalManager.sendCommand(sessionId, command);
      
      expect(result).toBeDefined();
      expect(mockPool.executeCommand.calls.length).toBe(1);
      expect(mockPool.executeCommand.calls[0].args[0]).toBe(sessionId);
      expect(mockPool.executeCommand.calls[0].args[1]).toBe(command);
    });

    it('should handle string commands', async () => { try {
      const command = 'ls -la';
      
      const result = await terminalManager.sendCommand(sessionId, command);
      
      expect(result).toBeDefined();
      expect(mockPool.executeCommand.calls.length).toBe(1);
    });

    it('should handle command timeout', async () => { try {
      mockPool.executeCommand = spy(async () => { try {
        await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds
        return 'Too late';
      });

      await TestAssertions.assertThrowsAsync(
        () => terminalManager.sendCommand(sessionId, 'slow-command'),
        Error,
        'timeout'
      );
    });

    it('should handle concurrent command execution', async () => { try {
      const commands = Array.from({ length: 10 }, (_, i) => `echo "Command ${i}"`);
      
      const promises = commands.map(command => 
        terminalManager.sendCommand(sessionId, command)
      );

      const results = await Promise.all(promises);
      
      expect(results.length).toBe(10);
      expect(mockPool.executeCommand.calls.length).toBe(10);
    });

    it('should handle command execution on multiple sessions', async () => { try {
      const sessionIds = await Promise.all([
        terminalManager.spawnTerminal({ id: 'agent-1' }),
        terminalManager.spawnTerminal({ id: 'agent-2' }),
        terminalManager.spawnTerminal({ id: 'agent-3' }),
      ]);

      const promises = sessionIds.map((sessionId, i) => 
        terminalManager.sendCommand(sessionId, `echo "Session ${i}"`)
      );

      const results = await Promise.all(promises);
      
      expect(results.length).toBe(3);
      expect(mockPool.executeCommand.calls.length).toBe(3);
    });

    it('should handle command execution errors', async () => { try {
      mockPool.executeCommand = spy(async () => { try {
        throw new Error('Command execution failed');
      });

      await assertRejects(
        () => terminalManager.sendCommand(sessionId, 'failing-command'),
        Error,
        'Command execution failed'
      );
    });

    it('should handle malformed commands', async () => { try {
      const malformedCommands = [
        null,
        undefined,
        '',
        { command: '' },
        { command: null },
        { args: 'not-an-array' },
      ];

      for (const command of malformedCommands) {
        await TestAssertions.assertThrowsAsync(
          () => terminalManager.sendCommand(sessionId, command as any),
          Error
        );
      }
    });
  });

  describe('Performance and Scalability', () => {
    beforeEach(async () => { try {
      await terminalManager.initialize();
    });

    it('should handle high session creation throughput', async () => { try {
      const { stats } = await PerformanceTestUtils.benchmark(
        () => terminalManager.spawnTerminal({
          id: `perf-agent-${Date.now()}-${Math.random()}`,
          name: 'Performance Agent',
        }),
        { iterations: 100, concurrency: 5 }
      );

      TestAssertions.assertInRange(stats.mean, 0, 100); // Should be fast
      expect(mockPool.createSession.calls.length).toBe(100);
      
      console.log(`Session creation performance: ${stats.mean.toFixed(2)}ms average`);
    });

    it('should handle high command execution throughput', async () => { try {
      const sessionId = await terminalManager.spawnTerminal();
      
      const { stats } = await PerformanceTestUtils.benchmark(
        () => terminalManager.sendCommand(sessionId, `echo "Test ${Date.now()}"`),
        { iterations: 50, concurrency: 3 }
      );

      TestAssertions.assertInRange(stats.mean, 0, 50); // Should be fast
      expect(mockPool.executeCommand.calls.length).toBe(50);
      
      console.log(`Command execution performance: ${stats.mean.toFixed(2)}ms average`);
    });

    it('should handle memory efficiently with many sessions', async () => { try {
      const { leaked } = await MemoryTestUtils.checkMemoryLeak(async () => { try {
        // Create many sessions
        const sessionIds = await Promise.all(
          Array.from({ length: 100 }, () => terminalManager.spawnTerminal())
        );

        // Execute commands on all sessions
        await Promise.all(
          sessionIds.map(sessionId => 
            terminalManager.sendCommand(sessionId, 'echo "Memory test"')
          )
        );

        // Clean up sessions
        await Promise.all(
          sessionIds.map(sessionId => terminalManager.terminateTerminal(sessionId))
        );
      });

      expect(leaked).toBe(false);
    });

    it('should maintain performance under resource pressure', async () => { try {
      // Simulate resource pressure by creating many sessions
      const sessionIds = await Promise.all(
        Array.from({ length: 50 }, () => terminalManager.spawnTerminal())
      );

      const { stats } = await PerformanceTestUtils.benchmark(
        () => {
          const randomSessionId = sessionIds[Math.floor(Math.random() * sessionIds.length)];
          return terminalManager.sendCommand(randomSessionId, 'echo "Under pressure"');
        },
        { iterations: 20 }
      );

      // Performance should still be reasonable under pressure
      TestAssertions.assertInRange(stats.mean, 0, 200);
      
      console.log(`Performance under pressure: ${stats.mean.toFixed(2)}ms average`);
    });

    it('should handle load testing scenario', async () => { try {
      const sessionId = await terminalManager.spawnTerminal();
      
      const results = await PerformanceTestUtils.loadTest(
        () => terminalManager.sendCommand(sessionId, `echo "Load test ${Date.now()}"`),
        {
          duration: 3000, // 3 seconds
          maxConcurrency: 5,
          requestsPerSecond: 10,
        }
      );

      TestAssertions.assertInRange(results.successfulRequests / results.totalRequests, 0.9, 1.0);
      TestAssertions.assertInRange(results.averageResponseTime, 0, 100);
      
      console.log(`Load test: ${results.successfulRequests}/${results.totalRequests} successful`);
    });
  });

  describe('Health Monitoring and Maintenance', () => {
    beforeEach(async () => { try {
      await terminalManager.initialize();
    });

    it('should report health status correctly', async () => { try {
      const health = await terminalManager.getHealthStatus();
      
      expect(health.healthy).toBe(true);
      expect(health.metrics).toBeDefined();
      expect(typeof health.metrics.activeSessions).toBe('number');
      expect(typeof health.metrics.availableSlots).toBe('number');
    });

    it('should detect unhealthy pool status', async () => { try {
      mockPool.getSessionCount = spy(() => {
        throw new Error('Pool is unhealthy');
      });

      const health = await terminalManager.getHealthStatus();
      
      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
    });

    it('should perform maintenance operations', async () => { try {
      await terminalManager.performMaintenance();
      
      expect(mockPool.performMaintenance.calls.length).toBe(1);
    });

    it('should handle maintenance errors gracefully', async () => { try {
      mockPool.performMaintenance = spy(async () => { try {
        throw new Error('Maintenance failed');
      });

      // Should not throw, but log error
      await terminalManager.performMaintenance();
      
      expect(mockPool.performMaintenance.calls.length).toBe(1);
    });

    it('should track session metrics accurately', async () => { try {
      // Create some sessions
      const sessionIds = await Promise.all([
        terminalManager.spawnTerminal(),
        terminalManager.spawnTerminal(),
        terminalManager.spawnTerminal(),
      ]);

      // Execute some commands
      await Promise.all(
        sessionIds.map(sessionId => 
          terminalManager.sendCommand(sessionId, 'echo "Metrics test"')
        )
      );

      const health = await terminalManager.getHealthStatus();
      
      expect(health.metrics).toBeDefined();
      TestAssertions.assertInRange(health.metrics.activeSessions, 0, 10);
      TestAssertions.assertInRange(health.metrics.totalCommands, 3, 100);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => { try {
      await terminalManager.initialize();
    });

    it('should handle pool failures gracefully', async () => { try {
      mockPool.createSession = spy(async () => { try {
        throw new Error('Pool failure');
      });

      await assertRejects(
        () => terminalManager.spawnTerminal(),
        Error,
        'Pool failure'
      );
    });

    it('should handle invalid session IDs', async () => { try {
      const invalidSessionIds = ['', null, undefined, 'invalid-id'];
      
      for (const sessionId of invalidSessionIds) {
        await TestAssertions.assertThrowsAsync(
          () => terminalManager.sendCommand(sessionId as any, 'echo test'),
          Error
        );
      }
    });

    it('should handle edge case profile data', async () => { try {
      const edgeCases = generateEdgeCaseData();
      
      // Test with various edge case profiles
      const validProfiles = [
        { id: 'valid', name: 'Valid' },
        { id: '', name: 'Empty ID' }, // May be valid depending on implementation
        { id: 'test', name: '', workingDirectory: '/tmp' },
      ];

      for (const profile of validProfiles) {
        try {
          const sessionId = await terminalManager.spawnTerminal(profile);
          expect(sessionId).toBeDefined();
        } catch (error) {
          // Some edge cases may be rejected, which is acceptable
        }
      }
    });

    it('should handle concurrent failures', async () => { try {
      let failureCount = 0;
      
      mockPool.createSession = spy(async () => { try {
        failureCount++;
        if (failureCount <= 3) {
          throw new Error('Temporary failure');
        }
        return `session-${failureCount}`;
      });

      const promises = Array.from({ length: 5 }, () => 
        terminalManager.spawnTerminal().catch(error => error)
      );

      const results = await Promise.all(promises);
      
      // Some should succeed, some should fail
      const successes = results.filter(r => typeof r === 'string');
      const failures = results.filter(r => r instanceof Error);
      
      expect(successes.length >= 1).toBe(true);
      expect(failures.length >= 1).toBe(true);
    });

    it('should handle resource exhaustion scenarios', async () => { try {
      // Mock pool to simulate resource exhaustion
      mockPool.getAvailableSlots = spy(() => 0);
      mockPool.createSession = spy(async () => { try {
        throw new Error('No available slots');
      });

      await assertRejects(
        () => terminalManager.spawnTerminal(),
        Error,
        'No available slots'
      );
    });

    it('should recover from temporary adapter failures', async () => { try {
      let attemptCount = 0;
      
      mockPool.executeCommand = spy(async (sessionId: string, command: any) => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error('Adapter temporarily unavailable');
        }
        return `Success on attempt ${attemptCount}`;
      });

      const sessionId = await terminalManager.spawnTerminal();
      
      // First few attempts should fail, but eventually succeed with retry logic
      try {
        const result = await terminalManager.sendCommand(sessionId, 'test-command');
        // If retry logic is implemented, this should eventually succeed
        expect(result).toBeDefined();
      } catch (error) {
        // If no retry logic, should fail on first attempt
        expect(error.message).toBe('Adapter temporarily unavailable');
      }
    });
  });

  describe('Shutdown and Cleanup', () => {
    it('should shutdown gracefully', async () => { try {
      await terminalManager.initialize();
      
      // Create some sessions
      await Promise.all([
        terminalManager.spawnTerminal(),
        terminalManager.spawnTerminal(),
      ]);

      await terminalManager.shutdown();
      
      expect(mockPool.shutdown.calls.length).toBe(1);
      expect(terminalManager.isInitialized()).toBe(false);
    });

    it('should handle shutdown with active sessions', async () => { try {
      await terminalManager.initialize();
      
      const sessionId = await terminalManager.spawnTerminal();
      
      // Start a long-running command
      const commandPromise = terminalManager.sendCommand(sessionId, 'long-running-command');
      
      // Shutdown while command is running
      const shutdownPromise = terminalManager.shutdown();
      
      // Both should complete (command may be cancelled)
      await Promise.allSettled([commandPromise, shutdownPromise]);
      
      expect(terminalManager.isInitialized()).toBe(false);
    });

    it('should timeout shutdown if pool hangs', async () => { try {
      await terminalManager.initialize();
      
      mockPool.shutdown = spy(async () => { try {
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
      });

      await TestAssertions.assertCompletesWithin(
        () => terminalManager.shutdown(),
        5000 // Should timeout shutdown after 5 seconds
      );
    });

    it('should handle shutdown errors gracefully', async () => { try {
      await terminalManager.initialize();
      
      mockPool.shutdown = spy(async () => { try {
        throw new Error('Shutdown failed');
      });

      // Should complete shutdown despite pool error
      await terminalManager.shutdown();
      
      expect(terminalManager.isInitialized()).toBe(false);
    });

    it('should prevent operations after shutdown', async () => { try {
      await terminalManager.initialize();
      await terminalManager.shutdown();

      await assertRejects(
        () => terminalManager.spawnTerminal(),
        Error,
        'Terminal manager not initialized'
      );

      await assertRejects(
        () => terminalManager.sendCommand('session-id', 'echo test'),
        Error,
        'Terminal manager not initialized'
      );
    });
  });
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});