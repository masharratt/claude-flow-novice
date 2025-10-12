/**
 * CFN Loop Mode Selection Tests
 *
 * Tests for mode detection, selection, and configuration.
 *
 * @group unit
 * @group cfn-loop
 */

import { describe, it, expect } from 'vitest';
import {
  selectMode,
  detectModeFromFilename,
  detectModeFromMetadata,
  getMode,
  getAllModes,
} from '../index.js';
import { mvpMode } from '../mvp-mode.js';
import { enterpriseMode } from '../enterprise-mode.js';
import { standardMode } from '../standard-mode.js';

describe('Mode Selection', () => {
  describe('selectMode', () => {
    it('should select explicit mode', () => {
      const result = selectMode({ mode: 'mvp' });
      expect(result.mode.name).toBe('mvp');
      expect(result.source).toBe('explicit');
    });

    it('should detect mode from filename', () => {
      const result = selectMode({
        filename: 'my-project-mvp.json',
        auto: true,
      });
      expect(result.mode.name).toBe('mvp');
      expect(result.source).toBe('filename');
      expect(result.detectedFrom).toBe('my-project-mvp.json');
    });

    it('should detect mode from metadata', () => {
      const result = selectMode({
        metadata: { cfnMode: 'enterprise' },
        auto: true,
      });
      expect(result.mode.name).toBe('enterprise');
      expect(result.source).toBe('metadata');
    });

    it('should default to standard mode', () => {
      const result = selectMode({});
      expect(result.mode.name).toBe('standard');
      expect(result.source).toBe('default');
    });

    it('should prioritize explicit mode over auto-detection', () => {
      const result = selectMode({
        mode: 'enterprise',
        filename: 'project-mvp.json',
        auto: true,
      });
      expect(result.mode.name).toBe('enterprise');
      expect(result.source).toBe('explicit');
    });
  });

  describe('detectModeFromFilename', () => {
    it('should detect MVP from -mvp pattern', () => {
      expect(detectModeFromFilename('project-mvp.json')).toBe('mvp');
      expect(detectModeFromFilename('my-app-mvp-config.json')).toBe('mvp');
    });

    it('should detect MVP from _mvp pattern', () => {
      expect(detectModeFromFilename('project_mvp.json')).toBe('mvp');
    });

    it('should detect MVP from .mvp pattern', () => {
      expect(detectModeFromFilename('project.mvp.json')).toBe('mvp');
    });

    it('should detect Enterprise from -enterprise pattern', () => {
      expect(detectModeFromFilename('project-enterprise.json')).toBe('enterprise');
    });

    it('should detect Enterprise from _enterprise pattern', () => {
      expect(detectModeFromFilename('project_enterprise.json')).toBe('enterprise');
    });

    it('should detect Enterprise from .enterprise pattern', () => {
      expect(detectModeFromFilename('project.enterprise.json')).toBe('enterprise');
    });

    it('should be case-insensitive', () => {
      expect(detectModeFromFilename('PROJECT-MVP.JSON')).toBe('mvp');
      expect(detectModeFromFilename('PROJECT-ENTERPRISE.JSON')).toBe('enterprise');
    });

    it('should return undefined for standard patterns', () => {
      expect(detectModeFromFilename('project.json')).toBeUndefined();
      expect(detectModeFromFilename('config.json')).toBeUndefined();
    });
  });

  describe('detectModeFromMetadata', () => {
    it('should detect from cfnMode field', () => {
      expect(detectModeFromMetadata({ cfnMode: 'mvp' })).toBe('mvp');
      expect(detectModeFromMetadata({ cfnMode: 'enterprise' })).toBe('enterprise');
      expect(detectModeFromMetadata({ cfnMode: 'standard' })).toBe('standard');
    });

    it('should detect from mode field', () => {
      expect(detectModeFromMetadata({ mode: 'mvp' })).toBe('mvp');
      expect(detectModeFromMetadata({ mode: 'enterprise' })).toBe('enterprise');
    });

    it('should detect from quality field', () => {
      expect(detectModeFromMetadata({ quality: 'mvp' })).toBe('mvp');
      expect(detectModeFromMetadata({ quality: 'enterprise' })).toBe('enterprise');
    });

    it('should prioritize cfnMode over mode', () => {
      expect(
        detectModeFromMetadata({
          cfnMode: 'enterprise',
          mode: 'mvp',
        })
      ).toBe('enterprise');
    });

    it('should return undefined for unknown metadata', () => {
      expect(detectModeFromMetadata({})).toBeUndefined();
      expect(detectModeFromMetadata({ other: 'value' })).toBeUndefined();
    });
  });

  describe('getMode', () => {
    it('should return mode by name', () => {
      expect(getMode('mvp')).toBe(mvpMode);
      expect(getMode('enterprise')).toBe(enterpriseMode);
      expect(getMode('standard')).toBe(standardMode);
    });
  });

  describe('getAllModes', () => {
    it('should return all registered modes', () => {
      const modes = getAllModes();
      expect(modes).toHaveLength(3);
      expect(modes.map((m) => m.name)).toContain('mvp');
      expect(modes.map((m) => m.name)).toContain('enterprise');
      expect(modes.map((m) => m.name)).toContain('standard');
    });
  });
});

