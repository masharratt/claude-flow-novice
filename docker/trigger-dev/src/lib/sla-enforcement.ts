/**
 * SLA Enforcement Library
 *
 * Defines and enforces SLAs at phase boundaries in the CFN Loop.
 * Tracks compliance metrics and enables graceful degradation on breach.
 *
 * P0.8 Security Fix: RBAC enforcement for SLA modifications
 *
 * Phase 6: Production Hardening (Task 6.1)
 */

import {
  AuthContext,
  Role,
  Operation,
} from './auth-types.js';

/**
 * SLA Permission Model
 * Restricts who can modify, create, and delete SLAs
 */
export const SLA_PERMISSIONS = {
  READ: 'sla:read',
  MODIFY: 'sla:modify',
  DELETE: 'sla:delete',
  ADMIN: 'sla:admin',
  VIEW_METRICS: 'sla:view_metrics',
} as const;

/**
 * Role-based SLA access control
 * Maps roles to allowed operations
 */
export const SLA_ROLE_ACCESS: Record<Role, (keyof typeof SLA_PERMISSIONS)[]> = {
  [Role.ADMIN]: ['READ', 'MODIFY', 'DELETE', 'ADMIN', 'VIEW_METRICS'],
  [Role.OPERATOR]: ['READ', 'MODIFY', 'VIEW_METRICS'],
  [Role.VIEWER]: ['READ', 'VIEW_METRICS'],
};

/**
 * Unauthorized access error
 */
export class SLAAuthorizationError extends Error {
  constructor(
    public userId: string,
    public operation: string,
    public resource: string,
    message?: string
  ) {
    super(
      message ||
      `Unauthorized: User ${userId} lacks permission to ${operation} SLA ${resource}`
    );
    this.name = 'SLAAuthorizationError';
  }
}

/**
 * Check if user has permission for SLA operation
 */
export function checkSLAPermission(
  authContext: AuthContext | undefined,
  permission: keyof typeof SLA_PERMISSIONS
): boolean {
  if (!authContext) {
    return false;
  }

  const allowedOps = SLA_ROLE_ACCESS[authContext.role];
  return allowedOps.includes(permission);
}

/**
 * Enforce RBAC for SLA operations
 * Throws SLAAuthorizationError if not authorized
 */
export function enforceSLAAuthorization(
  authContext: AuthContext | undefined,
  permission: keyof typeof SLA_PERMISSIONS,
  resource: string = 'unknown'
): void {
  if (!authContext) {
    throw new SLAAuthorizationError('unknown', permission, resource, 'Authentication required');
  }

  if (!checkSLAPermission(authContext, permission)) {
    throw new SLAAuthorizationError(
      authContext.id,
      permission,
      resource,
      `User ${authContext.id} (${authContext.role}) cannot ${permission} SLA ${resource}`
    );
  }
}

/**
 * Audit log entry for SLA modifications
 */
export interface SLAAuditEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userRole: Role;
  operation: keyof typeof SLA_PERMISSIONS;
  resourceId: string;
  resourceType: string;
  action: 'CREATE' | 'MODIFY' | 'DELETE' | 'READ' | 'VIEW_METRICS';
  changes?: Record<string, unknown>;
  status: 'success' | 'denied';
  reason?: string;
}

/**
 * SLA Audit Logger
 * Tracks all SLA-related operations for security and compliance
 */
export class SLAAuditLogger {
  private auditLog: SLAAuditEntry[] = [];

  /**
   * Log SLA operation
   */
  logSLAOperation(
    userId: string,
    userRole: Role,
    operation: keyof typeof SLA_PERMISSIONS,
    resourceId: string,
    action: SLAAuditEntry['action'],
    status: 'success' | 'denied',
    changes?: Record<string, unknown>,
    reason?: string
  ): SLAAuditEntry {
    const entry: SLAAuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      userId,
      userRole,
      operation,
      resourceId,
      resourceType: 'SLA_DEFINITION',
      action,
      changes,
      status,
      reason,
    };

    this.auditLog.push(entry);

    // Log unauthorized attempts with warning level
    if (status === 'denied') {
      console.warn(
        `[SECURITY] Unauthorized SLA access: ${action} on ${resourceId} by ${userId} (${userRole}). Reason: ${reason}`
      );
    }

