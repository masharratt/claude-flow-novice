/**
 * CFN Loop Mode Validation Test Suite
 * Comprehensive test coverage for MVP, Standard, and Enterprise mode configurations
 *
 * @version 1.0.0
 * @description Tests for P1 HIGH PRIORITY - Mode-specific logic validation
 *
 * Coverage:
 * - Mode-specific thresholds (gate, consensus)
 * - Validator scaling by mode
 * - Iteration limits by mode
 * - Mode selection logic
 * - Configuration validation
 * - Type guards and utility functions
 * - Planning consensus (Enterprise Loop 0.5)
 * - Product owner team structure (Enterprise Loop 4)
 *
 * Test Requirements:
 * - ≥250 lines of test code
 * - ≥80% coverage of mode files
 * - All mode configurations tested
 * - 0 test failures required
 */

import { describe, test, expect } from '@jest/globals';
import {
  mvpMode,
  standardMode,
  enterpriseMode,
  getModeByName,
  getAllModes,
  selectMode,
  DEFAULT_MODE,
  isMVPMode,
  isEnterpriseMode,
  isStandardMode,
  hasPlanningConsensus,
  hasProductOwnerTeam,
} from '../../../src/cfn-loop/modes/index.js';
import type {
  CFNLoopMode,
  CFNLoopModeName,
  ProductOwnerStructure,
  ModeDetectionMetadata,
} from '../../../src/cfn-loop/modes/types.js';

