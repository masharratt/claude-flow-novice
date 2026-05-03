import { findSubstitute, buildSubstitutionActions } from '../../../src/planning/agent-selection/index.js';
import type { SubstitutionContext } from '../../../src/planning/agent-selection/types.js';

describe('buildSubstitutionActions', () => {
  it('creates one action per eligible agent in the pool', () => {
    const pool = ['backend-developer', 'devops-engineer', 'react-frontend-engineer'];
    const actions = buildSubstitutionActions(pool, []);
    expect(actions).toHaveLength(3);
    const names = actions.map((a) => a.name);
    expect(names).toContain('assign_backend-developer');
    expect(names).toContain('assign_devops-engineer');
    expect(names).toContain('assign_react-frontend-engineer');
  });

  it('respects excluded list — excluded agents are omitted from actions', () => {
    const pool = ['backend-developer', 'devops-engineer', 'react-frontend-engineer'];
    const excluded = ['devops-engineer'];
    const actions = buildSubstitutionActions(pool, excluded);
    const names = actions.map((a) => a.name);
    expect(names).not.toContain('assign_devops-engineer');
    expect(names).toContain('assign_backend-developer');
    expect(names).toContain('assign_react-frontend-engineer');
  });
});

describe('findSubstitute', () => {
  it('returns a valid substitute for a failed loop3 agent in the same category', () => {
    const context: SubstitutionContext = {
      failedAgent: 'api-gateway-specialist',
      category: 'backend-api',
      role: 'loop3',
      excludedAgents: ['api-gateway-specialist'],
    };
    const result = findSubstitute(context);
    expect(result.reachable).toBe(true);
    expect(result.substitute).not.toBeNull();
    expect(result.substitute).not.toBe('api-gateway-specialist');
  });

  it('excludes the failed agent from result', () => {
    const context: SubstitutionContext = {
      failedAgent: 'backend-developer',
      category: 'backend-api',
      role: 'loop3',
      excludedAgents: ['backend-developer'],
    };
    const result = findSubstitute(context);
    expect(result.substitute).not.toBe('backend-developer');
  });

  it('returns a cross-category fallback when no same-category substitute exists', () => {
    const context: SubstitutionContext = {
      failedAgent: 'security-specialist',
      category: 'security',
      role: 'loop3',
      excludedAgents: ['security-specialist', 'backend-developer'],
    };
    const result = findSubstitute(context);
    expect(result.reachable).toBe(true);
    expect(result.substitute).not.toBeNull();
  });

  it('returns null substitute when all agents in the pool are excluded', () => {
    const context: SubstitutionContext = {
      failedAgent: 'backend-developer',
      category: 'backend-api',
      role: 'loop3',
      excludedAgents: [
        'backend-developer',
        'api-gateway-specialist',
        'devops-engineer',
      ],
    };
    const result = findSubstitute(context);
    expect(result.reachable).toBe(false);
    expect(result.substitute).toBeNull();
  });

  it('picks the lower-cost substitute when multiple options exist', () => {
    const context: SubstitutionContext = {
      failedAgent: 'api-gateway-specialist',
      category: 'backend-api',
      role: 'loop3',
      excludedAgents: ['api-gateway-specialist'],
    };
    const result = findSubstitute(context);
    expect(result.reachable).toBe(true);
    expect(result.cost).toBeLessThanOrEqual(2);
  });
});
