/**
 * SLA Enforcement Tests
 *
 * Phase 6: Production Hardening (Task 6.1)
 */

import {
  SLAs,
  SLAEnforcer,
  measureSLA,
  timePhase
} from "../../src/lib/sla-enforcement";

describe("SLA Enforcement", () => {
  let enforcer: SLAEnforcer;

  beforeEach(() => {
    enforcer = new SLAEnforcer();
  });

  describe("SLA Definitions", () => {
    test("all SLAs are defined", () => {
      expect(SLAs.phase1_ruvector_init).toBeDefined();
      expect(SLAs.phase2_decomposition).toBeDefined();
      expect(SLAs.phase3_validation).toBeDefined();
      expect(SLAs.phase4_ruvector_capture).toBeDefined();
      expect(SLAs.phase5_troubleshooting).toBeDefined();
      expect(SLAs.total_loop).toBeDefined();
    });

    test("phase 2 decomposition target is 10s", () => {
      expect(SLAs.phase2_decomposition.targetMs).toBe(10000);
      expect(SLAs.phase2_decomposition.warnMs).toBe(8000);
    });

    test("phase 3 validation target is 30s", () => {
      expect(SLAs.phase3_validation.targetMs).toBe(30000);
      expect(SLAs.phase3_validation.warnMs).toBe(24000);
    });

    test("total loop target is 150s", () => {
      expect(SLAs.total_loop.targetMs).toBe(150000);
      expect(SLAs.total_loop.warnMs).toBe(120000);
    });
  });

  describe("SLAEnforcer", () => {
    test("checkCompliance returns compliant for fast execution", () => {
      const result = enforcer.checkCompliance("phase2_decomposition", 5000);

      expect(result.compliant).toBe(true);
      expect(result.breached).toBe(false);
      expect(result.warning).toBe(false);
      expect(result.elapsed).toBe(5000);
      expect(result.target).toBe(10000);
      expect(result.percentOfTarget).toBe(50);
    });

    test("checkCompliance returns warning for slow execution", () => {
      const result = enforcer.checkCompliance("phase2_decomposition", 9000);

      expect(result.compliant).toBe(true);
      expect(result.breached).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.percentOfTarget).toBe(90);
    });

    test("checkCompliance returns breached for timeout", () => {
      const result = enforcer.checkCompliance("phase2_decomposition", 12000);

      expect(result.compliant).toBe(false);
      expect(result.breached).toBe(true);
      expect(result.elapsed).toBe(12000);
      expect(result.percentOfTarget).toBe(120);
    });

    test("tracks metrics across multiple checks", () => {
      enforcer.checkCompliance("phase2_decomposition", 5000);
      enforcer.checkCompliance("phase2_decomposition", 8000);
      enforcer.checkCompliance("phase2_decomposition", 12000);

      const metrics = enforcer.getMetrics("phase2_decomposition");
      expect(metrics).toBeDefined();
      expect(metrics!.totalChecks).toBe(3);
      expect(metrics!.compliant).toBe(2);
      expect(metrics!.warnings).toBe(1);
      expect(metrics!.breaches).toBe(1);
      expect(metrics!.complianceRate).toBeCloseTo(66.67, 1);
      expect(metrics!.averageLatency).toBeCloseTo(8333.33, 1);
    });

    test("formatCheckResult produces readable output", () => {
      const result = enforcer.checkCompliance("phase2_decomposition", 9000);
      const formatted = enforcer.formatCheckResult("phase2_decomposition", result);

      expect(formatted).toContain("Decomposition Swarm");
      expect(formatted).toContain("9000ms");
      expect(formatted).toContain("10000ms");
      expect(formatted).toContain("90.0%");
      expect(formatted).toContain("COMPLIANT");
    });

    test("getComplianceSummary aggregates across all SLAs", () => {
      enforcer.checkCompliance("phase2_decomposition", 5000);
      enforcer.checkCompliance("phase2_decomposition", 12000);
      enforcer.checkCompliance("phase3_validation", 25000);
      enforcer.checkCompliance("phase3_validation", 35000);

      const summary = enforcer.getComplianceSummary();

      expect(summary.totalChecks).toBe(4);
      expect(summary.totalBreaches).toBe(2);
      expect(summary.overall).toBe(50);
      expect(summary.byPhase["phase2_decomposition"]).toBe(50);
      expect(summary.byPhase["phase3_validation"]).toBe(50);
    });

    test("resetMetrics clears all data", () => {
      // Set auth context for RBAC enforcement (sec-1.8 fix)
      // Import from auth-types at top of file - use inline type assertion for minimal change
      enforcer.setAuthContext({
        id: 'admin-user',
        name: 'Admin User',
        role: 'ADMIN' as const,
        method: 'API_KEY' as const,
        authenticatedAt: new Date(),
      } as any);

      enforcer.checkCompliance("phase2_decomposition", 5000);
      enforcer.resetMetrics();

      const metrics = enforcer.getMetrics("phase2_decomposition");
      expect(metrics!.totalChecks).toBe(0);
      expect(metrics!.compliant).toBe(0);
      expect(metrics!.averageLatency).toBe(0);
    });
  });

  describe("measureSLA utility", () => {
    test("measures execution time and checks SLA", async () => {
      const mockTask = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return "result";
      };

      const { result, slaCheck } = await measureSLA("phase5_troubleshooting", mockTask);

      expect(result).toBe("result");
      expect(slaCheck.elapsed).toBeGreaterThanOrEqual(95); // Allow 5ms tolerance
      expect(slaCheck.elapsed).toBeLessThan(200);
      expect(slaCheck.compliant).toBe(true);
    });

    test("captures SLA breach for slow task", async () => {
      const slowTask = async () => {
        await new Promise(resolve => setTimeout(resolve, 6000));
        return "slow";
      };

      const { result, slaCheck } = await measureSLA("phase5_troubleshooting", slowTask);

      expect(result).toBe("slow");
      expect(slaCheck.elapsed).toBeGreaterThanOrEqual(6000);
      expect(slaCheck.breached).toBe(true);
      expect(slaCheck.compliant).toBe(false);
    });
  });

  describe("timePhase utility", () => {
    test("measures execution time without SLA enforcement", async () => {
      const mockTask = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return "timed";
      };

      const { result, elapsed } = await timePhase("custom-phase", mockTask);

      expect(result).toBe("timed");
      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(elapsed).toBeLessThan(100);
    });
  });
});
