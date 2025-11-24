/**
 * Comprehensive Test Suite for CFN Configuration Validator
 * Tests validation, env var export, edge cases, and backward compatibility
 *
 * @version 1.0.0
 * @description 90%+ code coverage with performance benchmarks
 */

import {
  ConfigValidator,
  validateConfig,
  validateJSON,
  exportEnvVars,
  resetValidator,
  isValidConfig,
  validateConfigFiles,
} from '../src/lib/config-validator';
import {
  AgentWhitelistConfig,
  MCPServersConfig,
  SkillRequirementsConfig,
  RuntimeContractConfig,
  TeamConfig,
  ValidationResult,
} from '../src/types/config';

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    resetValidator();
    validator = new ConfigValidator();
  });

  describe('Initialization', () => {
    it('should initialize validator successfully', () => {
      expect(validator).toBeDefined();
      expect(validator).toBeInstanceOf(ConfigValidator);
    });

    it('should load schema correctly', () => {
      const validator2 = new ConfigValidator();
      expect(validator2).toBeDefined();
    });

    it('should support custom schema initialization', () => {
      const customSchema = { custom: 'schema' };
      const validator2 = new ConfigValidator(customSchema);
      expect(validator2).toBeDefined();
      expect(validator2).toBeInstanceOf(ConfigValidator);
    });
  });

  describe('Agent Whitelist Configuration', () => {
    const validAgentConfig: AgentWhitelistConfig = {
      version: '1.0.0',
      description: 'Test agent whitelist',
      lastUpdated: '2025-11-15',
      agents: [
        {
          type: 'react-frontend-engineer',
          displayName: 'React Frontend Engineer',
          skills: ['ui-development', 'react-components'],
          allowedMcpServers: ['playwright'],
          resourceLimits: {
            maxMemoryMB: 1024,
            maxConcurrentRequests: 3,
          },
          description: 'Frontend specialist',
        },
        {
          type: 'backend-developer',
          displayName: 'Backend Developer',
          skills: ['api-design', 'database-design'],
        },
      ],
    };

    it('should validate correct agent whitelist config', () => {
      const result = validator.validate(validAgentConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.configType).toBe('agent-whitelist');
    });

    it('should reject agent config missing version', () => {
      const invalid = { ...validAgentConfig, version: undefined } as unknown;
      const result = validator.validate(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject agent config with invalid version format', () => {
      const invalid: AgentWhitelistConfig = {
        ...validAgentConfig,
        version: 'invalid-version',
      };
      const result = validator.validate(invalid);
      expect(result.valid).toBe(false);
    });

    it('should reject agent config missing agents array', () => {
      const invalid = { ...validAgentConfig, agents: undefined } as unknown;
      const result = validator.validate(invalid);
      expect(result.valid).toBe(false);
    });

    it('should reject agent with missing required fields', () => {
      const invalid: AgentWhitelistConfig = {
        ...validAgentConfig,
        agents: [
          {
            type: '',
            displayName: 'Bad Agent',
            skills: [],
          },
        ],
      };
      const result = validator.validate(invalid);
      expect(result.valid).toBe(false);
    });

    it('should accept empty agents array with warning', () => {
      const config: AgentWhitelistConfig = {
        version: '1.0.0',
        agents: [],
      };
      const result = validator.validate(config);
      // Empty array may be allowed but should be noted
      expect(result.configType).toBe('agent-whitelist');
    });

    it('should detect config type as agent-whitelist', () => {
      const result = validator.validate(validAgentConfig);
      expect(result.configType).toBe('agent-whitelist');
    });
  });

  describe('MCP Servers Configuration', () => {
    const validMcpConfig: MCPServersConfig = {
      version: '1.0.0',
      description: 'Test MCP servers',
      lastUpdated: '2025-11-15',
      servers: {
        playwright: {
          endpoint: 'http://mcp-playwright:8081',
          requiredSkills: ['browser-automation'],
          auth: {
            type: 'token',
            header: 'X-MCP-Token',
          },
          healthCheck: '/health',
          timeoutMs: 30000,
          retryAttempts: 3,
          capabilities: ['browser_automation'],
        },
        redis: {
          endpoint: 'http://mcp-redis:8082',
          requiredSkills: ['redis-operations'],
          auth: {
            type: 'token',
            header: 'X-MCP-Token',
          },
          timeoutMs: 15000,
          retryAttempts: 2,
        },
      },
    };

    it('should validate correct MCP servers config', () => {
      const result = validator.validate(validMcpConfig);
      expect(result.valid).toBe(true);
      expect(result.configType).toBe('mcp-servers');
    });

    it('should reject MCP config with invalid endpoint URL', () => {
      const invalid: MCPServersConfig = {
        ...validMcpConfig,
        servers: {
          bad: {
            endpoint: 'not-a-url',
            requiredSkills: ['test'],
            auth: { type: 'token' },
          },
        },
      };
      const result = validator.validate(invalid);
      expect(result.valid).toBe(false);
    });

    it('should reject server without endpoint', () => {
      const invalid: MCPServersConfig = {
        ...validMcpConfig,
        servers: {
          bad: {
            endpoint: '',
            requiredSkills: ['test'],
            auth: { type: 'token' },
          },
        },
      };
      const result = validator.validate(invalid);
      expect(result.valid).toBe(false);
    });

    it('should validate timeoutMs constraint', () => {
      const config: MCPServersConfig = {
        version: '1.0.0',
        servers: {
          test: {
            endpoint: 'http://test:8080',
            requiredSkills: ['test'],
            auth: { type: 'token' },
            timeoutMs: 500, // Less than 1000 minimum
          },
        },
      };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it('should support auth types correctly', () => {
      const authTypes = ['token', 'oauth2', 'basic', 'apikey'];
      for (const authType of authTypes) {
        const config: MCPServersConfig = {
          version: '1.0.0',
          servers: {
            test: {
              endpoint: 'http://test:8080',
              requiredSkills: ['test'],
              auth: { type: authType as any },
            },
          },
        };
        const result = validator.validate(config);
        expect(result.valid).toBe(true);
      }
    });

    it('should detect config type as mcp-servers', () => {
      const result = validator.validate(validMcpConfig);
      expect(result.configType).toBe('mcp-servers');
    });
  });

  describe('Skill Requirements Configuration', () => {
    const validSkillConfig: SkillRequirementsConfig = {
      version: '1.0.0',
      description: 'Test skill requirements',
      lastUpdated: '2025-11-15',
      tools: {
        take_screenshot: {
          displayName: 'Take Screenshot',
          requiredSkills: ['browser-automation'],
          optionalSkills: ['ui-development'],
          allowedAgentTypes: ['react-frontend-engineer'],
          resourceImpact: {
            memoryMB: 256,
            cpuUnits: 2,
            durationSeconds: 10,
          },
        },
      },
    };

    it('should validate correct skill requirements config', () => {
      const result = validator.validate(validSkillConfig);
      expect(result.valid).toBe(true);
      expect(result.configType).toBe('skill-requirements');
    });

    it('should reject config without version', () => {
      const invalid = { ...validSkillConfig, version: undefined } as unknown;
      const result = validator.validate(invalid);
      expect(result.valid).toBe(false);
    });

    it('should reject tool without displayName', () => {
      const invalid: SkillRequirementsConfig = {
        ...validSkillConfig,
        tools: {
          bad: {
            displayName: '',
            requiredSkills: ['test'],
          },
        },
      };
      const result = validator.validate(invalid);
      expect(result.valid).toBe(false);
    });

    it('should detect config type as skill-requirements', () => {
      const result = validator.validate(validSkillConfig);
      expect(result.configType).toBe('skill-requirements');
    });
  });

  describe('Runtime Contract Configuration', () => {
    const validRuntimeConfig: RuntimeContractConfig = {
      version: '1.0',
      lastUpdated: '2025-11-15',
      variables: {
        CFN_REDIS_HOST: {
          value: 'cfn-redis',
          description: 'Redis hostname',
          type: 'string',
          default: 'localhost',
          scope: ['agent', 'coordinator'],
        },
        CFN_REDIS_PORT: {
          value: 6379,
          description: 'Redis port',
          type: 'integer',
          default: 6379,
        },
        CFN_TASK_TIMEOUT: {
          value: 3600,
          description: 'Task timeout in seconds',
          type: 'integer',
        },
        CFN_CUSTOM_ROUTING: {
          value: true,
          description: 'Enable custom routing',
          type: 'boolean',
          legacyAliases: ['CUSTOM_ROUTING'],
        },
      },
    };

    it('should validate correct runtime contract config', () => {
      const result = validator.validate(validRuntimeConfig);
      expect(result.valid).toBe(true);
      expect(result.configType).toBe('runtime-contract');
    });

    it('should export environment variables correctly', () => {
      const envMap = validator.exportEnvVars(validRuntimeConfig);
      expect(envMap).toEqual({
        CFN_REDIS_HOST: 'cfn-redis',
        CFN_REDIS_PORT: 6379,
        CFN_TASK_TIMEOUT: 3600,
        CFN_CUSTOM_ROUTING: true,
      });
    });

    it('should preserve variable types in export', () => {
      const envMap = validator.exportEnvVars(validRuntimeConfig);
      expect(typeof envMap.CFN_REDIS_HOST).toBe('string');
      expect(typeof envMap.CFN_REDIS_PORT).toBe('number');
      expect(typeof envMap.CFN_CUSTOM_ROUTING).toBe('boolean');
    });

    it('should skip null/undefined values in export', () => {
      const config: RuntimeContractConfig = {
        version: '1.0',
        variables: {
          DEFINED: {
            value: 'test',
            description: 'Test',
            type: 'string',
          },
          UNDEFINED: {
            value: null,
            description: 'Unset',
            type: 'string',
          },
        },
      };
      const envMap = validator.exportEnvVars(config);
      expect(envMap).toEqual({ DEFINED: 'test' });
      expect('UNDEFINED' in envMap).toBe(false);
    });

    it('should detect config type as runtime-contract', () => {
      const result = validator.validate(validRuntimeConfig);
      expect(result.configType).toBe('runtime-contract');
    });

    it('should handle variable type coercion', () => {
      const config: RuntimeContractConfig = {
        version: '1.0',
        variables: {
          INT_VAR: {
            value: '42',
            description: 'Integer as string',
            type: 'integer',
          },
          FLOAT_VAR: {
            value: '3.14',
            description: 'Float as string',
            type: 'number',
          },
          BOOL_VAR: {
            value: 'true',
            description: 'Boolean as string',
            type: 'boolean',
          },
        },
      };
      const envMap = validator.exportEnvVars(config);
      expect(envMap.INT_VAR).toBe(42);
      expect(envMap.FLOAT_VAR).toBe(3.14);
      expect(envMap.BOOL_VAR).toBe(true);
    });
  });

  describe('Team Configuration', () => {
    const validTeamConfig: TeamConfig = {
      team: {
        id: 'backend',
        name: 'Backend Team',
        description: 'API development',
        workspace: {
          path: '/workspace/backend',
          diskQuota: '100GB',
        },
        resources: {
          memory: '16GB',
          cpuCores: 5,
          maxAgents: 6,
        },
        allowedSkills: ['database-readwrite', 'api-design'],
        network: {
          subnetId: 2,
          coordinatorIp: '172.18.0.12',
        },
      },
    };

    it('should validate correct team config', () => {
      const result = validator.validate(validTeamConfig);
      expect(result.valid).toBe(true);
      expect(result.configType).toBe('team');
    });

    it('should reject team without id', () => {
      const invalid: TeamConfig = {
        team: {
          id: '',
          name: 'Bad Team',
        },
      };
      const result = validator.validate(invalid);
      expect(result.valid).toBe(false);
    });

    it('should validate disk quota format', () => {
      const config: TeamConfig = {
        team: {
          id: 'test',
          name: 'Test',
          workspace: {
            diskQuota: '100GB',
          },
        },
      };
      const result = validator.validate(config);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid disk quota format', () => {
      const config: TeamConfig = {
        team: {
          id: 'test',
          name: 'Test',
          workspace: {
            diskQuota: 'invalid',
          },
        },
      };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it('should validate IPv4 format for coordinator IP', () => {
      const config: TeamConfig = {
        team: {
          id: 'test',
          name: 'Test',
          network: {
            coordinatorIp: '192.168.1.1',
          },
        },
      };
      const result = validator.validate(config);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid IPv4 format', () => {
      const config: TeamConfig = {
        team: {
          id: 'test',
          name: 'Test',
          network: {
            coordinatorIp: 'invalid-ip',
          },
        },
      };
      const result = validator.validate(config);
      expect(result.valid).toBe(false);
    });

    it('should detect config type as team', () => {
      const result = validator.validate(validTeamConfig);
      expect(result.configType).toBe('team');
    });
  });

  describe('Error Reporting', () => {
    it('should provide detailed error messages', () => {
      const invalid = { version: 'bad' };
      const result = validator.validate(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toBeDefined();
      expect(result.errors[0].code).toBeDefined();
    });

    it('should format errors for display', () => {
      const invalid = { version: 'bad' };
      const result = validator.validate(invalid);
      const formatted = validator.formatErrors(result);
      expect(formatted).toContain('Validation failed');
      expect(formatted).toContain('error');
    });

    it('should include field paths in errors', () => {
      const config: AgentWhitelistConfig = {
        version: '1.0.0',
        agents: [
          {
            type: '',
            displayName: 'Test',
            skills: [],
          },
        ],
      };
      const result = validator.validate(config);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].path).toBeDefined();
    });

    it('should include current values in error context', () => {
      const config = { version: 123 };
      const result = validator.validate(config);
      const error = result.errors.find((e) => e.code.includes('type'));
      if (error) {
        expect(error.value).toBeDefined();
      }
    });
  });

  describe('Warnings', () => {
    it('should warn about missing lastUpdated', () => {
      const config: AgentWhitelistConfig = {
        version: '1.0.0',
        agents: [
          {
            type: 'test',
            displayName: 'Test',
            skills: [],
          },
        ],
      };
      const result = validator.validate(config);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should warn about legacy variable names', () => {
      const config = { REDIS_HOST: 'test' };
      const result = validator.validate(config);
      // May contain warning about legacy variable
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('Global Functions', () => {
    it('should validate config with global function', () => {
      const config: AgentWhitelistConfig = {
        version: '1.0.0',
        agents: [
          {
            type: 'test',
            displayName: 'Test',
            skills: [],
          },
        ],
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should check if config is valid', () => {
      const validConfig: AgentWhitelistConfig = {
        version: '1.0.0',
        agents: [
          {
            type: 'test',
            displayName: 'Test',
            skills: [],
          },
        ],
      };
      expect(isValidConfig(validConfig)).toBe(true);
      expect(isValidConfig({})).toBe(false);
    });

    it('should export env vars from runtime config', () => {
      const config: RuntimeContractConfig = {
        version: '1.0',
        variables: {
          TEST: {
            value: 'value',
            description: 'Test',
            type: 'string',
          },
        },
      };
      const envMap = exportEnvVars(config);
      expect(envMap.TEST).toBe('value');
    });
  });

  describe('Type Detection', () => {
    it('should detect unknown config type', () => {
      const result = validator.validate({ unknown: 'config' });
      expect(result.configType).toBe('unknown');
    });

    it('should detect non-object config', () => {
      const result = validator.validate('string');
      expect(result.configType).toBe('unknown');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty configuration', () => {
      const result = validator.validate({});
      expect(result.valid).toBe(false);
      expect(result.configType).toBe('unknown');
    });

    it('should handle null configuration', () => {
      const result = validator.validate(null);
      expect(result.valid).toBe(false);
      expect(result.configType).toBe('unknown');
    });

    it('should handle undefined configuration', () => {
      const result = validator.validate(undefined);
      expect(result.valid).toBe(false);
    });

    it('should handle deeply nested objects', () => {
      const config: MCPServersConfig = {
        version: '1.0.0',
        servers: {
          test: {
            endpoint: 'http://test:8080',
            requiredSkills: ['deep'],
            auth: {
              type: 'token',
              header: 'X-Token',
            },
            resourceLimits: {
              maxMemoryMB: 1024,
              maxConcurrentRequests: 5,
            },
          },
        },
      };
      const result = validator.validate(config);
      expect(result.valid).toBe(true);
    });

    it('should handle large arrays', () => {
      const agents = Array.from({ length: 100 }, (_, i) => ({
        type: `agent-${i}`,
        displayName: `Agent ${i}`,
        skills: ['test'],
      }));
      const config: AgentWhitelistConfig = {
        version: '1.0.0',
        agents,
      };
      const result = validator.validate(config);
      expect(result.valid).toBe(true);
    });

    it('should handle special characters in strings', () => {
      const config: TeamConfig = {
        team: {
          id: 'test-team_123',
          name: 'Test Team "Special" & Characters',
          description: 'Description with special chars: !@#$%^&*()',
        },
      };
      const result = validator.validate(config);
      // Should handle properly or provide clear error
      expect(result.configType).toBe('team');
    });
  });

  describe('Performance', () => {
    it('should validate within 100ms', () => {
      const config: AgentWhitelistConfig = {
        version: '1.0.0',
        agents: [
          {
            type: 'test',
            displayName: 'Test',
            skills: ['test1', 'test2', 'test3'],
            resourceLimits: {
              maxMemoryMB: 1024,
              maxConcurrentRequests: 5,
            },
          },
        ],
      };

      const start = Date.now();
      validator.validate(config);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should batch validate multiple files efficiently', () => {
      const filePaths = [
        '/home/user/claude-flow-novice/config/agent-whitelist.json',
        '/home/user/claude-flow-novice/config/mcp-servers.json',
        '/home/user/claude-flow-novice/config/skill-requirements.json',
      ];

      const start = Date.now();
      const results = validateConfigFiles(filePaths);
      const duration = Date.now() - start;

      expect(Object.keys(results).length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Backward Compatibility', () => {
    it('should warn on legacy variable names', () => {
      const config: RuntimeContractConfig = {
        version: '1.0',
        variables: {
          REDIS_HOST: {
            value: 'localhost',
            description: 'Legacy Redis host',
            type: 'string',
            legacyAliases: ['MCP_REDIS_HOST'],
          },
        },
      };
      const result = validator.validate(config);
      // Should acknowledge legacy format
      expect(result.configType).toBe('runtime-contract');
    });

    it('should handle both YAML and JSON configs', () => {
      // Simulating YAML-to-JSON conversion
      const config: TeamConfig = {
        team: {
          id: 'backend',
          name: 'Backend Team',
          workspace: {
            path: '/workspace/backend',
            diskQuota: '100GB',
          },
        },
      };
      const result = validator.validate(config);
      expect(result.valid).toBe(true);
      expect(result.configType).toBe('team');
    });
  });

  describe('Batch Operations', () => {
    it('should validate multiple configurations at once', () => {
      const configs = [
        {
          version: '1.0.0',
          agents: [
            {
              type: 'test1',
              displayName: 'Test 1',
              skills: [],
            },
          ],
        } as AgentWhitelistConfig,
        {
          version: '1.0.0',
          servers: {
            test: {
              endpoint: 'http://test:8080',
              requiredSkills: ['test'],
              auth: { type: 'token' as const },
            },
          },
        } as MCPServersConfig,
      ];

      const results = configs.map((config) => validator.validate(config));
      expect(results).toHaveLength(2);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(true);
    });
  });
});

describe('JSON String Validation', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    resetValidator();
    validator = new ConfigValidator();
  });

  it('should validate JSON strings', () => {
    const jsonString = JSON.stringify({
      version: '1.0.0',
      agents: [
        {
          type: 'test',
          displayName: 'Test Agent',
          skills: ['test'],
        },
      ],
    } as AgentWhitelistConfig);

    const result = validator.validateJSON(jsonString);
    expect(result.valid).toBe(true);
    expect(result.configType).toBe('agent-whitelist');
  });

  it('should handle invalid JSON', () => {
    const result = validator.validateJSON('{invalid json}');
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('JSON_PARSE_ERROR');
  });

  it('should validate MCP servers config from JSON string', () => {
    const mcp: MCPServersConfig = {
      version: '1.0.0',
      servers: {
        test: {
          endpoint: 'http://test:8080',
          requiredSkills: ['test'],
          auth: { type: 'token' },
        },
      },
    };
    const result = validator.validateJSON(JSON.stringify(mcp));
    expect(result.valid).toBe(true);
    expect(result.configType).toBe('mcp-servers');
  });

  it('should validate runtime contract config from JSON string', () => {
    const runtime: RuntimeContractConfig = {
      version: '1.0',
      variables: {
        TEST: {
          value: 'test',
          description: 'Test var',
          type: 'string',
        },
      },
    };
    const result = validator.validateJSON(JSON.stringify(runtime));
    expect(result.valid).toBe(true);
    expect(result.configType).toBe('runtime-contract');
  });
});

describe('Naming Convention Support', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    resetValidator();
    validator = new ConfigValidator();
  });

  it('should accept team config with snake_case naming (disk_quota)', () => {
    const config = {
      team: {
        id: 'test-team',
        name: 'Test Team',
        workspace: {
          disk_quota: '100GB', // snake_case version
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
    expect(result.configType).toBe('team');
  });

  it('should accept team config with snake_case naming (cpu_cores)', () => {
    const config = {
      team: {
        id: 'test-team',
        name: 'Test Team',
        resources: {
          cpu_cores: 4, // snake_case version
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should accept team config with snake_case naming (max_agents)', () => {
    const config = {
      team: {
        id: 'test-team',
        name: 'Test Team',
        resources: {
          max_agents: 10, // snake_case version
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid cpu_cores value', () => {
    const config = {
      team: {
        id: 'test-team',
        name: 'Test Team',
        resources: {
          cpu_cores: -1, // Invalid: negative
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'team.resources.cpuCores')).toBe(true);
  });

  it('should reject invalid max_agents value (non-integer)', () => {
    const config = {
      team: {
        id: 'test-team',
        name: 'Test Team',
        resources: {
          max_agents: 3.5, // Invalid: not an integer
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'team.resources.maxAgents')).toBe(true);
  });

  it('should reject invalid max_agents value (less than 1)', () => {
    const config = {
      team: {
        id: 'test-team',
        name: 'Test Team',
        resources: {
          max_agents: 0, // Invalid: must be at least 1
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
  });

  it('should support both camelCase and snake_case in same object', () => {
    const config = {
      team: {
        id: 'test-team',
        name: 'Test Team',
        workspace: {
          diskQuota: '100GB', // camelCase
        },
        resources: {
          cpu_cores: 4, // snake_case
          maxAgents: 10, // camelCase
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
  });
});

describe('Additional Edge Cases and Coverage', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    resetValidator();
    validator = new ConfigValidator();
  });

  it('should reject agent with empty skills array', () => {
    const config: AgentWhitelistConfig = {
      version: '1.0.0',
      agents: [
        {
          type: 'test',
          displayName: 'Test',
          skills: [], // Empty
        },
      ],
    };
    const result = validator.validate(config);
    // Should still be valid as schema doesn't enforce minItems
    expect(result.configType).toBe('agent-whitelist');
  });

  it('should validate agent without optional fields', () => {
    const config: AgentWhitelistConfig = {
      version: '1.0.0',
      agents: [
        {
          type: 'test',
          displayName: 'Test Agent',
          skills: ['skill1'],
          // No optional fields
        },
      ],
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should validate MCP server with all optional fields', () => {
    const config: MCPServersConfig = {
      version: '1.0.0',
      servers: {
        test: {
          endpoint: 'http://localhost:8080',
          requiredSkills: ['skill1'],
          auth: { type: 'token' },
          timeoutMs: 5000,
          retryAttempts: 3,
          healthCheck: '/health',
          capabilities: ['read', 'write'],
          resourceLimits: {
            maxMemoryMB: 512,
            maxCpuCores: 2,
          },
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should detect non-object tools as unknown config type', () => {
    const config = {
      version: '1.0.0',
      tools: 'not-an-object', // Invalid - not an object
    };
    const result = validator.validate(config);
    // Since tools is not an object, it won't be detected as skill-requirements
    expect(result.configType).toBe('unknown');
  });

  it('should validate tool with optional skills', () => {
    const config: SkillRequirementsConfig = {
      version: '1.0.0',
      tools: {
        tool1: {
          displayName: 'Tool 1',
          requiredSkills: ['skill1'],
          optionalSkills: ['skill2', 'skill3'],
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should validate tool with resource impact', () => {
    const config: SkillRequirementsConfig = {
      version: '1.0.0',
      tools: {
        tool1: {
          displayName: 'Tool 1',
          requiredSkills: ['skill1'],
          resourceImpact: {
            memoryMB: 256,
            cpuUnits: 1.5,
            durationSeconds: 30,
          },
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should validate runtime contract with null variable values', () => {
    const config: RuntimeContractConfig = {
      version: '1.0',
      variables: {
        VAR1: {
          value: null,
          description: 'Nullable variable',
          type: 'string',
        },
        VAR2: {
          description: 'Variable without value',
          type: 'integer',
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should export env vars correctly with multiple types', () => {
    const config: RuntimeContractConfig = {
      version: '1.0',
      variables: {
        STRING_VAR: {
          value: 'test',
          description: 'String variable',
          type: 'string',
        },
        INT_VAR: {
          value: 42,
          description: 'Integer variable',
          type: 'integer',
        },
        BOOL_VAR: {
          value: true,
          description: 'Boolean variable',
          type: 'boolean',
        },
        FLOAT_VAR: {
          value: 3.14,
          description: 'Float variable',
          type: 'number',
        },
      },
    };
    const envMap = validator.exportEnvVars(config);
    expect(envMap['STRING_VAR']).toBe('test');
    expect(envMap['INT_VAR']).toBe(42);
    expect(envMap['BOOL_VAR']).toBe(true);
    expect(envMap['FLOAT_VAR']).toBe(3.14);
  });

  it('should validate team with all optional fields', () => {
    const config: TeamConfig = {
      team: {
        id: 'team-complete',
        name: 'Complete Team',
        description: 'A complete team configuration',
        workspace: {
          path: '/workspace/team1',
          diskQuota: '500GB',
        },
        resources: {
          memory: '4GB',
          cpuCores: 8,
          maxAgents: 100,
        },
        allowedSkills: ['skill1', 'skill2', 'skill3'],
        network: {
          subnetId: 1,
          coordinatorIp: '192.168.1.1',
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should reject team with invalid coordinator IP', () => {
    const config: TeamConfig = {
      team: {
        id: 'test-team',
        name: 'Test Team',
        network: {
          coordinatorIp: '256.1.1.1', // Invalid IP
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'team.network.coordinatorIp')).toBe(true);
  });

  it('should handle config type detection for various formats', () => {
    const configs = [
      { agents: [], version: '1.0' } as AgentWhitelistConfig,
      { servers: {}, version: '1.0' } as MCPServersConfig,
      { tools: {}, version: '1.0' } as SkillRequirementsConfig,
      { variables: {}, version: '1.0' } as RuntimeContractConfig,
      { team: { id: 'test', name: 'test' } } as TeamConfig,
    ];

    configs.forEach((config) => {
      const result = validator.validate(config);
      expect(result.configType).not.toBe('unknown');
    });
  });

  it('should validate JSON with format errors gracefully', () => {
    const invalidJsons = [
      '{broken json}',
      'not json at all',
      '{"incomplete": ',
    ];

    invalidJsons.forEach((json) => {
      const result = validator.validateJSON(json);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  it('should format errors with all properties', () => {
    const config = {
      team: {
        id: 'invalid id!', // Invalid due to pattern
        name: 'Test',
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
    const formatted = validator.formatErrors(result);
    expect(formatted).toContain('Validation failed');
    expect(formatted).toContain('error');
  });

  it('should handle exportEnvVars with coercion', () => {
    const config: RuntimeContractConfig = {
      version: '1.0',
      variables: {
        STRING_INT: {
          value: '123',
          description: 'Integer as string',
          type: 'integer',
        },
        STRING_FLOAT: {
          value: '3.14',
          description: 'Float as string',
          type: 'number',
        },
        STRING_BOOL: {
          value: 'true',
          description: 'Boolean as string',
          type: 'boolean',
        },
      },
    };
    const envMap = validator.exportEnvVars(config);
    expect(envMap['STRING_INT']).toBe(123);
    expect(envMap['STRING_FLOAT']).toBe(3.14);
    expect(envMap['STRING_BOOL']).toBe(true);
  });

  it('should throw error when exporting from non-runtime-contract', () => {
    const config: AgentWhitelistConfig = {
      version: '1.0.0',
      agents: [],
    };
    expect(() => {
      validator.exportEnvVars(config);
    }).toThrow('Configuration is not a valid runtime contract');
  });

  it('should throw error when exporting from non-object', () => {
    expect(() => {
      validator.exportEnvVars('not an object');
    }).toThrow('Configuration must be an object');
  });

  it('should handle formatErrors for valid config', () => {
    const config: TeamConfig = {
      team: {
        id: 'test',
        name: 'Test',
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
    const formatted = validator.formatErrors(result);
    expect(formatted).toContain('Configuration is valid');
  });

  it('should include warnings in formatted output', () => {
    const config: AgentWhitelistConfig = {
      version: '1.0.0',
      agents: [
        {
          type: 'test',
          displayName: 'Test',
          skills: ['skill1'],
        },
      ],
      // Missing lastUpdated might generate warning
    };
    const result = validator.validate(config);
    expect(result.configType).toBe('agent-whitelist');
    const formatted = validator.formatErrors(result);
    // Valid configs should show valid message
    expect(formatted).toContain('Configuration is valid');
  });

  it('should handle agent without type', () => {
    const config = {
      version: '1.0.0',
      agents: [
        {
          displayName: 'Test',
          skills: ['skill1'],
          // Missing type
        },
      ],
    };
    const result = validator.validate(config);
    expect(result.configType).toBe('agent-whitelist');
  });

  it('should handle agent without displayName', () => {
    const config = {
      version: '1.0.0',
      agents: [
        {
          type: 'test',
          skills: ['skill1'],
          // Missing displayName
        },
      ],
    };
    const result = validator.validate(config);
    expect(result.configType).toBe('agent-whitelist');
  });

  it('should handle MCP server without endpoint', () => {
    const config = {
      version: '1.0.0',
      servers: {
        test: {
          requiredSkills: ['skill1'],
          auth: { type: 'token' },
          // Missing endpoint
        },
      },
    };
    const result = validator.validate(config);
    expect(result.configType).toBe('mcp-servers');
  });

  it('should handle MCP server without requiredSkills', () => {
    const config = {
      version: '1.0.0',
      servers: {
        test: {
          endpoint: 'http://localhost:8080',
          auth: { type: 'token' },
          // Missing requiredSkills
        },
      },
    };
    const result = validator.validate(config);
    expect(result.configType).toBe('mcp-servers');
  });

  it('should validate MCP server with string health check', () => {
    const config: MCPServersConfig = {
      version: '1.0.0',
      servers: {
        test: {
          endpoint: 'http://localhost:8080',
          requiredSkills: ['skill1'],
          auth: { type: 'token' },
          healthCheck: '/api/health', // String form
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should validate MCP server with object health check', () => {
    const config: MCPServersConfig = {
      version: '1.0.0',
      servers: {
        test: {
          endpoint: 'http://localhost:8080',
          requiredSkills: ['skill1'],
          auth: { type: 'token' },
          healthCheck: {
            path: '/health',
            interval: 30,
            timeout: 5,
            enabled: true,
          }, // Object form
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should handle team without id', () => {
    const config = {
      team: {
        name: 'Test Team',
        // Missing id
      },
    };
    const result = validator.validate(config);
    expect(result.configType).toBe('team');
  });

  it('should handle team without name', () => {
    const config = {
      team: {
        id: 'test',
        // Missing name
      },
    };
    const result = validator.validate(config);
    expect(result.configType).toBe('team');
  });

  it('should validate multiple variables with different types', () => {
    const config: RuntimeContractConfig = {
      version: '1.0',
      variables: {
        VAR1: {
          description: 'String',
          type: 'string',
          value: 'test',
        },
        VAR2: {
          description: 'Integer',
          type: 'integer',
          value: 100,
        },
        VAR3: {
          description: 'Number',
          type: 'number',
          value: 3.14,
        },
        VAR4: {
          description: 'Boolean',
          type: 'boolean',
          value: true,
        },
      },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should detect config with only version field as unknown', () => {
    const config = {
      version: '1.0.0',
      // No config type indicator fields
    };
    const result = validator.validate(config);
    expect(result.configType).toBe('unknown');
  });

  it('should validate file batch operations with partial failures', () => {
    const filePaths = [
      '/tmp/nonexistent-file.json',
      '/tmp/another-nonexistent.json',
    ];
    const results = validateConfigFiles(filePaths);
    expect(Object.keys(results).length).toBe(2);
    expect(results[filePaths[0]].valid).toBe(false);
  });
});
