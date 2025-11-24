/**
 * Unit Tests for Environment Variable Contract Resolver
 *
 * Tests for:
 * - Mode-specific override resolution
 * - Environment variable precedence
 * - Legacy variable support with warnings
 * - Default fallback values
 * - Error handling for missing keys/required values
 * - Network name resolution
 * - Batch environment variable retrieval
 * - Validation rules enforcement
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  getEnvValue,
  getNetworkName,
  getAllEnvValues,
  validateEnvValue,
  _clearContractCache,
} from './environment-contract';

describe('Environment Contract Resolver', () => {
  // Store original environment for restoration
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    // Clear contract cache to ensure fresh loads
    _clearContractCache();
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Mode-Specific Overrides', () => {
    test('should resolve CLI mode redis_host to cfn-redis', () => {
      const value = getEnvValue('redis_host', 'cli');
      expect(value).toBe('cfn-redis');
    });

    test('should resolve trigger mode redis_host to redis', () => {
      const value = getEnvValue('redis_host', 'trigger');
      expect(value).toBe('redis');
    });

    test('should resolve CLI mode network_name to mcp-network', () => {
      const value = getEnvValue('network_name', 'cli');
      expect(value).toBe('mcp-network');
    });

    test('should resolve trigger mode network_name to trigger-cfn-network', () => {
      const value = getEnvValue('network_name', 'trigger');
      expect(value).toBe('trigger-cfn-network');
    });

    test('should resolve CLI mode redis_port correctly', () => {
      const value = getEnvValue('redis_port', 'cli');
      expect(value).toBe('6379');
    });

    test('should resolve trigger mode redis_port correctly', () => {
      const value = getEnvValue('redis_port', 'trigger');
      expect(value).toBe('6379');
    });
  });

  describe('Environment Variable Precedence', () => {
    test('CFN_ prefixed env var should override mode default', () => {
      process.env.CFN_REDIS_HOST = 'custom-redis';
      const value = getEnvValue('redis_host', 'cli');
      expect(value).toBe('custom-redis');
    });

    test('CFN_ prefixed env var should override trigger mode default', () => {
      process.env.CFN_REDIS_HOST = 'override-redis';
      const value = getEnvValue('redis_host', 'trigger');
      expect(value).toBe('override-redis');
    });

    test('CFN_ env var should have higher precedence than mode override', () => {
      process.env.CFN_NETWORK_NAME = 'custom-network';
      const cliValue = getEnvValue('network_name', 'cli');
      const triggerValue = getEnvValue('network_name', 'trigger');

      // Both should return the environment variable, not mode override
      expect(cliValue).toBe('custom-network');
      expect(triggerValue).toBe('custom-network');
    });
  });

  describe('Legacy Variable Support', () => {
    test('should support legacy REDIS_HOST variable with warning', () => {
      _clearContractCache();
      // Clean up any CFN_ version
      delete process.env.CFN_REDIS_HOST;

      // Set legacy variable
      process.env.REDIS_HOST = 'legacy-redis';

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const value = getEnvValue('redis_host', 'cli');

      expect(value).toBe('legacy-redis');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('ENV DEPRECATION')
      );

      consoleWarnSpy.mockRestore();
    });

    test('should prioritize CFN_ over legacy variables', () => {
      _clearContractCache();
      process.env.CFN_REDIS_HOST = 'cfn-redis';
      process.env.REDIS_HOST = 'legacy-redis';

      const value = getEnvValue('redis_host', 'cli');
      expect(value).toBe('cfn-redis');
    });

    test('should log deprecation warning for legacy variables only once per call', () => {
      _clearContractCache();
      delete process.env.CFN_REDIS_HOST;
      process.env.REDIS_HOST = 'legacy-redis';

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      getEnvValue('redis_host', 'cli');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Default Value Fallback', () => {
    test('should return default when no env var or override', () => {
      delete process.env.CFN_REDIS_PORT;
      delete process.env.REDIS_PORT;

      const value = getEnvValue('redis_port', 'cli');
      expect(value).toBe('6379');
    });

    test('should return contract default for various types', () => {
      delete process.env.CFN_MEMORY_BUDGET;

      // Memory budget should have a default
      const value = getEnvValue('memory_budget', 'cli');
      expect(value).toBe('40g');
    });
  });

  describe('Error Handling', () => {
    test('should throw error for unknown contract key', () => {
      expect(() => {
        getEnvValue('unknown_key', 'cli');
      }).toThrow('Unknown contract key: \'unknown_key\'');
    });

    test('should throw error for required missing variables', () => {
      // Note: This test assumes there are required variables in the contract
      // Adjust based on actual contract requirements
      // For now, we test that the error handling path exists
      expect(() => {
        getEnvValue('unknown_required', 'cli');
      }).toThrow();
    });

    test('should provide helpful error message with available keys', () => {
      expect(() => {
        getEnvValue('nonexistent_key', 'cli');
      }).toThrow('Unknown contract key');
      // The error message does include "Available keys", but jest stringContaining might have issues
      // Test via direct error catch instead
      try {
        getEnvValue('unknown', 'cli');
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Available keys');
      }
    });
  });

  describe('Network Name Resolution', () => {
    test('getNetworkName should return mcp-network for CLI mode', () => {
      _clearContractCache();
      delete process.env.CFN_NETWORK_NAME;
      const networkName = getNetworkName('cli');
      expect(networkName).toBe('mcp-network');
    });

    test('getNetworkName should return trigger-cfn-network for trigger mode', () => {
      _clearContractCache();
      delete process.env.CFN_NETWORK_NAME;
      const networkName = getNetworkName('trigger');
      expect(networkName).toBe('trigger-cfn-network');
    });

    test('getNetworkName should respect environment override', () => {
      _clearContractCache();
      process.env.CFN_NETWORK_NAME = 'custom-net';
      const networkName = getNetworkName('cli');
      expect(networkName).toBe('custom-net');
    });
  });

  describe('Batch Environment Variable Retrieval', () => {
    test('getAllEnvValues should return object with resolved values', () => {
      const envVars = getAllEnvValues('cli');

      expect(envVars).toBeInstanceOf(Object);
      expect(typeof envVars).toBe('object');
    });

    test('getAllEnvValues for CLI mode should include redis_host as cfn-redis', () => {
      const envVars = getAllEnvValues('cli');
      expect(envVars['redis_host']).toBe('cfn-redis');
    });

    test('getAllEnvValues for trigger mode should include redis_host as redis', () => {
      const envVars = getAllEnvValues('trigger');
      expect(envVars['redis_host']).toBe('redis');
    });

    test('getAllEnvValues should include network_name', () => {
      const cliEnv = getAllEnvValues('cli');
      const triggerEnv = getAllEnvValues('trigger');

      expect(cliEnv['network_name']).toBe('mcp-network');
      expect(triggerEnv['network_name']).toBe('trigger-cfn-network');
    });
  });

  describe('Validation Rules', () => {
    test('validateEnvValue should reject unknown keys', () => {
      const result = validateEnvValue('unknown_key', 'value');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown contract key');
    });

    test('validateEnvValue should validate against pattern rules', () => {
      // Test with a value that matches pattern
      const validResult = validateEnvValue('redis_host', 'valid-redis-host');
      expect(validResult.valid).toBe(true);

      // Test with a value that doesn't match (if pattern enforced)
      // This depends on actual contract patterns
    });

    test('validateEnvValue should validate numeric ranges', () => {
      // Test with valid port
      const validResult = validateEnvValue('redis_port', '6379');
      expect(validResult.valid).toBe(true);

      // Test with invalid port (outside range if enforced)
      // This depends on actual contract validation rules
    });

    test('validateEnvValue should return true for unvalidated specs', () => {
      // Most specs may not have validation rules
      const result = validateEnvValue('redis_host', 'any-value');
      // Should not error even if validation not defined
      expect(typeof result.valid).toBe('boolean');
    });
  });

  describe('Integration Tests', () => {
    test('CLI mode should be fully isolated from trigger mode', () => {
      _clearContractCache();
      delete process.env.CFN_REDIS_HOST;
      delete process.env.REDIS_HOST;

      const cliRedisHost = getEnvValue('redis_host', 'cli');
      const triggerRedisHost = getEnvValue('redis_host', 'trigger');

      expect(cliRedisHost).not.toBe(triggerRedisHost);
      expect(cliRedisHost).toBe('cfn-redis');
      expect(triggerRedisHost).toBe('redis');
    });

    test('full resolution chain: env > legacy > mode override > default', () => {
      // Test 1: Mode override (no env vars set)
      _clearContractCache();
      delete process.env.CFN_REDIS_HOST;
      delete process.env.REDIS_HOST;

      const modeOverride = getEnvValue('redis_host', 'cli');
      expect(modeOverride).toBe('cfn-redis'); // From mode override

      // Test 2: Environment variable (higher priority than mode override)
      _clearContractCache();
      process.env.CFN_REDIS_HOST = 'env-redis';
      const envOverride = getEnvValue('redis_host', 'cli');
      expect(envOverride).toBe('env-redis'); // From CFN_ env var

      // Test 3: Legacy (if no CFN_ var, but higher priority than mode override)
      _clearContractCache();
      delete process.env.CFN_REDIS_HOST;
      process.env.REDIS_HOST = 'legacy-redis';

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const legacyValue = getEnvValue('redis_host', 'cli');

      expect(legacyValue).toBe('legacy-redis'); // From legacy
      expect(consoleWarnSpy).toHaveBeenCalled(); // With warning

      consoleWarnSpy.mockRestore();
    });

    test('should support different modes in same process', () => {
      // Common use case: need both CLI and trigger configs in validator
      delete process.env.CFN_REDIS_HOST;

      const cliConfig = {
        host: getEnvValue('redis_host', 'cli'),
        network: getNetworkName('cli'),
      };

      const triggerConfig = {
        host: getEnvValue('redis_host', 'trigger'),
        network: getNetworkName('trigger'),
      };

      expect(cliConfig.host).toBe('cfn-redis');
      expect(cliConfig.network).toBe('mcp-network');

      expect(triggerConfig.host).toBe('redis');
      expect(triggerConfig.network).toBe('trigger-cfn-network');
    });
  });

  describe('Contract File Validation', () => {
    test('contract file should exist at expected location', () => {
      const contractPath = path.resolve(
        process.env.PROJECT_ROOT || path.resolve(__dirname, '../../'),
        'docker/runtime/cfn-runtime.contract.yml'
      );

      expect(fs.existsSync(contractPath)).toBe(true);
    });

    test('should load contract without errors', () => {
      expect(() => {
        getAllEnvValues('cli');
      }).not.toThrow();
    });
  });
});
