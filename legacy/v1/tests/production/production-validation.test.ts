/**
 * Production Validation Tests
 * Real-world scenario testing with actual system integrations
 * Ensures no mock implementations in production code
 */

import { FullstackIntegrationValidator } from "../../src/validation/fullstack-integration-validator.js";
import { UltraFastAgentManager } from "../../src/agents/unified-ultra-fast-agent-manager.js";
import { communicationBus } from "../../src/communication/ultra-fast-communication-bus.js";
import { performance } from "perf_hooks";

describe("Production Validation", () => {
  describe("Real System Integration", () => {
    it("should work with real agent instances", async () => { try {
      const agentManager = new UltraFastAgentManager();
      await agentManager.initialize();

      const agents = await agentManager.spawnAgentBatch([
        { id: "frontend-dev", type: "coder", priority: "normal" },
        { id: "backend-dev", type: "coder", priority: "normal" },
        { id: "qa-tester", type: "tester", priority: "normal" }
      ]);

      expect(agents).toHaveLength(3);
      agents.forEach(agent => {
        expect(agent.state).toBe("ready");
        expect(agent.spawnTime).toBeDefined();
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await agentManager.shutdown();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should complete full feature development cycle", async () => { try {
      const validator = new FullstackIntegrationValidator();
      await validator.initialize();

      const metrics = await validator.runScenario({
        id: "production-auth-test",
        name: "Production Authentication Test",
        description: "Real authentication feature development",
        type: "simple",
        requiredAgents: ["frontend-coder", "backend-coder", "tester", "reviewer"],
        expectedDuration: 120000,
        successCriteria: {
          minCoverage: 90,
          maxIterations: 5,
          maxDuration: 180000,
          minSuccessRate: 0.95
        }
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(metrics.iterationCount).toBeLessThanOrEqual(5);
      expect(metrics.testCoverage).toBeGreaterThanOrEqual(90);
      expect(metrics.successRate).toBeGreaterThanOrEqual(0.95);

      await validator.shutdown();
    }, 300000);
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
