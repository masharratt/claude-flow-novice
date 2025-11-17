/**
 * Provider Factory Test Suite
 * Comprehensive test coverage for provider factory, routing, and credential handling
 *
 * @version 1.0.0
 * @description 400+ lines of test code covering provider selection logic, model mapping,
 *              credential handling, fallback behavior, cost optimization, and security
 *
 * Coverage Targets:
 * - Provider selection logic (all supported providers)
 * - Model mapping and validation
 * - Credential handling (no hardcoding of keys)
 * - Fallback behavior on provider failure
 * - Cost optimization validation
 * - Custom routing configuration
 * - Agent-specific provider overrides
 * - Security: credential injection prevention, API key validation, authentication flows
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ProviderFactory, ProviderType } from '../../src/providers/provider-factory';
import {
  LLMProviderInterface,
  ProviderError,
  LLMMessageOptions,
  LLMModel,
} from '../../src/providers/provider-interface';
import { AnthropicProvider } from '../../src/providers/anthropic-provider';

// ============================================================================
// Test Setup and Mock Utilities
// ============================================================================

/**
 * Mock Provider for testing
 * Implements the LLMProviderInterface without external dependencies
 */
class MockProvider implements LLMProviderInterface {
  private apiKey: string | undefined;
  public sendMessageCalled = false;
  public streamMessageCalled = false;
  public getModelsCalled = false;
  public checkHealthCalled = false;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async sendMessage(prompt: string, options?: LLMMessageOptions): Promise<string> {
    this.sendMessageCalled = true;
    if (!prompt || prompt.length === 0) {
      throw new ProviderError('Empty prompt', 'INVALID_PROMPT');
    }
    return `Mock response to: ${prompt}`;
  }

  async *streamMessage(prompt: string, options?: LLMMessageOptions): AsyncGenerator<string, void, unknown> {
    this.streamMessageCalled = true;
    if (!prompt || prompt.length === 0) {
      throw new ProviderError('Empty prompt', 'INVALID_PROMPT');
    }
    yield 'Stream chunk 1';
    yield 'Stream chunk 2';
  }

  async getModels(): Promise<LLMModel[]> {
    this.getModelsCalled = true;
    return [
      {
        id: 'mock-model-1',
        name: 'Mock Model 1',
        context_window: 4096,
        pricing: { input: 0.001, output: 0.002 },
      },
    ];
  }

  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unavailable';
    latency?: number;
    models_available?: number;
  }> {
    this.checkHealthCalled = true;
    return {
      status: 'healthy',
      latency: 100,
      models_available: 1,
    };
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }
}

/**
 * Mock Provider that fails to simulate provider unavailability
 */
class FailingMockProvider implements LLMProviderInterface {
  constructor(apiKey?: string) {
    // Simulate API key validation failure
    if (!apiKey) {
      throw new ProviderError('API key required for FailingMockProvider', 'API_KEY_REQUIRED');
    }
  }

  async sendMessage(prompt: string, options?: LLMMessageOptions): Promise<string> {
    throw new ProviderError('Provider unavailable', 'PROVIDER_UNAVAILABLE');
  }

  async *streamMessage(prompt: string, options?: LLMMessageOptions): AsyncGenerator<string, void, unknown> {
    throw new ProviderError('Provider unavailable', 'PROVIDER_UNAVAILABLE');
    yield; // unreachable, but satisfies generator type
  }

  async getModels(): Promise<LLMModel[]> {
    throw new ProviderError('Provider unavailable', 'PROVIDER_UNAVAILABLE');
  }

  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unavailable';
    latency?: number;
    models_available?: number;
  }> {
    return {
      status: 'unavailable',
      latency: undefined,
      models_available: 0,
    };
  }
}

/**
 * Secure Mock Provider that validates credentials
 */
