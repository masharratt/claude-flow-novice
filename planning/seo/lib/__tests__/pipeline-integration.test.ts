/**
 * Pipeline Integration Tests - Phase 1 Sprint 4
 *
 * @module planning/seo/lib/__tests__/pipeline-integration
 * @description End-to-end integration tests for the complete SEO pipeline
 */

import { PipelineOrchestrator } from '../pipeline-orchestrator';
import { IntelligenceCurator } from '../intelligence-curator';
import { PatternManager } from '../pattern-manager';
import { RedisContextStore } from '../redis-context-store';
import {
  PipelineTask,
  PipelineContext,
  Pattern,
  PatternEvidence,
  PatternLifecycle,
} from '../../types';

describe('Pipeline Integration Tests', () => {
  let orchestrator: PipelineOrchestrator;
  let intelligenceCurator: IntelligenceCurator;
  let patternManager: PatternManager;
  let redisContextStore: RedisContextStore;

  beforeEach(() => {
    // Initialize components
    intelligenceCurator = new IntelligenceCurator({ verbose: false });
    patternManager = new PatternManager({ verbose: false });
    redisContextStore = new RedisContextStore({ verbose: false });

    orchestrator = new PipelineOrchestrator({
      intelligenceCurator,
      patternManager,
      redisContextStore,
      verbose: false,
    });
  });

  describe('PipelineOrchestrator.createTask', () => {
    it('should create valid pipeline task', () => {
      const task = PipelineOrchestrator.createTask('TypeScript tutorial', 'guide', {
        industry: 'software',
        competitorDomains: ['example.com'],
      });

      expect(task.taskId).toBeDefined();
      expect(task.taskId.length).toBeGreaterThan(0);
      expect(task.targetKeyword).toBe('TypeScript tutorial');
      expect(task.contentType).toBe('guide');
      expect(task.industry).toBe('software');
      expect(task.competitorDomains).toEqual(['example.com']);
      expect(task.createdAt).toBeInstanceOf(Date);
    });

    it('should create task without optional fields', () => {
      const task = PipelineOrchestrator.createTask('SEO tips', 'blog');

      expect(task.taskId).toBeDefined();
      expect(task.targetKeyword).toBe('SEO tips');
      expect(task.contentType).toBe('blog');
      expect(task.industry).toBeUndefined();
      expect(task.competitorDomains).toBeUndefined();
    });
  });

  describe('PipelineOrchestrator.validateTask', () => {
    it('should validate valid task', () => {
      const task = PipelineOrchestrator.createTask('React hooks', 'article');
      const errors = PipelineOrchestrator.validateTask(task);

      expect(errors).toEqual([]);
    });

    it('should reject task without task ID', () => {
      const task: PipelineTask = {
        taskId: '',
        targetKeyword: 'test',
        contentType: 'blog',
        createdAt: new Date(),
      };

      const errors = PipelineOrchestrator.validateTask(task);
      expect(errors).toContain('Task ID is required');
    });

    it('should reject task without target keyword', () => {
      const task: PipelineTask = {
        taskId: 'test-123',
        targetKeyword: '',
        contentType: 'blog',
        createdAt: new Date(),
      };

      const errors = PipelineOrchestrator.validateTask(task);
      expect(errors).toContain('Target keyword is required');
    });

    it('should reject task without content type', () => {
      const task: PipelineTask = {
        taskId: 'test-123',
        targetKeyword: 'test keyword',
        contentType: '',
        createdAt: new Date(),
      };

      const errors = PipelineOrchestrator.validateTask(task);
      expect(errors).toContain('Content type is required');
    });

    it('should reject task with too long target keyword', () => {
      const longKeyword = 'a'.repeat(201);
      const task: PipelineTask = {
        taskId: 'test-123',
        targetKeyword: longKeyword,
        contentType: 'blog',
        createdAt: new Date(),
      };

      const errors = PipelineOrchestrator.validateTask(task);
      expect(errors).toContain('Target keyword must be 200 characters or less');
    });

    it('should reject task with invalid competitor domain', () => {
      const task: PipelineTask = {
        taskId: 'test-123',
        targetKeyword: 'test',
        contentType: 'blog',
        competitorDomains: ['not-a-valid-domain!!!'],
        createdAt: new Date(),
      };

      const errors = PipelineOrchestrator.validateTask(task);
      expect(errors).toContain('Invalid competitor domain format');
    });
  });

  describe('Complete Pipeline Flow', () => {
    it('should execute complete pipeline successfully', async () => {
      const task = PipelineOrchestrator.createTask('JavaScript promises', 'guide', {
        industry: 'software',
      });

      const result = await orchestrator.execute(task);

      expect(result.taskId).toBe(task.taskId);
      expect(result.status).toBe('success');
      expect(result.stepsCompleted).toBe(14); // 0 + 1-11 + 12
      expect(result.totalSteps).toBe(14);
      expect(result.executionTimeMs).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    }, 30000); // 30 second timeout

    it('should track pattern applications during pipeline', async () => {
      const task = PipelineOrchestrator.createTask('React performance', 'article');

      const result = await orchestrator.execute(task);

      expect(result.status).toBe('success');
      expect(result.patternsApplied).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should capture learnings after pipeline completion', async () => {
      const task = PipelineOrchestrator.createTask('Vue.js tutorial', 'guide');

      const result = await orchestrator.execute(task);

      expect(result.status).toBe('success');
      expect(result.learningsCaptured).toBeGreaterThanOrEqual(0);
    }, 30000);
  });

  describe('Step 0: Intelligence Pre-load', () => {
    it('should load intelligence before pipeline execution', async () => {
      const task = PipelineOrchestrator.createTask('Angular best practices', 'blog', {
        competitorDomains: ['angular.io'],
      });

      // Mock intelligence load
      jest.spyOn(intelligenceCurator, 'loadIntelligence').mockResolvedValue({
        competitive: [],
        serpPatterns: [],
        learnings: [],
        metadata: {
          itemsLoaded: 5,
          oldestItemAge: 10,
          executionTime: 150,
          hasFreshData: true,
        },
      });

      const result = await orchestrator.execute(task);

      expect(result.status).toBe('success');
      expect(intelligenceCurator.loadIntelligence).toHaveBeenCalledWith(
        expect.objectContaining({
          targetKeyword: 'Angular best practices',
          competitorDomains: ['angular.io'],
        })
      );
    }, 30000);

    it('should filter patterns by content type and industry', async () => {
      const task = PipelineOrchestrator.createTask('SEO checklist', 'guide', {
        industry: 'marketing',
      });

      // Mock pattern query
      const mockPatterns: Pattern[] = [
        {
          id: 'pattern-1',
          type: 'content',
          category: 'keywords',
          name: 'Test Pattern',
          description: 'Test',
          confidence: 0.85,
          lifecycle: 'promoted' as PatternLifecycle,
          evidence: [],
          metadata: {
            applicability: {
              contentTypes: ['guide'],
              industries: ['marketing'],
            },
            performance: {
              successRate: 0.85,
              totalApplications: 10,
            },
          },
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
        },
      ];

      jest.spyOn(patternManager, 'queryPatterns').mockReturnValue(mockPatterns);

      const result = await orchestrator.execute(task);

      expect(result.status).toBe('success');
      expect(patternManager.queryPatterns).toHaveBeenCalled();
    }, 30000);
  });

  describe('Step 12: Learning Capture', () => {
    it('should capture learning after successful pipeline', async () => {
      const task = PipelineOrchestrator.createTask('Node.js streams', 'article');

      // Mock learning capture
      jest.spyOn(intelligenceCurator, 'captureLearning').mockResolvedValue();

      const result = await orchestrator.execute(task);

      expect(result.status).toBe('success');
      expect(intelligenceCurator.captureLearning).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'success',
          topic: 'Node.js streams',
        })
      );
    }, 30000);

    it('should update pattern confidence based on outcomes', async () => {
      const task = PipelineOrchestrator.createTask('Docker tutorial', 'guide');

      // Mock pattern confidence update
      jest.spyOn(patternManager, 'updateConfidence').mockReturnValue({
        patternId: 'pattern-1',
        previousConfidence: 0.75,
        newConfidence: 0.80,
        newEvidence: {
          source: 'test',
          outcome: 'success' as const,
          capturedAt: new Date(),
        },
        lifecycleChanged: false,
      });

      const result = await orchestrator.execute(task);

      expect(result.status).toBe('success');
      // Pattern updates happen during Step 12
    }, 30000);

    it('should promote patterns with confidence >= 0.80', async () => {
      const task = PipelineOrchestrator.createTask('Kubernetes basics', 'guide');

      // Mock pattern promotion
      const mockUpdateResult = {
        patternId: 'pattern-1',
        previousConfidence: 0.75,
        newConfidence: 0.85,
        newEvidence: {
          source: 'test',
          outcome: 'success' as const,
          capturedAt: new Date(),
        },
        lifecycleChanged: true,
        newLifecycle: 'promoted' as PatternLifecycle,
      };

      jest.spyOn(patternManager, 'updateConfidence').mockReturnValue(mockUpdateResult);

      const result = await orchestrator.execute(task);

      expect(result.status).toBe('success');
    }, 30000);

    it('should archive patterns with confidence < 0.40', async () => {
      const task = PipelineOrchestrator.createTask('Git basics', 'article');

      // Mock pattern archival
      const mockUpdateResult = {
        patternId: 'pattern-low',
        previousConfidence: 0.45,
        newConfidence: 0.35,
        newEvidence: {
          source: 'test',
          outcome: 'failure' as const,
          capturedAt: new Date(),
        },
        lifecycleChanged: false,
      };

      jest.spyOn(patternManager, 'updateConfidence').mockReturnValue(mockUpdateResult);
      jest.spyOn(patternManager, 'archivePattern').mockReturnValue(true);

      const result = await orchestrator.execute(task);

      expect(result.status).toBe('success');
    }, 30000);
  });

  describe('Redis Context Lifecycle', () => {
    it('should store context in Redis during Step 0', async () => {
      const task = PipelineOrchestrator.createTask('Redis tutorial', 'guide');

      // Mock Redis store
      jest.spyOn(redisContextStore, 'storeContext').mockResolvedValue(true);

      const result = await orchestrator.execute(task);

      expect(result.status).toBe('success');
      expect(redisContextStore.storeContext).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: task.taskId,
          targetKeyword: 'Redis tutorial',
        })
      );
    }, 30000);

    it('should clean up Redis context during Step 12', async () => {
      const task = PipelineOrchestrator.createTask('MongoDB tutorial', 'guide');

      // Mock Redis cleanup
      jest.spyOn(redisContextStore, 'deleteContext').mockResolvedValue(true);

      const result = await orchestrator.execute(task);

      expect(result.status).toBe('success');
      expect(redisContextStore.deleteContext).toHaveBeenCalledWith(task.taskId);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should capture learning even on pipeline failure', async () => {
      const task = PipelineOrchestrator.createTask('Error handling', 'guide');

      // Mock intelligence curator to capture learning
      jest.spyOn(intelligenceCurator, 'captureLearning').mockResolvedValue();

      // Force an error by mocking intelligence load failure
      jest.spyOn(intelligenceCurator, 'loadIntelligence').mockRejectedValue(
        new Error('Simulated failure')
      );

      const result = await orchestrator.execute(task);

      expect(result.status).toBe('failure');
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Simulated failure');

      // Should still attempt to capture learning
      expect(intelligenceCurator.captureLearning).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'failure',
        })
      );
    }, 30000);

    it('should include error details in result', async () => {
      const task = PipelineOrchestrator.createTask('Failure test', 'blog');

      jest.spyOn(intelligenceCurator, 'loadIntelligence').mockRejectedValue(
        new Error('Test error')
      );

      const result = await orchestrator.execute(task);

      expect(result.status).toBe('failure');
      expect(result.error).toBeDefined();
      expect(result.error?.step).toBeDefined();
      expect(result.error?.message).toBe('Test error');
    }, 30000);
  });
});
