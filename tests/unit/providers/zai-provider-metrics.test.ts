/**
 * Test Suite for Z.ai Provider Metrics Tracking
 *
 * Validates that Z.ai provider correctly:
 * - Routes through tiered-router
 * - Tags metrics with provider: 'z.ai'
 * - Tracks both streaming and non-streaming requests
 * - Records token usage metrics
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
const vi = jest;
type Mock = jest.Mock;
import { ZaiProvider } from '../../../src/providers/zai-provider.js';
import { getGlobalMetricsStorage, MetricsStorage } from '../../../src/observability/metrics-storage.js';
import { ILogger } from '../../../src/core/logger.js';

// Mock logger factory
const createMockLogger = (): ILogger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  level: 'debug'
} as any);

// Mock fetch globally
global.fetch = vi.fn();

describe('Z.ai Provider - Metrics Tracking', () => {
  let provider: ZaiProvider;
  let storage: MetricsStorage;
  let mockLogger: ILogger;
  const mockFetch = global.fetch as Mock;

  beforeEach(async () => {
    // Initialize metrics storage
    storage = getGlobalMetricsStorage();

    // Create mock logger
    mockLogger = createMockLogger();

    // Create Z.ai provider with BaseProviderOptions format
    provider = new ZaiProvider({
      logger: mockLogger,
      config: {
        apiKey: 'test-zai-key',
        model: 'glm-4.6',
        temperature: 0.7,
        maxTokens: 8192,
        enableCaching: false,
      }
    });

    // Initialize provider
    await provider.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (provider) {
      provider.destroy();
    }
  });

  describe('Non-Streaming Request Metrics', () => {
    it('should track request with provider: "z.ai" tag', async () => {
      // Mock Z.ai API response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'zai-msg-1',
          model: 'glm-4.6',
          choices: [{
            message: {
              role: 'assistant',
              content: 'Test response from Z.ai'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 100,
            total_tokens: 150
          }
        })
      });

      const beforeCount = storage.getCounterTotal('claude.api.request');

      await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
        model: 'glm-4.6'
      });

      const afterCount = storage.getCounterTotal('claude.api.request');
      expect(afterCount).toBeGreaterThan(beforeCount);

      // Verify provider tag
      const metrics = storage.query({ name: 'claude.api.request', limit: 1 });
      expect(metrics.length).toBeGreaterThan(0);

      const tags = JSON.parse(metrics[0].tags);
      expect(tags).toMatchObject({
        provider: 'z.ai',
        model: 'glm-4.6',
        stream: 'false'
      });
    });

    it('should track token usage with model tag', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'zai-msg-2',
          model: 'glm-4.6',
          choices: [{
            message: {
              role: 'assistant',
              content: 'Response'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 240,
            total_tokens: 360
          }
        })
      });

      const beforeInput = storage.getCounterTotal('claude.tokens.input');
      const beforeOutput = storage.getCounterTotal('claude.tokens.output');
      const beforeTotal = storage.getCounterTotal('claude.tokens.total');

      await provider.complete({
        messages: [{ role: 'user', content: 'test message' }],
        model: 'glm-4.6'
      });

      const afterInput = storage.getCounterTotal('claude.tokens.input');
      const afterOutput = storage.getCounterTotal('claude.tokens.output');
      const afterTotal = storage.getCounterTotal('claude.tokens.total');

      expect(afterInput - beforeInput).toBeGreaterThanOrEqual(120);
      expect(afterOutput - beforeOutput).toBeGreaterThanOrEqual(240);
      expect(afterTotal - beforeTotal).toBeGreaterThanOrEqual(360);

      // Verify model tag on token metrics
      const inputMetrics = storage.query({ name: 'claude.tokens.input', limit: 1 });
      const tags = JSON.parse(inputMetrics[0].tags);
      expect(tags.model).toBe('glm-4.6');
    });

    it('should record duration on successful request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'zai-msg-3',
          model: 'glm-4.5',
          choices: [{
            message: {
              role: 'assistant',
              content: 'Response'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
          }
        })
      });

      await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
        model: 'glm-4.5'
      });

      const metrics = storage.query({
        name: 'claude.api.duration',
        tags: { status: 'success', stream: 'false' },
        limit: 1
      });

      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].value).toBeGreaterThan(0);

      const tags = JSON.parse(metrics[0].tags);
      expect(tags).toMatchObject({
        model: 'glm-4.5',
        status: 'success',
        stream: 'false'
      });
    });

    it('should track errors with Z.ai provider tag', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: { message: 'Z.ai server error' } })
      });

      const beforeCount = storage.getCounterTotal('claude.api.error');

      try {
        await provider.complete({
          messages: [{ role: 'user', content: 'test' }],
          model: 'glm-4.6'
        });
      } catch (error) {
        // Expected error
      }

      const afterCount = storage.getCounterTotal('claude.api.error');
      expect(afterCount).toBeGreaterThan(beforeCount);

      const metrics = storage.query({ name: 'claude.api.error', limit: 1 });
      expect(metrics.length).toBeGreaterThan(0);

      const tags = JSON.parse(metrics[0].tags);
      expect(tags).toHaveProperty('errorType');
      expect(tags).toHaveProperty('model');
    });
  });

  describe('Streaming Request Metrics', () => {
    it('should track streaming request with provider: "z.ai" and stream: "true"', async () => {
      const mockStream = createMockZaiStreamResponse([
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ' world' } }] },
        { choices: [{ finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }
      ]);

      mockFetch.mockResolvedValue(mockStream);

      const beforeCount = storage.getCounterTotal('claude.api.request');

      const stream = provider.streamComplete({
        messages: [{ role: 'user', content: 'test streaming' }],
        model: 'glm-4.6'
      });

      // Consume stream
      for await (const _ of stream) {
        // Process events
      }

      const afterCount = storage.getCounterTotal('claude.api.request');
      expect(afterCount).toBeGreaterThan(beforeCount);

      const metrics = storage.query({ name: 'claude.api.request', limit: 1 });
      const tags = JSON.parse(metrics[0].tags);
      expect(tags).toMatchObject({
        provider: 'z.ai',
        model: 'glm-4.6',
        stream: 'true'
      });
    });

    it('should track token usage in streaming mode', async () => {
      const mockStream = createMockZaiStreamResponse([
        { choices: [{ delta: { content: 'Streaming' } }] },
        { choices: [{ delta: { content: ' response' } }] },
        { choices: [{ finish_reason: 'stop' }], usage: { prompt_tokens: 80, completion_tokens: 160, total_tokens: 240 } }
      ]);

      mockFetch.mockResolvedValue(mockStream);

      const beforeInput = storage.getCounterTotal('claude.tokens.input');
      const beforeOutput = storage.getCounterTotal('claude.tokens.output');
      const beforeTotal = storage.getCounterTotal('claude.tokens.total');

      const stream = provider.streamComplete({
        messages: [{ role: 'user', content: 'streaming test' }],
        model: 'glm-4.6'
      });

      for await (const _ of stream) {
        // Process events
      }

      const afterInput = storage.getCounterTotal('claude.tokens.input');
      const afterOutput = storage.getCounterTotal('claude.tokens.output');
      const afterTotal = storage.getCounterTotal('claude.tokens.total');

      expect(afterInput - beforeInput).toBeGreaterThanOrEqual(80);
      expect(afterOutput - beforeOutput).toBeGreaterThanOrEqual(160);
      expect(afterTotal - beforeTotal).toBeGreaterThanOrEqual(240);
    });

    it('should record duration on successful streaming completion', async () => {
      const mockStream = createMockZaiStreamResponse([
        { choices: [{ delta: { content: 'test' } }] },
        { choices: [{ finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 } }
      ]);

      mockFetch.mockResolvedValue(mockStream);

      const stream = provider.streamComplete({
        messages: [{ role: 'user', content: 'test' }],
        model: 'glm-4.6'
      });

      for await (const _ of stream) {
        // Process events
      }

      const metrics = storage.query({
        name: 'claude.api.duration',
        tags: { status: 'success', stream: 'true' },
        limit: 1
      });

      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].value).toBeGreaterThan(0);

      const tags = JSON.parse(metrics[0].tags);
      expect(tags).toMatchObject({
        model: 'glm-4.6',
        status: 'success',
        stream: 'true'
      });
    });

    it('should track streaming errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } })
      });

      const beforeCount = storage.getCounterTotal('claude.api.error');

      try {
        const stream = provider.streamComplete({
          messages: [{ role: 'user', content: 'test' }],
          model: 'glm-4.6'
        });

        for await (const _ of stream) {
          // Process events
        }
      } catch (error) {
        // Expected error
      }

      const afterCount = storage.getCounterTotal('claude.api.error');
      expect(afterCount).toBeGreaterThan(beforeCount);

      const metrics = storage.query({ name: 'claude.api.error', limit: 1 });
      const tags = JSON.parse(metrics[0].tags);
      expect(tags.errorType).toBeDefined();
    });
  });

  describe('Cross-Model Support', () => {
    it('should track different GLM models separately', async () => {
      // Test GLM-4.5
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg-1',
          model: 'glm-4.5',
          choices: [{
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
        })
      });

      await provider.complete({
        messages: [{ role: 'user', content: 'test glm-4.5' }],
        model: 'glm-4.5'
      });

      const metrics45 = storage.query({ name: 'claude.api.request', limit: 1 });
      const tags45 = JSON.parse(metrics45[0].tags);
      expect(tags45.model).toBe('glm-4.5');

      // Test GLM-4.6
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg-2',
          model: 'glm-4.6',
          choices: [{
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
        })
      });

      await provider.complete({
        messages: [{ role: 'user', content: 'test glm-4.6' }],
        model: 'glm-4.6'
      });

      const metrics46 = storage.query({ name: 'claude.api.request', limit: 1 });
      const tags46 = JSON.parse(metrics46[0].tags);
      expect(tags46.model).toBe('glm-4.6');
    });
  });

  describe('Metrics Aggregation', () => {
    it('should allow breakdown by provider tag', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'msg-1',
          model: 'glm-4.6',
          choices: [{
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
        })
      });

      // Make multiple requests
      await provider.complete({
        messages: [{ role: 'user', content: 'request 1' }],
        model: 'glm-4.6'
      });

      await provider.complete({
        messages: [{ role: 'user', content: 'request 2' }],
        model: 'glm-4.6'
      });

      const breakdown = storage.getBreakdown('claude.api.request', 'provider');
      expect(breakdown['z.ai']).toBeGreaterThanOrEqual(2);
    });

    it('should allow filtering metrics by Z.ai provider tag', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'msg-1',
          model: 'glm-4.6',
          choices: [{
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
        })
      });

      await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
        model: 'glm-4.6'
      });

      const zaiMetrics = storage.query({
        name: 'claude.api.request',
        tags: { provider: 'z.ai' }
      });

      expect(zaiMetrics.length).toBeGreaterThan(0);
      zaiMetrics.forEach(metric => {
        const tags = JSON.parse(metric.tags);
        expect(tags.provider).toBe('z.ai');
      });
    });
  });
});

/**
 * Helper: Create mock Z.ai streaming response
 */
function createMockZaiStreamResponse(events: any[]) {
  const encoder = new TextEncoder();
  const chunks = events.map(event =>
    encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  );

  // Add [DONE] marker
  chunks.push(encoder.encode('data: [DONE]\n\n'));

  let index = 0;
  const mockReader = {
    read: async () => {
      if (index >= chunks.length) {
        return { done: true, value: undefined };
      }
      return { done: false, value: chunks[index++] };
    },
    releaseLock: () => {}
  };

  return {
    ok: true,
    body: {
      getReader: () => mockReader
    }
  };
}