    return entry;
  }

  /**
   * Get audit log entries for a user
   */
  getUserAuditLog(userId: string): SLAAuditEntry[] {
    return this.auditLog.filter(entry => entry.userId === userId);
  }

  /**
   * Get all denied access attempts
   */
  getDeniedAccessAttempts(): SLAAuditEntry[] {
    return this.auditLog.filter(entry => entry.status === 'denied');
  }

  /**
   * Get audit log for a specific resource
   */
  getResourceAuditLog(resourceId: string): SLAAuditEntry[] {
    return this.auditLog.filter(entry => entry.resourceId === resourceId);
  }

  /**
   * Clear audit log (use with caution)
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }
}

/**
 * Global audit logger instance
 */
export const slaAuditLogger = new SLAAuditLogger();

export interface SLADefinition {
  name: string;
  targetMs: number;          // Target completion time
  warnMs: number;            // Warning threshold (typically 80% of target)
  maxRetries: number;        // Max retry attempts on failure
  gracefulDegradation: boolean;  // Continue with warning vs hard fail
}

export interface SLACheckResult {
  compliant: boolean;
  elapsed: number;
  target: number;
  percentOfTarget: number;
  breached: boolean;
  warning: boolean;
}

export interface SLAMetrics {
  totalChecks: number;
  compliant: number;
  warnings: number;
  breaches: number;
  complianceRate: number;
  averageLatency: number;
}

/**
 * SLA Definitions for CFN Loop Phases
 * Based on performance targets from implementation plan
 */
export const SLAs: Record<string, SLADefinition> = {
  phase1_ruvector_init: {
    name: "RuVector Initialization (Phase 1)",
    targetMs: 5000,           // <5s for connection setup
    warnMs: 4000,             // Warn at 80%
    maxRetries: 2,
    gracefulDegradation: false  // Critical path - must succeed
  },

  phase2_decomposition: {
    name: "Decomposition Swarm (Phase 2)",
    targetMs: 10000,          // <10s total (4 decomposers sequential)
    warnMs: 8000,             // Warn at 80%
    maxRetries: 2,
    gracefulDegradation: true   // Can proceed with partial analysis
  },

  phase2_individual_decomposer: {
    name: "Individual Decomposer (Phase 2)",
    targetMs: 2500,           // ~2.5s per decomposer (4 sequential = 10s)
    warnMs: 2000,             // Warn at 80%
    maxRetries: 1,
    gracefulDegradation: true
  },

  phase3_validation: {
    name: "Async Validation Orchestration (Phase 3)",
    targetMs: 30000,          // <30s total (5 validators parallel)
    warnMs: 24000,            // Warn at 80%
    maxRetries: 1,
    gracefulDegradation: true   // Can proceed with partial validation
  },

  phase3_individual_validator: {
    name: "Individual Validator (Phase 3)",
    targetMs: 30000,          // Max 30s (parallel execution)
    warnMs: 24000,            // Warn at 80%
    maxRetries: 1,
    gracefulDegradation: true
  },

  phase4_ruvector_capture: {
    name: "RuVector Learning Capture (Phase 4)",
    targetMs: 3000,           // <3s for embeddings + storage
    warnMs: 2400,             // Warn at 80%
    maxRetries: 2,
    gracefulDegradation: true   // Learning is optional
  },

  phase4_rag_search: {
    name: "RuVector RAG Search (Phase 4)",
    targetMs: 2000,           // <2s for similarity search
    warnMs: 1600,             // Warn at 80%
    maxRetries: 1,
    gracefulDegradation: true   // Can proceed without similar cases
  },

  phase5_troubleshooting: {
    name: "Troubleshooting Analysis (Phase 5)",
    targetMs: 5000,           // <5s per analysis
    warnMs: 4000,             // Warn at 80%
    maxRetries: 1,
    gracefulDegradation: true   // Can proceed without troubleshooting
  },

  total_loop: {
    name: "Total CFN Loop",
    targetMs: 150000,         // <150s typical (target: <3 min)
    warnMs: 120000,           // Warn at 80%
    maxRetries: 0,
    gracefulDegradation: false  // Don't retry entire loop
  }
};

