/**
 * Fullstack Integration Validation Test Suite
 * Comprehensive end-to-end validation of integrated swarm system
 * Tests real-world scenarios with performance benchmarking
 */

import { FullstackIntegrationValidator } from "../../src/validation/fullstack-integration-validator.js";
import { UltraFastAgentManager } from "../../src/agents/unified-ultra-fast-agent-manager.js";
import { communicationBus } from "../../src/communication/ultra-fast-communication-bus.js";

describe("Fullstack Integration Validation", () => {
  let validator: FullstackIntegrationValidator;

  beforeAll(async () => {
    validator = new FullstackIntegrationValidator();
    await validator.initialize();
  });

  afterAll(async () => {
    await validator.shutdown();
  });

  describe("Simple Feature Development Scenario", () => {
    it("should develop user authentication feature with 90%+ coverage", async () => {
      const scenario = {
        id: "simple-auth-feature",
        name: "User Authentication Feature",
        description: "Develop user authentication with frontend + backend",
        type: "simple" as const,
        requiredAgents: ["frontend-coder", "backend-coder", "tester", "reviewer"],
        expectedDuration: 120000,
        successCriteria: {
          minCoverage: 90,
          maxIterations: 5,
          maxDuration: 180000,
          minSuccessRate: 0.95
        }
      };

      const metrics = await validator.runScenario(scenario);

      // Validate iteration convergence
      expect(metrics.iterationCount).toBeLessThanOrEqual(5);
      expect(metrics.iterationCount).toBeGreaterThan(0);

      // Validate test coverage
      expect(metrics.testCoverage).toBeGreaterThanOrEqual(90);

      // Validate duration (within 3 minutes)
      expect(metrics.duration).toBeLessThanOrEqual(180000);

      // Validate success rate
      expect(metrics.successRate).toBeGreaterThanOrEqual(0.95);

      // Validate no critical issues
      const criticalIssues = metrics.issues.filter(i => i.severity === "critical");
      expect(criticalIssues).toHaveLength(0);
    }, 300000); // 5 minute timeout

    it("should complete build-test cycle within 30 minutes per iteration", async () => {
      const scenario = {
        id: "build-test-cycle",
        name: "Build-Test Cycle Performance",
        description: "Validate iterative build-test cycle performance",
        type: "simple" as const,
        requiredAgents: ["coder", "tester"],
        expectedDuration: 60000,
        successCriteria: {
          minCoverage: 85,
          maxIterations: 3,
          maxDuration: 90000,
          minSuccessRate: 0.90
        }
      };

      const metrics = await validator.runScenario(scenario);

      // Calculate average time per iteration
      const avgIterationTime = metrics.duration / metrics.iterationCount;

      // Should be well under 30 minutes per iteration
      expect(avgIterationTime).toBeLessThanOrEqual(1800000); // 30 minutes
      expect(avgIterationTime).toBeLessThanOrEqual(60000); // Target: <1 minute

      // Validate rapid iteration capability
      expect(metrics.iterationCount).toBeGreaterThanOrEqual(2);
    }, 200000);
  });

  describe("Complex Feature with Integration Scenario", () => {
    it("should develop real-time chat with WebSocket coordination", async () => {
      const scenario = {
        id: "realtime-chat-feature",
        name: "Real-time Chat Feature",
        description: "WebSocket-based chat with frontend + backend + database",
        type: "complex" as const,
        requiredAgents: [
          "frontend-coder",
          "backend-coder",
          "database-specialist",
          "tester",
          "reviewer",
          "architect"
        ],
        expectedDuration: 300000,
        successCriteria: {
          minCoverage: 90,
          maxIterations: 8,
          maxDuration: 450000,
          minSuccessRate: 0.90
        }
      };

      const metrics = await validator.runScenario(scenario);

      // Validate parallel development
      expect(metrics.agentCoordination.concurrentAgents).toBeGreaterThanOrEqual(6);

      // Validate coverage across frontend and backend
      expect(metrics.testCoverage).toBeGreaterThanOrEqual(90);

      // Validate E2E testing capability
      expect(metrics.successRate).toBeGreaterThanOrEqual(0.90);

      // Validate coordination efficiency
      expect(metrics.communicationLatency.p95).toBeLessThanOrEqual(5.0); // <5ms P95

      // Validate iteration count
      expect(metrics.iterationCount).toBeLessThanOrEqual(8);

      const criticalIssues = metrics.issues.filter(i => i.severity === "critical");
      expect(criticalIssues).toHaveLength(0);
    }, 600000); // 10 minute timeout

    it("should handle WebSocket integration with low latency", async () => {
      const scenario = {
        id: "websocket-integration",
        name: "WebSocket Integration Test",
        description: "Test WebSocket communication coordination",
        type: "complex" as const,
        requiredAgents: ["frontend-coder", "backend-coder", "tester"],
        expectedDuration: 60000,
        successCriteria: {
          minCoverage: 85,
          maxIterations: 5,
          maxDuration: 90000,
          minSuccessRate: 0.90
        }
      };

      const metrics = await validator.runScenario(scenario);

      // Validate communication latency
      expect(metrics.communicationLatency.average).toBeLessThanOrEqual(1.0); // <1ms avg
      expect(metrics.communicationLatency.p95).toBeLessThanOrEqual(2.0); // <2ms P95
      expect(metrics.communicationLatency.p99).toBeLessThanOrEqual(5.0); // <5ms P99

      // Validate message delivery rate
      expect(metrics.agentCoordination.messageDeliveryRate).toBeGreaterThanOrEqual(1000); // >1000 msg/sec
    }, 180000);
  });

  describe("Multi-Agent Coordination Scenario", () => {
    it("should coordinate 5+ agents working simultaneously", async () => {
      const scenario = {
        id: "multi-agent-coordination",
        name: "5+ Agents Simultaneous Work",
        description: "Test coordination of 5+ agents working simultaneously",
        type: "multi-agent" as const,
        requiredAgents: [
          "coordinator",
          "researcher",
          "frontend-coder",
          "backend-coder",
          "database-specialist",
          "tester",
          "reviewer",
          "architect"
        ],
        expectedDuration: 180000,
        successCriteria: {
          minCoverage: 85,
          maxIterations: 10,
          maxDuration: 300000,
          minSuccessRate: 0.85
        }
      };

      const metrics = await validator.runScenario(scenario);

      // Validate concurrent agents
      expect(metrics.agentCoordination.concurrentAgents).toBeGreaterThanOrEqual(5);
      expect(metrics.agentCoordination.concurrentAgents).toBeLessThanOrEqual(10);

      // Validate coordination latency
      expect(metrics.communicationLatency.p95).toBeLessThanOrEqual(1.0); // <1ms P95

      // Validate agent spawn time
      expect(metrics.agentCoordination.spawnTime).toBeLessThanOrEqual(5000); // <5 seconds

      // Validate memory sharing effectiveness
      expect(metrics.successRate).toBeGreaterThanOrEqual(0.85);

      const performanceIssues = metrics.issues.filter(
        i => i.category === "performance" && i.severity === "critical"
      );
      expect(performanceIssues).toHaveLength(0);
    }, 400000); // 6.67 minute timeout

    it("should maintain communication performance under load", async () => {
      const scenario = {
        id: "communication-load-test",
        name: "Communication System Load Test",
        description: "Test communication system under agent load",
        type: "multi-agent" as const,
        requiredAgents: Array.from({ length: 10 }, (_, i) => `agent-${i}`),
        expectedDuration: 60000,
        successCriteria: {
          minCoverage: 80,
          maxIterations: 3,
          maxDuration: 120000,
          minSuccessRate: 0.90
        }
      };

      const metrics = await validator.runScenario(scenario);

      // Validate communication system maintains sub-millisecond latency
      expect(metrics.communicationLatency.p95).toBeLessThanOrEqual(1.0);
      expect(metrics.communicationLatency.p99).toBeLessThanOrEqual(5.0);

      // Validate high throughput
      expect(metrics.agentCoordination.messageDeliveryRate).toBeGreaterThanOrEqual(5000);

      // Get bus metrics
      const busMetrics = communicationBus.getMetrics();
      expect(busMetrics.poolUtilization).toBeLessThanOrEqual(0.8); // <80% utilization
    }, 200000);
  });

  describe("Stress Test Scenario", () => {
    it("should support 100+ simultaneous agents", async () => {
      const scenario = {
        id: "stress-test-100-agents",
        name: "100+ Concurrent Agents",
        description: "Stress test with 100+ simultaneous agents",
        type: "stress" as const,
        requiredAgents: [],
        expectedDuration: 120000,
        successCriteria: {
          minCoverage: 80,
          maxIterations: 3,
          maxDuration: 180000,
          minSuccessRate: 0.90
        }
      };

      const metrics = await validator.runScenario(scenario);

      // Validate can spawn 100+ agents
      expect(metrics.agentCoordination.concurrentAgents).toBeGreaterThanOrEqual(100);

      // Validate system remains stable under load
      expect(metrics.successRate).toBeGreaterThanOrEqual(0.90);

      // Validate communication system scales
      expect(metrics.communicationLatency.p95).toBeLessThanOrEqual(5.0); // <5ms P95 acceptable under stress

      // Validate agent spawn time remains reasonable
      expect(metrics.agentCoordination.spawnTime).toBeLessThanOrEqual(10000); // <10 seconds for 100 agents

      const criticalIssues = metrics.issues.filter(i => i.severity === "critical");
      expect(criticalIssues).toHaveLength(0);
    }, 300000); // 5 minute timeout

    it("should maintain performance with high message throughput", async () => {
      // Pre-spawn agents
      const agentManager = new UltraFastAgentManager();
      await agentManager.initialize();

      const agents = await agentManager.spawnAgentBatch(
        Array.from({ length: 50 }, (_, i) => ({
          id: `throughput-agent-${i}`,
          type: "coder" as any,
          priority: "normal" as const
        }))
      );

      // Send high volume of messages
      const messageCount = 10000;
      const startTime = performance.now();

      const sendPromises = Array.from({ length: messageCount }, (_, i) => {
        const targetAgent = agents[i % agents.length];
        return agentManager.sendMessage({
          from: "test",
          to: targetAgent.id,
          type: "test-message",
          data: { index: i },
          priority: "normal"
        });
      });

      const results = await Promise.all(sendPromises);
      const duration = performance.now() - startTime;

      // Validate throughput
      const throughput = messageCount / (duration / 1000); // messages per second
      expect(throughput).toBeGreaterThanOrEqual(5000); // >5000 msg/sec

      // Validate delivery success rate
      const successCount = results.filter(r => r.success).length;
      const successRate = successCount / messageCount;
      expect(successRate).toBeGreaterThanOrEqual(0.95);

      // Validate average latency
      const avgLatency =
        results
          .filter(r => r.deliveryTime)
          .reduce((sum, r) => sum + (r.deliveryTime || 0), 0) / successCount;
      expect(avgLatency).toBeLessThanOrEqual(1.0); // <1ms average

      // Cleanup
      await agentManager.shutdown();
    }, 300000);
  });

  describe("Full System Integration", () => {
    it("should run all scenarios and generate comprehensive report", async () => {
      const report = await validator.runAllScenarios();

      // Validate report structure
      expect(report).toHaveProperty("overallStatus");
      expect(report).toHaveProperty("scenarios");
      expect(report).toHaveProperty("systemMetrics");
      expect(report).toHaveProperty("recommendations");
      expect(report).toHaveProperty("certificationLevel");

      // Validate all scenarios executed
      expect(report.scenarios).toHaveLength(4); // 4 scenarios defined

      // Validate system metrics
      expect(report.systemMetrics.totalScenarios).toBe(4);
      expect(report.systemMetrics.averageCoverage).toBeGreaterThanOrEqual(80);
      expect(report.systemMetrics.averageIterations).toBeLessThanOrEqual(10);

      // Validate communication performance
      expect(report.systemMetrics.communicationPerformance.p95Latency).toBeLessThanOrEqual(5.0);
      expect(report.systemMetrics.communicationPerformance.maxConcurrentAgents).toBeGreaterThanOrEqual(100);

      // Validate certification level
      expect(["production-ready", "needs-improvement", "not-ready"]).toContain(
        report.certificationLevel
      );

      // Log report for analysis
      console.log("\n=== FULLSTACK INTEGRATION VALIDATION REPORT ===");
      console.log(`Overall Status: ${report.overallStatus}`);
      console.log(`Certification Level: ${report.certificationLevel}`);
      console.log(`\nSystem Metrics:`);
      console.log(`  Total Scenarios: ${report.systemMetrics.totalScenarios}`);
      console.log(`  Passed: ${report.systemMetrics.passedScenarios}`);
      console.log(`  Failed: ${report.systemMetrics.failedScenarios}`);
      console.log(`  Average Coverage: ${report.systemMetrics.averageCoverage.toFixed(2)}%`);
      console.log(`  Average Iterations: ${report.systemMetrics.averageIterations.toFixed(2)}`);
      console.log(`  Average Duration: ${(report.systemMetrics.averageDuration / 1000).toFixed(2)}s`);
      console.log(`\nCommunication Performance:`);
      console.log(`  Average Latency: ${report.systemMetrics.communicationPerformance.averageLatency.toFixed(3)}ms`);
      console.log(`  P95 Latency: ${report.systemMetrics.communicationPerformance.p95Latency.toFixed(3)}ms`);
      console.log(`  Max Concurrent Agents: ${report.systemMetrics.communicationPerformance.maxConcurrentAgents}`);
      console.log(`\nRecommendations:`);
      report.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
      console.log("\n==============================================\n");

    }, 1800000); // 30 minute timeout for full validation
  });

  describe("Performance Benchmarking", () => {
    it("should measure and validate communication latency targets", async () => {
      const busMetrics = communicationBus.getMetrics();

      // Validate latency targets
      expect(busMetrics.averageLatencyNs / 1000000).toBeLessThanOrEqual(1.0); // <1ms avg
      expect(busMetrics.p95LatencyNs / 1000000).toBeLessThanOrEqual(1.0); // <1ms P95
      expect(busMetrics.p99LatencyNs / 1000000).toBeLessThanOrEqual(5.0); // <5ms P99
    });

    it("should validate agent spawn time performance", async () => {
      const agentManager = new UltraFastAgentManager();
      await agentManager.initialize();

      const startTime = performance.now();
      await agentManager.spawnAgent({
        id: "benchmark-agent",
        type: "coder",
        priority: "normal"
      });
      const spawnTime = performance.now() - startTime;

      // Validate spawn time target
      expect(spawnTime).toBeLessThanOrEqual(100); // <100ms P95

      await agentManager.shutdown();
    });

    it("should validate system throughput targets", async () => {
      const agentManager = new UltraFastAgentManager();
      await agentManager.initialize();

      const agents = await agentManager.spawnAgentBatch(
        Array.from({ length: 20 }, (_, i) => ({
          id: `throughput-agent-${i}`,
          type: "coder" as any,
          priority: "normal" as const
        }))
      );

      const metrics = agentManager.getSystemMetrics();

      // Validate throughput
      expect(metrics.systemThroughput).toBeGreaterThanOrEqual(100); // >100 ops/sec

      await agentManager.shutdown();
    });
  });
});