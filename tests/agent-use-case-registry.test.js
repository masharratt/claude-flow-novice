/**
 * Agent Use Case Registry - Unit Tests
 *
 * Tests for intelligent agent selection system
 */

const {
  agentRegistry,
  selectAgent,
  selectMultipleAgents,
  getAgentsByDomain,
  detectDomains,
  calculateScore,
  getRegistryStats
} = require('../src/cli/hybrid-routing/agent-use-case-registry.cjs');

describe('Agent Use Case Registry', () => {
  describe('Registry Integrity', () => {
    jest.setTimeout(10000);
  test('should have 85+ agents defined', () => {
      const agentCount = Object.keys(agentRegistry).length;
      expect(agentCount).toBeGreaterThanOrEqual(85);
    });

    jest.setTimeout(10000);
  test('each agent should have required fields', () => {
      Object.entries(agentRegistry).forEach(([agentType, config]) => {
        expect(config).toHaveProperty('keywords');
        expect(config).toHaveProperty('domains');
        expect(config).toHaveProperty('priority');
        expect(config).toHaveProperty('description');

        expect(Array.isArray(config.keywords)).toBe(true);
        expect(Array.isArray(config.domains)).toBe(true);
        expect(typeof config.priority).toBe('number');
        expect(typeof config.description).toBe('string');

        expect(config.keywords.length).toBeGreaterThan(0);
        expect(config.domains.length).toBeGreaterThan(0);
        expect(config.priority).toBeGreaterThanOrEqual(1);
        expect(config.priority).toBeLessThanOrEqual(10);
      });
    });
  });

  describe('Domain Detection', () => {
    jest.setTimeout(10000);
  test('should detect frontend domain', () => {
      const domains = detectDomains('Build a React component with state management');
      expect(domains.has('frontend')).toBe(true);
    });

    jest.setTimeout(10000);
  test('should detect backend domain', () => {
      const domains = detectDomains('Create REST API endpoints for user service');
      expect(domains.has('backend')).toBe(true);
    });

    jest.setTimeout(10000);
  test('should detect security domain', () => {
      const domains = detectDomains('Audit application for security vulnerabilities');
      expect(domains.has('security')).toBe(true);
    });

    jest.setTimeout(10000);
  test('should detect multiple domains', () => {
      const domains = detectDomains('Build secure REST API with authentication');
      expect(domains.has('backend')).toBe(true);
      expect(domains.has('security')).toBe(true);
      expect(domains.has('api')).toBe(true);
    });

    jest.setTimeout(10000);
  test('should detect mobile domain', () => {
      const domains = detectDomains('Develop React Native app for iOS and Android');
      expect(domains.has('mobile')).toBe(true);
    });
  });

  describe('Agent Selection - Single Agent', () => {
  const { performance } = require('perf_hooks');

  const measureSelectionPerformance = (taskDescription) => {
    const startTime = performance.now();
    const selectedAgents = selectAgents(taskDescription);
    const endTime = performance.now();
    const selectionTime = endTime - startTime;

    expect(selectionTime).toBeLessThan(2); // < 2ms requirement
    return { selectedAgents, selectionTime };
  };

  beforeAll(() => {
    global.performanceMetrics = {
      totalSelections: 0,
      averageSelectionTime: 0,
      selectionTimes: []
    };
  });

  afterEach((done) => {
    const { selectedAgents, selectionTime } = measureSelectionPerformance('test task');
    global.performanceMetrics.totalSelections++;
    global.performanceMetrics.selectionTimes.push(selectionTime);
    global.performanceMetrics.averageSelectionTime =
      global.performanceMetrics.selectionTimes.reduce((a, b) => a + b, 0) /
      global.performanceMetrics.totalSelections;
    return;
  });

  afterAll(() => {
    console.log('Performance Metrics:', global.performanceMetrics);
  });
    jest.setTimeout(10000);
  test('should select backend-dev for API task', () => {
      const result = selectAgent('Create REST API endpoints with authentication');
      expect(result.type).toBe('backend-dev');
      expect(result.score).toBeGreaterThan(50);
      expect(result.fallback).toBe(false);
    });

    jest.setTimeout(10000);
  test('should select react-frontend-engineer for React task', () => {
      const result = selectAgent('Build React component with hooks and state');
      expect(result.type).toBe('react-frontend-engineer');
      expect(result.score).toBeGreaterThan(50);
    });

    jest.setTimeout(10000);
  test('should select mobile-dev for mobile task', () => {
      const result = selectAgent('Develop React Native iOS Android app');
      expect(result.type).toBe('mobile-dev');
      expect(result.score).toBeGreaterThan(60);
    });

    jest.setTimeout(10000);
  test('should select security-specialist for security audit', () => {
      const result = selectAgent('Security audit vulnerability assessment OWASP');
      expect(result.type).toBe('security-specialist');
      expect(result.score).toBeGreaterThan(60);
    });

    jest.setTimeout(10000);
  test('should select tester for testing task', () => {
      const result = selectAgent('Write unit tests and integration tests with TDD');
      expect(result.type).toBe('tester');
      expect(result.score).toBeGreaterThan(50);
    });

    jest.setTimeout(10000);
  test('should select architecture agent for architecture task', () => {
      const result = selectAgent('Design distributed microservices architecture');
      expect(['system-architect', 'architect']).toContain(result.type);
      expect(result.score).toBeGreaterThan(50);
    });

    jest.setTimeout(10000);
  test('should select perf-analyzer for performance task', () => {
      const result = selectAgent('Analyze performance bottlenecks and slow queries');
      expect(result.type).toBe('perf-analyzer');
      expect(result.score).toBeGreaterThan(50);
    });

    jest.setTimeout(10000);
  test('should select some agent even for vague task', () => {
      const result = selectAgent('xyz abc nonsense task description');
      // Will match something based on partial keywords, or fallback to coder
      expect(result.type).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    jest.setTimeout(10000);
  test('should provide alternatives', () => {
      const result = selectAgent('Build API with security and testing');
      expect(result.alternatives).toBeDefined();
      expect(result.alternatives.length).toBeGreaterThan(0);
    });
  });

  describe('Agent Selection - Multiple Agents', () => {
    jest.setTimeout(10000);
  test('should select multiple agents for complex task', () => {
      const result = selectMultipleAgents(
        'Build secure REST API with testing and performance optimization',
        { count: 4 }
      );

      expect(result.length).toBe(4);
      expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);

      const types = result.map(r => r.type);
      expect(types).toContain('backend-dev');
    });

    jest.setTimeout(10000);
  test('should ensure domain diversity', () => {
      const result = selectMultipleAgents(
        'Full-stack application with security and testing',
        { count: 5, diverseDomains: true }
      );

      const allDomains = new Set();
      result.forEach(agent => {
        agent.config.domains.forEach(d => allDomains.add(d));
      });

      expect(allDomains.size).toBeGreaterThan(3);
    });

    jest.setTimeout(10000);
  test('should respect minScore threshold', () => {
      const result = selectMultipleAgents(
        'Build React component',
        { count: 3, minScore: 40 }
      );

      result.forEach(agent => {
        expect(agent.score).toBeGreaterThanOrEqual(40);
      });
    });
  });

  describe('Domain-Based Selection', () => {
    jest.setTimeout(10000);
  test('should get agents by security domain', () => {
      const agents = getAgentsByDomain('security');
      expect(agents.length).toBeGreaterThan(0);

      const types = agents.map(a => a.type);
      expect(types).toContain('security-specialist');
    });

    jest.setTimeout(10000);
  test('should get agents by frontend domain', () => {
      const agents = getAgentsByDomain('frontend');
      expect(agents.length).toBeGreaterThan(0);

      const types = agents.map(a => a.type);
      expect(types).toContain('react-frontend-engineer');
    });

    jest.setTimeout(10000);
  test('should respect minPriority filter', () => {
      const agents = getAgentsByDomain('backend', { minPriority: 8 });

      agents.forEach(agent => {
        expect(agent.priority).toBeGreaterThanOrEqual(8);
      });
    });

    jest.setTimeout(10000);
  test('should sort by priority descending', () => {
      const agents = getAgentsByDomain('backend');

      for (let i = 0; i < agents.length - 1; i++) {
        expect(agents[i].priority).toBeGreaterThanOrEqual(agents[i + 1].priority);
      }
    });
  });

  describe('Scoring Algorithm', () => {
    jest.setTimeout(10000);
  test('should score higher for exact keyword matches', () => {
      const domains = new Set(['backend', 'api']);
      const score1 = calculateScore('backend-dev', 'REST API development', domains);
      const score2 = calculateScore('backend-dev', 'general task', domains);

      expect(score1).toBeGreaterThan(score2);
    });

    jest.setTimeout(10000);
  test('should score higher with domain matches', () => {
      const domains1 = new Set(['backend', 'api']);
      const domains2 = new Set(['frontend']);

      const score1 = calculateScore('backend-dev', 'task', domains1);
      const score2 = calculateScore('backend-dev', 'task', domains2);

      expect(score1).toBeGreaterThan(score2);
    });

    jest.setTimeout(10000);
  test('should respect agent priority', () => {
      const domains = new Set(['security']);
      const score1 = calculateScore('security-specialist', 'security', domains);
      const score2 = calculateScore('security-manager', 'security', domains);

      // security-specialist has priority 10, security-manager has 8
      expect(score1).toBeGreaterThan(score2);
    });
  });

  describe('Registry Statistics', () => {
    jest.setTimeout(10000);
  test('should provide accurate statistics', () => {
      const stats = getRegistryStats();

      expect(stats.totalAgents).toBeGreaterThanOrEqual(85);
      expect(stats.totalDomains).toBeGreaterThan(10);
      expect(stats.totalKeywords).toBeGreaterThan(100);
      expect(parseFloat(stats.averageKeywordsPerAgent)).toBeGreaterThan(5);
      expect(parseFloat(stats.averageDomainsPerAgent)).toBeGreaterThan(1);
    });
  });

  describe('Edge Cases', () => {
    jest.setTimeout(10000);
  test('should handle empty task description', () => {
      const result = selectAgent('');
      expect(result.type).toBeDefined();
      // Empty description gets low score or fallback
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    jest.setTimeout(10000);
  test('should handle very short task description', () => {
      const result = selectAgent('API');
      expect(result).toBeDefined();
      expect(result.type).toBeDefined();
    });

    jest.setTimeout(10000);
  test('should handle task with special characters', () => {
      const result = selectAgent('Build REST API with @auth & #security!');
      expect(result).toBeDefined();
      expect(['backend-dev', 'security-specialist']).toContain(result.type);
    });

    jest.setTimeout(10000);
  test('should exclude specified agents', () => {
      const result = selectAgent('Build REST API', {
        excludeAgents: ['backend-dev']
      });

      expect(result.type).not.toBe('backend-dev');
    });

    jest.setTimeout(10000);
  test('should prefer specified domains', () => {
      const result = selectAgent('Perform security vulnerability assessment', {
        preferDomains: ['security']
      });

      const hasSecurityDomain = result.config.domains.includes('security');
      // With explicit security keywords in task + preferDomains, should select security agent
      expect(hasSecurityDomain).toBe(true);
    });
  });

  describe('Real-World Scenarios', () => {
    jest.setTimeout(10000);
  test('authentication system task', () => {
      const result = selectAgent('Build user authentication system with JWT tokens');
      expect(['backend-dev', 'security-specialist', 'react-frontend-engineer']).toContain(result.type);
      expect(result.score).toBeGreaterThan(40);
    });

    jest.setTimeout(10000);
  test('performance optimization task', () => {
      const result = selectAgent('Optimize slow database queries and improve performance');
      expect(['perf-analyzer', 'code-booster', 'backend-dev']).toContain(result.type);
      expect(result.score).toBeGreaterThan(40);
    });

    jest.setTimeout(10000);
  test('mobile app development task', () => {
      const result = selectAgent('Create cross-platform React Native mobile app');
      expect(result.type).toBe('mobile-dev');
      expect(result.score).toBeGreaterThan(60);
    });

    jest.setTimeout(10000);
  test('security audit task', () => {
      const result = selectAgent('Perform comprehensive security audit for vulnerabilities');
      expect(result.type).toBe('security-specialist');
      expect(result.score).toBeGreaterThan(50);
    });

    jest.setTimeout(10000);
  test('distributed system architecture task', () => {
      const result = selectAgent('Design scalable microservices architecture');
      expect(['system-architect', 'architect']).toContain(result.type);
      expect(result.score).toBeGreaterThan(50);
    });

    jest.setTimeout(10000);
  test('CI/CD pipeline task', () => {
      const result = selectAgent('Setup Docker Kubernetes CI/CD pipeline');
      expect(result.type).toBe('devops-engineer');
      expect(result.score).toBeGreaterThan(50);
    });

    jest.setTimeout(10000);
  test('accessibility compliance task', () => {
      const result = selectAgent('Ensure WCAG accessibility compliance');
      expect(result.type).toBe('accessibility-advocate-persona');
      expect(result.score).toBeGreaterThan(50);
    });
  });
});
