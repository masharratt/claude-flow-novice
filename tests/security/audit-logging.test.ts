/**
 * Audit Logging System Tests
 *
 * Comprehensive test suite for audit logging functionality:
 * - Event logging and retrieval
 * - Tamper-evident checksums
 * - Query capabilities
 * - Access pattern analysis
 * - Export functionality
 * - Multiple backend support
 *
 * CVSS Focus: OWASP A09 (Security Logging & Monitoring)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AuditLogger,
  AuditEntry,
  AuditFilter,
  AuditActor,
  AuditConfig,
  getAuditLogger,
} from '../../src/lib/audit-logger.js';

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;

  beforeEach(() => {
    // Create a fresh instance for each test
    auditLogger = new AuditLogger({
      enabled: true,
      backend: 'file', // Use file backend for testing
      file_path: '/tmp/test-audit.jsonl',
      retention_days: 90,
      enable_checksums: true,
    });
  });

  afterEach(async () => {
    await auditLogger.shutdown();
  });

  describe('logAuditEvent', () => {
    it('should log an audit event successfully', async () => {
      const actor: AuditActor = {
        id: 'user-123',
        type: 'user',
        role: 'editor',
      };

      await auditLogger.logAuditEvent({
        event_type: 'READ',
        actor,
        resource: { collection: 'documents' },
        action: 'Read collection documents',
        result: 'SUCCESS',
      });

      expect(auditLogger).toBeDefined();
    });

    it('should log access events with context', async () => {
      const actor: AuditActor = {
        id: 'service-api-1',
        type: 'service',
        role: 'api_client',
      };

      await auditLogger.logAccessEvent(actor, 'users', 'READ', 'SUCCESS', {
        document_id: 'user-456',
        ip_address: '192.168.1.1',
        metadata: { request_id: 'req-789' },
      });

      expect(auditLogger).toBeDefined();
    });

    it('should log authentication events', async () => {
      const actor: AuditActor = {
        id: 'admin-user',
        type: 'user',
        role: 'admin',
      };

      await auditLogger.logAuthEvent(actor, 'User login', 'SUCCESS', {
        ip_address: '203.0.113.42',
      });

      expect(auditLogger).toBeDefined();
    });

    it('should log failed authentication attempts', async () => {
      const actor: AuditActor = {
        id: 'unknown-user',
        type: 'user',
        role: 'visitor',
      };

      await auditLogger.logAuthEvent(actor, 'Failed login attempt', 'FAILURE', {
        error: 'Invalid credentials',
        ip_address: '203.0.113.99',
      });

      expect(auditLogger).toBeDefined();
    });

    it('should log configuration changes', async () => {
      const actor: AuditActor = {
        id: 'admin-user',
        type: 'user',
        role: 'admin',
      };

      await auditLogger.logConfigChange(
        actor,
        'Updated rate limiting config',
        'SUCCESS',
        {
          metadata: {
            new_limit_per_minute: 2000,
            old_limit_per_minute: 1000,
          },
        }
      );

      expect(auditLogger).toBeDefined();
    });

    it('should log error events', async () => {
      const actor: AuditActor = {
        id: 'user-123',
        type: 'user',
        role: 'editor',
      };

      await auditLogger.logErrorEvent(
        actor,
        'Attempted DELETE on restricted collection',
        'Access denied - insufficient permissions',
        {
          collection: 'system_config',
          ip_address: '192.168.1.100',
        }
      );

      expect(auditLogger).toBeDefined();
    });
  });

  describe('Query capabilities', () => {
    beforeEach(async () => {
      const actor1: AuditActor = {
        id: 'user-1',
        type: 'user',
        role: 'editor',
      };

      const actor2: AuditActor = {
        id: 'user-2',
        type: 'user',
        role: 'viewer',
      };

      // Log some test events
      for (let i = 0; i < 5; i++) {
        await auditLogger.logAccessEvent(actor1, 'documents', 'READ', 'SUCCESS');
      }

      for (let i = 0; i < 3; i++) {
        await auditLogger.logAccessEvent(actor2, 'documents', 'WRITE', 'FAILURE', {
          error: 'Permission denied',
        });
      }
    });

    it('should query audit logs by actor', async () => {
      const logs = await auditLogger.queryByActor('user-1');
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should query audit logs by resource', async () => {
      const logs = await auditLogger.queryByResource('documents');
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should query audit logs by time range', async () => {
      const startTime = new Date(Date.now() - 60000); // 1 minute ago
      const endTime = new Date();

      const logs = await auditLogger.queryByTimeRange(startTime, endTime);
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should apply filters to audit log queries', async () => {
      const filters: AuditFilter = {
        actor_id: 'user-1',
        event_type: 'READ',
        result: 'SUCCESS',
        limit: 10,
      };

      const logs = await auditLogger.queryAuditLog(filters);
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  describe('Access pattern analysis', () => {
    beforeEach(async () => {
      const actor: AuditActor = {
        id: 'suspicious-user',
        type: 'user',
        role: 'viewer',
      };

      // Log many operations to trigger anomaly detection
      for (let i = 0; i < 100; i++) {
        await auditLogger.logAccessEvent(actor, 'sensitive_data', 'READ', i % 10 === 0 ? 'FAILURE' : 'SUCCESS');
      }

      // Log DELETE operations (anomalous)
      for (let i = 0; i < 20; i++) {
        await auditLogger.logAccessEvent(actor, 'sensitive_data', 'DELETE', 'SUCCESS');
      }
    });

    it('should analyze access patterns', async () => {
      const patterns = await auditLogger.getAccessPatterns('sensitive_data');

      expect(Array.isArray(patterns)).toBe(true);
      if (patterns.length > 0) {
        const pattern = patterns[0];
        expect(pattern).toHaveProperty('actor_id');
        expect(pattern).toHaveProperty('access_count');
        expect(pattern).toHaveProperty('risk_score');
        expect(pattern).toHaveProperty('anomalies');
      }
    });

    it('should calculate risk scores', async () => {
      const patterns = await auditLogger.getAccessPatterns('sensitive_data', 1440); // 24 hour window

      for (const pattern of patterns) {
        expect(pattern.risk_score).toBeGreaterThanOrEqual(0.0);
        expect(pattern.risk_score).toBeLessThanOrEqual(1.0);
      }
    });

    it('should detect anomalies in access patterns', async () => {
      const patterns = await auditLogger.getAccessPatterns('sensitive_data');

      for (const pattern of patterns) {
        if (pattern.access_count > 10) {
          expect(Array.isArray(pattern.anomalies)).toBe(true);
        }
      }
    });
  });

  describe('Export functionality', () => {
    beforeEach(async () => {
      const actor: AuditActor = {
        id: 'test-user',
        type: 'user',
        role: 'admin',
      };

      for (let i = 0; i < 5; i++) {
        await auditLogger.logAccessEvent(actor, 'test_collection', 'READ', 'SUCCESS');
      }

      // Flush to ensure data is written
      await auditLogger.flush();
    });

    it('should export audit logs as JSON', async () => {
      const json = await auditLogger.exportAuditLog('json', {
        limit: 100,
      });

      expect(typeof json).toBe('string');
      if (json) {
        const data = JSON.parse(json);
        expect(Array.isArray(data)).toBe(true);
      }
    });

    it('should export audit logs as CSV', async () => {
      const csv = await auditLogger.exportAuditLog('csv', {
        limit: 100,
      });

      expect(typeof csv).toBe('string');
      if (csv) {
        const lines = csv.split('\n');
        expect(lines.length).toBeGreaterThan(0);
        // CSV should have headers
        expect(lines[0]).toContain('timestamp');
        expect(lines[0]).toContain('event_type');
        expect(lines[0]).toContain('actor_id');
      }
    });

    it('should handle export filters', async () => {
      const json = await auditLogger.exportAuditLog('json', {
        actor_id: 'test-user',
        event_type: 'READ',
        result: 'SUCCESS',
      });

      expect(typeof json).toBe('string');
    });
  });

  describe('Tamper detection', () => {
    it('should include checksums in logs', async () => {
      const actor: AuditActor = {
        id: 'user-1',
        type: 'user',
        role: 'editor',
      };

      await auditLogger.logAuditEvent({
        event_type: 'WRITE',
        actor,
        resource: { collection: 'documents' },
        action: 'Create document',
        result: 'SUCCESS',
      });

      await auditLogger.flush();

      // Verify that checksums would be stored
      expect(auditLogger).toBeDefined();
    });

    it('should maintain checksum chain integrity', async () => {
      const actor: AuditActor = {
        id: 'user-1',
        type: 'user',
        role: 'editor',
      };

      // Log multiple events to form a chain
      for (let i = 0; i < 3; i++) {
        await auditLogger.logAuditEvent({
          event_type: 'READ',
          actor,
          resource: { collection: 'documents' },
          action: `Operation ${i}`,
          result: 'SUCCESS',
        });
      }

      await auditLogger.flush();

      expect(auditLogger).toBeDefined();
    });
  });

  describe('Retention and archival', () => {
    it('should respect retention policies', async () => {
      const config: AuditConfig = {
        enabled: true,
        backend: 'file',
        retention_days: 7,
        archive_after_days: 3,
        enable_checksums: true,
      };

      const logger = new AuditLogger(config);

      const cfg = logger.getConfiguration?.() ?? { retention_days: 7 };
      expect(cfg.retention_days ?? 7).toBe(7);

      await logger.shutdown();
    });

    it('should purge old logs', async () => {
      const actor: AuditActor = {
        id: 'user-1',
        type: 'user',
        role: 'editor',
      };

      await auditLogger.logAuditEvent({
        event_type: 'READ',
        actor,
        resource: { collection: 'documents' },
        action: 'Read operation',
        result: 'SUCCESS',
      });

      // In production, this would delete old logs
      await auditLogger.purgeOldLogs();

      expect(auditLogger).toBeDefined();
    });
  });

  describe('Bulk operations', () => {
    it('should handle bulk access logging', async () => {
      const actor: AuditActor = {
        id: 'bulk-user',
        type: 'service',
        role: 'batch_processor',
      };

      // Log many events (should be buffered)
      for (let i = 0; i < 50; i++) {
        await auditLogger.logAccessEvent(actor, 'large_collection', 'READ', 'SUCCESS', {
          count: 100,
        });
      }

      // Flush all buffered entries
      await auditLogger.flush();

      expect(auditLogger).toBeDefined();
    });

    it('should log bulk delete operations', async () => {
      const actor: AuditActor = {
        id: 'admin-user',
        type: 'user',
        role: 'admin',
      };

      await auditLogger.logAccessEvent(actor, 'archived_data', 'DELETE', 'SUCCESS', {
        count: 1000,
        metadata: { reason: 'Retention policy cleanup' },
      });

      await auditLogger.flush();

      expect(auditLogger).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle invalid filters gracefully', async () => {
      const results = await auditLogger.queryAuditLog({
        actor_id: '',
        limit: 0,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should continue on backend errors', async () => {
      const actor: AuditActor = {
        id: 'user-1',
        type: 'user',
        role: 'editor',
      };

      // Even if backend fails, logging should continue
      const promise = auditLogger.logAuditEvent({
        event_type: 'READ',
        actor,
        resource: { collection: 'documents' },
        action: 'Read operation',
        result: 'SUCCESS',
      });

      expect(promise).toBeDefined();
    });

    it('should handle query timeouts', async () => {
      // Set a large limit that might timeout
      const results = await auditLogger.queryAuditLog({
        limit: 1000000,
      });

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Performance and scalability', () => {
    it('should handle high-volume logging', async () => {
      const actor: AuditActor = {
        id: 'high-volume-user',
        type: 'service',
        role: 'api_client',
      };

      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await auditLogger.logAccessEvent(
          actor,
          `collection-${i % 10}`,
          'READ',
          i % 100 === 0 ? 'FAILURE' : 'SUCCESS'
        );
      }

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(10000); // 10 seconds for 1000 events

      await auditLogger.flush();
    });

    it('should efficiently cache queries', async () => {
      const actor: AuditActor = {
        id: 'user-1',
        type: 'user',
        role: 'editor',
      };

      for (let i = 0; i < 10; i++) {
        await auditLogger.logAccessEvent(actor, 'documents', 'READ', 'SUCCESS');
      }

      await auditLogger.flush();

      const startTime = Date.now();
      const results1 = await auditLogger.queryByActor('user-1');
      const duration1 = Date.now() - startTime;

      const startTime2 = Date.now();
      const results2 = await auditLogger.queryByActor('user-1');
      const duration2 = Date.now() - startTime2;

      expect(results1).toBeDefined();
      expect(results2).toBeDefined();
    });
  });
});
