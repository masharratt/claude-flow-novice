import { describe, it, expect, beforeAll } from '@jest/globals';
import { performance } from 'perf_hooks';

/**
 * BENCHMARK THRESHOLD: Help matcher performance <100ms (p95) for 50+ agents
 *
 * Tests the performance of matching help requests to available helper agents
 * across different pool sizes and skill configurations.
 */

interface Agent {
  id: string;
  type: string;
  skills: string[];
  availability: 'available' | 'busy' | 'paused';
}

interface HelpRequest {
  requesterId: string;
  requiredSkills: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}

interface MatchResult {
  helperId: string | null;
  matchScore: number;
  latencyMs: number;
}

class HelpMatcher {
  private agents: Agent[] = [];

  addAgent(agent: Agent): void {
    this.agents.push(agent);
  }

  /**
   * Find best helper for a help request
   * Should complete in <100ms for 50+ agents (p95)
   */
  findHelper(request: HelpRequest): MatchResult {
    const startTime = performance.now();

    const availableAgents = this.agents.filter(a => a.availability === 'available');

    let bestMatch: Agent | null = null;
    let bestScore = 0;

    for (const agent of availableAgents) {
      const matchingSkills = request.requiredSkills.filter(
        skill => agent.skills.includes(skill)
      );
      const score = matchingSkills.length / request.requiredSkills.length;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = agent;
      }
    }

    const latencyMs = performance.now() - startTime;

    return {
      helperId: bestMatch?.id || null,
      matchScore: bestScore,
      latencyMs
    };
  }

  reset(): void {
    this.agents = [];
  }
}

describe('Help Matcher Performance Benchmark', () => {
  const matcher = new HelpMatcher();
  const latencies: number[] = [];

  beforeAll(() => {
    // Create 50+ agents with varied skills
    const skills = ['security', 'performance', 'testing', 'architecture', 'devops'];

    for (let i = 1; i <= 60; i++) {
      const agentSkills = skills.slice(0, Math.floor(Math.random() * 3) + 1);
      matcher.addAgent({
        id: `agent-${i}`,
        type: i % 5 === 0 ? 'specialist' : 'coder',
        skills: agentSkills,
        availability: i % 10 === 0 ? 'busy' : 'available' // 90% available
      });
    }
  });

  it('should match helpers in <100ms for 50+ agents (single request)', () => {
    const request: HelpRequest = {
      requesterId: 'agent-requester-1',
      requiredSkills: ['security', 'testing'],
      priority: 'high'
    };

    const result = matcher.findHelper(request);

    expect(result.helperId).toBeTruthy();
    expect(result.latencyMs).toBeLessThan(100);
    latencies.push(result.latencyMs);
  });

  it('should maintain <100ms p95 across 100 requests with 50+ agents', () => {
    const requests: HelpRequest[] = [];

    // Generate 100 varied requests
    for (let i = 0; i < 100; i++) {
      const skillCount = Math.floor(Math.random() * 3) + 1;
      const allSkills = ['security', 'performance', 'testing', 'architecture', 'devops'];
      const requiredSkills = allSkills.slice(0, skillCount);

      requests.push({
        requesterId: `requester-${i}`,
        requiredSkills,
        priority: i % 4 === 0 ? 'critical' : i % 3 === 0 ? 'high' : 'medium'
      });
    }

    const requestLatencies: number[] = [];

    for (const request of requests) {
      const result = matcher.findHelper(request);
      requestLatencies.push(result.latencyMs);
    }

    // Calculate p95 (95th percentile)
    const sorted = requestLatencies.sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95Latency = sorted[p95Index];

    console.log(`Help Matcher Performance (50+ agents):`);
    console.log(`  Requests: ${requests.length}`);
    console.log(`  Min: ${Math.min(...requestLatencies).toFixed(2)}ms`);
    console.log(`  Max: ${Math.max(...requestLatencies).toFixed(2)}ms`);
    console.log(`  Avg: ${(requestLatencies.reduce((a, b) => a + b) / requestLatencies.length).toFixed(2)}ms`);
    console.log(`  P95: ${p95Latency.toFixed(2)}ms`);
    console.log(`  Threshold: <100ms (p95)`);
    console.log(`  Status: ${p95Latency < 100 ? '✅ PASS' : '❌ FAIL'}`);

    expect(p95Latency).toBeLessThan(100);
  });

  it('should scale efficiently with 100 agents', () => {
    // Add 40 more agents for 100 total
    const skills = ['security', 'performance', 'testing', 'architecture', 'devops', 'database', 'frontend'];

    for (let i = 61; i <= 100; i++) {
      const agentSkills = skills.slice(0, Math.floor(Math.random() * 4) + 1);
      matcher.addAgent({
        id: `agent-${i}`,
        type: i % 5 === 0 ? 'specialist' : 'coder',
        skills: agentSkills,
        availability: i % 10 === 0 ? 'busy' : 'available'
      });
    }

    const scalabilityLatencies: number[] = [];

    for (let i = 0; i < 50; i++) {
      const request: HelpRequest = {
        requesterId: `scale-requester-${i}`,
        requiredSkills: ['security', 'performance'],
        priority: 'high'
      };

      const result = matcher.findHelper(request);
      scalabilityLatencies.push(result.latencyMs);
    }

    const sorted = scalabilityLatencies.sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95Latency = sorted[p95Index];

    console.log(`\nHelp Matcher Scalability (100 agents):`);
    console.log(`  P95: ${p95Latency.toFixed(2)}ms`);
    console.log(`  Threshold: <100ms (p95)`);
    console.log(`  Status: ${p95Latency < 100 ? '✅ PASS' : '❌ FAIL'}`);

    // Should still maintain sub-100ms p95 even with 100 agents
    expect(p95Latency).toBeLessThan(100);
  });
});
