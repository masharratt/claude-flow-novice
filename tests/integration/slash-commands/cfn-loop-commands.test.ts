/**
 * CFN Loop Slash Commands Integration Tests
 *
 * Tests slash command execution:
 * 1. /cfn-loop-single command
 * 2. /cfn-loop-sprints command
 * 3. /cfn-loop-epic command
 * 4. Parameter validation
 * 5. Error handling
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { CfnLoopSingleCommand } from '../../../src/slash-commands/cfn-loop-single.js';
import { CfnLoopSprintsCommand } from '../../../src/slash-commands/cfn-loop-sprints.js';
import { CfnLoopEpicCommand } from '../../../src/slash-commands/cfn-loop-epic.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CFN Loop Slash Commands - Integration Tests', () => {
  let tempDir: string;
  let testContext: any;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfn-commands-test-'));
    testContext = {
      cwd: tempDir,
    };
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('/cfn-loop-single Command', () => {
    let command: CfnLoopSingleCommand;

    beforeAll(() => {
      command = new CfnLoopSingleCommand();
    });

    it('should execute with natural language task', async () => {
      const result = await command.execute(
        ['Implement JWT authentication with bcrypt'],
        testContext
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.task).toContain('JWT authentication');
      expect(result.config).toBeDefined();
      expect(result.config.maxLoop2).toBe(10);
      expect(result.config.maxLoop3).toBe(10);
      expect(result.prompt).toBeDefined();
    });

    it('should handle custom loop parameters', async () => {
      const result = await command.execute(
        ['Fix security vulnerability', '--max-loop2=7', '--max-loop3=15', '--consensus=0.95'],
        testContext
      );

      expect(result.success).toBe(true);
      expect(result.config.maxLoop2).toBe(7);
      expect(result.config.maxLoop3).toBe(15);
      expect(result.config.consensusThreshold).toBe(0.95);
    });

    it('should handle file reference', async () => {
      const taskFilePath = path.join(tempDir, 'test-task.md');
      fs.writeFileSync(taskFilePath, 'Description: Implement user authentication\n\n## Agents\n- coder\n- tester');

      const result = await command.execute([taskFilePath], testContext);

      expect(result.success).toBe(true);
      expect(result.sourceFile).toBe(taskFilePath);
      expect(result.task).toContain('user authentication');
    });

    it('should handle partial file reference', async () => {
      const planningDir = path.join(tempDir, 'planning/tasks');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, 'auth-implementation.md'), 'Auth task description');

      const result = await command.execute(['auth-implementation'], testContext);

      expect(result.success).toBe(true);
      expect(result.sourceFile).toContain('auth-implementation.md');
    });

    it('should return error for missing task', async () => {
      const result = await command.execute([], testContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Task description or file reference required');
    });

    it('should validate iteration limits', async () => {
      await expect(async () => {
        await command.execute(
          ['Test task', '--max-loop2=150'],
          testContext
        );
      }).rejects.toThrow('--max-loop2 must be between 1 and 100');
    });

    it('should validate threshold ranges', async () => {
      await expect(async () => {
        await command.execute(
          ['Test task', '--consensus=1.5'],
          testContext
        );
      }).rejects.toThrow('--consensus must be between 0.5 and 1.0');
    });

    it('should assign agents based on task complexity', async () => {
      const simpleResult = await command.execute(
        ['Fix small bug in login'],
        testContext
      );
      expect(simpleResult.config.agents).toBeLessThanOrEqual(5);

      const complexResult = await command.execute(
        ['Architect and implement complete microservices migration'],
        testContext
      );
      expect(complexResult.config.agents).toBeGreaterThan(5);
    });
  });

  describe('/cfn-loop-sprints Command', () => {
    let command: CfnLoopSprintsCommand;

    beforeAll(() => {
      command = new CfnLoopSprintsCommand();
    });

    it('should execute with valid phase file', async () => {
      const phaseFilePath = path.join(tempDir, 'phase-1-auth.md');
      const phaseContent = `# Phase 1: Authentication

**Phase ID**: \`phase-1\`
**Status**: ❌ Not Started
**Estimated Duration**: 2 weeks

### Sprint 1.1: JWT Implementation

**Status**: ❌ Not Started
**Duration**: 1 week
**Dependencies**: None

**Tasks**:
1. Implement JWT generation
2. Add token validation

**Acceptance Criteria**:
- JWT tokens work correctly
- Tests pass
`;

      fs.writeFileSync(phaseFilePath, phaseContent);

      const result = await command.execute([phaseFilePath], testContext);

      expect(result.success).toBe(true);
      expect(result.phase).toBeDefined();
      expect(result.phase.sprints).toHaveLength(1);
      expect(result.prompt).toBeDefined();
    });

    it('should handle custom loop parameters', async () => {
      const phaseFilePath = path.join(tempDir, 'phase-test.md');
      fs.writeFileSync(phaseFilePath, '# Test Phase\n\n### Sprint 1.1: Test\n\n**Status**: ❌ Not Started');

      const result = await command.execute(
        [phaseFilePath, '--max-loop2=7', '--consensus=0.95'],
        testContext
      );

      expect(result.success).toBe(true);
      expect(result.config.maxLoop2).toBe(7);
      expect(result.config.consensusThreshold).toBe(0.95);
    });

    it('should return error for missing phase file', async () => {
      const result = await command.execute(['non-existent-phase.md'], testContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should parse sprint dependencies', async () => {
      const phaseFilePath = path.join(tempDir, 'phase-deps.md');
      const phaseContent = `# Phase 1

### Sprint 1.1: First

**Status**: ❌ Not Started
**Dependencies**: None

### Sprint 1.2: Second

**Status**: ❌ Not Started
**Dependencies**: Sprint 1.1
`;

      fs.writeFileSync(phaseFilePath, phaseContent);

      const result = await command.execute([phaseFilePath], testContext);

      expect(result.success).toBe(true);
      expect(result.phase.sprints[1].dependencies).toContain('sprint-1.1');
    });

    it('should create single sprint from phase without sprint structure', async () => {
      const phaseFilePath = path.join(tempDir, 'phase-no-sprints.md');
      const phaseContent = `# Phase 1: Simple Phase

**Phase ID**: \`phase-1\`
**Estimated Duration**: 1 week

No sprint breakdown provided.
`;

      fs.writeFileSync(phaseFilePath, phaseContent);

      const result = await command.execute([phaseFilePath], testContext);

      expect(result.success).toBe(true);
      expect(result.phase.sprints).toHaveLength(1);
      expect(result.phase.sprints[0].name).toContain('Simple Phase');
    });
  });

  describe('/cfn-loop-epic Command', () => {
    let command: CfnLoopEpicCommand;

    beforeAll(() => {
      command = new CfnLoopEpicCommand();
    });

    it('should execute with epic directory containing config', async () => {
      const epicDir = path.join(tempDir, 'test-epic');
      fs.mkdirSync(epicDir, { recursive: true });

      const epicConfig = {
        epicId: 'test-epic',
        name: 'Test Epic',
        description: 'Test epic description',
        status: 'not_started',
        owner: 'Test Team',
        estimatedDuration: '4 weeks',
        overviewFile: 'EPIC_OVERVIEW.md',
        phases: [
          {
            phaseId: 'phase-1',
            name: 'Phase 1',
            description: 'First phase',
            file: 'phase-1.md',
            status: 'not_started',
            dependencies: [],
            estimatedDuration: '2 weeks',
            sprints: [
              {
                sprintId: 'sprint-1.1',
                name: 'Sprint 1',
                status: 'not_started',
                duration: '1 week',
                dependencies: [],
                acceptanceCriteria: ['Criterion 1'],
              },
            ],
          },
        ],
        epicAcceptanceCriteria: ['Epic complete'],
        crossPhaseDependencies: [],
      };

      fs.writeFileSync(path.join(epicDir, 'epic-config.json'), JSON.stringify(epicConfig, null, 2));

      const result = await command.execute([epicDir], testContext);

      expect(result.success).toBe(true);
      expect(result.epic).toBeDefined();
      expect(result.epic.phases).toHaveLength(1);
      expect(result.epic.totalSprints).toBe(1);
      expect(result.prompt).toBeDefined();
    });

    it('should auto-discover phase files in directory', async () => {
      const epicDir = path.join(tempDir, 'auto-epic');
      fs.mkdirSync(epicDir, { recursive: true });

      const overviewContent = `# Auto Epic

**Epic ID**: \`auto-epic\`
`;

      const phase1Content = `# Phase 1

**Phase ID**: \`phase-1\`

### Sprint 1.1: Auto Sprint

**Status**: ❌ Not Started
**Acceptance Criteria**:
- Test
`;

      const phase2Content = `# Phase 2

**Phase ID**: \`phase-2\`
**Dependencies**: phase-1

### Sprint 2.1: Second Sprint

**Status**: ❌ Not Started
`;

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), overviewContent);
      fs.writeFileSync(path.join(epicDir, 'phase-1-auth.md'), phase1Content);
      fs.writeFileSync(path.join(epicDir, 'phase-2-rbac.md'), phase2Content);

      const result = await command.execute([epicDir], testContext);

      expect(result.success).toBe(true);
      expect(result.epic.phases).toHaveLength(2);
      expect(result.epic.totalSprints).toBe(2);
    });

    it('should handle custom loop parameters', async () => {
      const epicDir = path.join(tempDir, 'params-epic');
      fs.mkdirSync(epicDir, { recursive: true });

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), '# Test Epic\n\n**Epic ID**: `test`');

      const result = await command.execute(
        [epicDir, '--max-loop2=8', '--consensus=0.92'],
        testContext
      );

      expect(result.success).toBe(true);
      expect(result.config.maxLoop2).toBe(8);
      expect(result.config.consensusThreshold).toBe(0.92);
    });

    it('should return error for non-existent directory', async () => {
      const result = await command.execute(['non-existent-epic'], testContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error for file path instead of directory', async () => {
      const filePath = path.join(tempDir, 'test-file.md');
      fs.writeFileSync(filePath, 'Test file');

      const result = await command.execute([filePath], testContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a directory');
    });

    it('should compute topological order for phases', async () => {
      const epicDir = path.join(tempDir, 'topo-epic');
      fs.mkdirSync(epicDir, { recursive: true });

      const epicConfig = {
        epicId: 'topo-epic',
        name: 'Topological Epic',
        phases: [
          {
            phaseId: 'phase-3',
            name: 'Phase 3',
            dependencies: ['phase-1', 'phase-2'],
            sprints: [],
          },
          {
            phaseId: 'phase-1',
            name: 'Phase 1',
            dependencies: [],
            sprints: [],
          },
          {
            phaseId: 'phase-2',
            name: 'Phase 2',
            dependencies: ['phase-1'],
            sprints: [],
          },
        ],
      };

      fs.writeFileSync(path.join(epicDir, 'epic-config.json'), JSON.stringify(epicConfig, null, 2));

      const result = await command.execute([epicDir], testContext);

      expect(result.success).toBe(true);

      // Verify prompt contains topological order
      expect(result.prompt).toBeDefined();
      const orderMatch = result.prompt.match(/1\.\s+\*\*Phase 1/);
      expect(orderMatch).toBeTruthy();
    });
  });

  describe('Common Slash Command Features', () => {
    it('should provide usage information', () => {
      const singleCmd = new CfnLoopSingleCommand();
      const sprintsCmd = new CfnLoopSprintsCommand();
      const epicCmd = new CfnLoopEpicCommand();

      expect(singleCmd.getUsage()).toContain('/cfn-loop-single');
      expect(sprintsCmd.getUsage()).toContain('/cfn-loop-sprints');
      expect(epicCmd.getUsage()).toContain('/cfn-loop-epic');
    });

    it('should provide examples', () => {
      const singleCmd = new CfnLoopSingleCommand();
      const sprintsCmd = new CfnLoopSprintsCommand();
      const epicCmd = new CfnLoopEpicCommand();

      expect(singleCmd.getExamples().length).toBeGreaterThan(0);
      expect(sprintsCmd.getExamples().length).toBeGreaterThan(0);
      expect(epicCmd.getExamples().length).toBeGreaterThan(0);
    });

    it('should format response consistently', async () => {
      const singleCmd = new CfnLoopSingleCommand();
      const result = await singleCmd.execute(['Test task'], testContext);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('timestamp');

      if (result.success) {
        expect(result).toHaveProperty('prompt');
        expect(result).toHaveProperty('config');
      } else {
        expect(result).toHaveProperty('error');
      }
    });

    it('should validate memory namespace format', async () => {
      const singleCmd = new CfnLoopSingleCommand();
      const result = await singleCmd.execute(['Test task'], testContext);

      expect(result.memoryNamespace).toMatch(/^cfn-loop-single\//);
    });
  });

  describe('CFN-2025-001 Security Validation', () => {
    it('should enforce iteration limits (single command)', async () => {
      const singleCmd = new CfnLoopSingleCommand();

      await expect(async () => {
        await singleCmd.execute(
          ['Test', '--max-loop2=0'],
          testContext
        );
      }).rejects.toThrow('must be between 1 and 100');

      await expect(async () => {
        await singleCmd.execute(
          ['Test', '--max-loop2=101'],
          testContext
        );
      }).rejects.toThrow('must be between 1 and 100');
    });

    it('should enforce threshold limits', async () => {
      const singleCmd = new CfnLoopSingleCommand();

      await expect(async () => {
        await singleCmd.execute(
          ['Test', '--consensus=0.4'],
          testContext
        );
      }).rejects.toThrow('must be between 0.5 and 1.0');

      await expect(async () => {
        await singleCmd.execute(
          ['Test', '--consensus=1.1'],
          testContext
        );
      }).rejects.toThrow('must be between 0.5 and 1.0');
    });

    it('should enforce iteration limits (sprints command)', async () => {
      const sprintsCmd = new CfnLoopSprintsCommand();
      const phaseFile = path.join(tempDir, 'test-phase.md');
      fs.writeFileSync(phaseFile, '# Phase\n\n### Sprint 1.1: Test\n\n**Status**: ❌');

      await expect(async () => {
        await sprintsCmd.execute([phaseFile, '--max-loop2=150'], testContext);
      }).rejects.toThrow('must be between 1 and 100');
    });

    it('should enforce iteration limits (epic command)', async () => {
      const epicCmd = new CfnLoopEpicCommand();
      const epicDir = path.join(tempDir, 'sec-epic');
      fs.mkdirSync(epicDir, { recursive: true });
      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), '# Epic\n\n**Epic ID**: `test`');

      await expect(async () => {
        await epicCmd.execute([epicDir, '--max-loop3=-5'], testContext);
      }).rejects.toThrow('must be between 1 and 100');
    });
  });
});
