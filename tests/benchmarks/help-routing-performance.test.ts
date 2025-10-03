import { describe, it, expect, beforeEach } from '@jest/globals';
import { performance } from 'perf_hooks';

/**
 * BENCHMARK THRESHOLD: Help request routing <200ms end-to-end
 *
 * Tests the complete help request routing flow:
 * 1. Request submitted by agent
 * 2. Matcher finds suitable helper
 * 3. Helper notified and accepts
 * 4. Requester receives helper assignment
 */

interface Agent {
  id: string;
  skills: string[];
  status: 'available' | 'busy' | 'paused';
}

interface HelpRequest {
  id: string;
  requesterId: string;
  requiredSkills: string[];
  timestamp: number;
}

interface RoutingResult {
  requestId: string;
  helperId: string | null;
  totalLatencyMs: number;
  stages: {
    matching: number;
    notification: number;
    acceptance: number;
    assignment: number;
  };
}

class HelpRoutingSystem {
  private agents: Map<string, Agent> = new Map();
  private pendingRequests: Map<string, HelpRequest> = new Map();

  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Complete help request routing flow
   * Should complete in <200ms end-to-end
   */
  async routeHelpRequest(request: HelpRequest): Promise<RoutingResult> {
    const startTime = performance.now();
    const stages = { matching: 0, notification: 0, acceptance: 0, assignment: 0 };

    // Stage 1: Find matching helper
    const matchStart = performance.now();
    const helper = this.findBestHelper(request.requiredSkills);
    stages.matching = performance.now() - matchStart;

    if (!helper) {
      return {
        requestId: request.id,
        helperId: null,
        totalLatencyMs: performance.now() - startTime,
        stages
      };
    }

    // Stage 2: Notify helper
    const notifyStart = performance.now();
    await this.notifyHelper(helper.id, request);
    stages.notification = performance.now() - notifyStart;

    // Stage 3: Helper accepts
    const acceptStart = performance.now();
    const accepted = await this.helperAccepts(helper.id, request.id);
    stages.acceptance = performance.now() - acceptStart;

    if (!accepted) {
      return {
        requestId: request.id,
        helperId: null,
        totalLatencyMs: performance.now() - startTime,
        stages
      };
    }

    // Stage 4: Assign to requester
    const assignStart = performance.now();
    await this.assignHelperToRequester(request.requesterId, helper.id);
    stages.assignment = performance.now() - assignStart;

    const totalLatencyMs = performance.now() - startTime;

    return {
      requestId: request.id,
      helperId: helper.id,
      totalLatencyMs,
      stages
    };
  }

  private findBestHelper(requiredSkills: string[]): Agent | null {
    const available = Array.from(this.agents.values()).filter(a => a.status === 'available');

    let bestMatch: Agent | null = null;
    let bestScore = 0;

    for (const agent of available) {
      const matchCount = requiredSkills.filter(s => agent.skills.includes(s)).length;
      const score = matchCount / requiredSkills.length;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = agent;
      }
    }

    return bestMatch;
  }

  private async notifyHelper(helperId: string, request: HelpRequest): Promise<void> {
    // Simulate notification latency (message broker, etc.)
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
  }

  private async helperAccepts(helperId: string, requestId: string): Promise<boolean> {
    // Simulate helper decision latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
    return true; // Auto-accept for benchmark
  }

  private async assignHelperToRequester(requesterId: string, helperId: string): Promise<void> {
    // Simulate assignment notification
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));

    // Update helper status
    const helper = this.agents.get(helperId);
    if (helper) {
      helper.status = 'busy';
    }
  }

  reset(): void {
    this.agents.clear();
    this.pendingRequests.clear();
  }
}