describe('CFN Loop Mode Validation', () => {
  describe('MVP Mode Configuration', () => {
    test('should have correct mode name', () => {
      expect(mvpMode.name).toBe('mvp');
    });

    test('should have gate threshold of 0.70', () => {
      expect(mvpMode.gateThreshold).toBe(0.70);
    });

    test('should have consensus threshold of 0.85', () => {
      expect(mvpMode.consensusThreshold).toBe(0.85);
    });

    test('should have 5 max Loop 2 iterations', () => {
      expect(mvpMode.maxLoop2Iterations).toBe(5);
    });

    test('should have 5 max Loop 3 iterations', () => {
      expect(mvpMode.maxLoop3Iterations).toBe(5);
    });

    test('should have 2 validators', () => {
      expect(mvpMode.validatorCount).toBe(2);
    });

    test('should have correct validator types (reviewer, tester)', () => {
      expect(mvpMode.validatorTypes).toEqual(['reviewer', 'tester']);
      expect(mvpMode.validatorTypes.length).toBe(2);
    });

    test('should have single product owner structure', () => {
      expect(mvpMode.productOwnerStructure).toBe('single');
    });

    test('should skip architecture review and enterprise security audit', () => {
      expect(mvpMode.skipValidations).toBeDefined();
      expect(mvpMode.skipValidations).toContain('architecture-review');
      expect(mvpMode.skipValidations).toContain('enterprise-security-audit');
      expect(mvpMode.skipValidations?.length).toBe(2);
    });

    test('should have special instructions for rapid iteration', () => {
      expect(mvpMode.specialInstructions).toBeDefined();
      expect(mvpMode.specialInstructions).toContain('MVP mode');
      expect(mvpMode.specialInstructions).toContain('rapid iteration');
      expect(mvpMode.specialInstructions.length).toBeGreaterThan(50);
    });

    test('should not have planning consensus', () => {
      expect(mvpMode.planningConsensus).toBeUndefined();
    });

    test('should not have product owner team', () => {
      expect(mvpMode.productOwnerTeam).toBeUndefined();
    });

    test('should be valid MVP mode structure', () => {
      expect(isMVPMode(mvpMode)).toBe(true);
      expect(isStandardMode(mvpMode)).toBe(false);
      expect(isEnterpriseMode(mvpMode)).toBe(false);
    });
  });

  describe('Standard Mode Configuration', () => {
    test('should have correct mode name', () => {
      expect(standardMode.name).toBe('standard');
    });

    test('should have gate threshold of 0.75', () => {
      expect(standardMode.gateThreshold).toBe(0.75);
    });

    test('should have consensus threshold of 0.90', () => {
      expect(standardMode.consensusThreshold).toBe(0.90);
    });

    test('should have 10 max Loop 2 iterations', () => {
      expect(standardMode.maxLoop2Iterations).toBe(10);
    });

    test('should have 10 max Loop 3 iterations', () => {
      expect(standardMode.maxLoop3Iterations).toBe(10);
    });

    test('should have 4 validators', () => {
      expect(standardMode.validatorCount).toBe(4);
    });

    test('should have correct validator types (reviewer, tester, security, performance)', () => {
      expect(standardMode.validatorTypes).toEqual([
        'reviewer',
        'tester',
        'security',
        'performance',
      ]);
      expect(standardMode.validatorTypes.length).toBe(4);
    });

    test('should have single product owner structure', () => {
      expect(standardMode.productOwnerStructure).toBe('single');
    });

    test('should not skip any validations', () => {
      expect(standardMode.skipValidations).toBeUndefined();
    });

    test('should have special instructions for balanced quality', () => {
      expect(standardMode.specialInstructions).toBeDefined();
      expect(standardMode.specialInstructions).toContain('Standard mode');
      expect(standardMode.specialInstructions).toContain('Balance quality and velocity');
      expect(standardMode.specialInstructions.length).toBeGreaterThan(50);
    });

    test('should not have planning consensus', () => {
      expect(standardMode.planningConsensus).toBeUndefined();
    });

    test('should not have product owner team', () => {
      expect(standardMode.productOwnerTeam).toBeUndefined();
    });

    test('should be valid Standard mode structure', () => {
      expect(isStandardMode(standardMode)).toBe(true);
      expect(isMVPMode(standardMode)).toBe(false);
      expect(isEnterpriseMode(standardMode)).toBe(false);
    });
  });

  describe('Enterprise Mode Configuration', () => {
    test('should have correct mode name', () => {
      expect(enterpriseMode.name).toBe('enterprise');
    });

    test('should have gate threshold of 0.85', () => {
      expect(enterpriseMode.gateThreshold).toBe(0.85);
    });

    test('should have consensus threshold of 0.95', () => {
      expect(enterpriseMode.consensusThreshold).toBe(0.95);
    });

    test('should have 15 max Loop 2 iterations', () => {
      expect(enterpriseMode.maxLoop2Iterations).toBe(15);
    });

    test('should have 15 max Loop 3 iterations', () => {
      expect(enterpriseMode.maxLoop3Iterations).toBe(15);
    });

    test('should have 5 validators', () => {
      expect(enterpriseMode.validatorCount).toBe(5);
    });

    test('should have correct validator types (reviewer, tester, security, performance, architect)', () => {
      expect(enterpriseMode.validatorTypes).toEqual([
        'reviewer',
        'tester',
        'security',
        'performance',
        'architect',
      ]);
      expect(enterpriseMode.validatorTypes.length).toBe(5);
    });

    test('should have team product owner structure', () => {
      expect(enterpriseMode.productOwnerStructure).toBe('team');
    });

    test('should not skip any validations', () => {
      expect(enterpriseMode.skipValidations).toBeUndefined();
    });

    test('should have special instructions for maximum quality', () => {
      expect(enterpriseMode.specialInstructions).toBeDefined();
      expect(enterpriseMode.specialInstructions).toContain('Enterprise mode');
      expect(enterpriseMode.specialInstructions).toContain('Maximum quality standards');
      expect(enterpriseMode.specialInstructions.length).toBeGreaterThan(100);
    });

    test('should have planning consensus configuration (Loop 0.5)', () => {
      expect(enterpriseMode.planningConsensus).toBeDefined();
      expect(enterpriseMode.planningConsensus?.enabled).toBe(true);
      expect(enterpriseMode.planningConsensus?.threshold).toBe(0.85);
      expect(enterpriseMode.planningConsensus?.architectTypes).toEqual([
        'architect',
        'system-architect',
        'security-specialist',
      ]);
    });

    test('should have product owner team configuration (Loop 4)', () => {
      expect(enterpriseMode.productOwnerTeam).toBeDefined();
      expect(enterpriseMode.productOwnerTeam?.votingAlgorithm).toBe('weighted-confidence');
      expect(enterpriseMode.productOwnerTeam?.roles).toBeDefined();
      expect(enterpriseMode.productOwnerTeam?.roles.length).toBe(4);
    });

    test('should have correct product owner team roles', () => {
      const roles = enterpriseMode.productOwnerTeam?.roles || [];
      expect(roles[0]).toEqual({ name: 'cto', weight: 0.35 });
      expect(roles[1]).toEqual({ name: 'product-owner', weight: 0.30 });
      expect(roles[2]).toEqual({ name: 'user-power', weight: 0.20 });
      expect(roles[3]).toEqual({ name: 'user-accessibility', weight: 0.15 });
    });

    test('should have product owner team weights sum to 1.0', () => {
      const roles = enterpriseMode.productOwnerTeam?.roles || [];
      const totalWeight = roles.reduce((sum, role) => sum + role.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });

    test('should be valid Enterprise mode structure', () => {
      expect(isEnterpriseMode(enterpriseMode)).toBe(true);
      expect(isMVPMode(enterpriseMode)).toBe(false);
      expect(isStandardMode(enterpriseMode)).toBe(false);
    });

    test('should have planning consensus enabled', () => {
      expect(hasPlanningConsensus(enterpriseMode)).toBe(true);
      expect(hasPlanningConsensus(standardMode)).toBe(false);
      expect(hasPlanningConsensus(mvpMode)).toBe(false);
    });

    test('should have product owner team enabled', () => {
      expect(hasProductOwnerTeam(enterpriseMode)).toBe(true);
      expect(hasProductOwnerTeam(standardMode)).toBe(false);
      expect(hasProductOwnerTeam(mvpMode)).toBe(false);
    });
  });

  describe('Mode Threshold Validation', () => {
    test('should have progressively higher gate thresholds (MVP < Standard < Enterprise)', () => {
      expect(mvpMode.gateThreshold).toBeLessThan(standardMode.gateThreshold);
      expect(standardMode.gateThreshold).toBeLessThan(enterpriseMode.gateThreshold);
    });

    test('should have progressively higher consensus thresholds (MVP < Standard < Enterprise)', () => {
      expect(mvpMode.consensusThreshold).toBeLessThan(standardMode.consensusThreshold);
      expect(standardMode.consensusThreshold).toBeLessThan(enterpriseMode.consensusThreshold);
    });

    test('should have consensus threshold higher than gate threshold for all modes', () => {
      expect(mvpMode.consensusThreshold).toBeGreaterThan(mvpMode.gateThreshold);
      expect(standardMode.consensusThreshold).toBeGreaterThan(standardMode.gateThreshold);
      expect(enterpriseMode.consensusThreshold).toBeGreaterThan(enterpriseMode.gateThreshold);
    });

    test('should have gate thresholds between 0.0 and 1.0', () => {
      expect(mvpMode.gateThreshold).toBeGreaterThanOrEqual(0.0);
      expect(mvpMode.gateThreshold).toBeLessThanOrEqual(1.0);
      expect(standardMode.gateThreshold).toBeGreaterThanOrEqual(0.0);
      expect(standardMode.gateThreshold).toBeLessThanOrEqual(1.0);
      expect(enterpriseMode.gateThreshold).toBeGreaterThanOrEqual(0.0);
      expect(enterpriseMode.gateThreshold).toBeLessThanOrEqual(1.0);
    });

    test('should have consensus thresholds between 0.0 and 1.0', () => {
      expect(mvpMode.consensusThreshold).toBeGreaterThanOrEqual(0.0);
      expect(mvpMode.consensusThreshold).toBeLessThanOrEqual(1.0);
      expect(standardMode.consensusThreshold).toBeGreaterThanOrEqual(0.0);
      expect(standardMode.consensusThreshold).toBeLessThanOrEqual(1.0);
      expect(enterpriseMode.consensusThreshold).toBeGreaterThanOrEqual(0.0);
      expect(enterpriseMode.consensusThreshold).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Validator Scaling', () => {
    test('should scale validators progressively (MVP: 2, Standard: 4, Enterprise: 5)', () => {
      expect(mvpMode.validatorCount).toBe(2);
      expect(standardMode.validatorCount).toBe(4);
      expect(enterpriseMode.validatorCount).toBe(5);
    });

    test('should have validator count match validator types length', () => {
      expect(mvpMode.validatorCount).toBe(mvpMode.validatorTypes.length);
      expect(standardMode.validatorCount).toBe(standardMode.validatorTypes.length);
      expect(enterpriseMode.validatorCount).toBe(enterpriseMode.validatorTypes.length);
    });

    test('should include reviewer and tester in all modes', () => {
      expect(mvpMode.validatorTypes).toContain('reviewer');
      expect(mvpMode.validatorTypes).toContain('tester');
      expect(standardMode.validatorTypes).toContain('reviewer');
      expect(standardMode.validatorTypes).toContain('tester');
      expect(enterpriseMode.validatorTypes).toContain('reviewer');
      expect(enterpriseMode.validatorTypes).toContain('tester');
    });

    test('should add security and performance validators in Standard mode', () => {
      expect(standardMode.validatorTypes).toContain('security');
      expect(standardMode.validatorTypes).toContain('performance');
      expect(mvpMode.validatorTypes).not.toContain('security');
      expect(mvpMode.validatorTypes).not.toContain('performance');
    });

    test('should add architect validator in Enterprise mode', () => {
      expect(enterpriseMode.validatorTypes).toContain('architect');
      expect(standardMode.validatorTypes).not.toContain('architect');
      expect(mvpMode.validatorTypes).not.toContain('architect');
    });
  });

  describe('Iteration Limits', () => {
    test('should have progressively higher Loop 2 iteration limits', () => {
      expect(mvpMode.maxLoop2Iterations).toBe(5);
      expect(standardMode.maxLoop2Iterations).toBe(10);
      expect(enterpriseMode.maxLoop2Iterations).toBe(15);
    });

    test('should have progressively higher Loop 3 iteration limits', () => {
      expect(mvpMode.maxLoop3Iterations).toBe(5);
      expect(standardMode.maxLoop3Iterations).toBe(10);
      expect(enterpriseMode.maxLoop3Iterations).toBe(15);
    });

    test('should have same iteration limits for Loop 2 and Loop 3 within each mode', () => {
      expect(mvpMode.maxLoop2Iterations).toBe(mvpMode.maxLoop3Iterations);
      expect(standardMode.maxLoop2Iterations).toBe(standardMode.maxLoop3Iterations);
      expect(enterpriseMode.maxLoop2Iterations).toBe(enterpriseMode.maxLoop3Iterations);
    });

    test('should have iteration limits greater than 0', () => {
      expect(mvpMode.maxLoop2Iterations).toBeGreaterThan(0);
      expect(mvpMode.maxLoop3Iterations).toBeGreaterThan(0);
      expect(standardMode.maxLoop2Iterations).toBeGreaterThan(0);
      expect(standardMode.maxLoop3Iterations).toBeGreaterThan(0);
      expect(enterpriseMode.maxLoop2Iterations).toBeGreaterThan(0);
      expect(enterpriseMode.maxLoop3Iterations).toBeGreaterThan(0);
    });
  });

  describe('Mode Selection Logic', () => {
    test('getModeByName should return correct mode for "mvp"', () => {
      const mode = getModeByName('mvp');
      expect(mode.name).toBe('mvp');
      expect(mode.gateThreshold).toBe(0.70);
    });

    test('getModeByName should return correct mode for "standard"', () => {
      const mode = getModeByName('standard');
      expect(mode.name).toBe('standard');
      expect(mode.gateThreshold).toBe(0.75);
    });

    test('getModeByName should return correct mode for "enterprise"', () => {
      const mode = getModeByName('enterprise');
      expect(mode.name).toBe('enterprise');
      expect(mode.gateThreshold).toBe(0.85);
    });

    test('getModeByName should throw error for invalid mode name', () => {
      expect(() => getModeByName('invalid' as CFNLoopModeName)).toThrow('Unknown CFN Loop mode');
    });

    test('getAllModes should return all three modes', () => {
      const modes = getAllModes();
      expect(modes.length).toBe(3);
      expect(modes.map((m) => m.name)).toEqual(['mvp', 'standard', 'enterprise']);
    });

    test('DEFAULT_MODE should be Standard mode', () => {
      expect(DEFAULT_MODE.name).toBe('standard');
    });
  });

  describe('selectMode Function', () => {
    test('should select mode by explicit mode name parameter', () => {
      const mode = selectMode('mvp');
      expect(mode.name).toBe('mvp');
    });

    test('should select mode from metadata.cfnMode', () => {
      const metadata: ModeDetectionMetadata = { cfnMode: 'enterprise' };
      const mode = selectMode(undefined, metadata);
      expect(mode.name).toBe('enterprise');
    });

    test('should select mode from metadata.mode', () => {
      const metadata: ModeDetectionMetadata = { mode: 'mvp' };
      const mode = selectMode(undefined, metadata);
      expect(mode.name).toBe('mvp');
    });

    test('should prioritize explicit mode name over metadata', () => {
      const metadata: ModeDetectionMetadata = { cfnMode: 'enterprise' };
      const mode = selectMode('mvp', metadata);
      expect(mode.name).toBe('mvp');
    });

    test('should prioritize metadata.cfnMode over metadata.mode', () => {
      const metadata: ModeDetectionMetadata = { cfnMode: 'enterprise', mode: 'mvp' };
      const mode = selectMode(undefined, metadata);
      expect(mode.name).toBe('enterprise');
    });

    test('should return default (Standard) mode when no parameters provided', () => {
      const mode = selectMode();
      expect(mode.name).toBe('standard');
    });

    test('should return default (Standard) mode when metadata is empty', () => {
      const mode = selectMode(undefined, {});
      expect(mode.name).toBe('standard');
    });
  });

  describe('Type Guards', () => {
    test('isMVPMode should correctly identify MVP mode', () => {
      expect(isMVPMode(mvpMode)).toBe(true);
      expect(isMVPMode(standardMode)).toBe(false);
      expect(isMVPMode(enterpriseMode)).toBe(false);
    });

    test('isStandardMode should correctly identify Standard mode', () => {
      expect(isStandardMode(standardMode)).toBe(true);
      expect(isStandardMode(mvpMode)).toBe(false);
      expect(isStandardMode(enterpriseMode)).toBe(false);
    });

    test('isEnterpriseMode should correctly identify Enterprise mode', () => {
      expect(isEnterpriseMode(enterpriseMode)).toBe(true);
      expect(isEnterpriseMode(mvpMode)).toBe(false);
      expect(isEnterpriseMode(standardMode)).toBe(false);
    });

    test('hasPlanningConsensus should only be true for Enterprise mode', () => {
      expect(hasPlanningConsensus(enterpriseMode)).toBe(true);
      expect(hasPlanningConsensus(standardMode)).toBe(false);
      expect(hasPlanningConsensus(mvpMode)).toBe(false);
    });

    test('hasProductOwnerTeam should only be true for Enterprise mode', () => {
      expect(hasProductOwnerTeam(enterpriseMode)).toBe(true);
      expect(hasProductOwnerTeam(standardMode)).toBe(false);
      expect(hasProductOwnerTeam(mvpMode)).toBe(false);
    });
  });

  describe('Product Owner Structure', () => {
    test('MVP should have single product owner', () => {
      expect(mvpMode.productOwnerStructure).toBe('single');
    });

    test('Standard should have single product owner', () => {
      expect(standardMode.productOwnerStructure).toBe('single');
    });

    test('Enterprise should have team product owner', () => {
      expect(enterpriseMode.productOwnerStructure).toBe('team');
    });

    test('only Enterprise mode should have team structure', () => {
      const modes = getAllModes();
      const teamModes = modes.filter((m) => m.productOwnerStructure === 'team');
      expect(teamModes.length).toBe(1);
      expect(teamModes[0].name).toBe('enterprise');
    });
  });

  describe('Enterprise Planning Consensus (Loop 0.5)', () => {
    test('should have correct planning consensus threshold', () => {
      expect(enterpriseMode.planningConsensus?.threshold).toBe(0.85);
    });

    test('should have three architect types', () => {
      const architectTypes = enterpriseMode.planningConsensus?.architectTypes || [];
      expect(architectTypes.length).toBe(3);
    });

    test('should include system architect, security specialist, and architect', () => {
      const architectTypes = enterpriseMode.planningConsensus?.architectTypes || [];
      expect(architectTypes).toContain('architect');
      expect(architectTypes).toContain('system-architect');
      expect(architectTypes).toContain('security-specialist');
    });

    test('planning consensus should be disabled for non-Enterprise modes', () => {
      expect(mvpMode.planningConsensus?.enabled).toBeUndefined();
      expect(standardMode.planningConsensus?.enabled).toBeUndefined();
    });
  });

  describe('Enterprise Product Owner Team (Loop 4)', () => {
    test('should use weighted-confidence voting algorithm', () => {
      expect(enterpriseMode.productOwnerTeam?.votingAlgorithm).toBe('weighted-confidence');
    });

    test('should have CTO with highest weight', () => {
      const ctoRole = enterpriseMode.productOwnerTeam?.roles.find((r) => r.name === 'cto');
      const allWeights = enterpriseMode.productOwnerTeam?.roles.map((r) => r.weight) || [];
      expect(ctoRole?.weight).toBe(Math.max(...allWeights));
      expect(ctoRole?.weight).toBe(0.35);
    });

    test('should have product owner with second highest weight', () => {
      const poRole = enterpriseMode.productOwnerTeam?.roles.find(
        (r) => r.name === 'product-owner'
      );
      expect(poRole?.weight).toBe(0.30);
    });

    test('should include user-power stakeholder', () => {
      const userRole = enterpriseMode.productOwnerTeam?.roles.find(
        (r) => r.name === 'user-power'
      );
      expect(userRole?.weight).toBe(0.20);
    });

    test('should include user-accessibility stakeholder', () => {
      const accessRole = enterpriseMode.productOwnerTeam?.roles.find(
        (r) => r.name === 'user-accessibility'
      );
      expect(accessRole?.weight).toBe(0.15);
    });

    test('should have all weights as positive numbers', () => {
      const roles = enterpriseMode.productOwnerTeam?.roles || [];
      roles.forEach((role) => {
        expect(role.weight).toBeGreaterThan(0);
        expect(role.weight).toBeLessThanOrEqual(1.0);
      });
    });

    test('product owner team should be undefined for non-Enterprise modes', () => {
      expect(mvpMode.productOwnerTeam).toBeUndefined();
      expect(standardMode.productOwnerTeam).toBeUndefined();
    });
  });

  describe('Skip Validations', () => {
    test('MVP mode should skip architecture review', () => {
      expect(mvpMode.skipValidations).toContain('architecture-review');
    });

    test('MVP mode should skip enterprise security audit', () => {
      expect(mvpMode.skipValidations).toContain('enterprise-security-audit');
    });

    test('Standard mode should not skip any validations', () => {
      expect(standardMode.skipValidations).toBeUndefined();
    });

    test('Enterprise mode should not skip any validations', () => {
      expect(enterpriseMode.skipValidations).toBeUndefined();
    });

    test('only MVP mode should have skip validations', () => {
      const modes = getAllModes();
      const modesWithSkips = modes.filter((m) => m.skipValidations !== undefined);
      expect(modesWithSkips.length).toBe(1);
      expect(modesWithSkips[0].name).toBe('mvp');
    });
  });

  describe('Configuration Completeness', () => {
    test('all modes should have required base properties', () => {
      const modes = getAllModes();
      modes.forEach((mode) => {
        expect(mode.name).toBeDefined();
        expect(mode.gateThreshold).toBeDefined();
        expect(mode.consensusThreshold).toBeDefined();
        expect(mode.maxLoop2Iterations).toBeDefined();
        expect(mode.maxLoop3Iterations).toBeDefined();
        expect(mode.validatorCount).toBeDefined();
        expect(mode.validatorTypes).toBeDefined();
        expect(mode.productOwnerStructure).toBeDefined();
        expect(mode.specialInstructions).toBeDefined();
      });
    });

    test('all mode names should be unique', () => {
      const modes = getAllModes();
      const names = modes.map((m) => m.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(modes.length);
    });

    test('all validator types should be non-empty strings', () => {
      const modes = getAllModes();
      modes.forEach((mode) => {
        mode.validatorTypes.forEach((type) => {
          expect(typeof type).toBe('string');
          expect(type.length).toBeGreaterThan(0);
        });
      });
    });

    test('special instructions should be meaningful', () => {
      const modes = getAllModes();
      modes.forEach((mode) => {
        expect(mode.specialInstructions.length).toBeGreaterThan(30);
        expect(mode.specialInstructions).toContain('mode');
      });
    });
  });
});