describe('Mode Configurations', () => {
  describe('MVP Mode', () => {
    it('should have correct thresholds', () => {
      expect(mvpMode.gateThreshold).toBe(0.70);
      expect(mvpMode.consensusThreshold).toBe(0.80);
    });

    it('should have reduced iteration limits', () => {
      expect(mvpMode.maxLoop2Iterations).toBe(5);
      expect(mvpMode.maxLoop3Iterations).toBe(5);
    });

    it('should have 2 validators', () => {
      expect(mvpMode.validatorCount).toBe(2);
      expect(mvpMode.validatorTypes).toEqual(['reviewer', 'tester']);
    });

    it('should have single product owner', () => {
      expect(mvpMode.productOwnerStructure).toBe('single');
    });

    it('should skip non-critical validations', () => {
      expect(mvpMode.skipValidations).toContain('accessibility');
      expect(mvpMode.skipValidations).toContain('performance-benchmarks');
    });

    it('should not have planning consensus', () => {
      expect(mvpMode.planningConsensus).toBeUndefined();
    });

    it('should not have product owner team', () => {
      expect(mvpMode.productOwnerTeam).toBeUndefined();
    });
  });

  describe('Enterprise Mode', () => {
    it('should have strict thresholds', () => {
      expect(enterpriseMode.gateThreshold).toBe(0.75);
      expect(enterpriseMode.consensusThreshold).toBe(0.95);
    });

    it('should have extended iteration limits', () => {
      expect(enterpriseMode.maxLoop2Iterations).toBe(15);
      expect(enterpriseMode.maxLoop3Iterations).toBe(15);
    });

    it('should have 4 validators', () => {
      expect(enterpriseMode.validatorCount).toBe(4);
      expect(enterpriseMode.validatorTypes).toEqual([
        'code-quality-validator',
        'security-specialist',
        'perf-analyzer',
        'tester',
      ]);
    });

    it('should have team product owner structure', () => {
      expect(enterpriseMode.productOwnerStructure).toBe('team');
    });

    it('should not skip validations', () => {
      expect(enterpriseMode.skipValidations).toEqual([]);
    });

    it('should have planning consensus (Loop 0.5)', () => {
      expect(enterpriseMode.planningConsensus).toBeDefined();
      expect(enterpriseMode.planningConsensus?.enabled).toBe(true);
      expect(enterpriseMode.planningConsensus?.threshold).toBe(0.85);
      expect(enterpriseMode.planningConsensus?.architectTypes).toEqual([
        'architect',
        'system-architect',
        'security-specialist',
      ]);
    });

    it('should have product owner team with 4 members', () => {
      expect(enterpriseMode.productOwnerTeam).toBeDefined();
      expect(enterpriseMode.productOwnerTeam?.roles).toHaveLength(4);
      expect(enterpriseMode.productOwnerTeam?.votingAlgorithm).toBe('weighted-confidence');
    });

    it('should have correct stakeholder weights', () => {
      const roles = enterpriseMode.productOwnerTeam?.roles;
      expect(roles?.find((r) => r.name === 'cto')?.weight).toBe(0.30);
      expect(roles?.find((r) => r.name === 'product-owner')?.weight).toBe(0.30);
      expect(roles?.find((r) => r.name === 'user-power')?.weight).toBe(0.20);
      expect(roles?.find((r) => r.name === 'user-accessibility')?.weight).toBe(0.20);
    });

    it('should have weights sum to 1.0', () => {
      const totalWeight =
        enterpriseMode.productOwnerTeam?.roles.reduce((sum, role) => sum + role.weight, 0) || 0;
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });
  });

  describe('Standard Mode', () => {
    it('should have standard thresholds', () => {
      expect(standardMode.gateThreshold).toBe(0.75);
      expect(standardMode.consensusThreshold).toBe(0.90);
    });

    it('should have standard iteration limits', () => {
      expect(standardMode.maxLoop2Iterations).toBe(10);
      expect(standardMode.maxLoop3Iterations).toBe(10);
    });

    it('should have 4 validators', () => {
      expect(standardMode.validatorCount).toBe(4);
      expect(standardMode.validatorTypes).toEqual([
        'reviewer',
        'security-specialist',
        'tester',
        'analyst',
      ]);
    });

    it('should have single product owner', () => {
      expect(standardMode.productOwnerStructure).toBe('single');
    });

    it('should not skip validations', () => {
      expect(standardMode.skipValidations).toEqual([]);
    });
  });
});
