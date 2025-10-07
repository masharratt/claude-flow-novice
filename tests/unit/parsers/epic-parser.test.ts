/**
 * Epic Parser Tests
 *
 * Tests for epic-parser.ts and phase-parser.ts
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { EpicParser } from '../../../src/parsers/epic-parser.js';
import { PhaseParser } from '../../../src/parsers/phase-parser.js';
import type { EpicConfig, PhaseParserResult } from '../../../src/parsers/epic-parser-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('PhaseParser', () => {
  const testDataDir = path.join(__dirname, '../../test-data/epic-parser');
  const samplePhaseFile = path.join(testDataDir, 'phase-1-test.md');

  beforeEach(() => {
    // Create test data directory
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // Create sample phase file
    const phaseContent = `# Phase 1: Core Authentication System

**Phase ID**: \`phase-1-core-auth\`
**Epic**: \`auth-system-v2\`
**Status**: ❌ Not Started
**Dependencies**: None
**Estimated Duration**: 1 week

## Phase Description

Implement foundational JWT-based authentication system with user registration and login.

## Sprint Breakdown

### Sprint 1.1: User Registration & Password Security
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: None

**Tasks**:
1. Create User model
2. Implement password hashing service
3. Build POST /api/auth/register endpoint

**Acceptance Criteria**:
- User can register with email, username, password
- Passwords hashed with bcrypt (never stored plaintext)
- Duplicate registrations prevented
- Input validation with clear error messages
- Test coverage ≥85%

**Deliverables**:
- \`src/models/User.ts\`
- \`src/services/PasswordService.ts\`
- \`src/controllers/AuthController.ts\`

---

### Sprint 1.2: JWT Token Generation
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: Sprint 1.1

**Tasks**:
1. Implement JWT service
2. Generate access tokens
3. Generate refresh tokens

**Acceptance Criteria**:
- JWT access tokens generated with correct payload
- Refresh tokens generated and stored securely
- Token secrets from environment variables
- Token expiration enforced
- Test coverage ≥85%

**Deliverables**:
- \`src/services/JWTService.ts\`
- \`src/models/RefreshToken.ts\`
`;

    fs.writeFileSync(samplePhaseFile, phaseContent, 'utf-8');
  });

  afterEach(() => {
    // Cleanup test files
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  it('should parse phase file and extract phase metadata', () => {
    const result: PhaseParserResult = PhaseParser.parsePhaseFile(samplePhaseFile);

    expect(result.phaseId).toBe('phase-1-core-auth');
    expect(result.name).toBe('Phase 1: Core Authentication System');
    expect(result.status).toBe('not_started');
    expect(result.dependencies).toEqual([]);
    expect(result.estimatedDuration).toBe('1 week');
    expect(result.description).toContain('JWT-based authentication');
  });

  it('should extract all sprints from phase file', () => {
    const result: PhaseParserResult = PhaseParser.parsePhaseFile(samplePhaseFile);

    expect(result.sprints).toHaveLength(2);
    expect(result.sprints[0].sprintId).toBe('sprint-1.1');
    expect(result.sprints[0].name).toBe('User Registration & Password Security');
    expect(result.sprints[1].sprintId).toBe('sprint-1.2');
    expect(result.sprints[1].name).toBe('JWT Token Generation');
  });

  it('should extract sprint acceptance criteria', () => {
    const result: PhaseParserResult = PhaseParser.parsePhaseFile(samplePhaseFile);

    const sprint1 = result.sprints[0];
    expect(sprint1.acceptanceCriteria).toHaveLength(5);
    expect(sprint1.acceptanceCriteria[0]).toContain('User can register');
    expect(sprint1.acceptanceCriteria[1]).toContain('Passwords hashed with bcrypt');
  });

  it('should extract sprint tasks', () => {
    const result: PhaseParserResult = PhaseParser.parsePhaseFile(samplePhaseFile);

    const sprint1 = result.sprints[0];
    expect(sprint1.tasks).toHaveLength(3);
    expect(sprint1.tasks![0]).toBe('Create User model');
    expect(sprint1.tasks![1]).toBe('Implement password hashing service');
  });

  it('should extract sprint deliverables', () => {
    const result: PhaseParserResult = PhaseParser.parsePhaseFile(samplePhaseFile);

    const sprint1 = result.sprints[0];
    expect(sprint1.deliverables).toHaveLength(3);
    expect(sprint1.deliverables![0]).toBe('src/models/User.ts');
    expect(sprint1.deliverables![1]).toBe('src/services/PasswordService.ts');
  });

  it('should parse sprint dependencies correctly', () => {
    const result: PhaseParserResult = PhaseParser.parsePhaseFile(samplePhaseFile);

    const sprint2 = result.sprints[1];
    expect(sprint2.dependencies).toEqual(['sprint-1.1']);
  });

  it('should throw error if phase file does not exist', () => {
    expect(() => {
      PhaseParser.parsePhaseFile('/nonexistent/phase.md');
    }).toThrow('Phase file not found');
  });
});

describe('EpicParser', () => {
  const testDataDir = path.join(__dirname, '../../test-data/epic-parser');
  const epicDir = path.join(testDataDir, 'epic-test');
  const overviewFile = path.join(epicDir, 'EPIC_OVERVIEW.md');
  const phase1File = path.join(epicDir, 'phase-1-core-auth.md');

  beforeEach(() => {
    // Create test epic directory
    if (!fs.existsSync(epicDir)) {
      fs.mkdirSync(epicDir, { recursive: true });
    }

    // Create epic overview file
    const overviewContent = `# Authentication & Authorization System - Epic Overview

**Epic ID**: \`auth-system-v2\`
**Status**: ❌ Not Started
**Estimated Duration**: 3-4 weeks
**Owner**: Backend Team

## Epic Description

Complete overhaul of authentication and authorization system to support JWT-based authentication with refresh tokens, RBAC, and OAuth2 integration.

## Phases

### Phase 1: Core Authentication System
**File**: \`phase-1-core-auth.md\`
**Status**: ❌ Not Started
**Dependencies**: None
**Deliverables**:
- JWT authentication endpoints
- Password hashing with bcrypt
- Token refresh mechanism

## Acceptance Criteria

- [ ] All phases complete with ≥90% consensus validation
- [ ] Test coverage ≥85% across all phases
- [ ] No critical security vulnerabilities

## Risk Assessment

**High Risk**:
- OAuth2 provider rate limits
- Token storage security

**Mitigation**:
- Implement caching for OAuth2 tokens
- Use Redis for token blacklist with TTL

## Notes

- Cross-phase dependency: Phase 2 Sprint 2.2 depends on Phase 1 Sprint 1.3 (token validation infrastructure)
`;

    fs.writeFileSync(overviewFile, overviewContent, 'utf-8');

    // Create phase 1 file
    const phase1Content = `# Phase 1: Core Authentication System

**Phase ID**: \`phase-1-core-auth\`
**Status**: ❌ Not Started
**Dependencies**: None
**Estimated Duration**: 1 week

## Phase Description

Implement foundational JWT-based authentication system.

### Sprint 1.1: User Registration
**Status**: ❌ Not Started
**Duration**: 2 days
**Dependencies**: None

**Acceptance Criteria**:
- User can register with email, username, password
- Test coverage ≥85%
`;

    fs.writeFileSync(phase1File, phase1Content, 'utf-8');
  });

  afterEach(() => {
    // Cleanup test files
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  it('should parse epic overview and extract metadata', () => {
    const parser = new EpicParser({ epicDirectory: epicDir });
    const result: EpicConfig = parser.parse();

    expect(result.epicId).toBe('auth-system-v2');
    expect(result.name).toBe('Authentication & Authorization System - Epic Overview');
    expect(result.status).toBe('not_started');
    expect(result.owner).toBe('Backend Team');
    expect(result.estimatedDuration).toBe('3-4 weeks');
  });

  it('should extract epic description', () => {
    const parser = new EpicParser({ epicDirectory: epicDir });
    const result: EpicConfig = parser.parse();

    expect(result.description).toContain('JWT-based authentication');
    expect(result.description).toContain('RBAC');
  });

  it('should parse all phase files and include in epic config', () => {
    const parser = new EpicParser({ epicDirectory: epicDir });
    const result: EpicConfig = parser.parse();

    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].phaseId).toBe('phase-1-core-auth');
    expect(result.phases[0].name).toBe('Phase 1: Core Authentication System');
  });

  it('should extract epic acceptance criteria', () => {
    const parser = new EpicParser({ epicDirectory: epicDir });
    const result: EpicConfig = parser.parse();

    expect(result.epicAcceptanceCriteria).toHaveLength(3);
    expect(result.epicAcceptanceCriteria[0]).toContain('≥90% consensus validation');
  });

  it('should extract risk assessment', () => {
    const parser = new EpicParser({ epicDirectory: epicDir });
    const result: EpicConfig = parser.parse();

    expect(result.riskAssessment).toBeDefined();
    expect(result.riskAssessment!.highRisk).toHaveLength(2);
    expect(result.riskAssessment!.mitigation).toHaveLength(2);
  });

  it('should extract cross-phase dependencies from notes', () => {
    const parser = new EpicParser({ epicDirectory: epicDir });
    const result: EpicConfig = parser.parse();

    expect(result.crossPhaseDependencies).toHaveLength(1);
    expect(result.crossPhaseDependencies[0].from).toBe('phase-2/sprint-2.2');
    expect(result.crossPhaseDependencies[0].to).toBe('phase-1/sprint-1.3');
  });

  it('should save epic config to JSON file', () => {
    const parser = new EpicParser({ epicDirectory: epicDir });
    const outputFile = path.join(epicDir, 'epic-config.json');

    const result = parser.parseAndSave(outputFile);

    expect(fs.existsSync(outputFile)).toBe(true);

    const savedConfig = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    expect(savedConfig.epicId).toBe('auth-system-v2');
  });

  it('should validate epic config and detect missing required fields', () => {
    const invalidConfig: any = {
      epicId: '',
      name: '',
      phases: [],
    };

    const validation = EpicParser.validate(invalidConfig);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('Missing epicId');
    expect(validation.errors).toContain('Missing name');
    expect(validation.errors).toContain('Epic must have at least one phase');
  });

  it('should throw error if epic directory does not exist', () => {
    expect(() => {
      new EpicParser({ epicDirectory: '/nonexistent/epic' });
    }).toThrow('Epic directory not found');
  });

  it('should throw error if overview file does not exist', () => {
    const tempDir = path.join(testDataDir, 'no-overview');
    fs.mkdirSync(tempDir, { recursive: true });

    expect(() => {
      new EpicParser({ epicDirectory: tempDir });
    }).toThrow('Epic overview file not found');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

describe('EpicParser - Integration with Example Epic', () => {
  const exampleEpicDir = path.join(process.cwd(), 'planning', 'example-epic');

  it('should successfully parse the example epic directory', () => {
    if (!fs.existsSync(exampleEpicDir)) {
      console.warn('⚠️  Example epic directory not found, skipping integration test');
      return;
    }

    const parser = new EpicParser({ epicDirectory: exampleEpicDir });
    const result: EpicConfig = parser.parse();

    expect(result.epicId).toBe('auth-system-v2');
    expect(result.phases.length).toBeGreaterThan(0);
    expect(result.phases[0].sprints.length).toBeGreaterThan(0);
  });

  it('should validate the example epic config', () => {
    if (!fs.existsSync(exampleEpicDir)) {
      console.warn('⚠️  Example epic directory not found, skipping integration test');
      return;
    }

    const parser = new EpicParser({ epicDirectory: exampleEpicDir });
    const result: EpicConfig = parser.parse();

    const validation = EpicParser.validate(result);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});

describe('EpicParser - CLI Validation Epic Integration', () => {
  const cliValidationEpicDir = path.join(process.cwd(), 'planning', 'cli-validation-epic');

  beforeEach(() => {
    if (!fs.existsSync(cliValidationEpicDir)) {
      console.warn('⚠️  CLI validation epic directory not found, skipping tests');
    }
  });

  it('should successfully parse the CLI validation epic directory', () => {
    if (!fs.existsSync(cliValidationEpicDir)) {
      return;
    }

    const parser = new EpicParser({ epicDirectory: cliValidationEpicDir });
    const result: EpicConfig = parser.parse();

    expect(result).toBeDefined();
    expect(result.epicId).toBeTruthy();
    expect(result.name).toContain('CLI');
    expect(result.phases).toBeDefined();
    expect(result.phases.length).toBeGreaterThan(0);
  });

  it('should parse exactly 3 phases from CLI validation epic', () => {
    if (!fs.existsSync(cliValidationEpicDir)) {
      return;
    }

    const parser = new EpicParser({ epicDirectory: cliValidationEpicDir });
    const result: EpicConfig = parser.parse();

    expect(result.phases).toHaveLength(3);
    expect(result.phases[0].name).toContain('Critical');
    expect(result.phases[1].name).toContain('Performance');
    expect(result.phases[2].name).toContain('Optimization');
  });

  it('should extract all sprints from each phase', () => {
    if (!fs.existsSync(cliValidationEpicDir)) {
      return;
    }

    const parser = new EpicParser({ epicDirectory: cliValidationEpicDir });
    const result: EpicConfig = parser.parse();

    // Phase 1: Critical Validation (2 sprints)
    expect(result.phases[0].sprints).toBeDefined();
    expect(result.phases[0].sprints.length).toBeGreaterThanOrEqual(2);

    // Phase 2: Performance Validation (2 sprints)
    expect(result.phases[1].sprints).toBeDefined();
    expect(result.phases[1].sprints.length).toBeGreaterThanOrEqual(2);

    // Phase 3: Optimization Validation (4 sprints)
    expect(result.phases[2].sprints).toBeDefined();
    expect(result.phases[2].sprints.length).toBeGreaterThanOrEqual(4);

    // Total sprints should be at least 8
    const totalSprints = result.phases.reduce(
      (sum, phase) => sum + (phase.sprints?.length || 0),
      0
    );
    expect(totalSprints).toBeGreaterThanOrEqual(8);
  });

  it('should validate sprint numbering is consistent', () => {
    if (!fs.existsSync(cliValidationEpicDir)) {
      return;
    }

    const parser = new EpicParser({ epicDirectory: cliValidationEpicDir });
    const result: EpicConfig = parser.parse();

    result.phases.forEach((phase, phaseIndex) => {
      phase.sprints?.forEach((sprint, sprintIndex) => {
        // Sprint IDs should follow pattern: sprint-X.Y
        expect(sprint.sprintId).toMatch(/^sprint-\d+\.\d+$/);

        // Sprint ID should match phase number
        const sprintPhaseNum = parseInt(sprint.sprintId.split('-')[1].split('.')[0]);
        expect(sprintPhaseNum).toBe(phaseIndex + 1);
      });
    });
  });

  it('should extract scope boundaries from epic description', () => {
    if (!fs.existsSync(cliValidationEpicDir)) {
      return;
    }

    const parser = new EpicParser({ epicDirectory: cliValidationEpicDir });
    const result: EpicConfig = parser.parse();

    expect(result.description).toBeDefined();
    expect(result.description.length).toBeGreaterThan(0);
    // Scope should mention validation or testing
    expect(result.description.toLowerCase()).toMatch(/validat|test/);
  });

  it('should not detect circular dependencies', () => {
    if (!fs.existsSync(cliValidationEpicDir)) {
      return;
    }

    const parser = new EpicParser({ epicDirectory: cliValidationEpicDir });
    parser.parse();

    const validation = parser.getValidationResult();
    expect(validation.stats?.cyclesDetected).toBe(0);

    const cycleErrors = validation.errors.filter(
      (e) => e.type === 'dependency_cycle'
    );
    expect(cycleErrors).toHaveLength(0);
  });

  it('should validate all sprint dependencies reference valid sprints', () => {
    if (!fs.existsSync(cliValidationEpicDir)) {
      return;
    }

    const parser = new EpicParser({ epicDirectory: cliValidationEpicDir });
    parser.parse();

    const validation = parser.getValidationResult();
    const depErrors = validation.errors.filter(
      (e) => e.type === 'invalid_dependency'
    );
    expect(depErrors).toHaveLength(0);
  });

  it('should save epic config to JSON file with valid structure', () => {
    if (!fs.existsSync(cliValidationEpicDir)) {
      return;
    }

    const parser = new EpicParser({ epicDirectory: cliValidationEpicDir });
    const outputFile = path.join(cliValidationEpicDir, 'test-epic-config.json');

    // Clean up any existing file
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }

    const result = parser.parseAndSave(outputFile);

    expect(fs.existsSync(outputFile)).toBe(true);

    const savedConfig = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    expect(savedConfig.epicId).toBe(result.epicId);
    expect(savedConfig.phases).toHaveLength(result.phases.length);

    // Cleanup
    fs.unlinkSync(outputFile);
  });

  it('should include acceptance criteria for all sprints', () => {
    if (!fs.existsSync(cliValidationEpicDir)) {
      return;
    }

    const parser = new EpicParser({ epicDirectory: cliValidationEpicDir });
    const result: EpicConfig = parser.parse();

    result.phases.forEach((phase) => {
      phase.sprints?.forEach((sprint) => {
        expect(sprint.acceptanceCriteria).toBeDefined();
        expect(sprint.acceptanceCriteria.length).toBeGreaterThan(0);
      });
    });
  });

  it('should extract epic-level acceptance criteria', () => {
    if (!fs.existsSync(cliValidationEpicDir)) {
      return;
    }

    const parser = new EpicParser({ epicDirectory: cliValidationEpicDir });
    const result: EpicConfig = parser.parse();

    expect(result.epicAcceptanceCriteria).toBeDefined();
    // Epic should have GO/NO-GO criteria
    const criteria = result.epicAcceptanceCriteria.join(' ');
    expect(criteria.toLowerCase()).toMatch(/go|decision/);
  });

  it('should parse risk assessment if present', () => {
    if (!fs.existsSync(cliValidationEpicDir)) {
      return;
    }

    const parser = new EpicParser({ epicDirectory: cliValidationEpicDir });
    const result: EpicConfig = parser.parse();

    // Risk assessment may or may not be present
    if (result.riskAssessment) {
      expect(result.riskAssessment.highRisk).toBeDefined();
      expect(result.riskAssessment.mitigation).toBeDefined();
    }
  });

  it('should validate complete epic structure matches expected format', () => {
    if (!fs.existsSync(cliValidationEpicDir)) {
      return;
    }

    const parser = new EpicParser({ epicDirectory: cliValidationEpicDir });
    const result: EpicConfig = parser.parse();

    // Validate top-level structure
    expect(result).toHaveProperty('epicId');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('owner');
    expect(result).toHaveProperty('estimatedDuration');
    expect(result).toHaveProperty('phases');
    expect(result).toHaveProperty('epicAcceptanceCriteria');

    // Validate each phase has required fields
    result.phases.forEach((phase) => {
      expect(phase).toHaveProperty('phaseId');
      expect(phase).toHaveProperty('name');
      expect(phase).toHaveProperty('description');
      expect(phase).toHaveProperty('status');
      expect(phase).toHaveProperty('sprints');
      expect(phase).toHaveProperty('file');
    });

    const validation = EpicParser.validate(result);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});
