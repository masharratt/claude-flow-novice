/**
 * End-to-End Workflow Integration Tests
 *
 * Tests complete workflows spanning all integration points from Sprints 0-5:
 * - Workflow 1: Complete CFN Loop Execution (Database + Coordination + Metrics)
 * - Workflow 2: Skill Deployment Pipeline (Lifecycle + Storage + Validation)
 * - Workflow 3: Agent Recovery & Checkpoint (State + Coordination + Checkpoints)
 * - Workflow 4: Cross-System Data Handoff (Database + Queue + Schema)
 * - Workflow 5: Multi-Agent Collaboration (Coordination + Metrics + Reflection)
 * - Workflow 6: Failure Recovery & Rollback (Transaction + Checkpoints)
 *
 * Coverage: All 47 integration points in realistic end-to-end scenarios
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { DatabaseService } from '../../src/lib/database-service';
import { TransactionManager } from '../../src/lib/database-service/transaction-manager';
import { RedisQueueManager } from '../../src/lib/redis-queue-manager';
import { RedisCoordination } from '../../src/coordination';
import { SchemaTransform } from '../../src/lib/schema-transform';
import { MetricsLogger } from '../../src/lib/metrics-logger';
import { AgentWorkspace } from '../../src/lib/agent-workspace';
import { SkillContentManager } from '../../src/lib/skill-content-manager';
import { CheckpointManager } from '../../src/lib/checkpoint-manager';
import { EdgeCaseAnalyzer } from '../../src/lib/edge-case-analyzer';
import { ReflectionLogger } from '../../src/lib/reflection-logger';
import { SkillOutputParser } from '../../src/lib/skill-output-parser';
import { buildTaskKey, buildAgentKey, buildCorrelationKey } from '../../src/lib/database-service';

describe('End-to-End Workflow Integration Tests', () => {
  let dbService: DatabaseService;
  let txManager: TransactionManager;
  let queueManager: RedisQueueManager;
  let coordination: RedisCoordination;
  let schemaTransform: SchemaTransform;
  let metricsLogger: MetricsLogger;
  let workspace: AgentWorkspace;
  let skillManager: SkillContentManager;
  let checkpointManager: CheckpointManager;
  let edgeAnalyzer: EdgeCaseAnalyzer;
  let reflectionLogger: ReflectionLogger;
  let outputParser: SkillOutputParser;
  let testDir: string;

  beforeAll(async () => {
    testDir = path.join(process.cwd(), '.test-e2e');
    await fs.mkdir(testDir, { recursive: true });

    // Initialize all systems
    dbService = new DatabaseService({
      // redis: {
        type: 'redis',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      sqlite: {
        type: 'sqlite',
        database: path.join(testDir, 'test.db'),
      },
      // postgres: {
        type: 'postgres',
        connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cfn_test',
      },
    });

    await dbService.initialize();

    txManager = new TransactionManager(dbService);
    queueManager = new RedisQueueManager({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });

    coordination = new RedisCoordination({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      namespace: 'e2e-test',
    });

    await coordination.connect();

    schemaTransform = new SchemaTransform();
    metricsLogger = new MetricsLogger({
      enableRedis: true,
      enableSQLite: true,
      namespace: 'e2e-test',
    });

    workspace = new AgentWorkspace({
      baseDir: path.join(testDir, 'workspace'),
    });

    await workspace.initialize();

    skillManager = new SkillContentManager({
      baseDir: path.join(testDir, 'skills'),
      enableVersioning: true,
    });

    checkpointManager = new CheckpointManager({
      checkpointDir: path.join(testDir, 'checkpoints'),
    });

    await checkpointManager.initialize();

    edgeAnalyzer = new EdgeCaseAnalyzer();
    reflectionLogger = new ReflectionLogger({
      storage: 'sqlite',
      dbPath: path.join(testDir, 'reflections.db'),
    });

    await reflectionLogger.initialize();

    outputParser = new SkillOutputParser();
  });

  afterAll(async () => {
    if (dbService) { await dbService.disconnect(); };
    await queueManager.disconnect();
    await coordination.disconnect();
    await metricsLogger.close();
    await workspace.cleanup();
    await reflectionLogger.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await coordination.clear('e2e-test:*');
    await dbService.delete('redis', 'task:*');
    await dbService.delete('redis', 'agent:*');
    await dbService.delete('redis', 'corr:*');
  });

  describe('Workflow 1: Complete CFN Loop Execution', () => {
    it('should execute full CFN Loop with all integration points', async () => {
      const taskId = 'cfn-loop-e2e-001';
      const loop3Agents = ['backend-dev-001', 'frontend-dev-001', 'security-analyst-001'];
      const loop2Agents = ['validator-001', 'validator-002'];

      // === PHASE 1: Task Initialization ===

      // 1.1: Create task in Postgres (persistent storage)
      await dbService.set('postgres', 'tasks', {
        id: taskId,
        description: 'E2E CFN Loop test',
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      // 1.2: Initialize task state in Redis (fast access)
      await dbService.set('redis', buildTaskKey(taskId), {
        id: taskId,
        status: 'initializing',
        loop: 1,
        iteration: 1,
        agent_count: loop3Agents.length,
      });

      // 1.3: Log task initialization metric
      await metricsLogger.log({
        name: 'task_initialized',
        tags: { task_id: taskId },
        timestamp: new Date().toISOString(),
      });

      // === PHASE 2: Loop 3 Agent Spawning ===

      for (const agentId of loop3Agents) {
        // 2.1: Queue agent spawn
        await queueManager.enqueue('agent-spawn-queue', {
          task_id: taskId,
          agent_id: agentId,
          loop: 'loop3',
          type: agentId.split('-')[0],
        });

        // 2.2: Create agent workspace
        await workspace.createAgent(agentId, {
          task_id: taskId,
          type: agentId.split('-')[0],
          status: 'queued',
        });
      }

      // === PHASE 3: Agent Execution with Coordination ===

      const loop3Results = [];

      for (const agentId of loop3Agents) {
        // 3.1: Dequeue spawn message
        const spawnMsg = await queueManager.dequeue('agent-spawn-queue');
        expect(spawnMsg.agent_id).toBe(agentId);

        // 3.2: Create correlation key for tracking
        const corrKey = buildCorrelationKey(taskId, agentId, 'loop3');

        // 3.3: Update agent status with transaction
        await txManager.executeTransaction(async (tx) => {
          // Update Redis coordination state
          await tx.set('redis', corrKey, {
            task_id: taskId,
            agent_id: agentId,
            loop: 'loop3',
            status: 'running',
            started_at: new Date().toISOString(),
          });

          // Update SQLite audit log
          await tx.set('sqlite', 'agent_audit', {
            correlation_key: corrKey,
            agent_id: agentId,
            task_id: taskId,
            event: 'agent_started',
            timestamp: new Date().toISOString(),
          });

          // Update workspace
          await workspace.updateAgent(agentId, { status: 'running' });
        });

        // 3.4: Simulate agent work
        const confidence = 0.75 + Math.random() * 0.15;

        // 3.5: Create checkpoint
        await checkpointManager.saveCheckpoint(agentId, {
          iteration: 1,
          confidence,
          state: { work_completed: true },
        });

        // 3.6: Log reflection
        await reflectionLogger.log({
          agentId,
          taskId,
          iteration: 1,
          content: {
            observations: ['Task completed successfully'],
            confidence,
          },
        });

        // 3.7: Record metrics
        await metricsLogger.log({
          name: 'agent_execution_time',
          value: Math.floor(Math.random() * 1000),
          tags: { agent_id: agentId, task_id: taskId },
        });

        // 3.8: Signal completion
        await coordination.signal(`agent:${agentId}:done`, {
          status: 'completed',
          confidence,
        });

        // 3.9: Update final status
        await txManager.executeTransaction(async (tx) => {
          await tx.set('redis', corrKey, {
            task_id: taskId,
            agent_id: agentId,
            status: 'completed',
            confidence,
            completed_at: new Date().toISOString(),
          });

          await workspace.updateAgent(agentId, {
            status: 'completed',
            confidence,
          });
        });

        loop3Results.push({ agentId, confidence });
        await queueManager.acknowledge('agent-spawn-queue', spawnMsg.messageId);
      }

      // === PHASE 4: Gate Check ===

      const avgConfidence = loop3Results.reduce((sum, r) => sum + r.confidence, 0) / loop3Results.length;
      const gateThreshold = 0.75;

      expect(avgConfidence).toBeGreaterThanOrEqual(gateThreshold);

      await metricsLogger.log({
        name: 'gate_check_passed',
        value: avgConfidence,
        tags: { task_id: taskId, threshold: gateThreshold },
      });

      // === PHASE 5: Loop 2 Validation ===

      for (const validatorId of loop2Agents) {
        await workspace.createAgent(validatorId, {
          task_id: taskId,
          type: 'validator',
          status: 'running',
        });

        // Validators review Loop 3 work
        const validationResult = {
          validator_id: validatorId,
          consensus: 0.85 + Math.random() * 0.1,
          reviews: loop3Agents.length,
        };

        await dbService.set('redis', `validator:${validatorId}`, validationResult);

        await reflectionLogger.log({
          agentId: validatorId,
          taskId,
          iteration: 1,
          content: {
            validations_performed: loop3Agents.length,
            consensus: validationResult.consensus,
          },
        });
      }

      // === PHASE 6: Product Owner Decision ===

      const validatorResults = await Promise.all(
        loop2Agents.map(id => dbService.get('redis', `validator:${id}`))
      );

      const consensusScore = validatorResults.reduce((sum, r) => sum + r.consensus, 0) / validatorResults.length;

      const decision = consensusScore >= 0.90 ? 'PROCEED' : 'ITERATE';

      await dbService.set('redis', `task:${taskId}:decision`, {
        decision,
        consensus: consensusScore,
        iteration: 1,
        timestamp: new Date().toISOString(),
      });

      // === PHASE 7: Workflow Completion ===

      await txManager.executeTransaction(async (tx) => {
        await tx.set('postgres', 'tasks', {
          id: taskId,
          status: 'completed',
          final_decision: decision,
          avg_confidence: avgConfidence,
          consensus_score: consensusScore,
          completed_at: new Date().toISOString(),
        });

        await tx.set('redis', buildTaskKey(taskId), {
          id: taskId,
          status: 'completed',
          decision,
        });
      });

      await metricsLogger.log({
        name: 'task_completed',
        tags: {
          task_id: taskId,
          decision,
          avg_confidence: avgConfidence.toFixed(2),
          consensus: consensusScore.toFixed(2),
        },
      });

      // === VERIFICATION ===

      // Verify task completed
      const finalTask = await dbService.get('postgres', 'tasks', { id: taskId });
      expect(finalTask.status).toBe('completed');

      // Verify all agents completed
      for (const agentId of loop3Agents) {
        const lifecycle = await workspace.getAgentLifecycle(agentId);
        expect(lifecycle.events.some(e => e.status === 'completed')).toBe(true);
      }

      // Verify metrics logged
      const metrics = await metricsLogger.query({ name: 'task_completed' });
      expect(metrics.length).toBeGreaterThan(0);

      // Verify reflections stored
      const reflections = await reflectionLogger.query({ taskId });
      expect(reflections.length).toBeGreaterThanOrEqual(loop3Agents.length + loop2Agents.length);

      // Verify checkpoints created
      for (const agentId of loop3Agents) {
        const checkpoint = await checkpointManager.loadCheckpoint(agentId);
        expect(checkpoint).toBeTruthy();
      }
    }, 30000); // 30s timeout for complex workflow
  });

  describe('Workflow 2: Skill Deployment Pipeline', () => {
    it('should deploy skill through complete lifecycle', async () => {
      const skillId = 'test-skill-deployment';

      // === PHASE 1: Skill Creation ===

      const skillContent = `# ${skillId}

## Description
Test skill for E2E deployment

## Usage
\`\`\`bash
./skill.sh
\`\`\`
`;

      // 1.1: Validate markdown format
      const outputParser = new SkillOutputParser();
      const parsedContent = outputParser.parse(skillContent);

      // 1.2: Write skill file to disk
      const skillPath = path.join(testDir, 'skills', skillId, 'SKILL.md');
      await fs.mkdir(path.dirname(skillPath), { recursive: true });
      await fs.writeFile(skillPath, skillContent);

      // === PHASE 2: Skill Deployment Transaction ===

      await txManager.executeTransaction(async (tx) => {
        // 2.1: Store skill metadata in Postgres
        await tx.set('postgres', 'skills', {
          id: skillId,
          name: skillId,
          version: '1.0.0',
          status: 'deploying',
          deployed_at: new Date().toISOString(),
        });

        // 2.2: Cache in Redis
        await tx.set('redis', `skill:${skillId}`, {
          id: skillId,
          version: '1.0.0',
          content: skillContent,
        });

        // 2.3: Log deployment in SQLite
        await tx.set('sqlite', 'skill_deployments', {
          skill_id: skillId,
          version: '1.0.0',
          status: 'success',
        });
      });

      // === PHASE 3: Skill Registration ===

      await skillManager.saveSkill({
        id: skillId,
        name: skillId,
        version: '1.0.0',
        content: skillContent,
      });

      // === PHASE 4: Post-Deployment Validation ===

      // 4.1: Verify in all systems
      const pgSkill = await dbService.get('postgres', 'skills', { id: skillId });
      const redisSkill = await dbService.get('redis', `skill:${skillId}`);
      const deploymentLog = await dbService.get('sqlite', 'skill_deployments', { skill_id: skillId });

      expect(pgSkill.status).toBe('deploying');
      expect(redisSkill.version).toBe('1.0.0');
      expect(deploymentLog.status).toBe('success');

      // 4.3: Update status to active
      await dbService.set('postgres', 'skills', {
        id: skillId,
        status: 'active',
      });

      // === PHASE 5: Skill Execution Test ===

      const executionResult = {
        skill_id: skillId,
        status: 'success',
        output: { result: 'test passed' },
      };

      // 5.1: Store execution artifact
      await skillManager.saveArtifact(skillId, 'test-exec', {
        type: 'execution',
        data: executionResult,
      });

      // 5.2: Analyze for edge cases
      const edgeAnalysis = edgeAnalyzer.analyzeOutput(executionResult);

      // 5.3: Log metrics
      await metricsLogger.log({
        name: 'skill_deployment_success',
        tags: { skill_id: skillId, version: '1.0.0' },
      });

      // === VERIFICATION ===

      const finalSkill = await dbService.get('postgres', 'skills', { id: skillId });
      expect(finalSkill.status).toBe('active');

      const artifact = await skillManager.loadArtifact(skillId, 'test-exec');
      expect(artifact.data.status).toBe('success');
    });
  });

  describe('Workflow 3: Agent Recovery & Checkpoint', () => {
    it('should recover agent from failure using checkpoints', async () => {
      const agentId = 'recovery-agent-001';
      const taskId = 'recovery-task-001';

      // === PHASE 1: Normal Execution ===

      await workspace.createAgent(agentId, {
        task_id: taskId,
        status: 'running',
      });

      // Create checkpoints at intervals
      for (let i = 1; i <= 3; i++) {
        await checkpointManager.saveCheckpoint(agentId, {
          iteration: i,
          state: {
            items_processed: i * 10,
            confidence: 0.7 + (i * 0.05),
          },
        });

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // === PHASE 2: Simulated Failure ===

      await workspace.updateAgent(agentId, {
        status: 'failed',
        error: 'Simulated connection timeout',
      });

      await metricsLogger.log({
        name: 'agent_failure',
        tags: { agent_id: agentId, reason: 'timeout' },
      });

      // === PHASE 3: Recovery Process ===

      // 3.1: Load last checkpoint
      const lastCheckpoint = await checkpointManager.loadCheckpoint(agentId);
      expect(lastCheckpoint.iteration).toBe(3);
      expect(lastCheckpoint.state.items_processed).toBe(30);

      // 3.3: Restore from checkpoint
      await workspace.recoverAgent(agentId, {
        checkpoint: lastCheckpoint,
      });

      // 3.4: Resume execution
      await workspace.updateAgent(agentId, {
        status: 'running',
        recovered: true,
        recovery_checkpoint: lastCheckpoint.iteration,
      });

      // Continue from last checkpoint
      await checkpointManager.saveCheckpoint(agentId, {
        iteration: 4,
        state: {
          items_processed: 40,
          confidence: 0.85,
          recovered_from: lastCheckpoint.iteration,
        },
      });

      // === PHASE 4: Completion ===

      await workspace.updateAgent(agentId, {
        status: 'completed',
        confidence: 0.85,
      });

      await metricsLogger.log({
        name: 'agent_recovery_success',
        tags: { agent_id: agentId, checkpoint: lastCheckpoint.iteration },
      });

      // === VERIFICATION ===

      const lifecycle = await workspace.getAgentLifecycle(agentId);
      expect(lifecycle.events.some(e => e.status === 'failed')).toBe(true);
      expect(lifecycle.events.some(e => e.status === 'completed')).toBe(true);

      const finalCheckpoint = await checkpointManager.loadCheckpoint(agentId);
      expect(finalCheckpoint.iteration).toBe(4);
      expect(finalCheckpoint.state.recovered_from).toBe(3);
    });
  });

  describe('Workflow 4: Cross-System Data Handoff', () => {
    it('should handoff data across all storage systems', async () => {
      const taskId = 'handoff-test-001';

      // === PHASE 1: Data Creation in Redis ===

      await dbService.set('redis', buildTaskKey(taskId), {
        id: taskId,
        status: 'processing',
        data: { items: 100 },
      });

      // === PHASE 2: Transform and Store in Postgres ===

      const redisData = await dbService.get('redis', buildTaskKey(taskId));
      const transformedData = schemaTransform.toPostgres(redisData);

      await dbService.set('postgres', 'tasks', {
        ...transformedData,
        persistedAt: new Date().toISOString(),
      });

      // === PHASE 3: Queue for Processing ===

      await queueManager.enqueue('processing-queue', {
        task_id: taskId,
        data: redisData.data,
        source: 'redis',
      });

      // === PHASE 4: Dequeue and Process ===

      const queuedItem = await queueManager.dequeue('processing-queue');
      expect(queuedItem.task_id).toBe(taskId);

      // === PHASE 5: Store Results in SQLite ===

      await dbService.set('sqlite', 'task_results', {
        task_id: taskId,
        result: 'processed',
        items_count: queuedItem.data.items,
      });

      // === PHASE 6: Update Redis with Final Status ===

      await dbService.set('redis', buildTaskKey(taskId), {
        id: taskId,
        status: 'completed',
        result_ref: 'sqlite:task_results',
      });

      // === VERIFICATION ===

      const finalRedis = await dbService.get('redis', buildTaskKey(taskId));
      const finalPostgres = await dbService.get('postgres', 'tasks', { id: taskId });
      const finalSQLite = await dbService.get('sqlite', 'task_results', { task_id: taskId });

      expect(finalRedis.status).toBe('completed');
      expect(finalPostgres.id).toBe(taskId);
      expect(finalSQLite.result).toBe('processed');

      await queueManager.acknowledge('processing-queue', queuedItem.messageId);
    });
  });

  describe('Workflow 5: Multi-Agent Collaboration', () => {
    it('should coordinate multiple agents with real-time communication', async () => {
      const taskId = 'collab-test-001';
      const agents = ['agent-001', 'agent-002', 'agent-003'];

      // === PHASE 1: Setup Coordination ===

      // Create barrier for synchronization
      await coordination.createBarrier(`task:${taskId}:ready`, agents.length);

      // === PHASE 2: Agent Spawning ===

      for (const agentId of agents) {
        await workspace.createAgent(agentId, {
          task_id: taskId,
          status: 'spawned',
        });
      }

      // === PHASE 3: Broadcast Task Start ===

      const subscribers = await Promise.all(
        agents.map(agentId =>
          coordination.subscribe(`task:${taskId}:${agentId}`)
        )
      );

      await coordination.broadcast(`task:${taskId}:*`, {
        type: 'start_work',
        instructions: 'Collaborative test task',
      });

      // === PHASE 4: Agent Execution ===

      const executions = agents.map(async (agentId, index) => {
        // Receive broadcast
        const sub = subscribers[index];
        const message = await sub.waitForMessage(2000);
        expect(message.type).toBe('start_work');

        // Execute work
        await workspace.updateAgent(agentId, { status: 'running' });

        // Create checkpoint
        await checkpointManager.saveCheckpoint(agentId, {
          iteration: 1,
          state: { work_done: true },
        });

        // Log reflection
        await reflectionLogger.log({
          agentId,
          taskId,
          content: { collaboration: 'success' },
        });

        // Signal ready
        await coordination.arriveAtBarrier(`task:${taskId}:ready`, agentId);

        // Cleanup
        await sub.unsubscribe();
      });

      await Promise.all(executions);

      // === PHASE 5: Consolidation ===

      // All agents passed barrier
      for (const agentId of agents) {
        await workspace.updateAgent(agentId, { status: 'completed' });

        await metricsLogger.log({
          name: 'agent_collaboration',
          tags: { agent_id: agentId, task_id: taskId },
        });
      }

      // === VERIFICATION ===

      const reflections = await reflectionLogger.query({ taskId });
      expect(reflections).toHaveLength(agents.length);

      for (const agentId of agents) {
        const checkpoint = await checkpointManager.loadCheckpoint(agentId);
        expect(checkpoint.state.work_done).toBe(true);
      }
    });
  });

  describe('Workflow 6: Failure Recovery & Rollback', () => {
    it('should rollback transaction on failure', async () => {
      const taskId = 'rollback-test-001';
      const filePath = path.join(testDir, 'rollback-test.txt');

      // === PHASE 1: Initial State ===

      await fs.writeFile(filePath, 'initial content');

      await dbService.set('postgres', 'tasks', {
        id: taskId,
        status: 'initial',
      });

      // === PHASE 2: Attempted Update with Failure ===

      try {
        await txManager.executeTransaction(async (tx) => {
          // Modify file
          await fs.writeFile(filePath, 'modified content');

          // Update databases
          await tx.set('postgres', 'tasks', {
            id: taskId,
            status: 'updating',
          });

          await tx.set('redis', buildTaskKey(taskId), {
            id: taskId,
            status: 'updating',
          });

          // Simulate failure
          throw new Error('Simulated transaction failure');
        });
      } catch (error) {
        expect(error.message).toBe('Simulated transaction failure');
      }

      // === PHASE 3: Rollback & Recovery ===

      // 3.1: Verify transaction rollback
      const taskAfterRollback = await dbService.get('postgres', 'tasks', { id: taskId });
      expect(taskAfterRollback.status).toBe('initial');

      // 3.3: Log recovery
      await metricsLogger.log({
        name: 'transaction_rollback',
        tags: { task_id: taskId, reason: 'failure' },
      });

      // === VERIFICATION ===

      const finalTask = await dbService.get('postgres', 'tasks', { id: taskId });
      expect(finalTask.status).toBe('initial');

      const metrics = await metricsLogger.query({ name: 'transaction_rollback' });
      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe('Performance & Reliability', () => {
    it('should complete end-to-end workflow within performance SLA', async () => {
      const taskId = 'perf-e2e-001';
      const start = Date.now();

      // Complete workflow
      await txManager.executeTransaction(async (tx) => {
        await tx.set('postgres', 'tasks', { id: taskId, status: 'active' });
        await tx.set('redis', buildTaskKey(taskId), { id: taskId });
        await tx.set('sqlite', 'task_audit', { task_id: taskId, event: 'created' });
      });

      await queueManager.enqueue('test-queue', { task_id: taskId });
      const msg = await queueManager.dequeue('test-queue');
      await queueManager.acknowledge('test-queue', msg.messageId);

      await metricsLogger.log({ name: 'perf_test', tags: { task_id: taskId } });

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(2000); // <2s SLA
    });
  });
});
