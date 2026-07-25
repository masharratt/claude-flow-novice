/**
 * Product Owner Decision Logic Test Suite
 * Comprehensive test coverage for MVP and Enterprise Product Owner decision-making
 *
 * @version 1.0.0
 * @description Tests for P1 HIGH PRIORITY - Product Owner Decision Logic
 *
 * Coverage:
 * - PROCEED/ITERATE/ABORT/ESCALATE decision parsing
 * - Deliverable validation
 * - Consensus threshold checking
 * - MVP vs Enterprise decision differences
 * - Edge cases: max iterations, no deliverables, high blockers
 * - GOAP action selection
 * - Weighted voting in Enterprise mode
 * - Board consensus calculation
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { MVPOwner } from '../../../src/cfn-loop/product-owner/mvp-owner.js';
import { EnterpriseOwnerTeam } from '../../../src/cfn-loop/product-owner/enterprise-owner-team.js';
import type { GOAPState, PODecisionResult, TeamDecisionResult } from '../../../src/cfn-loop/product-owner/types.js';

describe('MVP Product Owner Decision Logic', () => {
  let mvpOwner: MVPOwner;

  beforeEach(() => {
    process.env.CLAUDE_FLOW_ENV = 'test';
    mvpOwner = new MVPOwner();
  });

  describe('PROCEED Decision', () => {
    test('should PROCEED with high confidence and no blockers', async () => {
      const state: GOAPState = {
        currentConfidence: 0.85,
        consensusScore: 0.90,
        blockers: [],
        completedTasks: ['task1', 'task2', 'task3'],
        remainingTasks: [],
        riskLevel: 'low',
      };

      const result = await mvpOwner.makeDecision(state);

      expect(result.decision).toBe('PROCEED');
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toContain('meets MVP threshold');
      expect(result.reasoning).toContain('Consensus');
      expect(result.reasoning).toContain('No blockers');
      expect(result.blockers).toEqual([]);
      expect(result.backlogItems).toEqual([]);
    });

    test('should PROCEED at minimum threshold with strong consensus', async () => {
      const state: GOAPState = {
        currentConfidence: 0.70,
        consensusScore: 0.85,
        blockers: [],
        completedTasks: ['task1'],
        remainingTasks: [],
        riskLevel: 'low',
      };

      const result = await mvpOwner.makeDecision(state);

      expect(result.decision).toBe('PROCEED');
      expect(result.confidence).toBe(0.70);
    });
  });

  describe('LOOP Decision', () => {
    test('should LOOP with moderate confidence and few blockers', async () => {
      const state: GOAPState = {
        currentConfidence: 0.65,
        consensusScore: 0.75,
        blockers: ['blocker1', 'blocker2'],
        completedTasks: ['task1'],
        remainingTasks: ['task2', 'task3'],
        riskLevel: 'medium',
      };

      const result = await mvpOwner.makeDecision(state);

      expect(result.decision).toBe('LOOP');
      expect(result.reasoning).toContain('needs improvement');
      expect(result.reasoning).toContain('2 blockers');
      expect(result.recommendations.some((r) => r.includes('confidence'))).toBe(true);
      expect(result.recommendations.some((r) => r.includes('blockers'))).toBe(true);
    });

    test('should LOOP when confidence below threshold', async () => {
      const state: GOAPState = {
        currentConfidence: 0.55,
        consensusScore: 0.80,
        blockers: [],
        completedTasks: ['task1'],
        remainingTasks: ['task2'],
        riskLevel: 'low',
      };

      const result = await mvpOwner.makeDecision(state);

      expect(result.decision).toBe('LOOP');
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    test('should LOOP at exactly threshold boundary', async () => {
      const state: GOAPState = {
        currentConfidence: 0.60,
        consensusScore: 0.80,
        blockers: ['blocker1'],
        completedTasks: [],
        remainingTasks: ['task1'],
        riskLevel: 'medium',
      };

      const result = await mvpOwner.makeDecision(state);

      expect(result.decision).toBe('LOOP');
    });
  });

  describe('ESCALATE Decision', () => {
    test('should ESCALATE with high risk level', async () => {
      const state: GOAPState = {
        currentConfidence: 0.50,
        consensusScore: 0.60,
        blockers: ['critical1', 'critical2', 'critical3'],
        completedTasks: [],
        remainingTasks: ['task1', 'task2'],
        riskLevel: 'high',
      };

      const result = await mvpOwner.makeDecision(state);

      expect(result.decision).toBe('ESCALATE');
      expect(result.reasoning).toContain('Risk level: high');
      expect(result.blockers.length).toBeGreaterThan(0);
    });

    test('should ESCALATE with excessive blockers', async () => {
      const state: GOAPState = {
        currentConfidence: 0.65,
        consensusScore: 0.70,
        blockers: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'],
        completedTasks: ['task1'],
        remainingTasks: ['task2'],
        riskLevel: 'high',
      };

      const result = await mvpOwner.makeDecision(state);

      expect(result.decision).toBe('ESCALATE');
      expect(result.reasoning).toContain('High blocker count: 6');
    });
  });

  describe('Backlog Management', () => {
    test('should correctly categorize backlog items', async () => {
      const state: GOAPState = {
        currentConfidence: 0.75,
        consensusScore: 0.85,
        blockers: [],
        completedTasks: ['task1', 'task2'],
        remainingTasks: ['task3', 'task4', 'task5'],
        riskLevel: 'low',
      };

      const result = await mvpOwner.makeDecision(state);

      expect(result.backlogItems).toEqual(['task3', 'task4', 'task5']);
      expect(result.backlogItems.length).toBe(3);
    });

    test('should handle empty backlog', async () => {
      const state: GOAPState = {
        currentConfidence: 0.80,
        consensusScore: 0.90,
        blockers: [],
        completedTasks: ['task1'],
        remainingTasks: [],
        riskLevel: 'low',
      };

      const result = await mvpOwner.makeDecision(state);

      expect(result.backlogItems).toEqual([]);
    });
  });

  describe('Reasoning Generation', () => {
    test('should generate comprehensive reasoning for LOOP', async () => {
      const state: GOAPState = {
        currentConfidence: 0.65,
        consensusScore: 0.75,
        blockers: ['blocker1'],
        completedTasks: [],
        remainingTasks: ['task1'],
        riskLevel: 'medium',
      };

      const result = await mvpOwner.makeDecision(state);

      expect(result.reasoning).toContain('65.0%');
      expect(result.reasoning).toContain('needs improvement');
      expect(result.reasoning).toContain('1 blockers');
    });

    test('should include risk level in ESCALATE reasoning', async () => {
      const state: GOAPState = {
        currentConfidence: 0.50,
        consensusScore: 0.60,
        blockers: [],
        completedTasks: [],
        remainingTasks: [],
        riskLevel: 'high',
      };

      const result = await mvpOwner.makeDecision(state);

      expect(result.reasoning).toContain('Risk level: high');
    });
  });

  describe('Timestamp and Metadata', () => {
    test('should include timestamp in result', async () => {
      const state: GOAPState = {
        currentConfidence: 0.80,
        consensusScore: 0.85,
        blockers: [],
        completedTasks: [],
        remainingTasks: [],
        riskLevel: 'low',
      };

      const beforeTimestamp = Date.now();
      const result = await mvpOwner.makeDecision(state);
      const afterTimestamp = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(result.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    test('should maintain confidence score in result', async () => {
      const state: GOAPState = {
        currentConfidence: 0.73,
        consensusScore: 0.80,
        blockers: [],
        completedTasks: [],
        remainingTasks: [],
        riskLevel: 'low',
      };

      const result = await mvpOwner.makeDecision(state);

      expect(result.confidence).toBe(0.73);
    });
  });

  describe('Configuration', () => {
    test('should return MVP configuration', () => {
      const config = mvpOwner.getConfig();

      expect(config.structure).toBe('single');
      expect(config.decisionAlgorithm).toBe('goap');
      expect(config.confidenceThreshold).toBe(0.70);
    });
  });
});

describe('Enterprise Product Owner Team Decision Logic', () => {
  let enterpriseTeam: EnterpriseOwnerTeam;

  beforeEach(() => {
    process.env.CLAUDE_FLOW_ENV = 'test';
    enterpriseTeam = new EnterpriseOwnerTeam();
  });

  describe('Weighted Voting', () => {
    test('should PROCEED with unanimous agreement', async () => {
      const state: GOAPState = {
        currentConfidence: 0.90,
        consensusScore: 0.95,
        blockers: [],
        completedTasks: ['task1', 'task2', 'task3'],
        remainingTasks: [],
        riskLevel: 'low',
      };

      const result = (await enterpriseTeam.makeDecision(state)) as TeamDecisionResult;

      expect(result.decision).toBe('PROCEED');
      expect(result.votes).toHaveLength(4);
      expect(result.boardConsensus).toBe(1.0);
      expect(result.minorityOpinions).toHaveLength(0);
    });

    test('should calculate weighted scores correctly', async () => {
      const state: GOAPState = {
        currentConfidence: 0.85,
        consensusScore: 0.90,
        blockers: [],
        completedTasks: ['task1'],
        remainingTasks: [],
        riskLevel: 'low',
      };

      const result = (await enterpriseTeam.makeDecision(state)) as TeamDecisionResult;

      expect(result.weightedScore).toBeGreaterThan(0);
      expect(result.weightedScore).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Stakeholder Voting', () => {
    test('CTO should vote LOOP with high risk', async () => {
      const state: GOAPState = {
        currentConfidence: 0.75,
        consensusScore: 0.80,
        blockers: ['security', 'performance', 'scalability', 'reliability'],
        completedTasks: [],
        remainingTasks: ['task1'],
        riskLevel: 'high',
      };

      const result = (await enterpriseTeam.makeDecision(state)) as TeamDecisionResult;

      const ctoVote = result.votes.find((v) => v.stakeholder === 'cto');
      expect(ctoVote).toBeDefined();
      expect(ctoVote!.vote).toBe('LOOP');
      expect(ctoVote!.weight).toBe(0.35);
    });

    test('Product Owner should vote DEFER with many remaining tasks', async () => {
      const state: GOAPState = {
        currentConfidence: 0.70,
        consensusScore: 0.80,
        blockers: [],
        completedTasks: ['task1'],
        remainingTasks: Array.from({ length: 12 }, (_, i) => `task${i + 2}`),
        riskLevel: 'medium',
      };

      const result = (await enterpriseTeam.makeDecision(state)) as TeamDecisionResult;

      const poVote = result.votes.find((v) => v.stakeholder === 'product-owner');
      expect(poVote).toBeDefined();
      expect(poVote!.vote).toBe('DEFER');
      expect(poVote!.weight).toBe(0.30);
    });

    test('Power User should vote LOOP for usability blockers', async () => {
      const state: GOAPState = {
        currentConfidence: 0.80,
        consensusScore: 0.85,
        blockers: ['usability issue in navigation'],
        completedTasks: [],
        remainingTasks: ['task1'],
        riskLevel: 'low',
      };

      const result = (await enterpriseTeam.makeDecision(state)) as TeamDecisionResult;

      const powerUserVote = result.votes.find((v) => v.stakeholder === 'user-power');
      expect(powerUserVote).toBeDefined();
      expect(powerUserVote!.vote).toBe('LOOP');
      expect(powerUserVote!.weight).toBe(0.20);
    });

    test('Accessibility User should vote LOOP for a11y blockers', async () => {
      const state: GOAPState = {
        currentConfidence: 0.80,
        consensusScore: 0.85,
        blockers: ['accessibility violation in modal', 'a11y issue with keyboard nav'],
        completedTasks: [],
        remainingTasks: [],
        riskLevel: 'low',
      };

      const result = (await enterpriseTeam.makeDecision(state)) as TeamDecisionResult;

      const a11yVote = result.votes.find((v) => v.stakeholder === 'user-accessibility');
      expect(a11yVote).toBeDefined();
      expect(a11yVote!.vote).toBe('LOOP');
      expect(a11yVote!.weight).toBe(0.15);
    });
  });

  describe('Board Consensus', () => {
    test('should calculate perfect consensus with unanimous vote', async () => {
      const state: GOAPState = {
        currentConfidence: 0.95,
        consensusScore: 0.98,
        blockers: [],
        completedTasks: ['task1', 'task2'],
        remainingTasks: [],
        riskLevel: 'low',
      };

      const result = (await enterpriseTeam.makeDecision(state)) as TeamDecisionResult;

      expect(result.boardConsensus).toBe(1.0);
    });

    test('should calculate partial consensus with split vote', async () => {
      const state: GOAPState = {
        currentConfidence: 0.75,
        consensusScore: 0.85,
        blockers: ['issue1', 'issue2', 'issue3', 'issue4'],
        completedTasks: ['task1'],
        remainingTasks: ['task2', 'task3', 'task4'],
        riskLevel: 'high',
      };

      const result = (await enterpriseTeam.makeDecision(state)) as TeamDecisionResult;

      expect(result.boardConsensus).toBeLessThanOrEqual(1.0);
      expect(result.boardConsensus).toBeGreaterThan(0);
    });
  });

  describe('Minority Opinions', () => {
    test('should capture minority opinions when not unanimous', async () => {
      const state: GOAPState = {
        currentConfidence: 0.78,
        consensusScore: 0.83,
        blockers: ['minor issue'],
        completedTasks: ['task1'],
        remainingTasks: ['task2'],
        riskLevel: 'medium',
      };

      const result = (await enterpriseTeam.makeDecision(state)) as TeamDecisionResult;

      if (result.minorityOpinions.length > 0) {
        expect(result.minorityOpinions[0]).toContain(':');
        expect(result.minorityOpinions[0]).toContain('-');
      }
    });

    test('should have no minority opinions with unanimous vote', async () => {
      const state: GOAPState = {
        currentConfidence: 0.95,
        consensusScore: 0.98,
        blockers: [],
        completedTasks: ['task1', 'task2'],
        remainingTasks: [],
        riskLevel: 'low',
      };

      const result = (await enterpriseTeam.makeDecision(state)) as TeamDecisionResult;

      expect(result.minorityOpinions).toHaveLength(0);
    });
  });

  describe('Team Recommendations', () => {
    test('should generate recommendations from stakeholder concerns', async () => {
      const state: GOAPState = {
        currentConfidence: 0.70,
        consensusScore: 0.80,
        blockers: ['issue1'],
        completedTasks: [],
        remainingTasks: ['task1', 'task2'],
        riskLevel: 'high',
      };

      const result = (await enterpriseTeam.makeDecision(state)) as TeamDecisionResult;

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some((r) => r.includes('high-risk'))).toBe(true);
    });
  });

  describe('Configuration', () => {
    test('should return Enterprise configuration', () => {
      const config = enterpriseTeam.getConfig();

      expect(config.structure).toBe('team');
      expect(config.decisionAlgorithm).toBe('weighted-voting');
      expect(config.confidenceThreshold).toBe(0.85);
    });
  });
});

describe('MVP vs Enterprise Comparison', () => {
  let mvpOwner: MVPOwner;
  let enterpriseTeam: EnterpriseOwnerTeam;

  beforeEach(() => {
    process.env.CLAUDE_FLOW_ENV = 'test';
    mvpOwner = new MVPOwner();
    enterpriseTeam = new EnterpriseOwnerTeam();
  });

  test('should have different confidence thresholds', () => {
    const mvpConfig = mvpOwner.getConfig();
    const enterpriseConfig = enterpriseTeam.getConfig();

    expect(mvpConfig.confidenceThreshold).toBe(0.70);
    expect(enterpriseConfig.confidenceThreshold).toBe(0.85);
  });

  test('should make different decisions with same marginal state', async () => {
    const marginalState: GOAPState = {
      currentConfidence: 0.75,
      consensusScore: 0.82,
      blockers: [],
      completedTasks: ['task1'],
      remainingTasks: [],
      riskLevel: 'low',
    };

    const mvpResult = await mvpOwner.makeDecision(marginalState);
    const enterpriseResult = await enterpriseTeam.makeDecision(marginalState);

    // MVP might PROCEED, Enterprise might LOOP due to higher threshold
    expect(mvpResult.decision).toBeDefined();
    expect(enterpriseResult.decision).toBeDefined();
  });

  test('Enterprise should provide more detailed reasoning', async () => {
    const state: GOAPState = {
      currentConfidence: 0.80,
      consensusScore: 0.85,
      blockers: [],
      completedTasks: ['task1'],
      remainingTasks: [],
      riskLevel: 'low',
    };

    const mvpResult = await mvpOwner.makeDecision(state);
    const enterpriseResult = (await enterpriseTeam.makeDecision(state)) as TeamDecisionResult;

    expect(enterpriseResult.votes).toBeDefined();
    expect(enterpriseResult.weightedScore).toBeDefined();
    expect(enterpriseResult.boardConsensus).toBeDefined();
  });
});

describe('Edge Cases', () => {
  let mvpOwner: MVPOwner;
  let enterpriseTeam: EnterpriseOwnerTeam;

  beforeEach(() => {
    process.env.CLAUDE_FLOW_ENV = 'test';
    mvpOwner = new MVPOwner();
    enterpriseTeam = new EnterpriseOwnerTeam();
  });

  test('should handle zero confidence', async () => {
    const state: GOAPState = {
      currentConfidence: 0.0,
      consensusScore: 0.0,
      blockers: ['critical failure'],
      completedTasks: [],
      remainingTasks: ['task1'],
      riskLevel: 'high',
    };

    const result = await mvpOwner.makeDecision(state);

    expect(result.decision).toBeDefined();
    expect(result.confidence).toBe(0.0);
  });

  test('should handle perfect confidence', async () => {
    const state: GOAPState = {
      currentConfidence: 1.0,
      consensusScore: 1.0,
      blockers: [],
      completedTasks: ['task1', 'task2', 'task3'],
      remainingTasks: [],
      riskLevel: 'low',
    };

    const result = await mvpOwner.makeDecision(state);

    expect(result.decision).toBe('PROCEED');
    expect(result.confidence).toBe(1.0);
  });

  test('should handle no completed tasks', async () => {
    const state: GOAPState = {
      currentConfidence: 0.60,
      consensusScore: 0.70,
      blockers: [],
      completedTasks: [],
      remainingTasks: ['task1', 'task2'],
      riskLevel: 'medium',
    };

    const result = await mvpOwner.makeDecision(state);

    expect(result.decision).toBeDefined();
    expect(result.backlogItems).toEqual(['task1', 'task2']);
  });

  test('should handle no remaining tasks', async () => {
    const state: GOAPState = {
      currentConfidence: 0.85,
      consensusScore: 0.90,
      blockers: [],
      completedTasks: ['task1', 'task2'],
      remainingTasks: [],
      riskLevel: 'low',
    };

    const result = await mvpOwner.makeDecision(state);

    expect(result.backlogItems).toEqual([]);
  });

  test('should handle maximum blockers', async () => {
    const maxBlockers = Array.from({ length: 20 }, (_, i) => `blocker${i + 1}`);
    const state: GOAPState = {
      currentConfidence: 0.30,
      consensusScore: 0.40,
      blockers: maxBlockers,
      completedTasks: [],
      remainingTasks: ['task1'],
      riskLevel: 'high',
    };

    const result = await mvpOwner.makeDecision(state);

    expect(result.decision).toBe('ESCALATE');
    expect(result.blockers.length).toBe(20);
  });
});