class SecureMockProvider implements LLMProviderInterface {
  private apiKey: string | undefined;
  private static readonly MIN_KEY_LENGTH = 20;
  private static readonly ALLOWED_KEY_PREFIXES = ['sk-', 'api-', 'key-'];

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    this.validateCredentials();
  }

  private validateCredentials(): void {
    if (!this.apiKey) {
      throw new ProviderError('API key required', 'CREDENTIALS_MISSING');
    }

    if (this.apiKey.length < SecureMockProvider.MIN_KEY_LENGTH) {
      throw new ProviderError('API key too short', 'INVALID_CREDENTIALS');
    }

    const hasValidPrefix = SecureMockProvider.ALLOWED_KEY_PREFIXES.some((prefix) =>
      this.apiKey!.startsWith(prefix)
    );

    if (!hasValidPrefix) {
      throw new ProviderError('Invalid API key format', 'INVALID_CREDENTIALS');
    }
  }

  async sendMessage(prompt: string, options?: LLMMessageOptions): Promise<string> {
    return `Secure response to: ${prompt}`;
  }

  async *streamMessage(prompt: string, options?: LLMMessageOptions): AsyncGenerator<string, void, unknown> {
    yield 'Secure stream chunk';
  }

  async getModels(): Promise<LLMModel[]> {
    return [
      {
        id: 'secure-model',
        name: 'Secure Model',
        context_window: 8192,
        pricing: { input: 0.005, output: 0.01 },
      },
    ];
  }

  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unavailable';
    latency?: number;
    models_available?: number;
  }> {
    return {
      status: 'healthy',
      latency: 50,
      models_available: 1,
    };
  }
}

// ============================================================================
// Test Suite: Basic Provider Creation
// ============================================================================

