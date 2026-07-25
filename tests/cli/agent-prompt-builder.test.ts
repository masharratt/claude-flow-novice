/**
 * Agent Prompt Builder - Comprehensive Test Suite
 *
 * Tests for src/cli/agent-prompt-builder.ts covering:
 * - Prompt template construction
 * - Context injection (epic, phase, success criteria)
 * - Parameter substitution
 * - Agent-specific customization
 * - Pre-edit backup injection
 * - Post-edit validation injection
 * - Error handling for missing context
 * - CLI Mode protocol generation
 * - Environment context building
 * - Skills injection (Phase 5)
 * - Iteration history integration
 * - JSON context enrichment
 *
 * Target Coverage: ≥80%
 *
 * @version 1.0.0
 * @priority P1 HIGH
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';

// Mock dependencies
jest.mock('child_process');
jest.mock('../../src/cli/agent-definition-parser', () => ({
  hasCFNLoopProtocol: jest.fn(() => true),
}));
jest.mock('../../src/cli/iteration-history', () => ({
  loadIterationHistory: jest.fn(async () => []),
  formatIterationHistory: jest.fn(() => '## Previous Iterations\n\nNo history available.'),
}));
jest.mock('../../src/cli/skill-loader', () => ({
  SkillLoader: jest.fn().mockImplementation(() => ({
    loadSkillsForAgent: jest.fn(async () => []),
    logSkillUsage: jest.fn(async () => {}),
    close: jest.fn(),
  })),
}));

// Import modules after mocking
import {
  buildAgentPrompt,
  getAgentId,
  buildSystemPrompt,
  TaskContext,
} from '../../src/cli/agent-prompt-builder';
import { AgentDefinition } from '../../src/cli/agent-definition-parser';
import { loadIterationHistory, formatIterationHistory } from '../../src/cli/iteration-history';
import { SkillLoader } from '../../src/cli/skill-loader';

// Test fixtures
const mockAgentDefinition: AgentDefinition = {
  name: 'backend-developer',
  description: 'Backend development specialist',
  tools: ['Bash', 'Edit', 'Read', 'Write'],
  model: 'sonnet',
  type: 'developer',
  content: '## Core Responsibilities\n\n- Write clean, maintainable code\n- Follow TDD practices',
  filePath: '/test/agents/backend-developer.md',
  color: 'blue',
  acl_level: 5,
};

const mockTaskContext: TaskContext = {
  taskId: 'test-task-123',
  iteration: 1,
  context: 'Implement JWT authentication',
  mode: 'standard',
  priority: 1,
  agentId: 'backend-developer-1',
};

describe('Agent Prompt Builder - Core Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    delete process.env.CFN_SKILLS_DATABASE;
    delete process.env.DOCKER_AGENT;
    delete process.env.WORKSPACE_ROOT;
  });

  describe('buildAgentPrompt', () => {
    test('should build basic prompt with all required sections', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      // Verify core sections
      expect(prompt).toContain('# Agent: backend-developer');
      expect(prompt).toContain('Backend development specialist');
      expect(prompt).toContain('## Task');
      expect(prompt).toContain('Implement JWT authentication');
      expect(prompt).toContain('## Agent Definition');
      expect(prompt).toContain('## CLI Mode Redis Completion Protocol');
      expect(prompt).toContain('## Execution Instructions');
      expect(prompt).toContain('## Pre-Edit Backup Protocol (MANDATORY)');
      expect(prompt).toContain('## Available Tools');
    });

    test('should inject task metadata correctly', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('**Task ID:** test-task-123');
      expect(prompt).toContain('**Iteration:** 1');
      expect(prompt).toContain('**Mode:** standard');
      expect(prompt).toContain('**Priority:** 1');
    });

    test('should handle missing optional context fields', async () => {
      const minimalContext: TaskContext = {
        taskId: 'minimal-task',
        iteration: 1,
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, minimalContext);

      expect(prompt).toContain('Execute task as backend-developer agent');
      expect(prompt).toContain('**Task ID:** minimal-task');
      expect(prompt).not.toContain('**Mode:**');
      expect(prompt).not.toContain('**Priority:**');
    });

    test('should include CLI Mode protocol when taskId is present', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('## CLI Mode Redis Completion Protocol');
      expect(prompt).toContain('redis-cli BLPOP');
      expect(prompt).toContain('TASK_ID=test-task-123');
      expect(prompt).toContain('agentId: \'backend-developer-1\'');
      expect(prompt).toContain('cfn:cli:');
    expect(prompt).toContain(':completion');
    });

    test('should omit CLI Mode protocol when taskId is missing', async () => {
      const contextWithoutTaskId: TaskContext = {
        iteration: 1,
        context: 'Simple task',
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, contextWithoutTaskId);

      expect(prompt).not.toContain('## CLI Mode Redis Completion Protocol');
      expect(prompt).not.toContain('redis-cli BLPOP');
    });

    test('should inject agent-specific tools list', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('## Available Tools');
      expect(prompt).toContain('Bash, Edit, Read, Write');
    });

    test('should include pre-edit backup protocol with agent ID', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('## Pre-Edit Backup Protocol (MANDATORY)');
      expect(prompt).toContain('cfn-invoke-pre-edit.sh');
      expect(prompt).toContain('--agent-id "backend-developer-1"');
      expect(prompt).toContain('cfn-invoke-post-edit.sh');
    });
  });

  describe('Context Enrichment - Shell Variable Parsing', () => {
    test('should parse shell variable format with WORKSPACE', async () => {
      const shellContext: TaskContext = {
        taskId: 'shell-task',
        iteration: 1,
        context: "WORKSPACE='/tmp/cfn-cli-real-test-123' MODE='standard' MAX_ITERATIONS='5'",
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, shellContext);

      expect(prompt).toContain('**Working Directory:** /tmp/cfn-cli-real-test-123');
      expect(prompt).toContain('**Task ID:** shell-task');
      expect(prompt).toContain('**Iteration:** 1');
    });

    test('should handle shell variable format with single quotes', async () => {
      const shellContext: TaskContext = {
        taskId: 'shell-quotes',
        iteration: 1,
        context: "WORKSPACE='/tmp/test' MODE='standard'",
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, shellContext);

      expect(prompt).toContain('**Working Directory:** /tmp/test');
    });

    test('should parse multiple shell variables correctly', async () => {
      const shellContext: TaskContext = {
        taskId: 'multi-var',
        iteration: 1,
        context: "WORKSPACE='/tmp/workspace' MODE='enterprise' MAX_ITERATIONS='15' TASK_TYPE='feature'",
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, shellContext);

      expect(prompt).toContain('**Working Directory:** /tmp/workspace');
    });

    test('should handle empty shell variable values', async () => {
      const shellContext: TaskContext = {
        taskId: 'empty-var',
        iteration: 1,
        context: "WORKSPACE='' MODE='standard'",
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, shellContext);

      // Empty WORKSPACE should not create a Working Directory section
      expect(prompt).not.toContain('**Working Directory:**');
    });

    test('should prioritize shell variable parsing over JSON when equals sign present', async () => {
      const shellContext: TaskContext = {
        taskId: 'format-priority',
        iteration: 1,
        context: "WORKSPACE='/tmp/test' MODE='standard'",
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, shellContext);

      // Should parse as shell variables, not fail as invalid JSON
      expect(prompt).toContain('**Working Directory:** /tmp/test');
    });

    test('should handle shell variables with special characters in paths', async () => {
      const shellContext: TaskContext = {
        taskId: 'special-chars',
        iteration: 1,
        context: "WORKSPACE='/tmp/cfn-test-123/my-workspace' MODE='standard'",
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, shellContext);

      expect(prompt).toContain('**Working Directory:** /tmp/cfn-test-123/my-workspace');
    });

    test('should be backward compatible with existing JSON format', async () => {
      const jsonContext: TaskContext = {
        taskId: 'backward-compat',
        iteration: 1,
        context: JSON.stringify({
          directory: '/existing/directory',
        }),
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, jsonContext);

      // Should still work with existing 'directory' key
      expect(prompt).toContain('**Working Directory:** /existing/directory');
    });

    test('should support both WORKSPACE and directory in JSON', async () => {
      const workspaceContext: TaskContext = {
        taskId: 'workspace-key',
        iteration: 1,
        context: JSON.stringify({
          WORKSPACE: '/tmp/workspace',
        }),
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, workspaceContext);

      expect(prompt).toContain('**Working Directory:** /tmp/workspace');
    });

    test('should prefer directory over WORKSPACE when both present in JSON', async () => {
      const bothContext: TaskContext = {
        taskId: 'both-keys',
        iteration: 1,
        context: JSON.stringify({
          directory: '/preferred/directory',
          WORKSPACE: '/fallback/workspace',
        }),
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, bothContext);

      // Should prefer 'directory' key (first in OR condition)
      expect(prompt).toContain('**Working Directory:** /preferred/directory');
    });
  });

  describe('Context Enrichment - JSON Parsing', () => {
    test('should parse and enrich JSON context with files', async () => {
      const jsonContext: TaskContext = {
        taskId: 'json-task',
        iteration: 1,
        context: JSON.stringify({
          task: 'Refactor authentication module',
          files: 'src/auth.ts, src/jwt.ts, tests/auth.test.ts',
          requirements: ['Add refresh token support', 'Implement rate limiting'],
          deliverables: ['Updated auth.ts', 'Test suite'],
        }),
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, jsonContext);

      expect(prompt).toContain('**Task:** Refactor authentication module');
      expect(prompt).toContain('**Files to process:**');
      expect(prompt).toContain('- src/auth.ts');
      expect(prompt).toContain('- src/jwt.ts');
      expect(prompt).toContain('- tests/auth.test.ts');
      expect(prompt).toContain('**Requirements:**');
      expect(prompt).toContain('1. Add refresh token support');
      expect(prompt).toContain('2. Implement rate limiting');
      expect(prompt).toContain('**Deliverables:**');
      expect(prompt).toContain('- Updated auth.ts');
      expect(prompt).toContain('- Test suite');
    });

    test('should handle JSON context with array-based files', async () => {
      const jsonContext: TaskContext = {
        taskId: 'array-files',
        iteration: 1,
        context: JSON.stringify({
          task: 'Update components',
          files: ['Button.tsx', 'Input.tsx', 'Form.tsx'],
        }),
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, jsonContext);

      expect(prompt).toContain('- Button.tsx');
      expect(prompt).toContain('- Input.tsx');
      expect(prompt).toContain('- Form.tsx');
    });

    test('should handle JSON context with acceptance criteria', async () => {
      const jsonContext: TaskContext = {
        taskId: 'criteria-task',
        iteration: 1,
        context: JSON.stringify({
          task: 'Implement feature',
          acceptanceCriteria: [
            'All tests pass',
            'Code coverage ≥80%',
            'No security vulnerabilities',
          ],
        }),
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, jsonContext);

      expect(prompt).toContain('**Acceptance Criteria:**');
      expect(prompt).toContain('- All tests pass');
      expect(prompt).toContain('- Code coverage ≥80%');
      expect(prompt).toContain('- No security vulnerabilities');
    });

    test('should handle invalid JSON gracefully', async () => {
      const invalidJsonContext: TaskContext = {
        taskId: 'invalid-json',
        iteration: 1,
        context: '{ invalid json: this is not valid }',
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, invalidJsonContext);

      // Should treat as plain text
      expect(prompt).toContain('{ invalid json: this is not valid }');
    });

    test('should handle plain text context', async () => {
      const plainContext: TaskContext = {
        taskId: 'plain-task',
        iteration: 1,
        context: 'This is a simple plain text instruction',
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, plainContext);

      expect(prompt).toContain('This is a simple plain text instruction');
    });

    test('should enrich JSON with batch and directory information', async () => {
      const jsonContext: TaskContext = {
        taskId: 'batch-task',
        iteration: 1,
        context: JSON.stringify({
          task: 'Process batch',
          batch: 'batch-1-of-5',
          directory: '/workspace/src/components',
          files: ['file1.ts', 'file2.ts'],
        }),
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, jsonContext);

      expect(prompt).toContain('**Batch:** batch-1-of-5');
      expect(prompt).toContain('**Working Directory:** /workspace/src/components');
    });

    test('should add processing instruction for structured tasks', async () => {
      const jsonContext: TaskContext = {
        taskId: 'structured-task',
        iteration: 1,
        context: JSON.stringify({
          files: ['a.ts', 'b.ts'],
          deliverables: ['result.txt'],
        }),
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, jsonContext);

      expect(prompt).toContain('Process each item systematically and report confidence when complete.');
    });
  });

  describe('Environment Context Building', () => {
    test('should build environment variables section', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('## Environment Variables');
      expect(prompt).toContain('TASK_ID=test-task-123');
      expect(prompt).toContain('ITERATION=1');
      expect(prompt).toContain('MODE=standard');
      expect(prompt).toContain('PRIORITY=1');
    });

    test('should handle Docker container environment', async () => {
      process.env.DOCKER_AGENT = 'true';
      process.env.WORKSPACE_ROOT = '/workspace';

      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('WORKSPACE_ROOT=/workspace');
      expect(prompt).toContain('## Docker Container Environment');
      expect(prompt).toContain('**CRITICAL:** You are running inside a Docker container.');
      expect(prompt).toContain('**Working Directory:** `/workspace`');
      expect(prompt).toContain('Use `/workspace/` for all file operations');
    });

    test('should omit environment section when no context available', async () => {
      // To truly omit env section, we need NO iteration, taskId, mode, priority, or Docker env
      const trulyEmptyContext: TaskContext = {};

      // Reset Docker env for this test
      delete process.env.DOCKER_AGENT;
      delete process.env.WORKSPACE_ROOT;

      const prompt = await buildAgentPrompt(mockAgentDefinition, trulyEmptyContext);

      // Environment section should be omitted when truly empty
      // (no taskId, iteration, mode, priority, parentTaskId, or Docker env)
      expect(prompt).not.toContain('## Environment Variables');
    });

    test('should include parent task ID when present', async () => {
      const contextWithParent: TaskContext = {
        ...mockTaskContext,
        parentTaskId: 'parent-task-456',
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, contextWithParent);

      expect(prompt).toContain('**Parent Task:** parent-task-456');
      expect(prompt).toContain('PARENT_TASK_ID=parent-task-456');
    });
  });

  describe('Iteration History Integration', () => {
    test('should load and inject iteration history for iteration > 1', async () => {
      const mockHistory = [
        {
          iteration: 1,
          result: 'First attempt completed',
          confidence: 0.75,
          timestamp: '2024-01-01T12:00:00Z',
          feedback: 'Good start, but needs error handling',
        },
      ];

      (loadIterationHistory as jest.MockedFunction<typeof loadIterationHistory>).mockResolvedValue(
        mockHistory
      );
      (formatIterationHistory as jest.MockedFunction<typeof formatIterationHistory>).mockReturnValue(
        '## Previous Iterations\n\n### Iteration 1\n**Result:** First attempt\n**Feedback:** Needs work'
      );

      const contextIteration2: TaskContext = {
        ...mockTaskContext,
        iteration: 2,
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, contextIteration2);

      // Agent ID is derived using getAgentId which uses explicit agentId if provided, or generates from context
      // Since mockTaskContext has agentId='backend-developer-1', iteration change doesn't auto-increment it
      expect(loadIterationHistory).toHaveBeenCalledWith(
        'test-task-123',
        'backend-developer-1', // Uses agentId from context
        2
      );
      expect(formatIterationHistory).toHaveBeenCalled();
      expect(prompt).toContain('## Previous Iterations');
      expect(prompt).toContain('Review iteration history and feedback from validators');
    });

    test('should skip history loading for iteration 1', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(loadIterationHistory).not.toHaveBeenCalled();
      expect(prompt).not.toContain('Review iteration history');
    });

    test('should handle history loading failure gracefully', async () => {
      (loadIterationHistory as jest.MockedFunction<typeof loadIterationHistory>).mockRejectedValue(
        new Error('Redis connection failed')
      );

      const contextIteration2: TaskContext = {
        ...mockTaskContext,
        iteration: 2,
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, contextIteration2);

      // Should continue without history
      expect(prompt).toContain('# Agent: backend-developer');
      expect(prompt).not.toContain('## Previous Iterations');
    });
  });

  describe('Skills Database Integration (Phase 5)', () => {
    test('should load skills when feature flag enabled', async () => {
      process.env.CFN_SKILLS_DATABASE = 'true';
      process.env.CFN_SKILLS_DB_PATH = '/test/skills.db';

      const mockSkills = [
        {
          id: 1,
          name: 'authentication-patterns',
          version: '1.0.0',
          content: '## Authentication Best Practices\n\nUse bcrypt for password hashing.',
          contentHash: 'abc123',
          approvalLevel: 'auto' as const,
        },
      ];

      const mockSkillLoader = {
        loadSkillsForAgent: jest.fn(async () => mockSkills),
        logSkillUsage: jest.fn(async () => {}),
        close: jest.fn(),
      };

      (SkillLoader as jest.MockedClass<typeof SkillLoader>).mockImplementation(() => mockSkillLoader as any);

      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(SkillLoader).toHaveBeenCalledWith('/test/skills.db', expect.any(Object));
      expect(mockSkillLoader.loadSkillsForAgent).toHaveBeenCalledWith('developer', {
        taskId: 'test-task-123',
        keywords: 'implement jwt authentication',
        phase: undefined,
        mode: 'standard',
        iteration: 1,
      });
      expect(prompt).toContain('## Applicable Skills');
      expect(prompt).toContain('authentication-patterns (v1.0.0) [✓ auto]');
      expect(prompt).toContain('Use bcrypt for password hashing.');
    });

    test('should skip skills when feature flag disabled', async () => {
      delete process.env.CFN_SKILLS_DATABASE;

      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(SkillLoader).not.toHaveBeenCalled();
      expect(prompt).not.toContain('## Applicable Skills');
    });

    test('should handle skill loading failure gracefully', async () => {
      process.env.CFN_SKILLS_DATABASE = 'true';

      const mockSkillLoader = {
        loadSkillsForAgent: jest.fn(async () => {
          throw new Error('Database connection failed');
        }),
        close: jest.fn(),
      };

      (SkillLoader as jest.MockedClass<typeof SkillLoader>).mockImplementation(() => mockSkillLoader as any);

      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      // Should continue without skills
      expect(prompt).toContain('# Agent: backend-developer');
      expect(prompt).not.toContain('## Applicable Skills');
    });

    test('should format skills with approval level badges', async () => {
      process.env.CFN_SKILLS_DATABASE = 'true';

      const mockSkills = [
        {
          id: 1,
          name: 'auto-skill',
          version: '1.0',
          content: 'Auto-approved content',
          contentHash: 'hash1',
          approvalLevel: 'auto' as const,
        },
        {
          id: 2,
          name: 'escalate-skill',
          version: '2.0',
          content: 'Escalate content',
          contentHash: 'hash2',
          approvalLevel: 'escalate' as const,
        },
        {
          id: 3,
          name: 'manual-skill',
          version: '3.0',
          content: 'Manual content',
          contentHash: 'hash3',
          approvalLevel: 'manual' as const,
        },
      ];

      const mockSkillLoader = {
        loadSkillsForAgent: jest.fn(async () => mockSkills),
        logSkillUsage: jest.fn(async () => {}),
        close: jest.fn(),
      };

      (SkillLoader as jest.MockedClass<typeof SkillLoader>).mockImplementation(() => mockSkillLoader as any);

      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('[✓ auto]');
      expect(prompt).toContain('[⚠ escalate]');
      expect(prompt).toContain('[✋ manual]');
    });

    test('should log skill usage analytics', async () => {
      process.env.CFN_SKILLS_DATABASE = 'true';

      const mockSkills = [
        {
          id: 5,
          name: 'test-skill',
          version: '1.0',
          content: 'Content',
          contentHash: 'hash',
          approvalLevel: 'auto' as const,
        },
      ];

      const mockSkillLoader = {
        loadSkillsForAgent: jest.fn(async () => mockSkills),
        logSkillUsage: jest.fn(async () => {}),
        close: jest.fn(),
      };

      (SkillLoader as jest.MockedClass<typeof SkillLoader>).mockImplementation(() => mockSkillLoader as any);

      await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(mockSkillLoader.logSkillUsage).toHaveBeenCalledWith({
        agentId: 'backend-developer-1',
        agentType: 'developer',
        skillIds: [5],
        taskId: 'test-task-123',
        phase: undefined,
        loadedAt: expect.any(Date),
        executionTimeMs: expect.any(Number),
      });
    });
  });

  describe('CLI Mode Protocol Generation', () => {
    test('should generate complete CLI Mode protocol', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('## CLI Mode Redis Completion Protocol');
      expect(prompt).toContain('### Step 1: Complete Your Work');
      expect(prompt).toContain('### Step 2: Signal Completion to Main Chat');
      expect(prompt).toContain('### Step 3: Exit Cleanly');
    });

    test('should include CLI coordination rationale', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('**Why This Protocol:**');
      expect(prompt).toContain('Main Chat uses Redis BLPOP to wait for your completion signal');
      expect(prompt).toContain('Enables simple 2-layer coordination (Main Chat → CLI agents)');
      expect(prompt).toContain('No complex orchestrator needed for CLI mode');
    });

    test('should document environment variables', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('**Environment Variables Available:**');
      expect(prompt).toContain('- TASK_ID: test-task-123');
      expect(prompt).toContain('- AGENT_ID: backend-developer-1');
      expect(prompt).toContain('- PROVIDER: AI provider (zai, kimi, anthropic, etc.)');
      expect(prompt).toContain('- MODEL: Specific model being used');
    });

    test('should explain coordination rationale', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('**Why This Protocol:**');
      expect(prompt).toContain('Main Chat uses Redis BLPOP to wait for your completion signal');
      expect(prompt).toContain('Enables simple 2-layer coordination (Main Chat → CLI agents)');
      expect(prompt).toContain('No complex orchestrator needed for CLI mode');
    });
  });

  describe('Execution Instructions', () => {
    test('should provide standard execution instructions for iteration 1', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('## Execution Instructions');
      expect(prompt).toContain('1. Read and understand the task requirements');
      expect(prompt).toContain('2. Execute your core responsibilities as defined above');
      expect(prompt).toContain('3. Follow any protocol steps');
      expect(prompt).toContain('4. Provide clear, concise output');
      expect(prompt).toContain('5. Report confidence score if applicable');
    });

    test('should provide iteration-specific instructions for iteration > 1', async () => {
      const contextIteration2: TaskContext = {
        ...mockTaskContext,
        iteration: 2,
      };

      (loadIterationHistory as jest.MockedFunction<typeof loadIterationHistory>).mockResolvedValue([]);

      const prompt = await buildAgentPrompt(mockAgentDefinition, contextIteration2);

      expect(prompt).toContain('2. Review iteration history and feedback from validators');
      expect(prompt).toContain('3. Address specific feedback points from previous iteration');
      expect(prompt).toContain('4. Execute your core responsibilities as defined above');
    });
  });

  describe('Pre-Edit Backup Protocol', () => {
    test('should inject complete backup workflow', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('## Pre-Edit Backup Protocol (MANDATORY)');
      expect(prompt).toContain('**BEFORE ANY Edit/Write/MultiEdit operation, you MUST create a backup:**');
      expect(prompt).toContain('**Complete Edit Workflow:**');
      expect(prompt).toContain('# 1. Pre-Edit: Create backup');
      expect(prompt).toContain('# 2. Edit: Perform file modification');
      expect(prompt).toContain('# 3. Post-Edit: Validate changes');
    });

    test('should include agent-specific backup commands', async () => {
      const customContext: TaskContext = {
        ...mockTaskContext,
        agentId: 'custom-agent-123',
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, customContext);

      expect(prompt).toContain('--agent-id "custom-agent-123"');
    });

    test('should explain backup rationale', async () => {
      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('**Why:** Enables safe file revert without git operations during parallel sessions.');
      expect(prompt).toContain('**Location:** `.backups/[agent-id]/[timestamp]_[hash]/`');
      expect(prompt).toContain('**Retention:** 24h TTL (configurable)');
    });
  });

  describe('getAgentId', () => {
    test('should use explicit agent ID from context', () => {
      const context: TaskContext = {
        agentId: 'explicit-agent-999',
        iteration: 5,
      };

      const agentId = getAgentId(mockAgentDefinition, context);

      expect(agentId).toBe('explicit-agent-999');
    });

    test('should generate agent ID from name and iteration', () => {
      const context: TaskContext = {
        iteration: 3,
      };

      const agentId = getAgentId(mockAgentDefinition, context);

      expect(agentId).toBe('backend-developer-3');
    });

    test('should default to iteration 1 if not specified', () => {
      const context: TaskContext = {};

      const agentId = getAgentId(mockAgentDefinition, context);

      expect(agentId).toBe('backend-developer-1');
    });
  });

  describe('buildSystemPrompt', () => {
    test('should build system prompt with agent metadata', () => {
      const systemPrompt = buildSystemPrompt(mockAgentDefinition);

      expect(systemPrompt).toContain('You are backend-developer, a specialized AI agent.');
      expect(systemPrompt).toContain('Type: developer');
      expect(systemPrompt).toContain('Model: sonnet');
      expect(systemPrompt).toContain('Tools: Bash, Edit, Read, Write');
    });

    test('should handle agent without type field', () => {
      const agentWithoutType: AgentDefinition = {
        ...mockAgentDefinition,
        type: undefined,
      };

      const systemPrompt = buildSystemPrompt(agentWithoutType);

      expect(systemPrompt).toContain('Type: specialist');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty agent definition content', async () => {
      const emptyAgent: AgentDefinition = {
        ...mockAgentDefinition,
        content: '',
      };

      const prompt = await buildAgentPrompt(emptyAgent, mockTaskContext);

      expect(prompt).toContain('# Agent: backend-developer');
      expect(prompt).toContain('## Agent Definition');
    });

    test('should handle very long context strings', async () => {
      const longContext: TaskContext = {
        taskId: 'long-task',
        iteration: 1,
        context: 'A'.repeat(10000),
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, longContext);

      expect(prompt).toContain('A'.repeat(10000));
      expect(prompt.length).toBeGreaterThan(10000);
    });

    test('should handle special characters in context', async () => {
      const specialContext: TaskContext = {
        taskId: 'special-task',
        iteration: 1,
        context: 'Handle $vars, `backticks`, and "quotes"',
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, specialContext);

      expect(prompt).toContain('Handle $vars, `backticks`, and "quotes"');
    });

    test('should handle empty tools array', async () => {
      const agentNoTools: AgentDefinition = {
        ...mockAgentDefinition,
        tools: [],
      };

      const prompt = await buildAgentPrompt(agentNoTools, mockTaskContext);

      // When tools array is empty, the section is omitted entirely
      // (see line 471-476 in agent-prompt-builder.ts: only adds section if tools.length > 0)
      expect(prompt).not.toContain('## Available Tools');
    });

    test('should handle missing task context', async () => {
      const minimalContext: TaskContext = {
        iteration: 1,
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, minimalContext);

      expect(prompt).toContain('Execute task as backend-developer agent');
      expect(prompt).not.toContain('## CLI Mode Redis Completion Protocol');
    });
  });

  describe('Integration Tests - Full Prompt Generation', () => {
    test('should generate complete prompt for standard CLI Mode task', async () => {
      const fullContext: TaskContext = {
        taskId: 'full-task-789',
        iteration: 1,
        context: JSON.stringify({
          task: 'Implement feature X',
          files: ['src/feature.ts', 'tests/feature.test.ts'],
          requirements: ['Add tests', 'Update docs'],
          deliverables: ['Working feature', 'Test coverage ≥80%'],
        }),
        mode: 'standard',
        priority: 1,
        agentId: 'backend-dev-789',
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, fullContext);

      // Verify all major sections
      const expectedSections = [
        '# Agent: backend-developer',
        '## Task',
        '## Agent Definition',
        '## CLI Mode Redis Completion Protocol',
        '## Environment Variables',
        '## Execution Instructions',
        '## Pre-Edit Backup Protocol (MANDATORY)',
        '## Available Tools',
      ];

      expectedSections.forEach((section) => {
        expect(prompt).toContain(section);
      });

      // Verify data flow
      expect(prompt).toContain('Implement feature X');
      expect(prompt).toContain('src/feature.ts');
      expect(prompt).toContain('Add tests');
      expect(prompt).toContain('Working feature');
      expect(prompt).toContain('TASK_ID=full-task-789');
      expect(prompt).toContain('--agent-id "backend-dev-789"');
    });

    test('should generate complete prompt for Docker environment', async () => {
      process.env.DOCKER_AGENT = 'true';
      process.env.WORKSPACE_ROOT = '/workspace';

      const prompt = await buildAgentPrompt(mockAgentDefinition, mockTaskContext);

      expect(prompt).toContain('## Docker Container Environment');
      expect(prompt).toContain('WORKSPACE_ROOT=/workspace');
      expect(prompt).toContain('Use `/workspace/` for all file operations');
    });

    test('should generate prompt suitable for second iteration with history', async () => {
      const mockHistory = [
        {
          iteration: 1,
          result: 'Implementation complete',
          confidence: 0.85,
          timestamp: '2024-01-01T12:00:00Z',
          feedback: 'Add more error handling',
        },
      ];

      (loadIterationHistory as jest.MockedFunction<typeof loadIterationHistory>).mockResolvedValue(
        mockHistory
      );
      (formatIterationHistory as jest.MockedFunction<typeof formatIterationHistory>).mockReturnValue(
        '## Previous Iterations\n\n### Iteration 1\n**Confidence:** 0.85\n**Feedback:** Add more error handling'
      );

      const contextIteration2: TaskContext = {
        ...mockTaskContext,
        iteration: 2,
      };

      const prompt = await buildAgentPrompt(mockAgentDefinition, contextIteration2);

      expect(prompt).toContain('## Previous Iterations');
      expect(prompt).toContain('Add more error handling');
      expect(prompt).toContain('Review iteration history and feedback from validators');
      expect(prompt).toContain('Address specific feedback points from previous iteration');
    });
  });
});
