/**
 * Crash Detection System Tests
 *
 * Comprehensive tests for crash detection functionality:
 * - Interrupted execution detection
 * - Sprint progress calculation
 * - Recovery time estimation
 * - Clean shutdown differentiation
 * - Redis integration
 *
 * @module tests/cfn-loop/crash-detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CrashDetector, InterruptedExecution, CrashDetectorConfig } from '../../src/cfn-loop/crash-detector.js';
import { EpicState, SprintState, PhaseState } from '../../src/cfn-loop/state-checkpoint-manager.js';
import { createClient, RedisClientType } from 'redis';

// Mock Redis client
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn(),
    quit: vi.fn(),
    on: vi.fn(),
    keys: vi.fn(),
    get: vi.fn(),
    setEx: vi.fn(),
  })),
}));

describe('CrashDetector', () => {
  let detector: CrashDetector;
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      setEx: vi.fn().mockResolvedValue('OK'),
    };

    vi.mocked(createClient).mockReturnValue(mockRedis as any);

    detector = new CrashDetector({
      heartbeatTimeoutMs: 300000, // 5 minutes
      scanTimeoutMs: 5000,
    });
  });

  afterEach(async () => { try {
    await detector.shutdown();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize Redis connection', async () => { try {
      await detector.initialize();

      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379',
      });
      expect(mockRedis.connect).toHaveBeenCalled();
    });

    it('should emit initialized event', async () => { try {
      const initSpy = vi.fn();
      detector.on('initialized', initSpy);

      await detector.initialize();

      expect(initSpy).toHaveBeenCalled();
    });

    it('should throw error on initialization failure', async () => { try {
      mockRedis.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(detector.initialize()).rejects.toThrow('Connection failed');
    });
  });

  describe('detectInterruptedExecutions', () => {
    it('should detect interrupted executions', async () => { try {
      const now = Date.now();
      const staleHeartbeat = now - 600000; // 10 minutes ago

      // Mock heartbeat data (stale)
      mockRedis.keys.mockResolvedValueOnce(['cfn:epic:epic-1:heartbeat']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ timestamp: staleHeartbeat })) // heartbeat
        .mockResolvedValueOnce('checkpoint-epic-1-5') // latest checkpoint
        .mockResolvedValueOnce(
          JSON.stringify({
            metadata: { timestamp: staleHeartbeat, version: 5 },
            serialized: { data: JSON.stringify(createMockEpicState('epic-1', 'in-progress')) },
          })
        ) // checkpoint data
        .mockResolvedValueOnce(JSON.stringify({ timestamp: staleHeartbeat })) // heartbeat again
        .mockResolvedValueOnce(null); // no shutdown marker

      await detector.initialize();
      const interrupted = await detector.detectInterruptedExecutions();

      expect(interrupted).toHaveLength(1);
      expect(interrupted[0].epicId).toBe('epic-1');
      expect(interrupted[0].isCleanShutdown).toBe(false);
    });

    it('should complete scan within timeout', async () => { try {
      await detector.initialize();

      const startTime = Date.now();
      await detector.detectInterruptedExecutions();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // 5 second timeout
    });

    it('should return empty array when no interrupted executions', async () => { try {
      mockRedis.keys.mockResolvedValue([]);

      await detector.initialize();
      const interrupted = await detector.detectInterruptedExecutions();

      expect(interrupted).toHaveLength(0);
    });

    it('should emit scan-completed event with stats', async () => { try {
      const scanSpy = vi.fn();
      detector.on('scan-completed', scanSpy);

      await detector.initialize();
      await detector.detectInterruptedExecutions();

      expect(scanSpy).toHaveBeenCalled();
      const stats = scanSpy.mock.calls[0][0].stats;
      expect(stats).toHaveProperty('totalEpicsScanned');
      expect(stats).toHaveProperty('scanDurationMs');
    });
  });

  describe('scanRedisForStaleHeartbeats', () => {
    it('should identify stale heartbeats', async () => { try {
      const now = Date.now();
      const staleTime = now - 600000; // 10 minutes ago
      const recentTime = now - 60000; // 1 minute ago

      mockRedis.keys.mockResolvedValue([
        'cfn:epic:epic-1:heartbeat',
        'cfn:epic:epic-2:heartbeat',
        'cfn:epic:epic-3:heartbeat',
      ]);

      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ timestamp: staleTime })) // epic-1: stale
        .mockResolvedValueOnce(JSON.stringify({ timestamp: recentTime })) // epic-2: recent
        .mockResolvedValueOnce(JSON.stringify({ timestamp: staleTime })); // epic-3: stale

      await detector.initialize();
      const staleEpics = await detector.scanRedisForStaleHeartbeats();

      expect(staleEpics).toHaveLength(2);
      expect(staleEpics).toContain('epic-1');
      expect(staleEpics).toContain('epic-3');
      expect(staleEpics).not.toContain('epic-2');
    });

    it('should handle missing heartbeat data gracefully', async () => { try {
      mockRedis.keys.mockResolvedValue(['cfn:epic:epic-1:heartbeat']);
      mockRedis.get.mockResolvedValue(null);

      await detector.initialize();
      const staleEpics = await detector.scanRedisForStaleHeartbeats();

      expect(staleEpics).toHaveLength(0);
    });

    it('should handle invalid heartbeat JSON gracefully', async () => { try {
      mockRedis.keys.mockResolvedValue(['cfn:epic:epic-1:heartbeat']);
      mockRedis.get.mockResolvedValue('invalid json');

      await detector.initialize();
      const staleEpics = await detector.scanRedisForStaleHeartbeats();

      expect(staleEpics).toHaveLength(0);
    });
  });

  describe('sprint progress calculation', () => {
    it('should calculate accurate sprint progress percentages', async () => { try {
      const epicState = createMockEpicState('epic-1', 'in-progress');
      epicState.sprints[0].phases[0].status = 'completed';
      epicState.sprints[0].phases[1].status = 'completed';
      epicState.sprints[0].phases[2].status = 'loop3-in-progress';

      mockRedis.keys.mockResolvedValue(['cfn:epic:epic-1:heartbeat']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce('checkpoint-epic-1-1')
        .mockResolvedValueOnce(
          JSON.stringify({
            metadata: { timestamp: Date.now() - 600000, version: 1 },
            serialized: { data: JSON.stringify(epicState) },
          })
        )
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce(null);

      await detector.initialize();
      const interrupted = await detector.detectInterruptedExecutions();

      expect(interrupted[0].sprintsInProgress[0].progress).toBeCloseTo(0.67, 2); // 2/3 phases complete
      expect(interrupted[0].sprintsInProgress[0].phasesCompleted).toBe(2);
      expect(interrupted[0].sprintsInProgress[0].phasesTotal).toBe(3);
    });

    it('should identify files in progress', async () => { try {
      const epicState = createMockEpicState('epic-1', 'in-progress');
      epicState.sprints[0].phases[1].status = 'loop3-in-progress';
      epicState.sprints[0].phases[1].deliverables = ['file1.ts', 'file2.ts'];

      mockRedis.keys.mockResolvedValue(['cfn:epic:epic-1:heartbeat']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce('checkpoint-epic-1-1')
        .mockResolvedValueOnce(
          JSON.stringify({
            metadata: { timestamp: Date.now() - 600000, version: 1 },
            serialized: { data: JSON.stringify(epicState) },
          })
        )
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce(null);

      await detector.initialize();
      const interrupted = await detector.detectInterruptedExecutions();

      expect(interrupted[0].sprintsInProgress[0].filesInProgress).toContain('file1.ts');
      expect(interrupted[0].sprintsInProgress[0].filesInProgress).toContain('file2.ts');
    });
  });

  describe('recovery estimation', () => {
    it('should calculate accurate recovery time estimate', async () => { try {
      const epicState = createMockEpicState('epic-1', 'in-progress');
      // Sprint 1: 2 incomplete phases
      epicState.sprints[0].phases[0].status = 'completed';
      epicState.sprints[0].phases[1].status = 'loop3-in-progress';
      epicState.sprints[0].phases[2].status = 'pending';

      mockRedis.keys.mockResolvedValue(['cfn:epic:epic-1:heartbeat']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce('checkpoint-epic-1-1')
        .mockResolvedValueOnce(
          JSON.stringify({
            metadata: { timestamp: Date.now() - 600000, version: 1 },
            serialized: { data: JSON.stringify(epicState) },
          })
        )
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce(null);

      await detector.initialize();
      const interrupted = await detector.detectInterruptedExecutions();

      // 2 incomplete phases * 5 minutes = 10 minutes
      expect(interrupted[0].recoveryTimeEstimate).toBe(10);
    });

    it('should calculate accurate work loss percentage', async () => { try {
      const epicState = createMockEpicState('epic-1', 'in-progress');
      // Total: 3 phases, Completed: 1, In Progress: 1, Pending: 1
      epicState.sprints[0].phases[0].status = 'completed';
      epicState.sprints[0].phases[1].status = 'loop3-in-progress';
      epicState.sprints[0].phases[2].status = 'pending';

      mockRedis.keys.mockResolvedValue(['cfn:epic:epic-1:heartbeat']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce('checkpoint-epic-1-1')
        .mockResolvedValueOnce(
          JSON.stringify({
            metadata: { timestamp: Date.now() - 600000, version: 1 },
            serialized: { data: JSON.stringify(epicState) },
          })
        )
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce(null);

      await detector.initialize();
      const interrupted = await detector.detectInterruptedExecutions();

      // 1 in-progress phase / 3 total = 33.3%
      expect(interrupted[0].estimatedWorkLoss).toBeCloseTo(33.3, 1);
    });
  });

  describe('clean shutdown differentiation', () => {
    it('should detect clean shutdown via shutdown marker', async () => { try {
      const epicState = createMockEpicState('epic-1', 'in-progress');

      mockRedis.keys.mockResolvedValue(['cfn:epic:epic-1:heartbeat']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce('checkpoint-epic-1-1')
        .mockResolvedValueOnce(
          JSON.stringify({
            metadata: { timestamp: Date.now() - 600000, version: 1 },
            serialized: { data: JSON.stringify(epicState) },
          })
        )
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce('true'); // shutdown marker present

      await detector.initialize();
      const interrupted = await detector.detectInterruptedExecutions();

      expect(interrupted[0].isCleanShutdown).toBe(true);
    });

    it('should detect clean shutdown via completed status', async () => { try {
      const epicState = createMockEpicState('epic-1', 'completed');

      mockRedis.keys.mockResolvedValue(['cfn:epic:epic-1:heartbeat']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce('checkpoint-epic-1-1')
        .mockResolvedValueOnce(
          JSON.stringify({
            metadata: { timestamp: Date.now() - 600000, version: 1 },
            serialized: { data: JSON.stringify(epicState) },
          })
        )
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce(null);

      await detector.initialize();
      const interrupted = await detector.detectInterruptedExecutions();

      expect(interrupted[0].isCleanShutdown).toBe(true);
    });

    it('should detect clean shutdown via all sprints finished', async () => { try {
      const epicState = createMockEpicState('epic-1', 'in-progress');
      epicState.sprints[0].status = 'completed';
      epicState.sprints[0].phases.forEach((p) => (p.status = 'completed'));

      mockRedis.keys.mockResolvedValue(['cfn:epic:epic-1:heartbeat']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce('checkpoint-epic-1-1')
        .mockResolvedValueOnce(
          JSON.stringify({
            metadata: { timestamp: Date.now() - 600000, version: 1 },
            serialized: { data: JSON.stringify(epicState) },
          })
        )
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce(null);

      await detector.initialize();
      const interrupted = await detector.detectInterruptedExecutions();

      expect(interrupted[0].isCleanShutdown).toBe(true);
    });

    it('should detect crash (no clean shutdown indicators)', async () => { try {
      const epicState = createMockEpicState('epic-1', 'in-progress');

      mockRedis.keys.mockResolvedValue(['cfn:epic:epic-1:heartbeat']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce('checkpoint-epic-1-1')
        .mockResolvedValueOnce(
          JSON.stringify({
            metadata: { timestamp: Date.now() - 600000, version: 1 },
            serialized: { data: JSON.stringify(epicState) },
          })
        )
        .mockResolvedValueOnce(JSON.stringify({ timestamp: Date.now() - 600000 }))
        .mockResolvedValueOnce(null);

      await detector.initialize();
      const interrupted = await detector.detectInterruptedExecutions();

      expect(interrupted[0].isCleanShutdown).toBe(false);
    });
  });

  describe('statistics', () => {
    it('should track scan statistics', async () => { try {
      mockRedis.keys.mockResolvedValue(['cfn:epic:epic-1:heartbeat']);
      mockRedis.get.mockResolvedValue(JSON.stringify({ timestamp: Date.now() - 600000 }));

      await detector.initialize();
      await detector.detectInterruptedExecutions();

      const stats = detector.getStats();
      expect(stats.totalEpicsScanned).toBeGreaterThanOrEqual(0);
      expect(stats.scanDurationMs).toBeGreaterThan(0);
      expect(stats.redisKeysScanned).toBeGreaterThanOrEqual(0);
    });

    it('should differentiate interrupted and clean shutdowns', async () => { try {
      const now = Date.now();
      const staleTime = now - 600000;

      mockRedis.keys.mockResolvedValue(['cfn:epic:epic-1:heartbeat', 'cfn:epic:epic-2:heartbeat']);
      mockRedis.get
        // Epic 1: interrupted
        .mockResolvedValueOnce(JSON.stringify({ timestamp: staleTime }))
        .mockResolvedValueOnce('checkpoint-epic-1-1')
        .mockResolvedValueOnce(
          JSON.stringify({
            metadata: { timestamp: staleTime, version: 1 },
            serialized: { data: JSON.stringify(createMockEpicState('epic-1', 'in-progress')) },
          })
        )
        .mockResolvedValueOnce(JSON.stringify({ timestamp: staleTime }))
        .mockResolvedValueOnce(null)
        // Epic 2: clean shutdown
        .mockResolvedValueOnce(JSON.stringify({ timestamp: staleTime }))
        .mockResolvedValueOnce('checkpoint-epic-2-1')
        .mockResolvedValueOnce(
          JSON.stringify({
            metadata: { timestamp: staleTime, version: 1 },
            serialized: { data: JSON.stringify(createMockEpicState('epic-2', 'completed')) },
          })
        )
        .mockResolvedValueOnce(JSON.stringify({ timestamp: staleTime }))
        .mockResolvedValueOnce(null);

      await detector.initialize();
      await detector.detectInterruptedExecutions();

      const stats = detector.getStats();
      expect(stats.interruptedEpicsFound).toBe(1);
      expect(stats.cleanShutdownsFound).toBe(1);
    });
  });
});

// ===== HELPER FUNCTIONS =====

function createMockEpicState(epicId: string, status: EpicState['status']): EpicState {
  const now = Date.now();

  return {
    epicId,
    name: `Test Epic ${epicId}`,
    status,
    sprints: [
      {
        sprintId: 'sprint-1',
        name: 'Sprint 1',
        status: 'in-progress',
        phases: [
          createMockPhaseState('phase-1', 'completed'),
          createMockPhaseState('phase-2', 'loop3-in-progress'),
          createMockPhaseState('phase-3', 'pending'),
        ],
        startTime: now - 3600000,
        lastUpdateTime: now - 600000,
      },
    ],
    startTime: now - 7200000,
    lastUpdateTime: now - 600000,
  };
}

function createMockPhaseState(phaseId: string, status: PhaseState['status']): PhaseState {
  const now = Date.now();

  return {
    phaseId,
    name: `Phase ${phaseId}`,
    objective: `Test objective for ${phaseId}`,
    status,
    agents: [],
    deliverables: [],
    loop3Iterations: 0,
    loop2Iterations: 0,
    startTime: now - 1800000,
    lastUpdateTime: now - 600000,
  };
}