/**
 * SLA Enforcement Class
 * Tracks metrics and performs compliance checks with RBAC enforcement
 */
export class SLAEnforcer {
  private metrics: Map<string, SLAMetrics> = new Map();
  private latencies: Map<string, number[]> = new Map();
  private currentAuth: AuthContext | undefined;

  constructor() {
    // Initialize metrics for all SLAs
    Object.keys(SLAs).forEach(key => {
      this.metrics.set(key, {
        totalChecks: 0,
        compliant: 0,
        warnings: 0,
        breaches: 0,
        complianceRate: 0,
        averageLatency: 0
      });
      this.latencies.set(key, []);
    });
  }

  /**
   * Set authentication context for subsequent operations
   * Required before calling modification methods
   */
  setAuthContext(authContext: AuthContext): void {
    this.currentAuth = authContext;
  }

  /**
   * Get current authentication context
   */
  getAuthContext(): AuthContext | undefined {
    return this.currentAuth;
  }

  /**
   * Clear authentication context
   */
  clearAuthContext(): void {
    this.currentAuth = undefined;
  }

  /**
   * Check SLA compliance for a phase
   *
   * @param slaKey - SLA definition key
   * @param elapsedMs - Actual elapsed time in milliseconds
   * @returns SLA check result with compliance status
   */
  checkCompliance(slaKey: string, elapsedMs: number): SLACheckResult {
    const sla = SLAs[slaKey];
    if (!sla) {
      throw new Error(`Unknown SLA key: ${slaKey}`);
    }

    const percentOfTarget = (elapsedMs / sla.targetMs) * 100;
    const warning = elapsedMs >= sla.warnMs && elapsedMs < sla.targetMs;
    const breached = elapsedMs >= sla.targetMs;
    const compliant = !breached;

    // Update metrics
    const metrics = this.metrics.get(slaKey)!;
    metrics.totalChecks++;
    if (compliant) metrics.compliant++;
    if (warning) metrics.warnings++;
    if (breached) metrics.breaches++;
    metrics.complianceRate = (metrics.compliant / metrics.totalChecks) * 100;

    // Track latency
    const latencies = this.latencies.get(slaKey)!;
    latencies.push(elapsedMs);
    metrics.averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    return {
      compliant,
      elapsed: elapsedMs,
      target: sla.targetMs,
      percentOfTarget,
      breached,
      warning
    };
  }

