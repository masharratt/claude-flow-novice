import {
  AgentSelector,
  TaskClassification,
  AgentSelection,
  DEFAULT_MAPPINGS_PATH,
  DEFAULT_AGENTS_DIR
} from './agent-selector';
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('AgentSelector', () => {
  let selector: AgentSelector;
  let tempDir: string;
  let testMappingsPath: string;
  let testAgentsDir: string;

  beforeAll(async () => {
    // Use the same module-relative locations the implementation uses. Resolving
    // these from process.cwd() was the defect: the mappings file and the agent
    // profiles ship inside the CFN skill tree, so a cwd-anchored path missed
    // them whenever the skill ran from another project.
    testMappingsPath = DEFAULT_MAPPINGS_PATH;
    testAgentsDir = DEFAULT_AGENTS_DIR;

    selector = new AgentSelector(testMappingsPath, testAgentsDir);
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  describe('Task Classification', () => {
    it('should classify security tasks', async () => {
      const result = await selector.classifyTask('Implement JWT authentication and OAuth2');
      expect(result.category).toBe('security');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.keywords.length).toBeGreaterThan(0);
    });

    it('should classify infrastructure tasks', async () => {
      const result = await selector.classifyTask('Deploy application to Kubernetes cluster with Docker');
      expect(result.category).toBe('infrastructure');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify mobile tasks', async () => {
      const result = await selector.classifyTask('Build iOS and Android app with React Native');
      expect(result.category).toBe('mobile');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify fullstack tasks (explicit keyword)', async () => {
      const result = await selector.classifyTask('Build a fullstack web application');
      expect(result.category).toBe('fullstack');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify fullstack tasks (frontend + backend)', async () => {
      const result = await selector.classifyTask('Implement React frontend with REST API backend and database');
      expect(result.category).toBe('fullstack');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify frontend tasks', async () => {
      const result = await selector.classifyTask('Build responsive React component with TypeScript and Tailwind CSS');
      expect(result.category).toBe('frontend');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify backend-api tasks', async () => {
      const result = await selector.classifyTask('Implement RESTful API with Express and GraphQL endpoints');
      expect(result.category).toBe('backend-api');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify database tasks', async () => {
      const result = await selector.classifyTask('Design PostgreSQL schema with migrations and indexes');
      expect(result.category).toBe('database');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify performance tasks', async () => {
      const result = await selector.classifyTask('Optimize application performance and profile memory leaks');
      expect(result.category).toBe('performance');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should fall back to default for unknown tasks', async () => {
      const result = await selector.classifyTask('Write documentation and create user manual');
      expect(result.category).toBe('default');
      expect(result.confidence).toBeLessThanOrEqual(0.0);
    });

    it('should handle empty description', async () => {
      const result = await selector.classifyTask('');
      expect(result.category).toBe('default');
      expect(result.confidence).toBe(0.0);
      expect(result.keywords.length).toBe(0);
    });

    it('should handle whitespace-only description', async () => {
      const result = await selector.classifyTask('   \n\t  ');
      expect(result.category).toBe('default');
      expect(result.confidence).toBe(0.0);
    });

    it('should be case-insensitive', async () => {
      const result1 = await selector.classifyTask('SECURITY vulnerability');
      const result2 = await selector.classifyTask('security vulnerability');
      expect(result1.category).toBe(result2.category);
    });

    it('should handle special characters', async () => {
      const result = await selector.classifyTask('Fix @security-critical bug #123 in auth module');
      expect(result.category).toBe('security');
    });

    it('should prioritize security over other categories', async () => {
      const result = await selector.classifyTask('Implement JWT security with React frontend');
      expect(result.category).toBe('security');
    });

    it('should prioritize infrastructure over backend-api', async () => {
      const result = await selector.classifyTask('Deploy Docker Kubernetes cluster with microservices');
      expect(result.category).toBe('infrastructure');
    });
  });

  describe('Agent Selection', () => {
    it('should select agents for security tasks', async () => {
      const result = await selector.selectAgents('Fix authentication vulnerability');
      expect(result).toHaveProperty('loop3');
      expect(result).toHaveProperty('loop2');
      expect(result).toHaveProperty('product_owner');
      expect(result).toHaveProperty('category', 'security');
      expect(result).toHaveProperty('confidence');
      expect(Array.isArray(result.loop3)).toBe(true);
      expect(Array.isArray(result.loop2)).toBe(true);
      expect(result.loop3.length).toBeGreaterThanOrEqual(2);
      expect(result.loop2.length).toBeGreaterThanOrEqual(3);
    });

    it('should select agents for backend-api tasks', async () => {
      const result = await selector.selectAgents('Implement REST API with GraphQL');
      expect(result.category).toBe('backend-api');
      expect(result.loop3).toContain('backend-developer');
      expect(result.loop3.length).toBeGreaterThanOrEqual(2);
    });

    it('should select agents for frontend tasks', async () => {
      const result = await selector.selectAgents('Build React dashboard with TypeScript');
      expect(result.category).toBe('frontend');
      expect(result.loop3.length).toBeGreaterThanOrEqual(2);
    });

    it('should guarantee minimum 2 Loop 3 agents', async () => {
      const result = await selector.selectAgents('Any task description');
      expect(result.loop3.length).toBeGreaterThanOrEqual(2);
    });

    it('should guarantee minimum 3 Loop 2 validators by default', async () => {
      const result = await selector.selectAgents('Any task description');
      expect(result.loop2.length).toBeGreaterThanOrEqual(3);
    });

    it('should respect minValidators parameter', async () => {
      const result = await selector.selectAgents('Any task', 5);
      expect(result.loop2.length).toBeGreaterThanOrEqual(5);
    });

    it('should not return empty arrays (BUG #22 fix)', async () => {
      const result = await selector.selectAgents('');
      expect(result.loop3.length).toBeGreaterThan(0);
      expect(result.loop2.length).toBeGreaterThan(0);
    });

    it('should include product_owner', async () => {
      const result = await selector.selectAgents('Any task');
      expect(result.product_owner).toBe('product-owner');
    });

    it('should return valid JSON', async () => {
      const result = await selector.selectAgents('Implement feature X');
      const json = JSON.stringify(result);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should set confidence from category mapping', async () => {
      const result = await selector.selectAgents('Fix security issue');
      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should handle min validators scaling', async () => {
      const result1 = await selector.selectAgents('Task', 3);
      const result2 = await selector.selectAgents('Task', 5);
      expect(result2.loop2.length).toBeGreaterThanOrEqual(result1.loop2.length);
    });

    it('should select appropriate agents for each category', async () => {
      const categories = [
        { desc: 'JWT authentication', cat: 'security' },
        { desc: 'Docker Kubernetes deployment', cat: 'infrastructure' },
        { desc: 'iOS app development', cat: 'mobile' },
        { desc: 'React fullstack application', cat: 'fullstack' },
        { desc: 'React component', cat: 'frontend' },
        { desc: 'REST API endpoint', cat: 'backend-api' },
        { desc: 'Database schema design', cat: 'database' },
        { desc: 'Performance optimization', cat: 'performance' }
      ];

      for (const { desc, cat } of categories) {
        const result = await selector.selectAgents(desc);
        expect(result.category).toBe(cat);
        expect(result.loop3.length).toBeGreaterThanOrEqual(2);
        expect(result.loop2.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('Agent Validation', () => {
    it('should validate that mappings can be loaded', async () => {
      const mappings = await selector.loadMappings();
      expect(mappings).toHaveProperty('categories');
      expect(mappings).toHaveProperty('product_owner');
      expect(mappings).toHaveProperty('agent_aliases');
    });

    it('should have all 9 task categories', async () => {
      const mappings = await selector.loadMappings();
      const categories = [
        'backend-api', 'fullstack', 'mobile', 'infrastructure',
        'security', 'frontend', 'database', 'performance', 'default'
      ];
      for (const cat of categories) {
        expect(mappings.categories).toHaveProperty(cat);
      }
    });

    it('should have loop3 and loop2 for each category', async () => {
      const mappings = await selector.loadMappings();
      for (const [category, mapping] of Object.entries(mappings.categories)) {
        expect(Array.isArray(mapping.loop3)).toBe(true);
        expect(Array.isArray(mapping.loop2)).toBe(true);
        expect(mapping.loop3.length).toBeGreaterThan(0);
        expect(mapping.loop2.length).toBeGreaterThan(0);
      }
    });

    it('should have valid confidence scores', async () => {
      const mappings = await selector.loadMappings();
      for (const mapping of Object.values(mappings.categories)) {
        expect(mapping.confidence).toBeGreaterThanOrEqual(0.0);
        expect(mapping.confidence).toBeLessThanOrEqual(1.0);
      }
    });

    it('should have agent aliases for all referenced agents', async () => {
      const mappings = await selector.loadMappings();
      const allAgents = new Set<string>();

      for (const mapping of Object.values(mappings.categories)) {
        mapping.loop3.forEach((agent: string) => allAgents.add(agent));
        mapping.loop2.forEach((agent: string) => allAgents.add(agent));
      }
      allAgents.add(mappings.product_owner);

      for (const agent of allAgents) {
        expect(mappings.agent_aliases).toHaveProperty(agent);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle tasks with numbers', async () => {
      const result = await selector.classifyTask('Implement API v2 with GraphQL');
      expect(result.category).toBe('backend-api');
    });

    it('should handle mixed case keywords', async () => {
      const result = await selector.classifyTask('DOCKER deployment with Kubernetes');
      expect(result.category).toBe('infrastructure');
    });

    it('should handle URLs in task description', async () => {
      const result = await selector.classifyTask('Fix bug https://github.com/org/repo/issues/123 in JWT auth');
      expect(result.category).toBe('security');
    });

    it('should handle very long descriptions', async () => {
      const longDesc = 'security '.repeat(100);
      const result = await selector.classifyTask(longDesc);
      expect(result.category).toBe('security');
    });

    it('should handle multiple categories', async () => {
      const result = await selector.classifyTask('Implement React frontend with REST API, Docker deployment, and JWT security');
      // Should pick one category based on priority
      expect(['security', 'infrastructure', 'fullstack', 'backend-api', 'frontend']).toContain(result.category);
    });

    it('should be deterministic', async () => {
      const result1 = await selector.classifyTask('Deploy to Kubernetes');
      const result2 = await selector.classifyTask('Deploy to Kubernetes');
      expect(result1.category).toBe(result2.category);
      expect(result1.confidence).toBe(result2.confidence);
    });

    it('should handle special characters in task description', async () => {
      const result = await selector.classifyTask('Fix bug #123: Security vulnerability [CRITICAL]');
      expect(result.category).toBe('security');
    });

    it('should not create duplicate agents in arrays', async () => {
      const result = await selector.selectAgents('Any task');
      const loop3Set = new Set(result.loop3);
      const loop2Set = new Set(result.loop2);
      expect(loop3Set.size).toBe(result.loop3.length);
      expect(loop2Set.size).toBe(result.loop2.length);
    });
  });

  describe('Classification Accuracy', () => {
    it('should achieve 85%+ accuracy across sample tasks', async () => {
      const testCases = [
        { desc: 'JWT authentication', expected: 'security' },
        { desc: 'OAuth2 implementation', expected: 'security' },
        { desc: 'Fix SQL injection vulnerability', expected: 'security' },
        { desc: 'Docker container build', expected: 'infrastructure' },
        { desc: 'Kubernetes deployment', expected: 'infrastructure' },
        { desc: 'AWS infrastructure setup', expected: 'infrastructure' },
        { desc: 'iOS React Native app', expected: 'mobile' },
        { desc: 'Android app development', expected: 'mobile' },
        { desc: 'Flutter mobile app', expected: 'mobile' },
        { desc: 'React component library', expected: 'frontend' },
        { desc: 'TypeScript UI components', expected: 'frontend' },
        { desc: 'Tailwind CSS styling', expected: 'frontend' },
        { desc: 'REST API development', expected: 'backend-api' },
        { desc: 'GraphQL schema implementation', expected: 'backend-api' },
        { desc: 'Express middleware', expected: 'backend-api' },
        { desc: 'Database schema design', expected: 'database' },
        { desc: 'PostgreSQL migration', expected: 'database' },
        { desc: 'MongoDB collection design', expected: 'database' },
        { desc: 'Performance optimization', expected: 'performance' },
        { desc: 'Memory leak fix', expected: 'performance' },
        { desc: 'Latency benchmark', expected: 'performance' }
      ];

      let correctCount = 0;
      for (const testCase of testCases) {
        const result = await selector.classifyTask(testCase.desc);
        if (result.category === testCase.expected) {
          correctCount++;
        }
      }

      const accuracy = correctCount / testCases.length;
      console.log(`Classification accuracy: ${(accuracy * 100).toFixed(1)}% (${correctCount}/${testCases.length})`);
      expect(accuracy).toBeGreaterThanOrEqual(0.85);
    });
  });
});
