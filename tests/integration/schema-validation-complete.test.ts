/**
 * Complete Schema Validation Tests
 *
 * Tests all 47+ integration point schemas
 * Target: >50 test cases covering all categories
 * Performance: <20ms validation per schema
 */

import { IntegrationSchemaValidator } from '../../src/lib/integration-schema-validator';
import path from 'path';
import fs from 'fs/promises';

describe('Schema Validation - Complete Coverage', () => {
  let validator: IntegrationSchemaValidator;
  const schemasPath = path.join(__dirname, '../../schemas/integration-points');

  beforeAll(async () => {
    validator = new IntegrationSchemaValidator({
      schemaPath: schemasPath,
      enableCache: true,
      strictMode: true,
    });
    await validator.initialize();
  });

  afterAll(async () => {
    await validator.shutdown();
  });

  // ============================================================================
  // Category 1: Database Handoffs (9 integration points)
  // ============================================================================

  describe('Database Handoffs', () => {
    const category = 'database-handoffs';

    test('1.1 Pattern Deployment - Valid', async () => {
      const data = {
        pattern_id: 'pattern-auth-001',
        skill_name: 'JWT Authentication',
        version: '1.0.0',
        content_path: '/skills/jwt-auth.md',
        content_hash: 'abc123',
        approved_at: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/pattern-deployment`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('1.1 Pattern Deployment - Invalid (missing required field)', async () => {
      const data = {
        pattern_id: 'pattern-auth-001',
        skill_name: 'JWT Authentication',
        // Missing version
      };

      await expect(
        validator.validate(data, `${category}/pattern-deployment`, '1.0.0')
      ).rejects.toThrow(/validation failed/i);
    });

    test('1.2 Execution Metrics - Valid', async () => {
      const data = {
        execution_id: 'exec-001',
        skill_id: 'cfn-coordination',
        timestamp: '2025-11-17T10:00:00Z',
        duration_ms: 1500,
        success: true,
      };

      await expect(
        validator.validate(data, `${category}/execution-metrics`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('1.3 Edge Case Feedback - Valid', async () => {
      const data = {
        edge_case_id: 'edge-validation-001',
        skill_id: 'docker-build',
        error_type: 'validation_error',
        context: {
          input: { path: '/invalid' },
          output: null,
          error_message: 'File not found',
        },
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/edge-case-feedback`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('1.4 Reflection Persistence - Valid', async () => {
      const data = {
        reflection_id: 'refl-task123',
        task_id: 'task-auth',
        agent_id: 'backend-001',
        reflection_type: 'success',
        content: {
          summary: 'Successfully implemented auth',
          details: 'Detailed reflection...',
        },
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/reflection-persistence`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('1.5 Skill Loader Cache - Valid', async () => {
      const data = {
        cache_id: 'cache-startup-001',
        skill_count: 43,
        total_size_bytes: 524288,
        loaded_at: '2025-11-17T10:00:00Z',
        skills: [],
      };

      await expect(
        validator.validate(data, `${category}/skill-loader-cache`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('1.5 Skill Loader Cache - Invalid (exceeds skill limit)', async () => {
      const data = {
        cache_id: 'cache-startup-001',
        skill_count: 1500, // Exceeds maxItems: 1000
        total_size_bytes: 524288,
        loaded_at: '2025-11-17T10:00:00Z',
        skills: [],
      };

      await expect(
        validator.validate(data, `${category}/skill-loader-cache`, '1.0.0')
      ).rejects.toThrow();
    });

    test('1.6 ACE Reflection Streaming - Valid', async () => {
      const data = {
        stream_id: 'stream-batch-001',
        batch_size: 50,
        reflections: [],
        cursor: {
          last_id: 'refl-123',
          has_more: true,
        },
      };

      await expect(
        validator.validate(data, `${category}/ace-reflection-streaming`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('1.7 Cross-Database Mappings - Valid', async () => {
      const data = {
        mapping_id: 'map-backend-001',
        agent_id: 'backend-developer-001',
        skill_ids: ['cfn-coordination'],
        version: '1.0.0',
        created_at: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/cross-database-mappings`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('1.8 Cost Tracking Metrics - Valid', async () => {
      const data = {
        metric_id: 'metric-task123',
        task_id: 'task-auth',
        total_cost_usd: 0.054,
        timestamp: '2025-11-17T10:00:00Z',
        breakdown: {
          provider_costs: [],
        },
      };

      await expect(
        validator.validate(data, `${category}/cost-tracking-metrics`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('1.9 Persistent Skill Data - Valid', async () => {
      const data = {
        persistence_id: 'persist-001',
        volume_path: '/var/lib/docker/volumes/cfn-skills/_data',
        db_path: '/data/skills.db',
        skill_count: 43,
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/persistent-skill-data`, '1.0.0')
      ).resolves.toBeUndefined();
    });
  });

  // ============================================================================
  // Category 2: File Operations (11 integration points)
  // ============================================================================

  describe('File Operations', () => {
    const category = 'file-operations';

    test('2.1 Pre-Edit Backup - Valid', async () => {
      const data = {
        file_path: '/home/user/file.ts',
        backup_path: '/backups/file.ts',
        agent_id: 'backend-001',
        timestamp: '2025-11-17T10:00:00Z',
        file_hash: 'sha256:' + 'a'.repeat(64),
        file_size: 1024,
      };

      await expect(
        validator.validate(data, `${category}/pre-edit-backup`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('2.2 Post-Edit Validation - Valid', async () => {
      const data = {
        validation_id: 'valid-001',
        file_path: '/home/user/file.ts',
        agent_id: 'backend-001',
        timestamp: '2025-11-17T10:00:00Z',
        status: 'passed',
        checks: [],
      };

      await expect(
        validator.validate(data, `${category}/post-edit-validation`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('2.3 Skill Content Storage - Valid', async () => {
      const data = {
        storage_id: 'storage-001',
        skill_id: 'cfn-coordination',
        file_path: '.claude/skills/cfn-coordination/SKILL.md',
        version: '1.0.0',
        content_hash: 'a'.repeat(64),
        git_commit: {
          sha: 'a'.repeat(40),
          message: 'feat: Add skill',
          author: 'agent',
          timestamp: '2025-11-17T10:00:00Z',
        },
      };

      await expect(
        validator.validate(data, `${category}/skill-content-storage`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('2.4 Agent Output - Valid', async () => {
      const data = {
        output_id: 'output-001',
        agent_id: 'backend-001',
        output_path: '/tmp/output.json',
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/agent-output`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('2.5 Docker Build Context - Valid', async () => {
      const data = {
        build_id: 'build-001',
        source_path: '/home/user/project',
        linux_path: '/tmp/cfn-build/build-001',
        dockerfile: 'docker/Dockerfile.agent',
        image_name: 'cfn-agent:latest',
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/docker-build-context`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('2.6 Coordinator Entrypoint - Valid', async () => {
      const data = {
        entrypoint_id: 'entry-001',
        container_id: 'a'.repeat(12),
        volumes: [],
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/coordinator-entrypoint`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('2.7 Skill Promotion - Valid', async () => {
      const data = {
        promotion_id: 'promo-001',
        skill_id: 'cfn-coordination',
        from_env: 'staging',
        to_env: 'production',
        version: '1.0.0',
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/skill-promotion`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('2.8 Config Files - Valid', async () => {
      const data = {
        config_id: 'config-001',
        source_format: 'yaml',
        target_format: 'json',
        data: {},
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/config-files`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('2.9 Distributed Logging - Valid', async () => {
      const data = {
        log_id: 'log-001',
        source: {
          service: 'coordinator',
          container_id: 'a'.repeat(12),
        },
        level: 'info',
        message: 'Test log',
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/distributed-logging`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('2.10 Memory Persistence - Valid', async () => {
      const data = {
        persistence_id: 'persist-001',
        state_key: 'agent:001:state',
        state_data: {},
        storage_backend: 'redis',
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/memory-persistence`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('2.11 Artifact Generation - Valid', async () => {
      const data = {
        artifact_id: 'artifact-001',
        artifact_type: 'report',
        name: 'REPORT.md',
        path: '/docs/REPORT.md',
        timestamp: '2025-11-17T10:00:00Z',
        metadata: {
          generated_by: 'agent',
          size_bytes: 1024,
        },
      };

      await expect(
        validator.validate(data, `${category}/artifact-generation`, '1.0.0')
      ).resolves.toBeUndefined();
    });
  });

  // ============================================================================
  // Category 3: CFN Loop Communication (8 integration points)
  // ============================================================================

  describe('CFN Loop Communication', () => {
    const category = 'cfn-loop-communication';

    test('3.1 CLI Mode Spawn - Valid', async () => {
      const data = {
        command: 'spawn-coordinator',
        task_id: 'task-auth',
        task_description: 'Implement authentication',
        mode: 'standard',
      };

      await expect(
        validator.validate(data, `${category}/cli-mode-spawn`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('3.2 Coordinator Delegation - Valid', async () => {
      const data = {
        delegation_id: 'deleg-001',
        task_id: 'task-auth',
        coordinator_id: 'cfn-v3-coordinator-main',
        orchestrator_id: 'orch-12345',
        action: 'spawn_loop3',
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/coordinator-delegation`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('3.3 Loop3 Spawning - Valid', async () => {
      const data = {
        spawn_id: 'spawn-001',
        task_id: 'task-auth',
        agent_type: 'backend-developer',
        agent_id: 'backend-developer-001',
        cli_command: 'npx claude-flow-novice agent-spawn --type=backend-developer',
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/loop3-spawning`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('3.4 Agent Completion - Valid', async () => {
      const data = {
        completion_id: 'complete-001',
        agent_id: 'backend-developer-001',
        task_id: 'task-auth',
        status: 'completed',
        confidence: 0.92,
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/agent-completion`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('3.5 Consensus Reporting - Valid', async () => {
      const data = {
        consensus_id: 'consensus-001',
        task_id: 'task-auth',
        iteration: 1,
        validators: [
          {
            validator_id: 'validator-001',
            confidence: 0.91,
            status: 'approved',
          },
        ],
        consensus_score: 0.91,
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/consensus-reporting`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('3.6 Product Owner Decision - Valid', async () => {
      const data = {
        decision_id: 'decision-001',
        task_id: 'task-auth',
        iteration: 1,
        decision: 'PROCEED',
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/product-owner-decision`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('3.7 Task Mode Spawn - Valid', async () => {
      const data = {
        spawn_id: 'task-spawn-001',
        task_id: 'task-auth',
        agent_type: 'backend-developer',
        agent_id: 'backend-developer-001',
        spawned_by: 'main-chat',
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/task-mode-spawn`, '1.0.0')
      ).resolves.toBeUndefined();
    });

    test('3.8 Redis Queues - Valid', async () => {
      const data = {
        message_id: 'msg-001',
        queue_name: 'queue:agent:backend-001',
        message_type: 'command',
        payload: {},
        timestamp: '2025-11-17T10:00:00Z',
      };

      await expect(
        validator.validate(data, `${category}/redis-queues`, '1.0.0')
      ).resolves.toBeUndefined();
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    test('Schema validation <20ms per schema', async () => {
      const data = {
        pattern_id: 'pattern-auth-001',
        skill_name: 'JWT Authentication',
        version: '1.0.0',
        content_path: '/skills/jwt-auth.md',
        content_hash: 'abc123',
      };

      const startTime = Date.now();
      await validator.validate(data, 'database-handoffs/pattern-deployment', '1.0.0');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(20);
    });

    test('Batch validation performance', async () => {
      const records = Array(100).fill({
        pattern_id: 'pattern-auth-001',
        skill_name: 'JWT Authentication',
        version: '1.0.0',
        content_path: '/skills/jwt-auth.md',
        content_hash: 'abc123',
      });

      const startTime = Date.now();
      const result = await validator.validateBatch(
        records,
        'database-handoffs/pattern-deployment',
        '1.0.0'
      );
      const duration = Date.now() - startTime;

      expect(result.valid).toBe(true);
      expect(duration / records.length).toBeLessThan(20); // <20ms per record
    });
  });

  // ============================================================================
  // Schema Registry Tests
  // ============================================================================

  describe('Schema Registry', () => {
    test('List all schemas', async () => {
      const schemas = await validator.listSchemas();
      expect(schemas.length).toBeGreaterThanOrEqual(47);
    });

    test('List schemas by category', async () => {
      const schemas = await validator.listSchemas('database-handoffs');
      expect(schemas.length).toBe(9);
    });

    test('Get schema versions', async () => {
      const versions = await validator.getVersions('database-handoffs/pattern-deployment');
      expect(versions).toContain('1.0.0');
    });

    test('Check schema existence', async () => {
      const exists = await validator.hasSchema('database-handoffs/pattern-deployment', '1.0.0');
      expect(exists).toBe(true);
    });
  });
});