  /**
   * Get metrics for a specific SLA
   */
  getMetrics(slaKey: string): SLAMetrics | undefined {
    return this.metrics.get(slaKey);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Map<string, SLAMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Get SLA definition
   */
  getSLA(slaKey: string): SLADefinition | undefined {
    return SLAs[slaKey];
  }

  /**
   * Reset metrics with authorization check
   * Only ADMIN and OPERATOR roles can reset metrics
   */
  resetMetrics(): void {
    // Check authorization before resetting
    enforceSLAAuthorization(this.currentAuth, 'MODIFY', 'metrics_reset');

    // Log the operation
    if (this.currentAuth) {
      slaAuditLogger.logSLAOperation(
        this.currentAuth.id,
        this.currentAuth.role,
        'MODIFY',
        'metrics_reset',
        'MODIFY',
        'success',
        { action: 'reset_metrics' }
      );
    }

    this.metrics.forEach(m => {
      m.totalChecks = 0;
      m.compliant = 0;
      m.warnings = 0;
      m.breaches = 0;
      m.complianceRate = 0;
      m.averageLatency = 0;
    });
    this.latencies.forEach(l => l.length = 0);
  }

  /**
   * Modify SLA definition with authorization check
   * Only ADMIN role can modify SLAs
   */
  modifySLADefinition(
    slaKey: string,
    updates: Partial<SLADefinition>
  ): void {
    // Check authorization before modifying
    enforceSLAAuthorization(this.currentAuth, 'MODIFY', slaKey);

    const currentSLA = SLAs[slaKey];
    if (!currentSLA) {
      throw new Error(`Unknown SLA key: ${slaKey}`);
    }

    // Log the operation
    if (this.currentAuth) {
      slaAuditLogger.logSLAOperation(
        this.currentAuth.id,
        this.currentAuth.role,
        'MODIFY',
        slaKey,
        'MODIFY',
        'success',
        {
          original: currentSLA,
          updates,
        }
      );
    }

    // Apply updates
    Object.assign(currentSLA, updates);
  }

  /**
   * Delete SLA definition with authorization check
   * Only ADMIN role can delete SLAs
   */
  deleteSLADefinition(slaKey: string): void {
    // Check authorization before deleting
    enforceSLAAuthorization(this.currentAuth, 'DELETE', slaKey);

    if (!SLAs[slaKey]) {
      throw new Error(`Unknown SLA key: ${slaKey}`);
    }

    // Log the operation
    if (this.currentAuth) {
      slaAuditLogger.logSLAOperation(
        this.currentAuth.id,
        this.currentAuth.role,
        'DELETE',
        slaKey,
        'DELETE',
        'success',
        { deleted_sla: slaKey }
      );
    }

    // Delete SLA
    delete SLAs[slaKey];
  }

  /**
   * View metrics with authorization check
   * All authenticated users can view metrics
   */
  getMetricsSecure(slaKey: string): SLAMetrics | undefined {
    // Check authorization before accessing metrics
    enforceSLAAuthorization(this.currentAuth, 'VIEW_METRICS', slaKey);

    // Log read access
    if (this.currentAuth) {
      slaAuditLogger.logSLAOperation(
        this.currentAuth.id,
        this.currentAuth.role,
        'VIEW_METRICS',
        slaKey,
        'READ',
        'success'
      );
    }

    return this.metrics.get(slaKey);
  }

  /**
   * Get all metrics with authorization check
   */
  getAllMetricsSecure(): Map<string, SLAMetrics> {
    // Check authorization before accessing metrics
    enforceSLAAuthorization(this.currentAuth, 'VIEW_METRICS', 'all_metrics');

    // Log read access
    if (this.currentAuth) {
      slaAuditLogger.logSLAOperation(
        this.currentAuth.id,
        this.currentAuth.role,
        'VIEW_METRICS',
        'all_metrics',
        'READ',
        'success'
      );
    }

    return new Map(this.metrics);
  }

  /**
   * Format SLA check result for logging
   */
  formatCheckResult(slaKey: string, result: SLACheckResult): string {
    const sla = SLAs[slaKey];
    const status = result.compliant ? "✓ COMPLIANT" : "✗ BREACHED";
    const icon = result.breached ? "⚠️" : result.warning ? "⏱️" : "✅";

    return `${icon} ${sla.name}: ${result.elapsed}ms / ${result.target}ms (${result.percentOfTarget.toFixed(1)}%) - ${status}`;
  }

  /**
   * Get compliance summary for reporting
   */
  getComplianceSummary(): {
    overall: number;
    byPhase: Record<string, number>;
    totalChecks: number;
    totalBreaches: number;
  } {
    let totalChecks = 0;
    let totalCompliant = 0;
    let totalBreaches = 0;
    const byPhase: Record<string, number> = {};

    this.metrics.forEach((metrics, key) => {
      totalChecks += metrics.totalChecks;
      totalCompliant += metrics.compliant;
      totalBreaches += metrics.breaches;
      byPhase[key] = metrics.complianceRate;
    });

    return {
      overall: totalChecks > 0 ? (totalCompliant / totalChecks) * 100 : 100,
      byPhase,
      totalChecks,
      totalBreaches
    };
  }
}

/**
 * Global SLA enforcer instance
 * Shared across all CFN Loop executions
 */
export const slaEnforcer = new SLAEnforcer();

/**
 * Utility: Measure execution time and check SLA
 *
 * Usage:
 * const result = await measureSLA("phase2_decomposition", async () => {
 *   return await decomposer.run();
 * });
 */
export async function measureSLA<T>(
  slaKey: string,
  fn: () => Promise<T>
): Promise<{ result: T; slaCheck: SLACheckResult }> {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;
  const slaCheck = slaEnforcer.checkCompliance(slaKey, elapsed);

  return { result, slaCheck };
}

/**
 * Utility: Time a function without SLA enforcement
 * (for phases not yet covered by SLAs)
 */
export async function timePhase<T>(
  phaseName: string,
  fn: () => Promise<T>
): Promise<{ result: T; elapsed: number }> {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;

  return { result, elapsed };
}
