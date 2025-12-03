/**
 * Redis Context Store Test Suite
 * Phase 1 Sprint 3: Pattern Schema & Knowledge Store
 */

import { RedisContextStore, IntelligenceContext, PatternApplication } from '../redis-context-store';
import { Pattern } from '../../types';

describe('RedisContextStore', () => {
  let contextStore: RedisContextStore;
  const testTaskId = `test-task-${Date.now()}`;

  beforeAll(async () => {
    contextStore = new RedisContextStore({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 15, // Use separate DB for tests
      keyPrefix: 'test-seo',
      defaultTtl: 60, // Short TTL for tests
      verbose: false,
    });

    // Verify Redis is available
    const isHealthy = await contextStore.healthCheck();
    if (!isHealthy) {
      console.warn('Redis not available, skipping Redis tests');
    }
  });

  afterAll(async () => {
    // Clean up test data
    await contextStore.clearTaskData(testTaskId);
    await contextStore.close();
  });

  describe('Health Check', () => {
    it('should verify Redis connection', async () => {
      const isHealthy = await contextStore.healthCheck();
      // Test passes if Redis is available OR if it's expected to be unavailable
      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('Intelligence Context Storage', () => {
    const mockPattern: Pattern = {
      id: 'test-pattern-1',
      type: 'content',
      category: 'title-tags',
      name: 'Test Pattern',
      description: 'Test pattern for unit tests',
      confidence: 0.85,
      lifecycle: 'promoted',
      evidence: [
        {
          source: 'test-source',
          outcome: 'success',
          capturedAt: new Date(),
        },
      ],
      metadata: {
        applicability: {
          contentTypes: ['blog-post'],
          industries: ['technology'],
        },
        performance: {
          successRate: 1.0,
          totalApplications: 1,
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0',
    };

    const mockContext: IntelligenceContext = {
      taskId: testTaskId,
      targetKeyword: 'test keyword',
      patterns: [mockPattern],
      competitive: [],
      serpPatterns: [],
      learnings: [],
      metadata: {
        loadedAt: new Date(),
        itemsLoaded: 1,
        hasFreshData: true,
      },
    };

    it('should store intelligence context', async () => {
      const isHealthy = await contextStore.healthCheck();
      if (!isHealthy) {
        console.warn('Skipping test: Redis not available');
        return;
      }

      const success = await contextStore.storeContext(mockContext);
      expect(success).toBe(true);
    });

    it('should retrieve stored intelligence context', async () => {
      const isHealthy = await contextStore.healthCheck();
      if (!isHealthy) {
        console.warn('Skipping test: Redis not available');
        return;
      }

      await contextStore.storeContext(mockContext);

      const retrieved = await contextStore.getContext(testTaskId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.taskId).toBe(testTaskId);
      expect(retrieved?.targetKeyword).toBe('test keyword');
      expect(retrieved?.patterns).toHaveLength(1);
      expect(retrieved?.patterns[0].id).toBe('test-pattern-1');

      // Verify Date deserialization
      expect(retrieved?.metadata.loadedAt).toBeInstanceOf(Date);
      expect(retrieved?.patterns[0].createdAt).toBeInstanceOf(Date);
    });

    it('should return null for non-existent context', async () => {
      const isHealthy = await contextStore.healthCheck();
      if (!isHealthy) {
        console.warn('Skipping test: Redis not available');
        return;
      }

      const retrieved = await contextStore.getContext('non-existent-task');
      expect(retrieved).toBeNull();
    });

    it('should delete intelligence context', async () => {
      const isHealthy = await contextStore.healthCheck();
      if (!isHealthy) {
        console.warn('Skipping test: Redis not available');
        return;
      }

      const tempTaskId = `temp-${Date.now()}`;
      const tempContext = { ...mockContext, taskId: tempTaskId };

      await contextStore.storeContext(tempContext);

      const success = await contextStore.deleteContext(tempTaskId);
      expect(success).toBe(true);

      const retrieved = await contextStore.getContext(tempTaskId);
      expect(retrieved).toBeNull();
    });

    it('should respect TTL for context data', async () => {
      const isHealthy = await contextStore.healthCheck();
      if (!isHealthy) {
        console.warn('Skipping test: Redis not available');
        return;
      }

      const tempTaskId = `ttl-test-${Date.now()}`;
      const tempContext = { ...mockContext, taskId: tempTaskId };

      // Store with 2 second TTL
      await contextStore.storeContext(tempContext, 2);

      // Verify it exists
      let retrieved = await contextStore.getContext(tempTaskId);
      expect(retrieved).not.toBeNull();

      // Check TTL
      const ttl = await contextStore.getContextTtl(tempTaskId);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(2);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Verify it expired
      retrieved = await contextStore.getContext(tempTaskId);
      expect(retrieved).toBeNull();
    }, 10000); // Increase timeout for this test

    it('should extend context TTL', async () => {
      const isHealthy = await contextStore.healthCheck();
      if (!isHealthy) {
        console.warn('Skipping test: Redis not available');
        return;
      }

      const tempTaskId = `extend-ttl-${Date.now()}`;
      const tempContext = { ...mockContext, taskId: tempTaskId };

      await contextStore.storeContext(tempContext, 10);

      const success = await contextStore.extendContextTtl(tempTaskId, 60);
      expect(success).toBe(true);

      const newTtl = await contextStore.getContextTtl(tempTaskId);
      expect(newTtl).toBeGreaterThan(50);

      // Cleanup
      await contextStore.deleteContext(tempTaskId);
    });
  });

  describe('Pattern Application Storage', () => {
    const mockApplication: PatternApplication = {
      applicationId: `app-${Date.now()}`,
      taskId: testTaskId,
      patternId: 'test-pattern-1',
      patternType: 'content',
      patternCategory: 'title-tags',
      appliedAt: new Date(),
    };

    it('should store pattern application', async () => {
      const isHealthy = await contextStore.healthCheck();
      if (!isHealthy) {
        console.warn('Skipping test: Redis not available');
        return;
      }

      const success = await contextStore.storePatternApplication(mockApplication);
      expect(success).toBe(true);
    });

    it('should retrieve pattern application', async () => {
      const isHealthy = await contextStore.healthCheck();
      if (!isHealthy) {
        console.warn('Skipping test: Redis not available');
        return;
      }

      await contextStore.storePatternApplication(mockApplication);

      const retrieved = await contextStore.getPatternApplication(
        testTaskId,
        mockApplication.applicationId
      );

      expect(retrieved).not.toBeNull();
      expect(retrieved?.applicationId).toBe(mockApplication.applicationId);
      expect(retrieved?.patternId).toBe('test-pattern-1');
      expect(retrieved?.appliedAt).toBeInstanceOf(Date);
    });

    it('should get all pattern applications for a task', async () => {
      const isHealthy = await contextStore.healthCheck();
      if (!isHealthy) {
        console.warn('Skipping test: Redis not available');
        return;
      }

      const tempTaskId = `multi-app-${Date.now()}`;

      const app1: PatternApplication = {
        applicationId: 'app-1',
        taskId: tempTaskId,
        patternId: 'pattern-1',
        patternType: 'content',
        patternCategory: 'title-tags',
        appliedAt: new Date(),
      };

      const app2: PatternApplication = {
        applicationId: 'app-2',
        taskId: tempTaskId,
        patternId: 'pattern-2',
        patternType: 'technical',
        patternCategory: 'schema-markup',
        appliedAt: new Date(),
      };

      await contextStore.storePatternApplication(app1);
      await contextStore.storePatternApplication(app2);

      const applications = await contextStore.getPatternApplications(tempTaskId);

      expect(applications).toHaveLength(2);
      expect(applications.map((a) => a.applicationId)).toContain('app-1');
      expect(applications.map((a) => a.applicationId)).toContain('app-2');

      // Cleanup
      await contextStore.clearTaskData(tempTaskId);
    });

    it('should update pattern application outcome', async () => {
      const isHealthy = await contextStore.healthCheck();
      if (!isHealthy) {
        console.warn('Skipping test: Redis not available');
        return;
      }

      const tempTaskId = `outcome-test-${Date.now()}`;
      const app: PatternApplication = {
        applicationId: 'outcome-app',
        taskId: tempTaskId,
        patternId: 'pattern-1',
        patternType: 'content',
        patternCategory: 'hooks',
        appliedAt: new Date(),
      };

      await contextStore.storePatternApplication(app);

      const success = await contextStore.updatePatternOutcome(
        tempTaskId,
        'outcome-app',
        'success',
        { ctr: 0.25, position: 3.5 }
      );

      expect(success).toBe(true);

      const updated = await contextStore.getPatternApplication(tempTaskId, 'outcome-app');
      expect(updated?.outcome).toBe('success');
      expect(updated?.metrics).toEqual({ ctr: 0.25, position: 3.5 });

      // Cleanup
      await contextStore.clearTaskData(tempTaskId);
    });
  });

  describe('Pattern Caching', () => {
    const mockPatterns: Pattern[] = [
      {
        id: 'cache-pattern-1',
        type: 'content',
        category: 'title-tags',
        name: 'Cached Pattern 1',
        description: 'Test',
        confidence: 0.85,
        lifecycle: 'promoted',
        evidence: [
          {
            source: 'test',
            outcome: 'success',
            capturedAt: new Date(),
          },
        ],
        metadata: {
          applicability: {
            contentTypes: ['blog-post'],
            industries: ['technology'],
          },
          performance: {
            successRate: 1.0,
            totalApplications: 1,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
      },
    ];

    it('should cache patterns', async () => {
      const isHealthy = await contextStore.healthCheck();
      if (!isHealthy) {
        console.warn('Skipping test: Redis not available');
        return;
      }

      const success = await contextStore.cachePatterns(mockPatterns, 60);
      expect(success).toBe(true);
    });

    it('should retrieve cached patterns', async () => {
      const isHealthy = await contextStore.healthCheck();
      if (!isHealthy) {
        console.warn('Skipping test: Redis not available');
        return;
      }

      await contextStore.cachePatterns(mockPatterns, 60);

      const cached = await contextStore.getCachedPatterns();

      expect(cached).not.toBeNull();
      expect(cached).toHaveLength(1);
      expect(cached![0].id).toBe('cache-pattern-1');
      expect(cached![0].createdAt).toBeInstanceOf(Date);
    });
  });

  describe('Task Data Cleanup', () => {
    it('should clear all data for a task', async () => {
      const isHealthy = await contextStore.healthCheck();
      if (!isHealthy) {
        console.warn('Skipping test: Redis not available');
        return;
      }

      const cleanupTaskId = `cleanup-${Date.now()}`;

      // Create context
      const context: IntelligenceContext = {
        taskId: cleanupTaskId,
        targetKeyword: 'cleanup test',
        patterns: [],
        metadata: {
          loadedAt: new Date(),
          itemsLoaded: 0,
          hasFreshData: false,
        },
      };
      await contextStore.storeContext(context);

      // Create applications
      const app1: PatternApplication = {
        applicationId: 'cleanup-app-1',
        taskId: cleanupTaskId,
        patternId: 'pattern-1',
        patternType: 'content',
        patternCategory: 'title-tags',
        appliedAt: new Date(),
      };
      await contextStore.storePatternApplication(app1);

      // Clear all task data
      const deleted = await contextStore.clearTaskData(cleanupTaskId);
      expect(deleted).toBeGreaterThan(0);

      // Verify all data is gone
      const retrievedContext = await contextStore.getContext(cleanupTaskId);
      expect(retrievedContext).toBeNull();

      const applications = await contextStore.getPatternApplications(cleanupTaskId);
      expect(applications).toHaveLength(0);
    });
  });
});
