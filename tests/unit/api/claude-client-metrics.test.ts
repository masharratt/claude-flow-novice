/**
 * Comprehensive Test Suite for Claude API Client Metrics Instrumentation
 *
 * Tests all 22 instrumentation points across:
 * - Non-streaming request path (6 points)
 * - Streaming request path (16 points)
 * - Token usage tracking
 * - Error metrics
 * - Duration tracking
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
const vi = jest;
type Mock = jest.Mock;
import { ClaudeAPIClient } from '../../../src/api/claude-client.js';
import { getGlobalMetricsStorage, MetricsStorage } from '../../../src/observability/metrics-storage.js';
import { ConfigManager } from '../../../src/config/config-manager.js';
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

describe('Claude API Client - Metrics Integration', () => {
  let client: ClaudeAPIClient;
  let storage: MetricsStorage;
  let mockLogger: any;
  let mockConfigManager: any;
  const mockFetch = global.fetch as Mock;

  beforeEach(() => {
    // Initialize metrics storage
    storage = getGlobalMetricsStorage();

    // Create mocks
    mockLogger = createMockLogger();
    mockConfigManager = {
      get: vi.fn().mockReturnValue(null),
    };

    // Set up environment for API key
    process.env.ANTHROPIC_API_KEY = 'test-key';

    // Create client with test configuration (default anthropic URL)
    client = new ClaudeAPIClient(mockLogger, mockConfigManager as any, {
      apiKey: 'test-key',
      apiUrl: 'https://api.anthropic.com/v1/messages', // Explicit anthropic URL
      model: 'claude-3-sonnet-20240229',
      retryAttempts: 3,
      retryDelay: 100,
      retryJitter: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    if (client) {
      client.destroy();
    }
  });

  describe('Non-Streaming Request Metrics', () => {
    describe('Line 307-311: claude.api.request counter', () => {
      it('should increment request counter on sendMessage', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'response' }],
            model: 'claude-3-sonnet-20240229',
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 20 }
          })
        });

        const beforeCount = storage.getCounterTotal('claude.api.request');

        await client.sendMessage([{ role: 'user', content: 'test' }]);

        const afterCount = storage.getCounterTotal('claude.api.request');
        expect(afterCount).toBeGreaterThan(beforeCount);
      });

      it('should track request with correct tags (model, provider, stream)', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'response' }],
            model: 'claude-3-sonnet-20240229',
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 20 }
          })
        });

        await client.sendMessage([{ role: 'user', content: 'test' }]);

        const metrics = storage.query({ name: 'claude.api.request', limit: 1 });
        expect(metrics.length).toBeGreaterThan(0);

        const tags = JSON.parse(metrics[0].tags);
        expect(tags).toMatchObject({
          model: 'claude-3-sonnet-20240229',
          provider: 'anthropic',
          stream: 'false'
        });
      });
    });

    describe('Line 352-356: claude.api.duration (success)', () => {
      it('should record duration on successful request', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'response' }],
            model: 'claude-3-sonnet-20240229',
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 20 }
          })
        });

        await client.sendMessage([{ role: 'user', content: 'test' }]);

        const metrics = storage.query({
          name: 'claude.api.duration',
          tags: { status: 'success', stream: 'false' },
          limit: 1
        });

        expect(metrics.length).toBeGreaterThan(0);
        expect(metrics[0].value).toBeGreaterThan(0);

        const tags = JSON.parse(metrics[0].tags);
        expect(tags).toMatchObject({
          model: 'claude-3-sonnet-20240229',
          status: 'success',
          stream: 'false'
        });
      });
    });

    describe('Line 360-368: Token usage metrics (input, output, total)', () => {
      it('should track claude.tokens.input', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'response' }],
            model: 'claude-3-sonnet-20240229',
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 200 }
          })
        });

        const beforeInput = storage.getCounterTotal('claude.tokens.input');

        await client.sendMessage([{ role: 'user', content: 'test' }]);

        const afterInput = storage.getCounterTotal('claude.tokens.input');
        expect(afterInput - beforeInput).toBeGreaterThanOrEqual(100);
      });

      it('should track claude.tokens.output', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'response' }],
            model: 'claude-3-sonnet-20240229',
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 200 }
          })
        });

        const beforeOutput = storage.getCounterTotal('claude.tokens.output');

        await client.sendMessage([{ role: 'user', content: 'test' }]);

        const afterOutput = storage.getCounterTotal('claude.tokens.output');
        expect(afterOutput - beforeOutput).toBeGreaterThanOrEqual(200);
      });

      it('should track claude.tokens.total', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'response' }],
            model: 'claude-3-sonnet-20240229',
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 200 }
          })
        });

        const beforeTotal = storage.getCounterTotal('claude.tokens.total');

        await client.sendMessage([{ role: 'user', content: 'test' }]);

        const afterTotal = storage.getCounterTotal('claude.tokens.total');
        expect(afterTotal - beforeTotal).toBeGreaterThanOrEqual(300);
      });

      it('should tag token metrics with model', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'response' }],
            model: 'claude-3-sonnet-20240229',
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 200 }
          })
        });

        await client.sendMessage([{ role: 'user', content: 'test' }]);

        const inputMetrics = storage.query({ name: 'claude.tokens.input', limit: 1 });
        const tags = JSON.parse(inputMetrics[0].tags);
        expect(tags.model).toBe('claude-3-sonnet-20240229');
      });
    });

    describe('Line 384-389: claude.api.error counter (on failure)', () => {
      it('should track errors on API failure', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ error: { message: 'Server error' } })
        });

        const beforeCount = storage.getCounterTotal('claude.api.error');

        try {
          await client.sendMessage([{ role: 'user', content: 'test' }]);
        } catch (error) {
          // Expected error
        }

        const afterCount = storage.getCounterTotal('claude.api.error');
        expect(afterCount).toBeGreaterThan(beforeCount);
      });

      it('should tag errors with errorType, statusCode, retryable', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ error: { message: 'Bad request' } })
        });

        try {
          await client.sendMessage([{ role: 'user', content: 'test' }]);
        } catch (error) {
          // Expected error
        }

        const metrics = storage.query({ name: 'claude.api.error', limit: 1 });
        expect(metrics.length).toBeGreaterThan(0);

        const tags = JSON.parse(metrics[0].tags);
        expect(tags).toHaveProperty('errorType');
        expect(tags).toHaveProperty('statusCode');
        expect(tags).toHaveProperty('retryable');
      });
    });

    describe('Line 393-397: claude.api.duration (error, non-retryable)', () => {
      it('should record duration on non-retryable error', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ error: { message: 'Bad request' } })
        });

        try {
          await client.sendMessage([{ role: 'user', content: 'test' }]);
        } catch (error) {
          // Expected error
        }

        const metrics = storage.query({
          name: 'claude.api.duration',
          tags: { status: 'error', stream: 'false' },
          limit: 1
        });

        expect(metrics.length).toBeGreaterThan(0);
        expect(metrics[0].value).toBeGreaterThan(0);
      });
    });

    describe('Line 419-423: claude.api.duration (error, after retries)', () => {
      it('should record duration after all retries exhausted', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ error: { message: 'Server error' } })
        });

        try {
          await client.sendMessage([{ role: 'user', content: 'test' }]);
        } catch (error) {
          // Expected error
        }

        // Should have retried 3 times
        expect(mockFetch).toHaveBeenCalledTimes(3);

        const metrics = storage.query({
          name: 'claude.api.duration',
          tags: { status: 'error', stream: 'false' },
          limit: 1
        });

        expect(metrics.length).toBeGreaterThan(0);
        expect(metrics[0].value).toBeGreaterThan(0);
      });
    });
  });

  describe('Streaming Request Metrics', () => {
    describe('Line 439-443: claude.api.request (stream=true)', () => {
      it('should track streaming request with stream=true tag', async () => {
        const mockStream = createMockStreamResponse([
          { type: 'message_start', message: { usage: { input_tokens: 10 } } },
          { type: 'content_block_delta', delta: { text: 'test' } },
          { type: 'message_stop' }
        ]);

        mockFetch.mockResolvedValue(mockStream);

        const beforeCount = storage.getCounterTotal('claude.api.request');

        const stream = await client.sendMessage([{ role: 'user', content: 'test' }], { stream: true });

        // Consume stream
        for await (const _ of stream as AsyncIterable<any>) {
          // Process events
        }

        const afterCount = storage.getCounterTotal('claude.api.request');
        expect(afterCount).toBeGreaterThan(beforeCount);

        const metrics = storage.query({ name: 'claude.api.request', limit: 1 });
        const tags = JSON.parse(metrics[0].tags);
        expect(tags.stream).toBe('true');
      });
    });

    describe('Line 473-478: claude.api.error (HTTP error)', () => {
      it('should track HTTP error in streaming', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ error: { message: 'Server error' } })
        });

        const beforeCount = storage.getCounterTotal('claude.api.error');

        try {
          const stream = await client.sendMessage([{ role: 'user', content: 'test' }], { stream: true });
          for await (const _ of stream as AsyncIterable<any>) {
            // Process events
          }
        } catch (error) {
          // Expected error
        }

        const afterCount = storage.getCounterTotal('claude.api.error');
        expect(afterCount).toBeGreaterThan(beforeCount);
      });
    });

    describe('Line 480-484: claude.api.duration (HTTP error)', () => {
      it('should record duration on HTTP error', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ error: { message: 'Server error' } })
        });

        try {
          const stream = await client.sendMessage([{ role: 'user', content: 'test' }], { stream: true });
          for await (const _ of stream as AsyncIterable<any>) {
            // Process events
          }
        } catch (error) {
          // Expected error
        }

        const metrics = storage.query({
          name: 'claude.api.duration',
          tags: { status: 'error', stream: 'true' },
          limit: 1
        });

        expect(metrics.length).toBeGreaterThan(0);
        expect(metrics[0].value).toBeGreaterThan(0);
      });
    });

    describe('Line 492-497: claude.api.error (null body)', () => {
      it('should track error when response body is null', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          body: null
        });

        const beforeCount = storage.getCounterTotal('claude.api.error');

        try {
          const stream = await client.sendMessage([{ role: 'user', content: 'test' }], { stream: true });
          for await (const _ of stream as AsyncIterable<any>) {
            // Process events
          }
        } catch (error) {
          // Expected error
        }

        const afterCount = storage.getCounterTotal('claude.api.error');
        expect(afterCount).toBeGreaterThan(beforeCount);

        const metrics = storage.query({ name: 'claude.api.error', limit: 1 });
        const tags = JSON.parse(metrics[0].tags);
        expect(tags.errorType).toBe('ResponseBodyNull');
      });
    });

    describe('Line 499-503: claude.api.duration (null body)', () => {
      it('should record duration on null body error', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          body: null
        });

        try {
          const stream = await client.sendMessage([{ role: 'user', content: 'test' }], { stream: true });
          for await (const _ of stream as AsyncIterable<any>) {
            // Process events
          }
        } catch (error) {
          // Expected error
        }

        const metrics = storage.query({
          name: 'claude.api.duration',
          tags: { status: 'error', stream: 'true' },
          limit: 1
        });

        expect(metrics.length).toBeGreaterThan(0);
      });
    });

    describe('Line 546-550: claude.api.duration (success)', () => {
      it('should record duration on successful streaming completion', async () => {
        const mockStream = createMockStreamResponse([
          { type: 'message_start', message: { usage: { input_tokens: 10 } } },
          { type: 'content_block_delta', delta: { text: 'test' } },
          { type: 'message_stop' }
        ]);

        mockFetch.mockResolvedValue(mockStream);

        const stream = await client.sendMessage([{ role: 'user', content: 'test' }], { stream: true });

        // Consume stream
        for await (const _ of stream as AsyncIterable<any>) {
          // Process events
        }

        const metrics = storage.query({
          name: 'claude.api.duration',
          tags: { status: 'success', stream: 'true' },
          limit: 1
        });

        expect(metrics.length).toBeGreaterThan(0);
        expect(metrics[0].value).toBeGreaterThan(0);
      });
    });

    describe('Line 553-557: Token metrics (input, output, total) from streaming', () => {
      it('should track input tokens from message_start event', async () => {
        const mockStream = createMockStreamResponse([
          { type: 'message_start', message: { usage: { input_tokens: 150 } } },
          { type: 'message_delta', usage: { output_tokens: 50 } },
          { type: 'message_stop' }
        ]);

        mockFetch.mockResolvedValue(mockStream);

        const beforeInput = storage.getCounterTotal('claude.tokens.input');

        const stream = await client.sendMessage([{ role: 'user', content: 'test' }], { stream: true });

        for await (const _ of stream as AsyncIterable<any>) {
          // Process events
        }

        const afterInput = storage.getCounterTotal('claude.tokens.input');
        expect(afterInput - beforeInput).toBeGreaterThanOrEqual(150);
      });

      it('should track output tokens from message_delta events', async () => {
        const mockStream = createMockStreamResponse([
          { type: 'message_start', message: { usage: { input_tokens: 10 } } },
          { type: 'message_delta', usage: { output_tokens: 25 } },
          { type: 'message_delta', usage: { output_tokens: 25 } },
          { type: 'message_stop' }
        ]);

        mockFetch.mockResolvedValue(mockStream);

        const beforeOutput = storage.getCounterTotal('claude.tokens.output');

        const stream = await client.sendMessage([{ role: 'user', content: 'test' }], { stream: true });

        for await (const _ of stream as AsyncIterable<any>) {
          // Process events
        }

        const afterOutput = storage.getCounterTotal('claude.tokens.output');
        expect(afterOutput - beforeOutput).toBeGreaterThanOrEqual(50);
      });

      it('should track total tokens from streaming events', async () => {
        const mockStream = createMockStreamResponse([
          { type: 'message_start', message: { usage: { input_tokens: 100 } } },
          { type: 'message_delta', usage: { output_tokens: 200 } },
          { type: 'message_stop' }
        ]);

        mockFetch.mockResolvedValue(mockStream);

        const beforeTotal = storage.getCounterTotal('claude.tokens.total');

        const stream = await client.sendMessage([{ role: 'user', content: 'test' }], { stream: true });

        for await (const _ of stream as AsyncIterable<any>) {
          // Process events
        }

        const afterTotal = storage.getCounterTotal('claude.tokens.total');
        expect(afterTotal - beforeTotal).toBeGreaterThanOrEqual(300);
      });
    });

    describe('Line 565-570: claude.api.error (timeout)', () => {
      it('should track timeout errors', async () => {
        // Mock AbortError
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';

        mockFetch.mockRejectedValue(abortError);

        const beforeCount = storage.getCounterTotal('claude.api.error');

        try {
          const stream = await client.sendMessage([{ role: 'user', content: 'test' }], { stream: true });
          for await (const _ of stream as AsyncIterable<any>) {
            // Process events
          }
        } catch (error) {
          // Expected error
        }

        const afterCount = storage.getCounterTotal('claude.api.error');
        expect(afterCount).toBeGreaterThan(beforeCount);

        const metrics = storage.query({ name: 'claude.api.error', limit: 1 });
        const tags = JSON.parse(metrics[0].tags);
        expect(tags.errorType).toBe('Timeout');
        expect(tags.statusCode).toBe('timeout');
        expect(tags.retryable).toBe('true');
      });
    });

    describe('Line 572-576: claude.api.duration (timeout)', () => {
      it('should record duration on timeout', async () => {
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';

        mockFetch.mockRejectedValue(abortError);

        try {
          const stream = await client.sendMessage([{ role: 'user', content: 'test' }], { stream: true });
          for await (const _ of stream as AsyncIterable<any>) {
            // Process events
          }
        } catch (error) {
          // Expected error
        }

        const metrics = storage.query({
          name: 'claude.api.duration',
          tags: { status: 'error', stream: 'true' },
          limit: 1
        });

        expect(metrics.length).toBeGreaterThan(0);
      });
    });

    describe('Line 582-588: claude.api.error (generic error)', () => {
      it('should track generic errors not already instrumented', async () => {
        const genericError = new Error('Generic network error');
        mockFetch.mockRejectedValue(genericError);

        const beforeCount = storage.getCounterTotal('claude.api.error');

        try {
          const stream = await client.sendMessage([{ role: 'user', content: 'test' }], { stream: true });
          for await (const _ of stream as AsyncIterable<any>) {
            // Process events
          }
        } catch (error) {
          // Expected error
        }

        const afterCount = storage.getCounterTotal('claude.api.error');
        expect(afterCount).toBeGreaterThan(beforeCount);
      });
    });

    describe('Line 590-594: claude.api.duration (generic error)', () => {
      it('should record duration on generic error', async () => {
        const genericError = new Error('Generic network error');
        mockFetch.mockRejectedValue(genericError);

        try {
          const stream = await client.sendMessage([{ role: 'user', content: 'test' }], { stream: true });
          for await (const _ of stream as AsyncIterable<any>) {
            // Process events
          }
        } catch (error) {
          // Expected error
        }

        const metrics = storage.query({
          name: 'claude.api.duration',
          tags: { status: 'error', stream: 'true' },
          limit: 1
        });

        expect(metrics.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Cross-cutting Metric Concerns', () => {
    it('should track different models separately', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'response' }],
          model: 'claude-3-haiku-20240307',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      });

      await client.sendMessage(
        [{ role: 'user', content: 'test' }],
        { model: 'claude-3-haiku-20240307' }
      );

      const metrics = storage.query({ name: 'claude.api.request', limit: 1 });
      const tags = JSON.parse(metrics[0].tags);
      expect(tags.model).toBe('claude-3-haiku-20240307');
    });

    it('should detect Z.ai provider from apiUrl', async () => {
      // Create client with Z.ai URL
      const zaiClient = new ClaudeAPIClient(mockLogger, mockConfigManager as any, {
        apiKey: 'test-key',
        apiUrl: 'https://api.z.ai/v1/chat/completions',
        model: 'claude-3-sonnet-20240229',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'response' }],
          model: 'claude-3-sonnet-20240229',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 }
        })
      });

      await zaiClient.sendMessage([{ role: 'user', content: 'test' }]);

      const metrics = storage.query({ name: 'claude.api.request', limit: 1 });
      const tags = JSON.parse(metrics[0].tags);
      expect(tags.provider).toBe('z.ai');

      zaiClient.destroy();
    });

    it('should provide breakdown by error type', async () => {
      // Trigger multiple error types
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: 'Bad request' } })
      });

      try {
        await client.sendMessage([{ role: 'user', content: 'test' }]);
      } catch (error) {
        // Expected
      }

      const breakdown = storage.getBreakdown('claude.api.error', 'errorType');
      expect(Object.keys(breakdown).length).toBeGreaterThan(0);
    });
  });
});

/**
 * Helper: Create mock streaming response
 */
function createMockStreamResponse(events: any[]) {
  const encoder = new TextEncoder();
  const chunks = events.map(event =>
    encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  );

  let index = 0;
  const mockReader = {
    read: async () => {
      if (index >= chunks.length) {
        return { done: true, value: undefined };
      }
      return { done: false, value: chunks[index++] };
    }
  };

  return {
    ok: true,
    body: {
      getReader: () => mockReader
    }
  };
}
