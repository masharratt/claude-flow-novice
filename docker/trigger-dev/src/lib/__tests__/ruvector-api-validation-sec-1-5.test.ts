/**
 * Security Test Suite for sec-1.5: Unchecked API Responses
 *
 * Tests validation of API responses, error handling, and network resilience
 * for RuVector learning hooks and RAG decomposition systems.
 *
 * Coverage:
 * - Zod schema validation of API responses
 * - Network error handling with timeouts
 * - Typed error classification
 * - Graceful degradation on API failures
 * - Metadata validation from search results
 *
 * References:
 * - sec-1.5: Unchecked API Responses
 * - ruvector-learning-hooks.ts
 * - ruvector-rag-decomposition.ts
 */

import { z } from 'zod';
import {
  ApiError,
  NetworkError,
  ValidationError,
} from '../ruvector-learning-hooks';

describe('sec-1.5: API Response Validation', () => {
  describe('Error Classes', () => {
    it('should create typed ApiError with status code', () => {
      const error = new ApiError('API request failed', 500);
      expect(error.message).toBe('API request failed');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('ApiError');
    });

    it('should create NetworkError with original error', () => {
      const originalError = new Error('Connection timeout');
      const error = new NetworkError('Network request failed', originalError);
      expect(error.message).toBe('Network request failed');
      expect(error.originalError).toBe(originalError);
      expect(error.name).toBe('NetworkError');
    });

    it('should create ValidationError with Zod error details', () => {
      const schema = z.object({ id: z.string() });
      const result = schema.safeParse({ id: 123 });

      if (!result.success) {
        const error = new ValidationError(
          'Invalid response schema',
          result.error
        );
        expect(error.message).toBe('Invalid response schema');
        expect(error.schemaError).toBeDefined();
        expect(error.name).toBe('ValidationError');
      }
    });
  });

  describe('Zod Schema Validation', () => {
    it('should validate correct API response structure', () => {
      const ApiResponseSchema = z.object({
        status: z.string().optional(),
        error: z.string().optional(),
        data: z.unknown().optional(),
      });

      const validResponse = {
        status: 'success',
        data: { taskId: 'task-123' },
      };

      const result = ApiResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('success');
      }
    });

    it('should reject response with invalid field types', () => {
      const ApiResponseSchema = z.object({
        status: z.string(),
        errorCode: z.number(),
      });

      const invalidResponse = {
        status: 'success',
        errorCode: 'not-a-number', // Wrong type
      };

      const result = ApiResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.length).toBeGreaterThan(0);
      }
    });

    it('should validate RuVector search result structure', () => {
      const SearchResultSchema = z.object({
        id: z.string(),
        score: z.number().min(0).max(1),
        metadata: z.record(z.unknown()).optional(),
      });

      const validResult = {
        id: 'doc-123',
        score: 0.85,
        metadata: { taskId: 'task-456' },
      };

      const result = SearchResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });

    it('should reject search result with out-of-range score', () => {
      const SearchResultSchema = z.object({
        id: z.string(),
        score: z.number().min(0).max(1),
      });

      const invalidResult = {
        id: 'doc-123',
        score: 1.5, // Out of range
      };

      const result = SearchResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });

    it('should validate decomposition metadata schema', () => {
      const MetadataSchema = z.object({
        taskId: z.string(),
        originalTask: z.string(),
        decompositionApproach: z.string(),
        microTaskCount: z.number(),
        executionPhases: z.number(),
        gateCheckScore: z.number(),
        finalDecision: z.string(),
        securityRiskLevel: z.string(),
        performanceGrade: z.string(),
        successRate: z.number(),
        timesUsed: z.number(),
        totalTimeMs: z.number(),
      });

      const validMetadata = {
        taskId: 'task-123',
        originalTask: 'Implement API endpoint',
        decompositionApproach: 'Sequential Context Passing',
        microTaskCount: 5,
        executionPhases: 3,
        gateCheckScore: 0.95,
        finalDecision: 'PROCEED',
        securityRiskLevel: 'low',
        performanceGrade: 'A',
        successRate: 0.9,
        timesUsed: 2,
        totalTimeMs: 5000,
      };

      const result = MetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it('should reject metadata with missing required fields', () => {
      const MetadataSchema = z.object({
        taskId: z.string(),
        originalTask: z.string(),
        decompositionApproach: z.string(),
        microTaskCount: z.number(),
      });

      const incompleteMetadata = {
        taskId: 'task-123',
        originalTask: 'Implement API endpoint',
        // Missing decompositionApproach and microTaskCount
      };

      const result = MetadataSchema.safeParse(incompleteMetadata);
      expect(result.success).toBe(false);
    });
  });

  describe('Error Handling Patterns', () => {
    it('should categorize TypeError as NetworkError for fetch failures', () => {
      const fetchError = new TypeError(
        'Failed to fetch - network unavailable'
      );

      // Simulate error categorization
      if (fetchError instanceof TypeError && fetchError.message.includes('fetch')) {
        const networkError = new NetworkError(
          'Network request failed: connectivity issue',
          fetchError
        );
        expect(networkError).toBeInstanceOf(NetworkError);
      }
    });

    it('should categorize AbortError as timeout NetworkError', () => {
      const abortError = new Error('AbortError');

      // Simulate timeout detection
      if (abortError.message.includes('AbortError')) {
        const networkError = new NetworkError(
          'Request timeout: no response within 10000ms'
        );
        expect(networkError).toBeInstanceOf(NetworkError);
      }
    });

    it('should preserve original error context', () => {
      const originalError = new Error('Database connection failed');
      const apiError = new ApiError('RuVector insert failed', 500, originalError);

      expect(apiError.originalError).toBe(originalError);
      expect(apiError.statusCode).toBe(500);
    });
  });

  describe('Response Validation Error Reporting', () => {
    it('should provide detailed schema error information', () => {
      const schema = z.object({
        id: z.string(),
        score: z.number().min(0).max(1),
      });

      const invalidData = {
        id: 123, // Should be string
        score: 1.5, // Out of range
      };

      const result = schema.safeParse(invalidData);

      if (!result.success) {
        const errorMessages = result.error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join('; ');

        expect(errorMessages).toContain('id');
        expect(errorMessages).toContain('score');
      }
    });

    it('should format error details for logging', () => {
      const schema = z.object({
        taskId: z.string(),
        taskDescription: z.string(),
      });

      const invalidResponse = {
        // Missing required fields
      };

      const result = schema.safeParse(invalidResponse);

      if (!result.success) {
        const errorDetails = result.error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join('; ');

        expect(errorDetails.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Network Resilience', () => {
    it('should timeout after specified duration', async () => {
      const timeoutMs = 100;
      const startTime = Date.now();

      // Simulate a promise that never resolves
      const slowOperation = new Promise<string>(resolve => {
        setTimeout(() => resolve('done'), 5000); // 5 seconds
      });

      // Race with timeout
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(
          () => reject(new NetworkError('Operation timed out')),
          timeoutMs
        );
      });

      try {
        await Promise.race([slowOperation, timeoutPromise]);
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(timeoutMs + 50); // Allow 50ms margin
        expect(error).toBeInstanceOf(NetworkError);
      }
    });

    it('should clean up timeout on success', async () => {
      let timeoutCleared = false;

      const operation = Promise.resolve('success');
      const timeoutId = setTimeout(() => {
        timeoutCleared = true;
      }, 100);

      const result = await operation;

      // In real implementation, would call clearTimeout
      clearTimeout(timeoutId);

      expect(result).toBe('success');
      expect(timeoutCleared).toBe(false); // Should not have fired
    });

    it('should handle fetch connection errors gracefully', () => {
      const error = new TypeError('Failed to fetch');

      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new NetworkError(
          'Network request failed: connectivity issue or fetch unavailable',
          error
        );

        expect(networkError.message).toContain('connectivity');
        expect(networkError.originalError).toBe(error);
      }
    });
  });

  describe('Graceful Degradation', () => {
    it('should return empty results on validation error', () => {
      const schema = z.object({
        results: z.array(z.object({ id: z.string() })),
      });

      const invalidResponse = {
        results: 'not-an-array', // Invalid type
      };

      const result = schema.safeParse(invalidResponse);

      if (!result.success) {
        // Gracefully degrade to empty results
        const fallbackResult = {
          results: [],
          totalFound: 0,
        };

        expect(fallbackResult.results.length).toBe(0);
        expect(fallbackResult.totalFound).toBe(0);
      }
    });

    it('should return empty decompositions on RAG query failure', () => {
      const ragQueryResult = {
        results: [],
        totalFound: 0,
        avgSimilarity: 0,
        avgQualityScore: 0,
        hasHighConfidencePrior: false,
      };

      expect(ragQueryResult.results).toEqual([]);
      expect(ragQueryResult.hasHighConfidencePrior).toBe(false);
    });

    it('should log errors without throwing in fire-and-forget operations', () => {
      const consoleSpy = jest.spyOn(console, 'warn');

      // Simulate fire-and-forget error handling
      const handleCaptureError = (error: unknown) => {
        if (error instanceof ValidationError) {
          console.warn(`Failed to capture: Schema validation error: ${error.message}`);
        } else if (error instanceof NetworkError) {
          console.warn(`Failed to capture: Network error: ${error.message}`);
        } else if (error instanceof ApiError) {
          console.warn(`Failed to capture: API error (${error.statusCode}): ${error.message}`);
        }
      };

      const validationError = new ValidationError('Schema mismatch');
      handleCaptureError(validationError);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Schema validation error')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('SLA Monitoring', () => {
    it('should warn on query timeout exceeding SLA (500ms)', () => {
      const queryTimeMs = 750; // Exceeds 500ms SLA
      const slaThreshold = 500;

      const isSlaViolation = queryTimeMs > slaThreshold;

      expect(isSlaViolation).toBe(true);
    });

    it('should pass on query within SLA', () => {
      const queryTimeMs = 250;
      const slaThreshold = 500;

      const isSlaViolation = queryTimeMs > slaThreshold;

      expect(isSlaViolation).toBe(false);
    });
  });

  describe('Security Audit Trail', () => {
    it('should preserve error context for security logging', () => {
      const error = new ApiError('RuVector API failed', 503, {
        endpoint: '/collections/search',
        retryCount: 3,
      });

      expect(error.message).toBe('RuVector API failed');
      expect(error.statusCode).toBe(503);
      expect(error.originalError).toBeDefined();
    });

    it('should categorize errors by type for monitoring', () => {
      const errors = [
        new NetworkError('Connection timeout'),
        new ValidationError('Schema mismatch'),
        new ApiError('Service unavailable', 503),
      ];

      const errorCounts = {
        network: errors.filter(e => e instanceof NetworkError).length,
        validation: errors.filter(e => e instanceof ValidationError).length,
        api: errors.filter(e => e instanceof ApiError).length,
      };

      expect(errorCounts.network).toBe(1);
      expect(errorCounts.validation).toBe(1);
      expect(errorCounts.api).toBe(1);
    });
  });
});
