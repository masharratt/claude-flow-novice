/**
 * MVP Product Owner (Single Agent)
 *
 * Speed-focused product owner for MVP mode.
 * Single agent with simplified decision criteria.
 *
 * Decision Criteria:
 * - Lower bar for PROCEED (consensus ≥0.80)
 * - Bias toward shipping fast
 * - Technical debt acceptable
 *
 * @module cfn-loop/product-owner/mvp-owner
 */

import type { ConsensusResult, AgentResponse, ProductOwnerDecision } from '../types.js';

/**
 * Execute MVP product owner decision (Loop 4)
 *
 * Simplified decision process:
 * 1. Check consensus score ≥0.80
 * 2. Bias toward PROCEED or DEFER
 * 3. Only ESCALATE on critical issues
 *
 * @param consensusResult - Loop 2 consensus validation result
 * @param primaryResponses - Loop 3 implementation results
 * @returns Product owner decision
 */
export async function executeMVPOwnerDecision(
  consensusResult: ConsensusResult,
  primaryResponses: AgentResponse[]
): Promise<ProductOwnerDecision> {
  // Spawn MVP product owner agent
  const ownerResponse = await spawnMVPOwner(consensusResult, primaryResponses);

  return ownerResponse;
}

/**
 * Spawn MVP product owner agent
 */
async function spawnMVPOwner(
  consensusResult: ConsensusResult,
  primaryResponses: AgentResponse[]
): Promise<ProductOwnerDecision> {
  const decisionContext = prepareDecisionContext(consensusResult, primaryResponses);

  const prompt = `
# MVP Product Owner Decision (Loop 4)

${decisionContext}

**Your Role:** MVP Product Owner (speed-focused)

**Decision Criteria:**

**PROCEED (MVP Ready):**
- Consensus ≥0.80 AND core functionality works
- Basic tests passing
- Critical bugs fixed
- Ready to ship MVP

**DEFER (Ship with Backlog):**
- Consensus ≥0.80 BUT minor issues exist
- Technical debt acceptable for MVP
- Defer optimizations to next iteration
- Ship now, improve later

**ESCALATE (Critical Issues):**
- Consensus <0.80 OR critical bugs
- Core functionality broken
- Security vulnerabilities

**MVP Mindset:** Ship fast, iterate later. Perfect is the enemy of good.

**Output Format (JSON):**
\`\`\`json
{
  "decision": "PROCEED|DEFER|ESCALATE",
  "confidence": 0.0-1.0,
  "reasoning": "MVP decision rationale",
  "backlogItems": ["Item 1", "Item 2"],
  "blockers": ["Blocker 1"],
  "recommendations": ["Recommendation 1"]
}
\`\`\`
`;

  try {
    // TODO: Replace with real Task tool call:
    // const result = await Task("product-owner", prompt, "product-owner");

    // Mock implementation
    const mockDecision = generateMVPOwnerDecision(consensusResult);
    return mockDecision;
  } catch (error) {
    // Fallback on error
    return {
      decision: 'ESCALATE',
      confidence: 0,
      reasoning: 'Product owner spawn failed - escalating for review',
      backlogItems: [],
      blockers: ['Product owner agent spawn failure'],
      recommendations: ['Retry product owner decision'],
      timestamp: Date.now(),
    };
  }
}

/**
 * Generate MVP owner decision (mock)
 */
function generateMVPOwnerDecision(consensusResult: ConsensusResult): ProductOwnerDecision {
  const consensusScore = consensusResult.consensusScore;

  // MVP thresholds (lower than standard)
  if (consensusScore >= 0.85) {
    // High confidence - PROCEED
    return {
      decision: 'PROCEED',
      confidence: consensusScore,
      reasoning: `MVP ready for release. Consensus: ${(consensusScore * 100).toFixed(1)}%. Core functionality validated. Technical debt acceptable for MVP.`,
      backlogItems: [],
      blockers: [],
      recommendations: ['Ship MVP', 'Plan iteration 2 for improvements'],
      timestamp: Date.now(),
    };
  } else if (consensusScore >= 0.80) {
    // Medium confidence - DEFER (ship with backlog)
    return {
      decision: 'DEFER',
      confidence: consensusScore,
      reasoning: `MVP approved with minor issues. Consensus: ${(consensusScore * 100).toFixed(1)}%. Ship now, improve later.`,
      backlogItems: [
        'Refactor complex logic for maintainability',
        'Increase test coverage to 90%',
        'Add comprehensive documentation',
      ],
      blockers: [],
      recommendations: ['Ship MVP', 'Address backlog in next sprint'],
      timestamp: Date.now(),
    };
  } else {
    // Low confidence - ESCALATE
    return {
      decision: 'ESCALATE',
      confidence: consensusScore,
      reasoning: `MVP not ready. Consensus: ${(consensusScore * 100).toFixed(1)}%. Critical issues require attention.`,
      backlogItems: [],
      blockers: [
        'Consensus below MVP threshold (0.80)',
        'Critical functionality incomplete',
      ],
      recommendations: ['Fix critical issues', 'Retry Loop 3'],
      timestamp: Date.now(),
    };
  }
}

/**
 * Prepare decision context for MVP owner
 */
function prepareDecisionContext(
  consensusResult: ConsensusResult,
  primaryResponses: AgentResponse[]
): string {
  return `
# Loop 2 Consensus Results (MVP)
**Consensus Score:** ${(consensusResult.consensusScore * 100).toFixed(1)}%
**Threshold:** ${(consensusResult.consensusThreshold * 100).toFixed(1)}%
**Status:** ${consensusResult.consensusPassed ? 'PASSED' : 'FAILED'}

# Loop 3 Implementation Summary
${primaryResponses
  .map(
    (r, i) => `
${i + 1}. **${r.agentType}** (${r.confidence})
   ${r.reasoning}
`
  )
  .join('\n')}
`;
}

export default {
  executeMVPOwnerDecision,
};
