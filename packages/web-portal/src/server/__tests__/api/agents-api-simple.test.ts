/**
 * Simple validation tests for agents API security fixes
 *
 * Tests:
 * 1. Rate limiting is configured
 * 2. SQL-based filtering logic exists
 * 3. Query parameter validation
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Agents API Security - Code Validation', () => {
  const agentsApiPath = join(__dirname, '../../api/agents.ts');
  const eventStorePath = join(__dirname, '../../services/event-store.ts');

  const agentsApiCode = readFileSync(agentsApiPath, 'utf-8');
  const eventStoreCode = readFileSync(eventStorePath, 'utf-8');

  describe('Rate Limiting Configuration', () => {
    it('should import express-rate-limit', () => {
      expect(agentsApiCode).toContain("import rateLimit from 'express-rate-limit'");
    });

    it('should configure rate limiter with 100 req/15min', () => {
      expect(agentsApiCode).toContain('windowMs: 15 * 60 * 1000');
      expect(agentsApiCode).toContain('max: 100');
    });

    it('should apply rate limiter to /hybrid endpoint', () => {
      expect(agentsApiCode).toContain('agentsRateLimiter');
      expect(agentsApiCode).toMatch(/router\.get\([^)]*'\/hybrid'[^)]*agentsRateLimiter/);
    });

    it('should include rate limit message', () => {
      expect(agentsApiCode).toContain('Too many requests from this IP');
    });
  });

  describe('SQL-Based Filtering', () => {
    it('should use payloadFilters parameter', () => {
      expect(agentsApiCode).toContain('payloadFilters');
    });

    it('should NOT use in-memory filter() method', () => {
      // Check that in-memory filtering is removed
      const inMemoryFilterPattern = /hybridWorkers = hybridWorkers\.filter\(/g;
      const matches = agentsApiCode.match(inMemoryFilterPattern);
      expect(matches).toBeNull(); // No in-memory filtering
    });

    it('should pass filters to queryEvents', () => {
      expect(agentsApiCode).toContain('eventStoreService.queryEvents({');
      expect(agentsApiCode).toContain('payloadFilters: {');
    });

    it('should use SQL pagination', () => {
      expect(agentsApiCode).toContain('limit,');
      expect(agentsApiCode).toContain('offset');
      expect(agentsApiCode).not.toContain('slice(offset, offset + limit)');
    });
  });

  describe('Event Store SQL Filtering', () => {
    it('should support payloadFilters interface', () => {
      expect(eventStoreCode).toContain('payloadFilters?:');
      expect(eventStoreCode).toContain('status?:');
      expect(eventStoreCode).toContain('provider?:');
      expect(eventStoreCode).toContain('confidence_min?:');
      expect(eventStoreCode).toContain('confidence_max?:');
    });

    it('should use json_extract for status filtering', () => {
      expect(eventStoreCode).toContain("json_extract(payload, '$.status')");
    });

    it('should use json_extract for provider filtering', () => {
      expect(eventStoreCode).toContain("json_extract(payload, '$.provider')");
    });

    it('should use json_extract for confidence filtering', () => {
      expect(eventStoreCode).toContain("json_extract(payload, '$.confidence')");
    });

    it('should create JSON indexes for performance', () => {
      expect(eventStoreCode).toContain('idx_payload_status');
      expect(eventStoreCode).toContain('idx_payload_provider');
      expect(eventStoreCode).toContain('idx_payload_confidence');
    });

    it('should use parameterized queries (SQL injection prevention)', () => {
      expect(eventStoreCode).toContain('params.push(');
      expect(eventStoreCode).toContain('conditions.push(');
    });
  });

  describe('Query Parameter Validation', () => {
    it('should use Zod schema validation', () => {
      expect(agentsApiCode).toContain('HybridAgentsQuerySchema');
      expect(agentsApiCode).toContain('safeParse');
    });

    it('should validate status enum', () => {
      expect(agentsApiCode).toContain("z.enum(['active', 'completed', 'failed'])");
    });

    it('should validate provider enum', () => {
      expect(agentsApiCode).toContain("z.enum(['zai', 'anthropic'])");
    });

    it('should validate confidence range', () => {
      expect(agentsApiCode).toContain('confidence_min');
      expect(agentsApiCode).toContain('confidence_max');
      expect(agentsApiCode).toContain('z.coerce.number().min(0).max(1)');
    });

    it('should enforce limit constraints', () => {
      expect(agentsApiCode).toContain('.min(1).max(100)');
    });

    it('should return 400 for invalid parameters', () => {
      expect(agentsApiCode).toContain('return res.status(400)');
      expect(agentsApiCode).toContain('Invalid query parameters');
    });
  });

  describe('Performance Optimizations', () => {
    it('should use indexed queries', () => {
      expect(eventStoreCode).toContain('CREATE INDEX');
      expect(eventStoreCode).toMatch(/idx_events_\w+/);
    });

    it('should use WHERE clause for filtering', () => {
      expect(eventStoreCode).toContain('WHERE');
      expect(eventStoreCode).toContain('conditions.join');
    });

    it('should use LIMIT and OFFSET in SQL', () => {
      expect(eventStoreCode).toContain('LIMIT ? OFFSET ?');
    });

    it('should include cache headers', () => {
      expect(agentsApiCode).toContain('Cache-Control');
      expect(agentsApiCode).toContain('max-age=30');
    });
  });
});
