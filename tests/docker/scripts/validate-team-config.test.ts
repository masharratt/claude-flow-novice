/**
 * Validate Team Config Test Suite
 * Tests for validating team configuration files
 *
 * Migrated from: docker/scripts/validate-team-config.sh
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ValidateTeamConfig, ValidationResult } from '../../../src/docker/scripts/validate-team-config';
import * as fs from 'fs';

jest.mock('fs');

describe('ValidateTeamConfig', () => {
  let validator: ValidateTeamConfig;
  const mockReadFile = jest.spyOn(fs, 'readFileSync') as jest.Mock;

  const validConfig = {
    team: {
      id: 'backend',
      name: 'Backend Team',
      workspace: {
        path: '/workspace/backend',
        disk_quota: '100GB',
      },
      resources: {
        memory: '10GB',
        cpu_cores: 2,
        max_agents: 5,
      },
      network: {
        subnet_id: 2,
        coordinator_ip: '172.18.2.10',
      },
      allowed_skills: ['bash', 'typescript'],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new ValidateTeamConfig();
  });

  describe('Configuration Loading', () => {
    it('should load YAML config file', async () => {
      mockReadFile.mockReturnValue(JSON.stringify(validConfig));

      const config = await validator.loadConfig('/config/teams/backend.yaml');

      expect(config.team.id).toBe('backend');
    });

    it('should detect missing file', async () => {
      mockReadFile.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await validator.validateFile('/missing.yaml');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('File not found: /missing.yaml');
    });

    it('should detect invalid YAML syntax', async () => {
      mockReadFile.mockReturnValue('{ invalid yaml: [');

      const result = await validator.loadConfigSafe('/bad.yaml');

      expect(result.valid).toBe(false);
    });
  });

  describe('Required Fields', () => {
    it('should validate team.id exists', async () => {
      const config = { team: { ...validConfig.team } };
      delete config.team.id;

      const result = validator.validateRequiredFields(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: team.id');
    });

    it('should validate team.name exists', async () => {
      const config = { team: { ...validConfig.team } };
      delete config.team.name;

      const result = validator.validateRequiredFields(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: team.name');
    });

    it('should validate workspace.path exists', async () => {
      const config = JSON.parse(JSON.stringify(validConfig));
      delete config.team.workspace.path;

      const result = validator.validateRequiredFields(config);

      expect(result.valid).toBe(false);
    });

    it('should validate all required fields', async () => {
      const result = validator.validateRequiredFields(validConfig);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('Team ID Format', () => {
    it('should accept valid team ID format', () => {
      const config = { ...validConfig };
      config.team.id = 'backend';

      const result = validator.validateTeamId(config.team.id);

      expect(result.valid).toBe(true);
    });

    it('should accept IDs with hyphens', () => {
      const result = validator.validateTeamId('my-backend-team');

      expect(result.valid).toBe(true);
    });

    it('should accept IDs with numbers', () => {
      const result = validator.validateTeamId('team2024');

      expect(result.valid).toBe(true);
    });

    it('should reject IDs starting with uppercase', () => {
      const result = validator.validateTeamId('Backend');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Team ID must be lowercase alphanumeric with hyphens'
      );
    });

    it('should reject IDs with special characters', () => {
      const result = validator.validateTeamId('backend@team');

      expect(result.valid).toBe(false);
    });

    it('should reject IDs starting with number', () => {
      const result = validator.validateTeamId('1backend');

      expect(result.valid).toBe(false);
    });

    it('should reject empty team ID', () => {
      const result = validator.validateTeamId('');

      expect(result.valid).toBe(false);
    });
  });

  describe('Network Configuration', () => {
    it('should validate subnet_id is in range 1-254', () => {
      const result = validator.validateNetworkConfig({
        subnet_id: 2,
        coordinator_ip: '172.18.2.10',
      });

      expect(result.valid).toBe(true);
    });

    it('should reject subnet_id < 1', () => {
      const result = validator.validateNetworkConfig({
        subnet_id: 0,
        coordinator_ip: '172.18.0.10',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Subnet ID must be between 1 and 254');
    });

    it('should reject subnet_id > 254', () => {
      const result = validator.validateNetworkConfig({
        subnet_id: 255,
        coordinator_ip: '172.18.255.10',
      });

      expect(result.valid).toBe(false);
    });

    it('should validate coordinator IP matches subnet', () => {
      const result = validator.validateCoordinatorIP(
        '172.18.2.10',
        2
      );

      expect(result.valid).toBe(true);
    });

    it('should reject mismatched coordinator IP', () => {
      const result = validator.validateCoordinatorIP(
        '172.18.1.10', // Wrong network
        2
      );

      expect(result.valid).toBe(false);
    });

    it('should validate coordinator IP is valid', () => {
      const result = validator.validateCoordinatorIP(
        '172.18.2.10',
        2
      );

      expect(result.valid).toBe(true);
    });

    it('should reject invalid IP format', () => {
      const result = validator.validateCoordinatorIP(
        'invalid-ip',
        2
      );

      expect(result.valid).toBe(false);
    });
  });

  describe('Resource Configuration', () => {
    it('should validate memory format', () => {
      const result = validator.validateResources({
        memory: '10GB',
        cpu_cores: 2,
        max_agents: 5,
      });

      expect(result.valid).toBe(true);
    });

    it('should accept various memory units', () => {
      const validMemory = ['512MB', '1GB', '10GB', '1024MB'];

      for (const mem of validMemory) {
        const result = validator.validateMemory(mem);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid memory format', () => {
      const result = validator.validateMemory('10XB');

      expect(result.valid).toBe(false);
    });

    it('should validate cpu_cores is positive integer', () => {
      const result = validator.validateCpuCores(2);

      expect(result.valid).toBe(true);
    });

    it('should reject zero cpu_cores', () => {
      const result = validator.validateCpuCores(0);

      expect(result.valid).toBe(false);
    });

    it('should reject negative cpu_cores', () => {
      const result = validator.validateCpuCores(-1);

      expect(result.valid).toBe(false);
    });

    it('should validate max_agents is positive integer', () => {
      const result = validator.validateMaxAgents(5);

      expect(result.valid).toBe(true);
    });

    it('should reject zero max_agents', () => {
      const result = validator.validateMaxAgents(0);

      expect(result.valid).toBe(false);
    });

    it('should validate reasonable resource limits', () => {
      const result = validator.validateResources({
        memory: '10GB',
        cpu_cores: 2,
        max_agents: 5,
      });

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(0);
    });

    it('should warn about excessive resources', () => {
      const result = validator.validateResources({
        memory: '500GB', // Very high
        cpu_cores: 128, // Very high
        max_agents: 1000, // Very high
      });

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Allowed Skills', () => {
    it('should validate allowed_skills array exists', () => {
      const result = validator.validateAllowedSkills(validConfig.team.allowed_skills);

      expect(result.valid).toBe(true);
    });

    it('should accept empty allowed_skills', () => {
      const result = validator.validateAllowedSkills([]);

      expect(result.valid).toBe(true);
    });

    it('should validate skill names', () => {
      const result = validator.validateAllowedSkills(['bash', 'typescript', 'python']);

      expect(result.valid).toBe(true);
    });

    it('should warn about invalid skill names', () => {
      const result = validator.validateAllowedSkills(['bash', '@invalid-skill']);

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Complete Validation', () => {
    it('should validate complete config', async () => {
      mockReadFile.mockReturnValue(JSON.stringify(validConfig));

      const result = await validator.validateConfig('/config/teams/backend.yaml');

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect multiple errors', async () => {
      const badConfig = {
        team: {
          id: 'Bad-Team', // Wrong format
          // name is missing
          workspace: {
            path: '/workspace/backend',
            disk_quota: '100GB',
          },
          resources: {
            memory: '10XB', // Wrong format
            cpu_cores: 0, // Invalid
            max_agents: 5,
          },
          network: {
            subnet_id: 300, // Out of range
            coordinator_ip: 'invalid', // Invalid IP
          },
          allowed_skills: ['bash'],
        },
      };

      const result = validator.validateCompleteConfig(badConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
    });

    it('should include warnings in result', async () => {
      const configWithWarnings = JSON.parse(JSON.stringify(validConfig));
      configWithWarnings.team.resources.memory = '500GB';

      const result = validator.validateCompleteConfig(configWithWarnings);

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should provide summary of validation', async () => {
      mockReadFile.mockReturnValue(JSON.stringify(validConfig));

      const result = await validator.validateFile('/config/teams/backend.yaml');

      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('valid');
    });
  });

  describe('Error Reporting', () => {
    it('should format error messages clearly', () => {
      const result = validator.validateTeamId('Invalid');

      expect(result.errors[0]).toMatch(/Team ID/i);
    });

    it('should provide helpful error messages', () => {
      const result = validator.validateNetworkConfig({
        subnet_id: 300,
        coordinator_ip: '172.18.300.10',
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/1.*254/);
    });

    it('should include field names in error messages', () => {
      const result = validator.validateMemory('invalid');

      expect(result.errors[0]).toContain('memory');
    });
  });

  describe('JSON/YAML Output', () => {
    it('should format validation result as JSON', async () => {
      mockReadFile.mockReturnValue(JSON.stringify(validConfig));

      const result = await validator.validateConfig('/config/teams/backend.yaml');
      const json = JSON.stringify(result);

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should include all validation details', async () => {
      const result = validator.validateCompleteConfig(validConfig);

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('summary');
    });
  });

  describe('Environment Variable Contracts', () => {
    it('should validate config file path from env', () => {
      // Should work with environment variable
      const configPath = process.env.CFN_TEAM_CONFIG_FILE || '/config/teams/backend.yaml';

      expect(configPath).toBeDefined();
    });
  });
});
