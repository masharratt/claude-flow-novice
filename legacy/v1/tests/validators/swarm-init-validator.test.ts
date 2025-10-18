/**
 * Unit tests for Swarm Init Validator
 *
 * Tests validation logic for swarm initialization before agent spawning.
 * Based on test strategy from AGENT_COORDINATION_TEST_STRATEGY.md (lines 114-155)
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import {
  validateSwarmInit,
  requireSwarmInit,
  getRecommendedTopology,
  isSwarmRequired,
  validateSwarmConfig,
  type SwarmStatus,
  type SwarmValidatorConfig,
} from '../../src/validators/swarm-init-validator.js';

describe('Swarm Init Validator', () => {
  describe('validateSwarmInit', () => {
    describe('Single agent spawning (no swarm required)', () => {
      it('should pass validation for single agent without swarm', async () => {
        const result = await validateSwarmInit(1);

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.suggestion).toBeUndefined();
      });

      it('should pass validation for 0 agents', async () => {
        const result = await validateSwarmInit(0);

        expect(result.valid).toBe(true);
      });
    });

    describe('Multi-agent spawning with swarm initialized', () => {
      it('should pass validation for 2 agents with mesh topology', async () => {
        const swarmStatus: SwarmStatus = {
          initialized: true,
          topology: 'mesh',
          maxAgents: 5,
          activeAgents: 0,
          swarmId: 'test-swarm-123',
        };

        const result = await validateSwarmInit(2, swarmStatus);

        expect(result.valid).toBe(true);
      });

      it('should pass validation for 7 agents with mesh topology', async () => {
        const swarmStatus: SwarmStatus = {
          initialized: true,
          topology: 'mesh',
          maxAgents: 7,
          swarmId: 'test-swarm-456',
        };

        const result = await validateSwarmInit(7, swarmStatus);

        expect(result.valid).toBe(true);
      });

      it('should pass validation for 8 agents with hierarchical topology', async () => {
        const swarmStatus: SwarmStatus = {
          initialized: true,
          topology: 'hierarchical',
          maxAgents: 10,
          swarmId: 'test-swarm-789',
        };

        const result = await validateSwarmInit(8, swarmStatus);

        expect(result.valid).toBe(true);
      });
    });

    describe('Multi-agent spawning without swarm (should fail)', () => {
      it('should fail validation for 2 agents without swarm', async () => {
        const swarmStatus: SwarmStatus = {
          initialized: false,
        };

        const result = await validateSwarmInit(2, swarmStatus);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('SWARM INITIALIZATION REQUIRED');
        expect(result.error).toContain('2 agents');
        expect(result.suggestion).toContain('npx claude-flow-novice swarm init');
        expect(result.suggestion).toContain('--topology mesh');
        expect(result.topology).toBe('mesh');
        expect(result.maxAgents).toBe(2);
      });

      it('should fail validation for 3 agents without swarm (JWT scenario)', async () => {
        const swarmStatus: SwarmStatus = {
          initialized: false,
        };

        const result = await validateSwarmInit(3, swarmStatus);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('3 agents');
        expect(result.error).toContain('inconsistent');
        expect(result.suggestion).toContain('mesh');
        expect(result.topology).toBe('mesh');
      });

      it('should fail validation for 10 agents without swarm', async () => {
        const swarmStatus: SwarmStatus = {
          initialized: false,
        };

        const result = await validateSwarmInit(10, swarmStatus);

        expect(result.valid).toBe(false);
        expect(result.suggestion).toContain('--topology hierarchical');
        expect(result.topology).toBe('hierarchical');
        expect(result.maxAgents).toBe(10);
      });
    });
  });

  describe('requireSwarmInit', () => {
    it('should not throw for valid swarm', async () => {
      const swarmStatus: SwarmStatus = {
        initialized: true,
        topology: 'mesh',
        maxAgents: 5,
        swarmId: 'test-swarm',
      };

      await expect(requireSwarmInit(3, swarmStatus)).resolves.toBeUndefined();
    });

    it('should throw error for invalid swarm', async () => {
      const swarmStatus: SwarmStatus = {
        initialized: false,
      };

      await expect(requireSwarmInit(3, swarmStatus)).rejects.toThrow(
        'SWARM INITIALIZATION REQUIRED'
      );
    });

    it('should include suggestion in error message', async () => {
      const swarmStatus: SwarmStatus = {
        initialized: false,
      };

      await expect(requireSwarmInit(3, swarmStatus)).rejects.toThrow(
        'npx claude-flow-novice swarm init'
      );
    });
  });

  describe('getRecommendedTopology', () => {
    it('should return mesh for 2-7 agents', () => {
      expect(getRecommendedTopology(2)).toBe('mesh');
      expect(getRecommendedTopology(5)).toBe('mesh');
      expect(getRecommendedTopology(7)).toBe('mesh');
    });

    it('should return hierarchical for 8+ agents', () => {
      expect(getRecommendedTopology(8)).toBe('hierarchical');
      expect(getRecommendedTopology(10)).toBe('hierarchical');
      expect(getRecommendedTopology(15)).toBe('hierarchical');
      expect(getRecommendedTopology(20)).toBe('hierarchical');
    });

    it('should respect custom configuration', () => {
      const config: SwarmValidatorConfig = {
        meshTopologyMaxAgents: 10,
      };

      expect(getRecommendedTopology(8, config)).toBe('mesh');
      expect(getRecommendedTopology(10, config)).toBe('mesh');
      expect(getRecommendedTopology(11, config)).toBe('hierarchical');
    });
  });

  describe('isSwarmRequired', () => {
    it('should return false for single agent', () => {
      expect(isSwarmRequired(1)).toBe(false);
    });

    it('should return true for 2+ agents', () => {
      expect(isSwarmRequired(2)).toBe(true);
      expect(isSwarmRequired(3)).toBe(true);
      expect(isSwarmRequired(10)).toBe(true);
    });

    it('should respect custom minAgentsRequiringSwarm', () => {
      const config: SwarmValidatorConfig = {
        minAgentsRequiringSwarm: 5,
      };

      expect(isSwarmRequired(2, config)).toBe(false);
      expect(isSwarmRequired(4, config)).toBe(false);
      expect(isSwarmRequired(5, config)).toBe(true);
      expect(isSwarmRequired(6, config)).toBe(true);
    });

    it('should return false when validation is disabled', () => {
      const config: SwarmValidatorConfig = {
        requireSwarmForMultiAgent: false,
      };

      expect(isSwarmRequired(10, config)).toBe(false);
    });
  });

  describe('validateSwarmConfig', () => {
    it('should validate correct mesh topology configuration', () => {
      const result = validateSwarmConfig('mesh', 5);

      expect(result.valid).toBe(true);
    });

    it('should validate correct hierarchical topology configuration', () => {
      const result = validateSwarmConfig('hierarchical', 10);

      expect(result.valid).toBe(true);
    });

    it('should fail for mesh topology with 10 agents', () => {
      const result = validateSwarmConfig('mesh', 10);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not optimal for 10 agents");
      expect(result.suggestion).toContain('hierarchical');
      expect(result.topology).toBe('hierarchical');
    });

    it('should fail for hierarchical topology with 5 agents', () => {
      const result = validateSwarmConfig('hierarchical', 5);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not optimal for 5 agents");
      expect(result.suggestion).toContain('mesh');
      expect(result.topology).toBe('mesh');
    });
  });

  describe('Real-world JWT secret scenario (from test strategy)', () => {
    it('should prevent inconsistent JWT implementations without swarm', async () => {
      // Scenario: 3 agents fixing JWT secret without coordination
      const swarmStatus: SwarmStatus = {
        initialized: false,
      };

      const result = await validateSwarmInit(3, swarmStatus);

      // Validation should fail
      expect(result.valid).toBe(false);

      // Error should explain the problem
      expect(result.error).toContain('3 agents');
      expect(result.error).toContain('inconsistent');

      // Suggestion should provide solution
      expect(result.suggestion).toContain('npx claude-flow-novice swarm init');
      expect(result.suggestion).toContain('--topology mesh');
    });

    it('should allow coordinated JWT fix with swarm', async () => {
      // Scenario: 3 agents fixing JWT secret WITH coordination
      const swarmStatus: SwarmStatus = {
        initialized: true,
        topology: 'mesh',
        maxAgents: 3,
        swarmId: 'jwt-fix-swarm',
      };

      const result = await validateSwarmInit(3, swarmStatus);

      // Validation should pass
      expect(result.valid).toBe(true);
    });
  });
});
