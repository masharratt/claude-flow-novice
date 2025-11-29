/**
 * SLA Enforcement RBAC Security Tests
 *
 * Tests for RBAC enforcement, authorization checks, and audit logging
 * in the SLA enforcement module.
 *
 * @module sla-enforcement.test
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  SLAEnforcer,
  SLA_PERMISSIONS,
  SLA_ROLE_ACCESS,
  checkSLAPermission,
  enforceSLAAuthorization,
  SLAAuthorizationError,
  slaAuditLogger,
  slaEnforcer,
} from '../../src/lib/sla-enforcement';
import { AuthContext, Role, AuthMethod } from '../../src/lib/auth-types';

describe('SLA RBAC Enforcement', () => {
  let enforcer: SLAEnforcer;
  let adminAuth: AuthContext;
  let operatorAuth: AuthContext;
  let viewerAuth: AuthContext;

  beforeEach(() => {
    enforcer = new SLAEnforcer();
    slaAuditLogger.clearAuditLog();

    adminAuth = {
      id: 'admin-user',
      name: 'Admin User',
      role: Role.ADMIN,
      method: AuthMethod.API_KEY,
      authenticatedAt: new Date(),
    };

    operatorAuth = {
      id: 'operator-user',
      name: 'Operator User',
      role: Role.OPERATOR,
      method: AuthMethod.API_KEY,
      authenticatedAt: new Date(),
    };

    viewerAuth = {
      id: 'viewer-user',
      name: 'Viewer User',
      role: Role.VIEWER,
      method: AuthMethod.API_KEY,
      authenticatedAt: new Date(),
    };
  });

  afterEach(() => {
    enforcer.clearAuthContext();
    slaAuditLogger.clearAuditLog();
  });

  describe('SLA_PERMISSIONS', () => {
    it('should define all SLA permissions', () => {
      expect(SLA_PERMISSIONS).toHaveProperty('READ');
      expect(SLA_PERMISSIONS).toHaveProperty('MODIFY');
      expect(SLA_PERMISSIONS).toHaveProperty('DELETE');
      expect(SLA_PERMISSIONS).toHaveProperty('ADMIN');
      expect(SLA_PERMISSIONS).toHaveProperty('VIEW_METRICS');
    });

    it('should have correct permission strings', () => {
      expect(SLA_PERMISSIONS.READ).toBe('sla:read');
      expect(SLA_PERMISSIONS.MODIFY).toBe('sla:modify');
      expect(SLA_PERMISSIONS.DELETE).toBe('sla:delete');
      expect(SLA_PERMISSIONS.ADMIN).toBe('sla:admin');
      expect(SLA_PERMISSIONS.VIEW_METRICS).toBe('sla:view_metrics');
    });
  });

  describe('SLA_ROLE_ACCESS', () => {
    it('should grant ADMIN all permissions', () => {
      const adminPermissions = SLA_ROLE_ACCESS[Role.ADMIN];
      expect(adminPermissions).toContain('READ');
      expect(adminPermissions).toContain('MODIFY');
      expect(adminPermissions).toContain('DELETE');
      expect(adminPermissions).toContain('ADMIN');
      expect(adminPermissions).toContain('VIEW_METRICS');
    });

    it('should grant OPERATOR read, modify, and view permissions', () => {
      const operatorPermissions = SLA_ROLE_ACCESS[Role.OPERATOR];
      expect(operatorPermissions).toContain('READ');
      expect(operatorPermissions).toContain('MODIFY');
      expect(operatorPermissions).toContain('VIEW_METRICS');
      expect(operatorPermissions).not.toContain('DELETE');
      expect(operatorPermissions).not.toContain('ADMIN');
    });

    it('should grant VIEWER only read and view permissions', () => {
      const viewerPermissions = SLA_ROLE_ACCESS[Role.VIEWER];
      expect(viewerPermissions).toContain('READ');
      expect(viewerPermissions).toContain('VIEW_METRICS');
      expect(viewerPermissions).not.toContain('MODIFY');
      expect(viewerPermissions).not.toContain('DELETE');
      expect(viewerPermissions).not.toContain('ADMIN');
    });
  });

  describe('checkSLAPermission', () => {
    it('should return false for undefined auth context', () => {
      expect(checkSLAPermission(undefined, 'READ')).toBe(false);
    });

    it('should return true for ADMIN with any permission', () => {
      expect(checkSLAPermission(adminAuth, 'READ')).toBe(true);
      expect(checkSLAPermission(adminAuth, 'MODIFY')).toBe(true);
      expect(checkSLAPermission(adminAuth, 'DELETE')).toBe(true);
      expect(checkSLAPermission(adminAuth, 'VIEW_METRICS')).toBe(true);
    });

    it('should return true for OPERATOR with allowed permissions', () => {
      expect(checkSLAPermission(operatorAuth, 'READ')).toBe(true);
      expect(checkSLAPermission(operatorAuth, 'MODIFY')).toBe(true);
      expect(checkSLAPermission(operatorAuth, 'VIEW_METRICS')).toBe(true);
    });

    it('should return false for OPERATOR with restricted permissions', () => {
      expect(checkSLAPermission(operatorAuth, 'DELETE')).toBe(false);
      expect(checkSLAPermission(operatorAuth, 'ADMIN')).toBe(false);
    });

    it('should return true for VIEWER with allowed permissions', () => {
      expect(checkSLAPermission(viewerAuth, 'READ')).toBe(true);
      expect(checkSLAPermission(viewerAuth, 'VIEW_METRICS')).toBe(true);
    });

    it('should return false for VIEWER with restricted permissions', () => {
      expect(checkSLAPermission(viewerAuth, 'MODIFY')).toBe(false);
      expect(checkSLAPermission(viewerAuth, 'DELETE')).toBe(false);
      expect(checkSLAPermission(viewerAuth, 'ADMIN')).toBe(false);
    });
  });

  describe('enforceSLAAuthorization', () => {
    it('should throw for undefined auth context', () => {
      expect(() => {
        enforceSLAAuthorization(undefined, 'READ', 'test-sla');
      }).toThrow(SLAAuthorizationError);
    });

    it('should throw for VIEWER trying to modify SLA', () => {
      expect(() => {
        enforceSLAAuthorization(viewerAuth, 'MODIFY', 'test-sla');
      }).toThrow(SLAAuthorizationError);
    });

    it('should throw for VIEWER trying to delete SLA', () => {
      expect(() => {
        enforceSLAAuthorization(viewerAuth, 'DELETE', 'test-sla');
      }).toThrow(SLAAuthorizationError);
    });

    it('should not throw for ADMIN with any permission', () => {
      expect(() => {
        enforceSLAAuthorization(adminAuth, 'READ', 'test-sla');
        enforceSLAAuthorization(adminAuth, 'MODIFY', 'test-sla');
        enforceSLAAuthorization(adminAuth, 'DELETE', 'test-sla');
      }).not.toThrow();
    });

    it('should not throw for OPERATOR with allowed permissions', () => {
      expect(() => {
        enforceSLAAuthorization(operatorAuth, 'READ', 'test-sla');
        enforceSLAAuthorization(operatorAuth, 'MODIFY', 'test-sla');
      }).not.toThrow();
    });
  });

  describe('SLAAuthorizationError', () => {
    it('should have correct error properties', () => {
      const error = new SLAAuthorizationError('user-123', 'MODIFY', 'sla-key');
      expect(error.userId).toBe('user-123');
      expect(error.operation).toBe('MODIFY');
      expect(error.resource).toBe('sla-key');
    });

    it('should generate default message', () => {
      const error = new SLAAuthorizationError('user-123', 'MODIFY', 'sla-key');
      expect(error.message).toContain('user-123');
      expect(error.message).toContain('MODIFY');
      expect(error.message).toContain('sla-key');
    });

    it('should use custom message if provided', () => {
      const customMsg = 'Custom error message';
      const error = new SLAAuthorizationError('user-123', 'MODIFY', 'sla-key', customMsg);
      expect(error.message).toBe(customMsg);
    });
  });

  describe('SLAEnforcer with RBAC', () => {
    it('should set and get auth context', () => {
      enforcer.setAuthContext(adminAuth);
      expect(enforcer.getAuthContext()).toEqual(adminAuth);
    });

    it('should clear auth context', () => {
      enforcer.setAuthContext(adminAuth);
      enforcer.clearAuthContext();
      expect(enforcer.getAuthContext()).toBeUndefined();
    });

    describe('resetMetrics()', () => {
      it('should allow ADMIN to reset metrics', () => {
        enforcer.setAuthContext(adminAuth);
        expect(() => {
          enforcer.resetMetrics();
        }).not.toThrow();
      });

      it('should allow OPERATOR to reset metrics', () => {
        enforcer.setAuthContext(operatorAuth);
        expect(() => {
          enforcer.resetMetrics();
        }).not.toThrow();
      });

      it('should deny VIEWER resetting metrics', () => {
        enforcer.setAuthContext(viewerAuth);
        expect(() => {
          enforcer.resetMetrics();
        }).toThrow(SLAAuthorizationError);
      });

      it('should deny unauthenticated reset metrics', () => {
        expect(() => {
          enforcer.resetMetrics();
        }).toThrow(SLAAuthorizationError);
      });

      it('should audit successful reset', () => {
        enforcer.setAuthContext(adminAuth);
        enforcer.resetMetrics();

        const auditLog = slaAuditLogger.getUserAuditLog(adminAuth.id);
        expect(auditLog.length).toBeGreaterThan(0);
        expect(auditLog[0].action).toBe('MODIFY');
        expect(auditLog[0].status).toBe('success');
      });
    });

    describe('modifySLADefinition()', () => {
      it('should allow ADMIN to modify SLA', () => {
        enforcer.setAuthContext(adminAuth);
        expect(() => {
          enforcer.modifySLADefinition('phase1_ruvector_init', { targetMs: 6000 });
        }).not.toThrow();
      });

      it('should allow OPERATOR to modify SLA', () => {
        enforcer.setAuthContext(operatorAuth);
        expect(() => {
          enforcer.modifySLADefinition('phase1_ruvector_init', { targetMs: 6000 });
        }).not.toThrow();
      });

      it('should deny VIEWER modifying SLA', () => {
        enforcer.setAuthContext(viewerAuth);
        expect(() => {
          enforcer.modifySLADefinition('phase1_ruvector_init', { targetMs: 6000 });
        }).toThrow(SLAAuthorizationError);
      });

      it('should deny unauthenticated SLA modification', () => {
        expect(() => {
          enforcer.modifySLADefinition('phase1_ruvector_init', { targetMs: 6000 });
        }).toThrow(SLAAuthorizationError);
      });

      it('should audit modification', () => {
        enforcer.setAuthContext(adminAuth);
        enforcer.modifySLADefinition('phase1_ruvector_init', { targetMs: 6000 });

        const auditLog = slaAuditLogger.getResourceAuditLog('phase1_ruvector_init');
        expect(auditLog.length).toBeGreaterThan(0);
        expect(auditLog[0].action).toBe('MODIFY');
        expect(auditLog[0].status).toBe('success');
      });

      it('should throw for unknown SLA', () => {
        enforcer.setAuthContext(adminAuth);
        expect(() => {
          enforcer.modifySLADefinition('unknown-sla', { targetMs: 6000 });
        }).toThrow('Unknown SLA key');
      });
    });

    describe('deleteSLADefinition()', () => {
      it('should deny OPERATOR deleting SLA', () => {
        enforcer.setAuthContext(operatorAuth);
        expect(() => {
          enforcer.deleteSLADefinition('phase1_ruvector_init');
        }).toThrow(SLAAuthorizationError);
      });

      it('should deny VIEWER deleting SLA', () => {
        enforcer.setAuthContext(viewerAuth);
        expect(() => {
          enforcer.deleteSLADefinition('phase1_ruvector_init');
        }).toThrow(SLAAuthorizationError);
      });

      it('should allow ADMIN to delete SLA', () => {
        enforcer.setAuthContext(adminAuth);
        expect(() => {
          enforcer.deleteSLADefinition('phase5_troubleshooting');
        }).not.toThrow();
      });

      it('should audit deletion', () => {
        enforcer.setAuthContext(adminAuth);
        enforcer.deleteSLADefinition('phase4_rag_search');

        const auditLog = slaAuditLogger.getResourceAuditLog('phase4_rag_search');
        expect(auditLog.length).toBeGreaterThan(0);
        expect(auditLog[0].action).toBe('DELETE');
        expect(auditLog[0].status).toBe('success');
      });

      it('should throw for unknown SLA', () => {
        enforcer.setAuthContext(adminAuth);
        expect(() => {
          enforcer.deleteSLADefinition('unknown-sla');
        }).toThrow('Unknown SLA key');
      });
    });

    describe('getMetricsSecure()', () => {
      it('should allow ADMIN to view metrics', () => {
        enforcer.setAuthContext(adminAuth);
        expect(() => {
          enforcer.getMetricsSecure('phase1_ruvector_init');
        }).not.toThrow();
      });

      it('should allow OPERATOR to view metrics', () => {
        enforcer.setAuthContext(operatorAuth);
        expect(() => {
          enforcer.getMetricsSecure('phase1_ruvector_init');
        }).not.toThrow();
      });

      it('should allow VIEWER to view metrics', () => {
        enforcer.setAuthContext(viewerAuth);
        expect(() => {
          enforcer.getMetricsSecure('phase1_ruvector_init');
        }).not.toThrow();
      });

      it('should deny unauthenticated viewing metrics', () => {
        expect(() => {
          enforcer.getMetricsSecure('phase1_ruvector_init');
        }).toThrow(SLAAuthorizationError);
      });

      it('should audit metric access', () => {
        enforcer.setAuthContext(viewerAuth);
        enforcer.getMetricsSecure('phase1_ruvector_init');

        const auditLog = slaAuditLogger.getUserAuditLog(viewerAuth.id);
        expect(auditLog.length).toBeGreaterThan(0);
        expect(auditLog[0].action).toBe('READ');
        expect(auditLog[0].operation).toBe('VIEW_METRICS');
      });
    });

    describe('getAllMetricsSecure()', () => {
      it('should allow all authenticated users to view all metrics', () => {
        enforcer.setAuthContext(adminAuth);
        expect(() => {
          enforcer.getAllMetricsSecure();
        }).not.toThrow();

        enforcer.setAuthContext(operatorAuth);
        expect(() => {
          enforcer.getAllMetricsSecure();
        }).not.toThrow();

        enforcer.setAuthContext(viewerAuth);
        expect(() => {
          enforcer.getAllMetricsSecure();
        }).not.toThrow();
      });

      it('should deny unauthenticated viewing all metrics', () => {
        expect(() => {
          enforcer.getAllMetricsSecure();
        }).toThrow(SLAAuthorizationError);
      });

      it('should return metrics map', () => {
        enforcer.setAuthContext(adminAuth);
        const metrics = enforcer.getAllMetricsSecure();
        expect(metrics).toBeInstanceOf(Map);
        expect(metrics.size).toBeGreaterThan(0);
      });
    });
  });

  describe('SLA Audit Logger', () => {
    it('should log SLA operations', () => {
      slaAuditLogger.logSLAOperation(
        adminAuth.id,
        adminAuth.role,
        'MODIFY',
        'phase1_ruvector_init',
        'MODIFY',
        'success'
      );

      const auditLog = slaAuditLogger.getUserAuditLog(adminAuth.id);
      expect(auditLog.length).toBe(1);
      expect(auditLog[0].userId).toBe(adminAuth.id);
      expect(auditLog[0].action).toBe('MODIFY');
    });

    it('should track denied access attempts', () => {
      slaAuditLogger.logSLAOperation(
        viewerAuth.id,
        viewerAuth.role,
        'MODIFY',
        'phase1_ruvector_init',
        'MODIFY',
        'denied',
        undefined,
        'VIEWER cannot modify SLA'
      );

      const denied = slaAuditLogger.getDeniedAccessAttempts();
      expect(denied.length).toBe(1);
      expect(denied[0].status).toBe('denied');
      expect(denied[0].reason).toContain('cannot');
    });

    it('should get resource audit log', () => {
      slaAuditLogger.logSLAOperation(
        adminAuth.id,
        adminAuth.role,
        'MODIFY',
        'phase1_ruvector_init',
        'MODIFY',
        'success'
      );

      slaAuditLogger.logSLAOperation(
        operatorAuth.id,
        operatorAuth.role,
        'READ',
        'phase1_ruvector_init',
        'READ',
        'success'
      );

      const log = slaAuditLogger.getResourceAuditLog('phase1_ruvector_init');
      expect(log.length).toBe(2);
      expect(log.every((e: any) => e.resourceId === 'phase1_ruvector_init')).toBe(true);
    });

    it('should clear audit log', () => {
      slaAuditLogger.logSLAOperation(
        adminAuth.id,
        adminAuth.role,
        'MODIFY',
        'phase1_ruvector_init',
        'MODIFY',
        'success'
      );

      slaAuditLogger.clearAuditLog();
      expect(slaAuditLogger.getDeniedAccessAttempts()).toHaveLength(0);
    });

    it('should log with changes metadata', () => {
      const changes = { targetMs: 6000, warnMs: 4800 };
      slaAuditLogger.logSLAOperation(
        adminAuth.id,
        adminAuth.role,
        'MODIFY',
        'phase1_ruvector_init',
        'MODIFY',
        'success',
        changes
      );

      const auditLog = slaAuditLogger.getUserAuditLog(adminAuth.id);
      expect(auditLog[0].changes).toEqual(changes);
    });
  });

  describe('Security Integration', () => {
    it('should prevent unauthorized SLA modification attempts', () => {
      enforcer.setAuthContext(viewerAuth);

      expect(() => {
        enforcer.modifySLADefinition('phase1_ruvector_init', { targetMs: 10000 });
      }).toThrow(SLAAuthorizationError);

      // Verify that authorization was properly enforced
      // (No audit log entry from enforcer since authorization check failed before logging)
      // But we can verify the authorization check worked via the thrown error
    });

    it('should create audit trail for all modifications', () => {
      enforcer.setAuthContext(adminAuth);

      // Perform multiple operations
      enforcer.resetMetrics();
      enforcer.modifySLADefinition('phase2_decomposition', { targetMs: 12000 });
      enforcer.getMetricsSecure('phase2_decomposition');

      // Verify audit trail
      const auditLog = slaAuditLogger.getUserAuditLog(adminAuth.id);
      expect(auditLog.length).toBeGreaterThanOrEqual(3);
      expect(auditLog.map((e: any) => e.action)).toContain('MODIFY');
      expect(auditLog.map((e: any) => e.action)).toContain('READ');
    });

    it('should timestamp all audit entries', () => {
      enforcer.setAuthContext(adminAuth);
      const beforeTime = new Date();
      enforcer.resetMetrics();
      const afterTime = new Date();

      const auditLog = slaAuditLogger.getUserAuditLog(adminAuth.id);
      const entry = auditLog[0];

      expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(entry.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });
});
