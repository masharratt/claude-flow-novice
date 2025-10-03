/**
 * Epic Parser Integration Tests
 *
 * Tests epic markdown parsing and validation:
 * 1. Parse EPIC_OVERVIEW.md
 * 2. Extract sprints from phase files
 * 3. Generate epic-config.json
 * 4. Validate dependencies and cycles
 * 5. Error handling
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { EpicParser, generateEpicConfig, validateEpic } from '../../../src/parsers/epic-parser.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('EpicParser - Integration Tests', () => {
  let tempDir: string;
  let epicDir: string;

  beforeAll(() => {
    // Create temporary test directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epic-parser-test-'));
    epicDir = path.join(tempDir, 'test-epic');
    fs.mkdirSync(epicDir, { recursive: true });
  });

  afterAll(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('EPIC_OVERVIEW.md Parsing', () => {
    it('should parse epic metadata from overview file', () => {
      const overviewContent = `# User Management System

**Epic ID**: \`user-mgmt-v1\`
**Status**: 🔄 In Progress
**Owner**: Product Team
**Estimated Duration**: 6 weeks

## Epic Description

Complete user management system with authentication, authorization, and profile management.

## Acceptance Criteria

- [ ] Users can register and authenticate
- [ ] Role-based access control implemented
- [ ] User profiles with avatar upload

## Notes

Cross-phase dependencies noted in phase files.
`;

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), overviewContent);

      const parser = new EpicParser({ epicDirectory: epicDir });
      const config = parser.parse();

      expect(config.epicId).toBe('user-mgmt-v1');
      expect(config.name).toBe('User Management System');
      expect(config.description).toContain('Complete user management system');
      expect(config.status).toBe('in_progress');
      expect(config.owner).toBe('Product Team');
      expect(config.estimatedDuration).toBe('6 weeks');
      expect(config.epicAcceptanceCriteria).toHaveLength(3);
    });

    it('should extract cross-phase dependencies from notes', () => {
      const overviewContent = `# Test Epic

## Notes

Phase 2 Sprint 2.2 depends on Phase 1 Sprint 1.3
Phase 3 Sprint 3.1 depends on Phase 1 Sprint 1.1 and Phase 2 Sprint 2.2
`;

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), overviewContent);

      const parser = new EpicParser({ epicDirectory: epicDir });
      const config = parser.parse();

      expect(config.crossPhaseDependencies).toBeDefined();
      expect(config.crossPhaseDependencies!.length).toBeGreaterThan(0);
    });

    it('should extract risk assessment', () => {
      const overviewContent = `# Test Epic

## Risk Assessment

**High Risk**:
- Authentication security vulnerabilities
- Third-party API availability

**Mitigation**:
- Security audit before deployment
- Implement fallback mechanisms
`;

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), overviewContent);

      const parser = new EpicParser({ epicDirectory: epicDir });
      const config = parser.parse();

      expect(config.riskAssessment).toBeDefined();
      expect(config.riskAssessment!.highRisk).toHaveLength(2);
      expect(config.riskAssessment!.mitigation).toHaveLength(2);
    });
  });

  describe('Phase File Parsing', () => {
    it('should extract sprints from phase file', () => {
      const overviewContent = `# Test Epic

**File**: \`phase-1-auth.md\`
`;

      const phaseContent = `# Phase 1: Authentication

**Phase ID**: \`phase-1\`
**Status**: ❌ Not Started
**Dependencies**: None
**Estimated Duration**: 2 weeks

## Sprint Breakdown

### Sprint 1.1: JWT Implementation

**Status**: ❌ Not Started
**Duration**: 1 week
**Dependencies**: None

**Tasks**:
1. Create JWT utility functions
2. Implement token generation
3. Add token validation

**Acceptance Criteria**:
- JWT tokens generated correctly
- Token expiration handled
- Refresh token mechanism works

**Deliverables**:
- \`src/auth/jwt.ts\`
- \`tests/auth/jwt.test.ts\`

### Sprint 1.2: Login Endpoint

**Status**: ❌ Not Started
**Duration**: 1 week
**Dependencies**: Sprint 1.1

**Tasks**:
1. Create login route
2. Implement password verification
3. Return JWT token

**Acceptance Criteria**:
- Login endpoint functional
- Password hashing secure
- Tokens returned on success
`;

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), overviewContent);
      fs.writeFileSync(path.join(epicDir, 'phase-1-auth.md'), phaseContent);

      const parser = new EpicParser({ epicDirectory: epicDir });
      const config = parser.parse();

      expect(config.phases).toHaveLength(1);
      expect(config.phases[0].sprints).toHaveLength(2);

      const sprint1 = config.phases[0].sprints![0];
      expect(sprint1.sprintId).toBe('sprint-1.1');
      expect(sprint1.name).toContain('JWT Implementation');
      expect(sprint1.dependencies).toHaveLength(0);
      expect(sprint1.tasks).toHaveLength(3);
      expect(sprint1.acceptanceCriteria).toHaveLength(3);
      expect(sprint1.deliverables).toHaveLength(2);

      const sprint2 = config.phases[0].sprints![1];
      expect(sprint2.sprintId).toBe('sprint-1.2');
      expect(sprint2.dependencies).toContain('sprint-1.1');
    });

    it('should handle multiple phase files', () => {
      const overviewContent = `# Test Epic

**File**: \`phase-1-auth.md\`
**File**: \`phase-2-rbac.md\`
`;

      const phase1Content = `# Phase 1: Authentication

**Phase ID**: \`phase-1\`

### Sprint 1.1: Test Sprint

**Status**: ❌ Not Started
`;

      const phase2Content = `# Phase 2: Authorization

**Phase ID**: \`phase-2\`
**Dependencies**: phase-1

### Sprint 2.1: Test Sprint

**Status**: ❌ Not Started
**Dependencies**: None
**Cross-Phase Dependencies**: ["phase-1/sprint-1.1"]
`;

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), overviewContent);
      fs.writeFileSync(path.join(epicDir, 'phase-1-auth.md'), phase1Content);
      fs.writeFileSync(path.join(epicDir, 'phase-2-rbac.md'), phase2Content);

      const parser = new EpicParser({ epicDirectory: epicDir });
      const config = parser.parse();

      expect(config.phases).toHaveLength(2);
      expect(config.phases[1].dependencies).toContain('phase-1');
    });
  });

  describe('Validation and Error Handling', () => {
    it('should detect dependency cycles', () => {
      const overviewContent = `# Test Epic

**File**: \`phase-1.md\`
`;

      const phaseContent = `# Phase 1

**Phase ID**: \`phase-1\`

### Sprint 1.1: First

**Dependencies**: Sprint 1.2

### Sprint 1.2: Second

**Dependencies**: Sprint 1.1
`;

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), overviewContent);
      fs.writeFileSync(path.join(epicDir, 'phase-1.md'), phaseContent);

      const parser = new EpicParser({ epicDirectory: epicDir });
      parser.parse();

      const validation = parser.getValidationResult();
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);

      const cycleError = validation.errors.find(e => e.type === 'dependency_cycle');
      expect(cycleError).toBeDefined();
    });

    it('should warn about invalid sprint statuses', () => {
      const overviewContent = `# Test Epic

**File**: \`phase-1.md\`
`;

      const phaseContent = `# Phase 1

**Phase ID**: \`phase-1\`

### Sprint 1.1: Test

**Status**: INVALID_STATUS
`;

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), overviewContent);
      fs.writeFileSync(path.join(epicDir, 'phase-1.md'), phaseContent);

      const parser = new EpicParser({ epicDirectory: epicDir });
      parser.parse();

      const validation = parser.getValidationResult();
      expect(validation.warnings.length).toBeGreaterThan(0);

      const statusWarning = validation.warnings.find(w => w.type === 'invalid_status');
      expect(statusWarning).toBeDefined();
    });

    it('should detect invalid dependencies', () => {
      const overviewContent = `# Test Epic

**File**: \`phase-1.md\`
`;

      const phaseContent = `# Phase 1

**Phase ID**: \`phase-1\`

### Sprint 1.1: Test

**Dependencies**: Sprint 99.99
`;

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), overviewContent);
      fs.writeFileSync(path.join(epicDir, 'phase-1.md'), phaseContent);

      const parser = new EpicParser({ epicDirectory: epicDir });
      parser.parse();

      const validation = parser.getValidationResult();
      expect(validation.valid).toBe(false);

      const depError = validation.errors.find(e => e.type === 'invalid_dependency');
      expect(depError).toBeDefined();
    });
  });

  describe('epic-config.json Generation', () => {
    it('should generate valid epic-config.json', () => {
      const overviewContent = `# Test Epic

**Epic ID**: \`test-epic\`
**Owner**: Test Team
**Estimated Duration**: 2 weeks

## Epic Description

Test epic for configuration generation.

**File**: \`phase-1.md\`
`;

      const phaseContent = `# Phase 1: Test Phase

**Phase ID**: \`phase-1\`

### Sprint 1.1: Test Sprint

**Status**: ❌ Not Started
**Duration**: 1 week

**Acceptance Criteria**:
- Test criterion 1
- Test criterion 2
`;

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), overviewContent);
      fs.writeFileSync(path.join(epicDir, 'phase-1.md'), phaseContent);

      const parser = new EpicParser({ epicDirectory: epicDir });
      const config = parser.parseAndSave();

      const configPath = path.join(epicDir, 'epic-config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(savedConfig.epicId).toBe('test-epic');
      expect(savedConfig.phases).toHaveLength(1);
      expect(savedConfig.phases[0].sprints).toHaveLength(1);
    });

    it('should validate epic-config structure', () => {
      const validConfig = {
        epicId: 'test-epic',
        name: 'Test Epic',
        description: 'Test description',
        status: 'not_started' as const,
        owner: 'Test',
        estimatedDuration: '1 week',
        overviewFile: 'EPIC_OVERVIEW.md',
        phases: [
          {
            phaseId: 'phase-1',
            name: 'Phase 1',
            description: 'Test phase',
            file: 'phase-1.md',
            status: 'not_started' as const,
            dependencies: [],
            estimatedDuration: '1 week',
            sprints: [
              {
                sprintId: 'sprint-1.1',
                name: 'Sprint 1',
                status: 'not_started' as const,
                duration: '1 week',
                dependencies: [],
                acceptanceCriteria: ['Criterion 1'],
              },
            ],
          },
        ],
        epicAcceptanceCriteria: [],
        crossPhaseDependencies: [],
      };

      const validation = EpicParser.validate(validConfig);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject invalid epic-config', () => {
      const invalidConfig = {
        // Missing epicId
        name: 'Test',
        phases: [], // Empty phases
      } as any;

      const validation = EpicParser.validate(invalidConfig);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('CLI Utilities', () => {
    it('should generate config via CLI utility', async () => {
      const overviewContent = `# CLI Test Epic

**Epic ID**: \`cli-test\`
**File**: \`phase-1.md\`
`;

      const phaseContent = `# Phase 1

**Phase ID**: \`phase-1\`

### Sprint 1.1: CLI Sprint

**Status**: ❌ Not Started
**Acceptance Criteria**:
- Test CLI
`;

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), overviewContent);
      fs.writeFileSync(path.join(epicDir, 'phase-1.md'), phaseContent);

      const outputPath = path.join(epicDir, 'generated-config.json');
      const result = await generateEpicConfig(epicDir, outputPath);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(fs.existsSync(outputPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(config.epicId).toBe('cli-test');
    });

    it('should validate epic via CLI utility', async () => {
      const overviewContent = `# Validation Test Epic

**Epic ID**: \`validation-test\`
**File**: \`phase-1.md\`
`;

      const phaseContent = `# Phase 1

**Phase ID**: \`phase-1\`

### Sprint 1.1: Valid Sprint

**Status**: ❌ Not Started
**Acceptance Criteria**:
- Valid criterion
`;

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), overviewContent);
      fs.writeFileSync(path.join(epicDir, 'phase-1.md'), phaseContent);

      const result = await validateEpic(epicDir);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing overview file', () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');

      expect(() => {
        new EpicParser({ epicDirectory: nonExistentDir });
      }).toThrow('Epic directory not found');
    });

    it('should handle missing phase files gracefully', () => {
      const overviewContent = `# Test Epic

**File**: \`missing-phase.md\`
`;

      fs.writeFileSync(path.join(epicDir, 'EPIC_OVERVIEW.md'), overviewContent);

      const parser = new EpicParser({ epicDirectory: epicDir });
      const config = parser.parse();

      // Should parse without crashing
      expect(config.phases).toHaveLength(0);
    });
  });
});