describe('Help Routing Performance Benchmark', () => {
  let system: HelpRoutingSystem;

  beforeEach(() => {
    system = new HelpRoutingSystem();

    // Register 60 agents with varied skills
    const skills = ['security', 'performance', 'testing', 'architecture', 'devops', 'database'];

    for (let i = 1; i <= 60; i++) {
      const agentSkills = skills.slice(0, Math.floor(Math.random() * 3) + 1);
      system.registerAgent({
        id: `agent-${i}`,
        skills: agentSkills,
        status: i % 10 === 0 ? 'busy' : 'available' // 90% available
      });
    }
  });

  it('should route help request in <200ms end-to-end', async () => {
    const request: HelpRequest = {
      id: 'req-1',
      requesterId: 'agent-requester-1',
      requiredSkills: ['security', 'testing'],
      timestamp: Date.now()
    };

    const result = await system.routeHelpRequest(request);

    console.log(`\nHelp Routing Stages (single request):`);
    console.log(`  Matching: ${result.stages.matching.toFixed(2)}ms`);
    console.log(`  Notification: ${result.stages.notification.toFixed(2)}ms`);
    console.log(`  Acceptance: ${result.stages.acceptance.toFixed(2)}ms`);
    console.log(`  Assignment: ${result.stages.assignment.toFixed(2)}ms`);
    console.log(`  Total: ${result.totalLatencyMs.toFixed(2)}ms`);
    console.log(`  Threshold: <200ms`);
    console.log(`  Status: ${result.totalLatencyMs < 200 ? '✅ PASS' : '❌ FAIL'}`);

    expect(result.helperId).toBeTruthy();
    expect(result.totalLatencyMs).toBeLessThan(200);
  });

  it('should maintain <200ms p95 across 100 routing requests', async () => {
    const latencies: number[] = [];
    const stageLatencies = { matching: [], notification: [], acceptance: [], assignment: [] };

    for (let i = 0; i < 100; i++) {
      const skillCount = Math.floor(Math.random() * 3) + 1;
      const allSkills = ['security', 'performance', 'testing', 'architecture', 'devops'];
      const requiredSkills = allSkills.slice(0, skillCount);

      const request: HelpRequest = {
        id: `req-${i}`,
        requesterId: `requester-${i}`,
        requiredSkills,
        timestamp: Date.now()
      };

      const result = await system.routeHelpRequest(request);
      latencies.push(result.totalLatencyMs);
      stageLatencies.matching.push(result.stages.matching);
      stageLatencies.notification.push(result.stages.notification);
      stageLatencies.acceptance.push(result.stages.acceptance);
      stageLatencies.assignment.push(result.stages.assignment);
    }

    const sorted = latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95Latency = sorted[p95Index];

    const avgMatching = stageLatencies.matching.reduce((a, b) => a + b) / stageLatencies.matching.length;
    const avgNotification = stageLatencies.notification.reduce((a, b) => a + b) / stageLatencies.notification.length;
    const avgAcceptance = stageLatencies.acceptance.reduce((a, b) => a + b) / stageLatencies.acceptance.length;
    const avgAssignment = stageLatencies.assignment.reduce((a, b) => a + b) / stageLatencies.assignment.length;

    console.log(`\nHelp Routing Performance (100 requests):`);
    console.log(`  Min: ${Math.min(...latencies).toFixed(2)}ms`);
    console.log(`  Max: ${Math.max(...latencies).toFixed(2)}ms`);
    console.log(`  Avg: ${(latencies.reduce((a, b) => a + b) / latencies.length).toFixed(2)}ms`);
    console.log(`  P95: ${p95Latency.toFixed(2)}ms`);
    console.log(`\nAverage Stage Latencies:`);
    console.log(`  Matching: ${avgMatching.toFixed(2)}ms`);
    console.log(`  Notification: ${avgNotification.toFixed(2)}ms`);
    console.log(`  Acceptance: ${avgAcceptance.toFixed(2)}ms`);
    console.log(`  Assignment: ${avgAssignment.toFixed(2)}ms`);
    console.log(`\nThreshold: <200ms (p95)`);
    console.log(`  Status: ${p95Latency < 200 ? '✅ PASS' : '❌ FAIL'}`);

    expect(p95Latency).toBeLessThan(200);
  });

  it('should handle concurrent routing requests efficiently', async () => {
    const requests: HelpRequest[] = [];

    for (let i = 0; i < 20; i++) {
      requests.push({
        id: `concurrent-req-${i}`,
        requesterId: `concurrent-requester-${i}`,
        requiredSkills: ['security', 'performance'],
        timestamp: Date.now()
      });
    }

    const startTime = performance.now();
    const results = await Promise.all(requests.map(req => system.routeHelpRequest(req)));
    const totalTime = performance.now() - startTime;

    const avgLatency = results.reduce((sum, r) => sum + r.totalLatencyMs, 0) / results.length;
    const maxLatency = Math.max(...results.map(r => r.totalLatencyMs));

    console.log(`\nConcurrent Routing (20 requests):`);
    console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
    console.log(`  Avg latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`  Max latency: ${maxLatency.toFixed(2)}ms`);
    console.log(`  Threshold: <200ms per request`);
    console.log(`  Status: ${maxLatency < 200 ? '✅ PASS' : '❌ FAIL'}`);

    expect(maxLatency).toBeLessThan(200);
  });
});
