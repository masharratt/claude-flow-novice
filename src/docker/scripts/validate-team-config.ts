/**
 * Validate Team Config Module
 * TypeScript implementation for validating team configuration files
 *
 * Migrated from: docker/scripts/validate-team-config.sh
 */

import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { EventEmitter } from 'events';

export interface TeamConfig {
  team: {
    id: string;
    name: string;
    workspace: {
      path: string;
      disk_quota: string;
    };
    resources: {
      memory: string;
      cpu_cores: number;
      max_agents: number;
    };
    network: {
      subnet_id: number;
      coordinator_ip: string;
    };
    allowed_skills: string[];
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary?: string;
}

/**
 * ValidateTeamConfig class - Validates team configuration files
 */
export class ValidateTeamConfig extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * Load and safely parse config file
   */
  async loadConfig(configFile: string): Promise<TeamConfig> {
    try {
      const content = readFileSync(configFile, 'utf-8');
      const config = parseYaml(content);
      return config as TeamConfig;
    } catch (error) {
      throw new Error(`Failed to load config: ${error}`);
    }
  }

  /**
   * Safely load config with error handling
   */
  async loadConfigSafe(
    configFile: string
  ): Promise<{ valid: boolean; errors: string[] }> {
    try {
      await this.loadConfig(configFile);
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [String(error)],
      };
    }
  }

  /**
   * Validate config file exists and is readable
   */
  async validateFile(
    configFile: string
  ): Promise<{ valid: boolean; errors: string[] }> {
    try {
      readFileSync(configFile, 'utf-8');
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [`File not found: ${configFile}`],
      };
    }
  }

  /**
   * Validate required fields exist
   */
  validateRequiredFields(config: any): ValidationResult {
    const errors: string[] = [];
    const requiredFields = [
      'team.id',
      'team.name',
      'team.workspace.path',
      'team.resources.memory',
      'team.resources.cpu_cores',
      'team.resources.max_agents',
      'team.network.subnet_id',
      'team.network.coordinator_ip',
    ];

    for (const field of requiredFields) {
      const parts = field.split('.');
      let value = config;

      for (const part of parts) {
        value = value?.[part];
      }

      if (value === undefined || value === null || value === '') {
        errors.push(`Missing required field: ${field}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Validate team ID format (lowercase alphanumeric with hyphens)
   */
  validateTeamId(teamId: string): ValidationResult {
    const errors: string[] = [];

    if (!teamId) {
      errors.push('Team ID cannot be empty');
    } else if (!/^[a-z][a-z0-9-]*$/.test(teamId)) {
      errors.push('Team ID must be lowercase alphanumeric with hyphens');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Validate network configuration
   */
  validateNetworkConfig(
    config: any
  ): ValidationResult {
    const errors: string[] = [];

    const subnetId = config.subnet_id;
    if (typeof subnetId !== 'number' || subnetId < 1 || subnetId > 254) {
      errors.push('Subnet ID must be between 1 and 254');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Validate coordinator IP matches subnet
   */
  validateCoordinatorIP(ip: string, subnetId: number): ValidationResult {
    const errors: string[] = [];
    const expectedPrefix = `172.18.${subnetId}`;

    if (!ip.startsWith(expectedPrefix)) {
      errors.push(
        `Coordinator IP must be in subnet 172.18.${subnetId}.0/24`
      );
    }

    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      errors.push('Coordinator IP is not in valid format');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Validate memory format (MB/GB)
   */
  validateMemory(memory: string): ValidationResult {
    const errors: string[] = [];

    if (!/^\d+(MB|GB)$/.test(memory)) {
      errors.push('Memory format must be like 512MB or 10GB');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Validate CPU cores
   */
  validateCpuCores(cores: number): ValidationResult {
    const errors: string[] = [];

    if (!Number.isInteger(cores) || cores <= 0) {
      errors.push('CPU cores must be a positive integer');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Validate max agents
   */
  validateMaxAgents(maxAgents: number): ValidationResult {
    const errors: string[] = [];

    if (!Number.isInteger(maxAgents) || maxAgents <= 0) {
      errors.push('Max agents must be a positive integer');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Validate resource configuration
   */
  validateResources(resources: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate memory
    const memResult = this.validateMemory(resources.memory);
    errors.push(...memResult.errors);

    // Validate CPU cores
    const cpuResult = this.validateCpuCores(resources.cpu_cores);
    errors.push(...cpuResult.errors);

    // Validate max agents
    const agentsResult = this.validateMaxAgents(resources.max_agents);
    errors.push(...agentsResult.errors);

    // Warn about excessive resources
    const memValue = parseInt(resources.memory);
    const memUnit = resources.memory.includes('GB') ? 1024 : 1;
    const totalMem = memValue * memUnit;

    if (totalMem > 256 * 1024) {
      // > 256GB
      warnings.push('Memory allocation is very high (>256GB)');
    }

    if (resources.cpu_cores > 64) {
      warnings.push('CPU cores allocation is very high (>64)');
    }

    if (resources.max_agents > 500) {
      warnings.push('Max agents is very high (>500)');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate allowed skills
   */
  validateAllowedSkills(skills: string[]): ValidationResult {
    const warnings: string[] = [];

    if (!Array.isArray(skills)) {
      return {
        valid: false,
        errors: ['Allowed skills must be an array'],
        warnings: [],
      };
    }

    for (const skill of skills) {
      if (!/^[a-z0-9-]+$/.test(skill)) {
        warnings.push(`Invalid skill name format: ${skill}`);
      }
    }

    return {
      valid: true,
      errors: [],
      warnings,
    };
  }

  /**
   * Validate complete configuration
   */
  validateCompleteConfig(config: TeamConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    const requiredResult = this.validateRequiredFields(config);
    errors.push(...requiredResult.errors);

    if (errors.length === 0) {
      // Validate team ID
      const teamIdResult = this.validateTeamId(config.team.id);
      errors.push(...teamIdResult.errors);

      // Validate network
      const networkResult = this.validateNetworkConfig(config.team.network);
      errors.push(...networkResult.errors);

      // Validate coordinator IP
      const ipResult = this.validateCoordinatorIP(
        config.team.network.coordinator_ip,
        config.team.network.subnet_id
      );
      errors.push(...ipResult.errors);

      // Validate resources
      const resourceResult = this.validateResources(config.team.resources);
      errors.push(...resourceResult.errors);
      warnings.push(...resourceResult.warnings);

      // Validate allowed skills
      const skillsResult = this.validateAllowedSkills(config.team.allowed_skills);
      warnings.push(...skillsResult.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: `${errors.length} errors, ${warnings.length} warnings`,
    };
  }

  /**
   * Validate config file
   */
  async validateConfig(configFile: string): Promise<ValidationResult> {
    try {
      const config = await this.loadConfig(configFile);
      return this.validateCompleteConfig(config);
    } catch (error) {
      return {
        valid: false,
        errors: [String(error)],
        warnings: [],
      };
    }
  }
}
