/**
 * Unit Tests for CLI Agent Context Builder
 *
 * Tests the buildCLIAgentSystemPrompt function that creates natural language
 * system prompts for CLI-spawned agents.
 */

import {
  buildCLIAgentSystemPrompt,
  loadContextFromEnv,
  type ContextBuilderOptions,
  type EpicContext,
  type PhaseContext,
  type SuccessCriteria,
} from './cli-agent-context';
import fs from 'fs/promises';

// Mock fs module
jest.mock('fs/promises');

describe('CLI Agent Context Builder', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.AGENT_TYPE;
    delete process.env.TASK_ID;
    delete process.env.ITERATION;
    delete process.env.EPIC_CONTEXT;
    delete process.env.PHASE_CONTEXT;
    delete process.env.SUCCESS_CRITERIA;
  });

  describe('buildCLIAgentSystemPrompt', () => {
    it('should build basic system prompt with agent type only', async () => {
      // Mock fs.readFile to fail (no CLAUDE.md, no agent template)
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toBeTruthy();
      expect(result).toContain('Execution Instructions');
      expect(result).toContain('CLI-spawned agent');
    });

    it('should include CLAUDE.md when available', async () => {
      const claudeMd = '# Test Project Rules\nRule 1\nRule 2';

      mockFs.readFile.mockImplementation((path: any) => {
        if (path.toString().endsWith('CLAUDE.md')) {
          return Promise.resolve(claudeMd);
        }
        return Promise.reject(new Error('File not found'));
      });

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toContain('Project Rules (CLAUDE.md)');
      expect(result).toContain('Test Project Rules');
      expect(result).toContain('Rule 1');
    });

    it('should include agent markdown template when available', async () => {
      const agentTemplate = '# Researcher Agent\n\nCore responsibilities:\n- Research\n- Analysis';

      mockFs.readFile.mockImplementation((path: any) => {
        if (path.toString().includes('researcher.md')) {
          return Promise.resolve(agentTemplate);
        }
        return Promise.reject(new Error('File not found'));
      });

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toContain('Agent Definition: researcher');
      expect(result).toContain('Researcher Agent');
      expect(result).toContain('Core responsibilities');
    });

    it('should format epic context from JSON to natural language', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const epicContext: EpicContext = {
        epicGoal: 'Build authentication system',
        inScope: ['JWT authentication', 'User login', 'Session management'],
        outOfScope: ['OAuth integration', 'SAML'],
        riskProfile: 'medium',
      };

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        epicContext: JSON.stringify(epicContext),
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toContain('## Epic Context');
      expect(result).toContain('**Epic Goal:**');
      expect(result).toContain('Build authentication system');
      expect(result).toContain('**In Scope:**');
      expect(result).toContain('- JWT authentication');
      expect(result).toContain('- User login');
      expect(result).toContain('**Out of Scope:**');
      expect(result).toContain('- OAuth integration');
      expect(result).toContain('**Risk Profile:** medium');
    });

    it('should format phase context from JSON to natural language', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const phaseContext: PhaseContext = {
        currentPhase: 'Implementation',
        phaseNumber: 2,
        dependencies: ['Design complete', 'API spec approved'],
        deliverables: ['Working authentication', 'Unit tests', 'Documentation'],
      };

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        phaseContext: JSON.stringify(phaseContext),
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toContain('## Current Phase');
      expect(result).toContain('**Phase:** Implementation');
      expect(result).toContain('**Phase Number:** 2');
      expect(result).toContain('**Dependencies:**');
      expect(result).toContain('- Design complete');
      expect(result).toContain('**Deliverables:**');
      expect(result).toContain('- Working authentication');
    });

    it('should format success criteria from JSON to natural language', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const successCriteria: SuccessCriteria = {
        acceptanceCriteria: [
          'All tests pass',
          'Code coverage > 80%',
          'Security review complete',
        ],
        gateThreshold: 0.75,
        consensusThreshold: 0.9,
        qualityGates: {
          testCoverage: 80,
          securityScore: 0.9,
          performanceBudget: 200,
        },
      };

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        successCriteria: JSON.stringify(successCriteria),
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toContain('## Success Criteria');
      expect(result).toContain('**Acceptance Criteria:**');
      expect(result).toContain('- All tests pass');
      expect(result).toContain('- Code coverage > 80%');
      expect(result).toContain('**Quality Gates:**');
      expect(result).toContain('- Gate Threshold (Loop 3): 75%');
      expect(result).toContain('- Consensus Threshold (Loop 2): 90%');
      expect(result).toContain('**Quality Metrics:**');
      expect(result).toContain('- Test Coverage: 80%');
      expect(result).toContain('- Security Score: 90%');
      expect(result).toContain('- Performance Budget: 200ms');
    });

    it('should include iteration context for iteration > 1', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        taskId: 'task-123',
        iteration: 3,
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toContain('## Current Iteration');
      expect(result).toContain('This is **iteration 3** of your task');
      expect(result).toContain('You have completed 2 iterations before this one');
      expect(result).toContain('Address feedback from previous iterations');
    });

    it('should not include iteration context for iteration 1', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        taskId: 'task-123',
        iteration: 1,
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).not.toContain('## Current Iteration');
    });

    it('should handle malformed JSON gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        epicContext: '{invalid json}',
        phaseContext: 'not json at all',
        successCriteria: '',
      };

      const result = await buildCLIAgentSystemPrompt(options);

      // Should not throw, and should still build basic prompt
      expect(result).toBeTruthy();
      expect(result).toContain('Execution Instructions');
    });

    it('should handle nil Redis values gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        epicContext: '(nil)',
        phaseContext: '(nil)',
        successCriteria: '(nil)',
      };

      const result = await buildCLIAgentSystemPrompt(options);

      // Should not throw, and should not include empty sections
      expect(result).toBeTruthy();
      expect(result).not.toContain('## Epic Context');
      expect(result).not.toContain('## Current Phase');
      expect(result).not.toContain('## Success Criteria');
    });

    it('should build complete prompt with all sections', async () => {
      const claudeMd = '# Project Rules\nRule 1';
      const agentTemplate = '# Researcher\nResponsibilities';

      mockFs.readFile.mockImplementation((path: any) => {
        if (path.toString().endsWith('CLAUDE.md')) {
          return Promise.resolve(claudeMd);
        }
        if (path.toString().includes('researcher.md')) {
          return Promise.resolve(agentTemplate);
        }
        return Promise.reject(new Error('File not found'));
      });

      const epicContext: EpicContext = {
        epicGoal: 'Test Epic',
        inScope: ['Feature A'],
        outOfScope: ['Feature B'],
      };

      const phaseContext: PhaseContext = {
        currentPhase: 'Implementation',
        deliverables: ['Code', 'Tests'],
      };

      const successCriteria: SuccessCriteria = {
        acceptanceCriteria: ['All tests pass'],
        gateThreshold: 0.75,
      };

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        taskId: 'task-123',
        iteration: 2,
        epicContext: JSON.stringify(epicContext),
        phaseContext: JSON.stringify(phaseContext),
        successCriteria: JSON.stringify(successCriteria),
      };

      const result = await buildCLIAgentSystemPrompt(options);

      // Check all sections are present
      expect(result).toContain('Project Rules (CLAUDE.md)');
      expect(result).toContain('Agent Definition: researcher');
      expect(result).toContain('## Epic Context');
      expect(result).toContain('## Current Phase');
      expect(result).toContain('## Success Criteria');
      expect(result).toContain('## Current Iteration');
      expect(result).toContain('## Execution Instructions');

      // Check separators
      expect(result.split('---').length).toBeGreaterThan(3);
    });
  });

  describe('loadContextFromEnv', () => {
    it('should load context from environment variables', () => {
      process.env.AGENT_TYPE = 'researcher';
      process.env.TASK_ID = 'task-123';
      process.env.ITERATION = '2';
      process.env.EPIC_CONTEXT = '{"epicGoal":"Test"}';
      process.env.PHASE_CONTEXT = '{"currentPhase":"Implementation"}';
      process.env.SUCCESS_CRITERIA = '{"gateThreshold":0.75}';

      const result = loadContextFromEnv();

      expect(result.agentType).toBe('researcher');
      expect(result.taskId).toBe('task-123');
      expect(result.iteration).toBe(2);
      expect(result.epicContext).toBe('{"epicGoal":"Test"}');
      expect(result.phaseContext).toBe('{"currentPhase":"Implementation"}');
      expect(result.successCriteria).toBe('{"gateThreshold":0.75}');
    });

    it('should handle missing environment variables', () => {
      const result = loadContextFromEnv();

      expect(result.agentType).toBe('unknown');
      expect(result.taskId).toBeUndefined();
      expect(result.iteration).toBe(1);
      expect(result.epicContext).toBeUndefined();
    });

    it('should parse iteration as number', () => {
      process.env.ITERATION = '5';

      const result = loadContextFromEnv();

      expect(result.iteration).toBe(5);
      expect(typeof result.iteration).toBe('number');
    });

    it('should default iteration to 1 if not provided', () => {
      const result = loadContextFromEnv();

      expect(result.iteration).toBe(1);
    });
  });

  describe('Epic Context Formatting', () => {
    it('should format epic with phases', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const epicContext: EpicContext = {
        epicGoal: 'Build system',
        phases: ['Phase 1: Design', 'Phase 2: Implementation', 'Phase 3: Testing'],
      };

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        epicContext: JSON.stringify(epicContext),
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toContain('**Phases:**');
      expect(result).toContain('1. Phase 1: Design');
      expect(result).toContain('2. Phase 2: Implementation');
      expect(result).toContain('3. Phase 3: Testing');
    });

    it('should format epic with stakeholders', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const epicContext: EpicContext = {
        epicGoal: 'Build system',
        stakeholders: ['Product Manager', 'Tech Lead', 'Security Team'],
      };

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        epicContext: JSON.stringify(epicContext),
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toContain('**Stakeholders:** Product Manager, Tech Lead, Security Team');
    });

    it('should format epic with timeline', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const epicContext: EpicContext = {
        epicGoal: 'Build system',
        timeline: {
          start: '2025-10-01',
          end: '2025-12-31',
          milestones: [
            { phase: 'Design', date: '2025-10-15' },
            { phase: 'Implementation', date: '2025-11-30' },
          ],
        },
      };

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        epicContext: JSON.stringify(epicContext),
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toContain('**Timeline:**');
      expect(result).toContain('- Start: 2025-10-01');
      expect(result).toContain('- End: 2025-12-31');
      expect(result).toContain('- Milestones:');
      expect(result).toContain('  - Design: 2025-10-15');
      expect(result).toContain('  - Implementation: 2025-11-30');
    });
  });

  describe('Phase Context Formatting', () => {
    it('should format phase with blockers', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const phaseContext: PhaseContext = {
        currentPhase: 'Implementation',
        blockers: ['Waiting for API key', 'Database migration pending'],
      };

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        phaseContext: JSON.stringify(phaseContext),
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toContain('**Current Blockers:**');
      expect(result).toContain('- Waiting for API key');
      expect(result).toContain('- Database migration pending');
    });

    it('should format phase with resources', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const phaseContext: PhaseContext = {
        currentPhase: 'Implementation',
        resources: {
          agentCount: 5,
          estimatedDuration: 3,
          costBudget: 2.5,
        },
      };

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        phaseContext: JSON.stringify(phaseContext),
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toContain('**Resources:**');
      expect(result).toContain('- Agents: 5');
      expect(result).toContain('- Duration: 3 hours');
      expect(result).toContain('- Budget: $2.50');
    });
  });

  describe('Success Criteria Formatting', () => {
    it('should format success criteria with definition of done', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const successCriteria: SuccessCriteria = {
        definitionOfDone: [
          'All tests pass',
          'Code reviewed',
          'Documentation complete',
        ],
      };

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        successCriteria: JSON.stringify(successCriteria),
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toContain('**Definition of Done:**');
      expect(result).toContain('- [ ] All tests pass');
      expect(result).toContain('- [ ] Code reviewed');
      expect(result).toContain('- [ ] Documentation complete');
    });

    it('should format success criteria with non-functional requirements', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const successCriteria: SuccessCriteria = {
        nonFunctionalRequirements: [
          'Response time < 200ms',
          'Support 1000 concurrent users',
          'WCAG 2.1 AA compliance',
        ],
      };

      const options: ContextBuilderOptions = {
        agentType: 'researcher',
        successCriteria: JSON.stringify(successCriteria),
      };

      const result = await buildCLIAgentSystemPrompt(options);

      expect(result).toContain('**Non-Functional Requirements:**');
      expect(result).toContain('- Response time < 200ms');
      expect(result).toContain('- Support 1000 concurrent users');
    });
  });
});