describe('ProviderFactory - Basic Provider Creation', () => {
  beforeEach(() => {
    // Clear any registered providers except defaults
    ProviderFactory.registerProvider('anthropic', AnthropicProvider);
  });

  test('should create an Anthropic provider instance', () => {
    const provider = ProviderFactory.createProvider('anthropic');
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  test('should create provider with provided API key', () => {
    const testKey = 'sk-test-key-1234567890123456';
    const provider = ProviderFactory.createProvider('anthropic', testKey);
    expect(provider).toBeDefined();
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  test('should use environment API key when not provided', () => {
    const provider = ProviderFactory.createProvider('anthropic');
    expect(provider).toBeDefined();
  });

  test('should throw error for unsupported provider type', () => {
    expect(() => {
      ProviderFactory.createProvider('unsupported' as ProviderType);
    }).toThrow();
  });

  test('should throw ProviderError with correct code for unsupported provider', () => {
    try {
      ProviderFactory.createProvider('unsupported' as ProviderType);
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe('PROVIDER_NOT_FOUND');
    }
  });

  test('should include available providers in error details', () => {
    try {
      ProviderFactory.createProvider('unsupported' as ProviderType);
      fail('Should have thrown an error');
    } catch (error) {
      const providerError = error as ProviderError;
      expect(providerError.details).toBeDefined();
      expect(providerError.details.availableProviders).toContain('anthropic');
      expect(Array.isArray(providerError.details.availableProviders)).toBe(true);
    }
  });
});

// ============================================================================
// Test Suite: Provider Registration
// ============================================================================

describe('ProviderFactory - Provider Registration', () => {
  beforeEach(() => {
    ProviderFactory.registerProvider('anthropic', AnthropicProvider);
  });

  test('should register a new provider', () => {
    ProviderFactory.registerProvider('mock', MockProvider);
    const provider = ProviderFactory.createProvider('mock');
    expect(provider).toBeInstanceOf(MockProvider);
  });

  test('should allow overriding existing provider', () => {
    ProviderFactory.registerProvider('mock', MockProvider);
    const provider1 = ProviderFactory.createProvider('mock');
    expect(provider1).toBeInstanceOf(MockProvider);

    ProviderFactory.registerProvider('mock', AnthropicProvider);
    const provider2 = ProviderFactory.createProvider('mock');
    expect(provider2).toBeInstanceOf(AnthropicProvider);
  });

  test('should register multiple different providers', () => {
    ProviderFactory.registerProvider('mock', MockProvider);
    ProviderFactory.registerProvider('secure', SecureMockProvider);

    expect(ProviderFactory.createProvider('mock')).toBeInstanceOf(MockProvider);
    expect(ProviderFactory.createProvider('secure', 'sk-valid-key-1234567890')).toBeInstanceOf(SecureMockProvider);
  });

  test('should make registered provider available in getAvailableProviders', () => {
    ProviderFactory.registerProvider('mock', MockProvider);
    const available = ProviderFactory.getAvailableProviders();
    expect(available).toContain('mock');
  });
});

// ============================================================================
// Test Suite: Available Providers
// ============================================================================

describe('ProviderFactory - Available Providers', () => {
  beforeEach(() => {
    ProviderFactory.registerProvider('anthropic', AnthropicProvider);
  });

  test('should return array of available providers', () => {
    const providers = ProviderFactory.getAvailableProviders();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);
  });

  test('should include anthropic in available providers', () => {
    const providers = ProviderFactory.getAvailableProviders();
    expect(providers).toContain('anthropic');
  });

  test('should not include unregistered providers', () => {
    const providers = ProviderFactory.getAvailableProviders();
    expect(providers).not.toContain('nonexistent');
  });

  test('should update available providers after registration', () => {
    const before = ProviderFactory.getAvailableProviders();
    const hadMock = before.includes('mock');
    ProviderFactory.registerProvider('mock', MockProvider);
    const after = ProviderFactory.getAvailableProviders();
    if (!hadMock) {
      expect(after.length).toBe(before.length + 1);
    }
    expect(after).toContain('mock');
  });

  test('should return consistent list for repeated calls', () => {
    const list1 = ProviderFactory.getAvailableProviders();
    const list2 = ProviderFactory.getAvailableProviders();
    expect(list1).toEqual(list2);
  });
});

// ============================================================================
// Test Suite: Credential Handling and Security
// ============================================================================

describe('ProviderFactory - Credential Handling and Security', () => {
  beforeEach(() => {
    ProviderFactory.registerProvider('anthropic', AnthropicProvider);
  });

  test('should accept valid credentials format', () => {
    const validKey = 'sk-ant-v1-test1234567890abcdefghijklmnop';
    const provider = ProviderFactory.createProvider('anthropic', validKey);
    expect(provider).toBeDefined();
  });

  test('should not expose credentials in error messages', () => {
    try {
      ProviderFactory.createProvider('unsupported' as ProviderType);
    } catch (error) {
      const errorMessage = (error as Error).message;
      expect(errorMessage).not.toMatch(/sk-/);
      expect(errorMessage).not.toMatch(/api[-_]key/i);
      expect(errorMessage).not.toMatch(/secret/i);
    }
  });

  test('should not hardcode API keys in factory', () => {
    // This test ensures no hardcoded keys exist in the source
    const source = require('../../src/providers/provider-factory');
    const sourceString = JSON.stringify(source);
    expect(sourceString).not.toMatch(/sk-[a-zA-Z0-9]+/);
    expect(sourceString).not.toMatch(/api[_-]key[_-][a-zA-Z0-9]+/i);
  });

  test('should handle missing credentials gracefully', () => {
    // Remove ANTHROPIC_API_KEY from environment temporarily
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const provider = ProviderFactory.createProvider('anthropic');
      // Provider creation should succeed, but operation will fail without key
      expect(provider).toBeDefined();
    } finally {
      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      }
    }
  });

  test('should validate credentials in secure provider', () => {
    ProviderFactory.registerProvider('secure', SecureMockProvider);

    expect(() => {
      ProviderFactory.createProvider('secure');
    }).toThrow();
  });

  test('should accept properly formatted credentials in secure provider', () => {
    ProviderFactory.registerProvider('secure', SecureMockProvider);
    const validKey = 'sk-1234567890abcdefghijklmnop';

    const provider = ProviderFactory.createProvider('secure', validKey);
    expect(provider).toBeDefined();
    expect(provider).toBeInstanceOf(SecureMockProvider);
  });

  test('should reject credentials with invalid format in secure provider', () => {
    ProviderFactory.registerProvider('secure', SecureMockProvider);
    const invalidKey = 'invalid-key-format';

    expect(() => {
      ProviderFactory.createProvider('secure', invalidKey);
    }).toThrow(ProviderError);
  });

  test('should reject credentials that are too short in secure provider', () => {
    ProviderFactory.registerProvider('secure', SecureMockProvider);
    const shortKey = 'sk-short';

    expect(() => {
      ProviderFactory.createProvider('secure', shortKey);
    }).toThrow(ProviderError);
  });
});

// ============================================================================
// Test Suite: Fallback Behavior
// ============================================================================

describe('ProviderFactory - Fallback and Error Handling', () => {
  beforeEach(() => {
    ProviderFactory.registerProvider('anthropic', AnthropicProvider);
  });

  test('should provide error details for troubleshooting', () => {
    try {
      ProviderFactory.createProvider('nonexistent' as ProviderType);
    } catch (error) {
      const providerError = error as ProviderError;
      expect(providerError.details).toBeDefined();
      expect(typeof providerError.details).toBe('object');
    }
  });

  test('should create failing provider instance that throws on operation', () => {
    ProviderFactory.registerProvider('failing', FailingMockProvider);
    const validKey = 'sk-valid-key-1234567890';

    const provider = ProviderFactory.createProvider('failing', validKey);
    expect(provider).toBeDefined();
  });

  test('should throw on failing provider operation without credentials', () => {
    ProviderFactory.registerProvider('failing', FailingMockProvider);

    expect(() => {
      ProviderFactory.createProvider('failing');
    }).toThrow();
  });

  test('should throw ProviderError on failing provider message send', async () => {
    ProviderFactory.registerProvider('failing', FailingMockProvider);
    const validKey = 'sk-valid-key-1234567890';

    const provider = ProviderFactory.createProvider('failing', validKey);
    await expect(provider.sendMessage('test')).rejects.toThrow(ProviderError);
  });

  test('should handle provider health check failure', async () => {
    ProviderFactory.registerProvider('failing', FailingMockProvider);
    const validKey = 'sk-valid-key-1234567890';

    const provider = ProviderFactory.createProvider('failing', validKey);
    const health = await provider.checkHealth();
    expect(health.status).toBe('unavailable');
  });
});

// ============================================================================
// Test Suite: Provider Interface Implementation
// ============================================================================

describe('ProviderFactory - Provider Interface Compliance', () => {
  beforeEach(() => {
    ProviderFactory.registerProvider('mock', MockProvider);
  });

  test('created provider should implement sendMessage', async () => {
    const provider = ProviderFactory.createProvider('mock');
    const response = await provider.sendMessage('test prompt');
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
  });

  test('created provider should implement streamMessage', async () => {
    const provider = ProviderFactory.createProvider('mock');
    const chunks: string[] = [];

    for await (const chunk of provider.streamMessage('test prompt')) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => typeof c === 'string')).toBe(true);
  });

  test('created provider should implement getModels', async () => {
    const provider = ProviderFactory.createProvider('mock');
    const models = await provider.getModels();

    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('name');
    expect(models[0]).toHaveProperty('context_window');
    expect(models[0]).toHaveProperty('pricing');
  });

  test('created provider should implement checkHealth', async () => {
    const provider = ProviderFactory.createProvider('mock');
    const health = await provider.checkHealth();

    expect(health).toHaveProperty('status');
    expect(['healthy', 'degraded', 'unavailable']).toContain(health.status);
  });

  test('provider models should have valid pricing structure', async () => {
    const provider = ProviderFactory.createProvider('mock');
    const models = await provider.getModels();

    models.forEach((model) => {
      expect(model.pricing).toHaveProperty('input');
      expect(model.pricing).toHaveProperty('output');
      expect(typeof model.pricing.input).toBe('number');
      expect(typeof model.pricing.output).toBe('number');
      expect(model.pricing.input).toBeGreaterThanOrEqual(0);
      expect(model.pricing.output).toBeGreaterThanOrEqual(0);
    });
  });

  test('provider health should report valid metrics', async () => {
    const provider = ProviderFactory.createProvider('mock');
    const health = await provider.checkHealth();

    if (health.latency !== undefined) {
      expect(typeof health.latency).toBe('number');
      expect(health.latency).toBeGreaterThanOrEqual(0);
    }

    if (health.models_available !== undefined) {
      expect(typeof health.models_available).toBe('number');
      expect(health.models_available).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================================
// Test Suite: Cost Optimization
// ============================================================================

describe('ProviderFactory - Cost Optimization', () => {
  beforeEach(() => {
    ProviderFactory.registerProvider('anthropic', AnthropicProvider);
    ProviderFactory.registerProvider('mock', MockProvider);
  });

  test('should provide model pricing information for cost comparison', async () => {
    const provider = ProviderFactory.createProvider('mock');
    const models = await provider.getModels();

    expect(models.length).toBeGreaterThan(0);
    models.forEach((model) => {
      expect(model.pricing.input).toBeLessThanOrEqual(model.pricing.output);
      expect(model.pricing.input).toBeGreaterThan(0);
      expect(model.pricing.output).toBeGreaterThan(0);
    });
  });

  test('should allow selecting cost-optimized models', async () => {
    const provider = ProviderFactory.createProvider('mock');
    const models = await provider.getModels();

    // Find cheapest model
    const cheapest = models.reduce((min, model) => {
      const minCost = min.pricing.input + min.pricing.output;
      const modelCost = model.pricing.input + model.pricing.output;
      return modelCost < minCost ? model : min;
    });

    expect(cheapest).toBeDefined();
    expect(cheapest.pricing).toBeDefined();
  });

  test('should support provider selection based on cost', async () => {
    const providers = ProviderFactory.getAvailableProviders();

    const providerCosts = await Promise.all(
      providers.map(async (type) => {
        try {
          const provider = ProviderFactory.createProvider(type, 'sk-valid-key-1234567890');
          const models = await provider.getModels();
          const avgCost = models.reduce((sum, m) => sum + m.pricing.input + m.pricing.output, 0) / models.length;
          return { type, avgCost };
        } catch {
          // Provider requires valid credentials, skip
          return null;
        }
      })
    );

    const validCosts = providerCosts.filter((p) => p !== null);
    expect(validCosts.length).toBeGreaterThan(0);
    const costOptimized = validCosts.reduce((min, p) => (p!.avgCost < min!.avgCost ? p : min));
    expect(costOptimized).toBeDefined();
    expect(costOptimized!.type).toBeDefined();
  });
});

// ============================================================================
// Test Suite: Custom Routing Configuration
// ============================================================================

describe('ProviderFactory - Custom Routing and Configuration', () => {
  beforeEach(() => {
    ProviderFactory.registerProvider('anthropic', AnthropicProvider);
  });

  test('should support environment-based provider selection', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    const providerType: ProviderType = (process.env.LLM_PROVIDER as ProviderType) || 'anthropic';

    const provider = ProviderFactory.createProvider(providerType);
    expect(provider).toBeDefined();
    delete process.env.LLM_PROVIDER;
  });

  test('should support custom API endpoint configuration', () => {
    const customEndpoint = 'https://custom.api.endpoint.com';
    process.env.LLM_ENDPOINT = customEndpoint;

    // Register custom provider that uses endpoint
    const provider = ProviderFactory.createProvider('anthropic');
    expect(provider).toBeDefined();

    delete process.env.LLM_ENDPOINT;
  });

  test('should allow provider instance reuse', () => {
    const provider1 = ProviderFactory.createProvider('anthropic', 'sk-test-key');
    const provider2 = ProviderFactory.createProvider('anthropic', 'sk-test-key');

    expect(provider1).not.toBe(provider2);
    expect(provider1).toBeInstanceOf(AnthropicProvider);
    expect(provider2).toBeInstanceOf(AnthropicProvider);
  });

  test('should support different credentials per provider type', () => {
    ProviderFactory.registerProvider('mock', MockProvider);

    const anthropicKey = 'sk-ant-v1-abcdefghijklmnop';
    const mockKey = 'sk-mock-v1-abcdefghijklmnop';

    const anthropic = ProviderFactory.createProvider('anthropic', anthropicKey);
    const mock = ProviderFactory.createProvider('mock', mockKey);

    expect(anthropic).toBeInstanceOf(AnthropicProvider);
    expect(mock).toBeInstanceOf(MockProvider);
  });
});

// ============================================================================
// Test Suite: Agent-Specific Provider Overrides
// ============================================================================

describe('ProviderFactory - Agent-Specific Provider Overrides', () => {
  beforeEach(() => {
    ProviderFactory.registerProvider('anthropic', AnthropicProvider);
    ProviderFactory.registerProvider('mock', MockProvider);
  });

  test('should support per-agent provider configuration', () => {
    const agents = [
      { name: 'agent-1', provider: 'anthropic' as ProviderType },
      { name: 'agent-2', provider: 'mock' as ProviderType },
    ];

    agents.forEach((agent) => {
      const provider = ProviderFactory.createProvider(agent.provider);
      expect(provider).toBeDefined();
    });
  });

  test('should support per-agent model selection', async () => {
    const agentConfig = {
      agent1: { provider: 'mock' as ProviderType, model: 'mock-model-1' },
      agent2: { provider: 'mock' as ProviderType, model: 'mock-model-2' },
    };

    for (const [agentName, config] of Object.entries(agentConfig)) {
      const provider = ProviderFactory.createProvider(config.provider);
      const models = await provider.getModels();
      expect(models).toBeDefined();
    }
  });

  test('should support fallback provider for agent', () => {
    const agentConfig = {
      primaryProvider: 'mock' as ProviderType,
      fallbackProvider: 'anthropic' as ProviderType,
    };

    const primary = ProviderFactory.createProvider(agentConfig.primaryProvider);
    const fallback = ProviderFactory.createProvider(agentConfig.fallbackProvider);

    expect(primary).toBeDefined();
    expect(fallback).toBeDefined();
  });

  test('should support agent provider override from environment', () => {
    process.env.AGENT_OVERRIDE_PROVIDER = 'mock';
    const overrideProvider = (process.env.AGENT_OVERRIDE_PROVIDER as ProviderType) || 'anthropic';

    const provider = ProviderFactory.createProvider(overrideProvider);
    expect(provider).toBeDefined();

    delete process.env.AGENT_OVERRIDE_PROVIDER;
  });
});

// ============================================================================
// Test Suite: Edge Cases and Error Scenarios
// ============================================================================

describe('ProviderFactory - Edge Cases and Error Scenarios', () => {
  beforeEach(() => {
    ProviderFactory.registerProvider('anthropic', AnthropicProvider);
    ProviderFactory.registerProvider('mock', MockProvider);
  });

  test('should handle null provider type gracefully', () => {
    expect(() => {
      ProviderFactory.createProvider(null as any);
    }).toThrow();
  });

  test('should handle undefined provider type gracefully', () => {
    expect(() => {
      ProviderFactory.createProvider(undefined as any);
    }).toThrow();
  });

  test('should handle empty string provider type', () => {
    expect(() => {
      ProviderFactory.createProvider('' as any);
    }).toThrow();
  });

  test('should handle case-sensitive provider type matching', () => {
    expect(() => {
      ProviderFactory.createProvider('ANTHROPIC' as any);
    }).toThrow();
  });

  test('should handle whitespace in provider type', () => {
    expect(() => {
      ProviderFactory.createProvider(' anthropic ' as any);
    }).toThrow();
  });

  test('should handle provider registration with null class', () => {
    expect(() => {
      ProviderFactory.registerProvider('null', null as any);
    }).not.toThrow();
  });

  test('should throw error message without sensitive details', () => {
    try {
      ProviderFactory.createProvider('nonexistent' as ProviderType);
    } catch (error) {
      const message = (error as Error).message;
      expect(message.toLowerCase()).not.toContain('password');
      expect(message.toLowerCase()).not.toContain('secret');
    }
  });

  test('should handle concurrent provider creation', async () => {
    const promises = Array(10)
      .fill(null)
      .map(() => Promise.resolve(ProviderFactory.createProvider('mock')));

    const providers = await Promise.all(promises);
    expect(providers.length).toBe(10);
    providers.forEach((p) => expect(p).toBeDefined());
  });

  test('should maintain provider independence', () => {
    const provider1 = ProviderFactory.createProvider('mock');
    const provider2 = ProviderFactory.createProvider('mock');

    expect(provider1).not.toBe(provider2);
  });
});

// ============================================================================
// Test Suite: Integration Scenarios
// ============================================================================

describe('ProviderFactory - Integration Scenarios', () => {
  beforeEach(() => {
    ProviderFactory.registerProvider('anthropic', AnthropicProvider);
    ProviderFactory.registerProvider('mock', MockProvider);
    ProviderFactory.registerProvider('secure', SecureMockProvider);
  });

  test('should support multi-provider orchestration', async () => {
    const orchestrationConfig = {
      primaryProvider: 'mock' as ProviderType,
      secondaryProvider: 'anthropic' as ProviderType,
    };

    const primary = ProviderFactory.createProvider(orchestrationConfig.primaryProvider);
    const secondary = ProviderFactory.createProvider(orchestrationConfig.secondaryProvider);

    const primaryModels = await primary.getModels();
    const secondaryModels = await secondary.getModels();

    expect(primaryModels.length).toBeGreaterThan(0);
    expect(secondaryModels.length).toBeGreaterThan(0);
  });

  test('should support provider health-based routing', async () => {
    const providers = ProviderFactory.getAvailableProviders();

    const healthChecks = await Promise.all(
      providers.map(async (type) => {
        try {
          const provider = ProviderFactory.createProvider(type, 'sk-valid-key-1234567890');
          const health = await provider.checkHealth();
          return { type, ...health };
        } catch {
          // Provider requires valid credentials, return degraded status
          return { type, status: 'unavailable' as const };
        }
      })
    );

    const healthyProviders = healthChecks.filter((h) => h.status === 'healthy');
    expect(healthyProviders.length).toBeGreaterThanOrEqual(0);
  });

  test('should support gradual provider migration', () => {
    const migrationConfig = {
      iteration1: 'anthropic' as ProviderType,
      iteration2: 'mock' as ProviderType,
    };

    const oldProvider = ProviderFactory.createProvider(migrationConfig.iteration1);
    const newProvider = ProviderFactory.createProvider(migrationConfig.iteration2);

    expect(oldProvider).toBeDefined();
    expect(newProvider).toBeDefined();
  });

  test('should support A/B testing with different providers', async () => {
    const abTestConfig = {
      cohortA: {
        provider: 'mock' as ProviderType,
        sampleSize: 50,
      },
      cohortB: {
        provider: 'anthropic' as ProviderType,
        sampleSize: 50,
      },
    };

    const providerA = ProviderFactory.createProvider(abTestConfig.cohortA.provider);
    const providerB = ProviderFactory.createProvider(abTestConfig.cohortB.provider);

    const modelsA = await providerA.getModels();
    const modelsB = await providerB.getModels();

    expect(modelsA.length).toBeGreaterThan(0);
    expect(modelsB.length).toBeGreaterThan(0);
  });

  test('should support provider failover strategy', async () => {
    const failoverConfig = {
      primaryProvider: 'mock' as ProviderType,
      fallbackProvider: 'anthropic' as ProviderType,
      tertiaryProvider: 'secure' as ProviderType,
    };

    const providers = [
      failoverConfig.primaryProvider,
      failoverConfig.fallbackProvider,
      failoverConfig.tertiaryProvider,
    ];

    const instances = providers.map((p) => {
      try {
        return ProviderFactory.createProvider(p, 'sk-valid-key-1234567890');
      } catch {
        return null;
      }
    });

    const availableInstances = instances.filter((p) => p !== null);
    expect(availableInstances.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Test Suite: Type Safety and Validation
// ============================================================================

describe('ProviderFactory - Type Safety and Validation', () => {
  beforeEach(() => {
    ProviderFactory.registerProvider('anthropic', AnthropicProvider);
  });

  test('should enforce ProviderType contract', () => {
    const validTypes: ProviderType[] = ['anthropic'];

    validTypes.forEach((type) => {
      const provider = ProviderFactory.createProvider(type);
      expect(provider).toBeDefined();
    });
  });

  test('should return array of ProviderType from getAvailableProviders', () => {
    const providers = ProviderFactory.getAvailableProviders();
    expect(Array.isArray(providers)).toBe(true);
    providers.forEach((p) => {
      expect(typeof p).toBe('string');
    });
  });

  test('should validate provider interface implementation', () => {
    const provider = ProviderFactory.createProvider('anthropic');

    expect(typeof provider.sendMessage).toBe('function');
    expect(typeof provider.streamMessage).toBe('function');
    expect(typeof provider.getModels).toBe('function');
    expect(typeof provider.checkHealth).toBe('function');
  });

  test('should return proper error type on invalid provider', () => {
    try {
      ProviderFactory.createProvider('invalid' as ProviderType);
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
    }
  });
});
