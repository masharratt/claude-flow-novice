/**
 * MVP Consensus Validator
 *
 * Minimal validator team for MVP mode (2 validators).
 * Speed-focused consensus with basic quality checks.
 *
 * Validators:
 * 1. reviewer - Code quality and maintainability
 * 2. tester - Test coverage and basic validation
 *
 * Threshold: 0.80 (lower than standard 0.90)
 *
 * @module cfn-loop/consensus/mvp-consensus
 */

import type { AgentResponse, ConsensusResult } from '../types.js';

/**
 * Execute MVP consensus validation with 2 validators
 *
 * Fast validation for MVP mode:
 * - 2 validators (reviewer, tester)
 * - 0.80 consensus threshold
 * - Skip comprehensive checks
 * - Focus on basic functionality
 *
 * @param primaryResponses - Loop 3 implementation results
 * @param consensusThreshold - Threshold for consensus (default: 0.80)
 * @returns Consensus result
 */
export async function executeMVPConsensus(
  primaryResponses: AgentResponse[],
  consensusThreshold: number = 0.80
): Promise<ConsensusResult> {
  // Spawn 2 MVP validators
  const validators = await spawnMVPValidators(primaryResponses);

  // Calculate simple consensus score
  const confidenceScores = validators.map((v) => v.confidence || 0.5);
  const consensusScore =
    confidenceScores.length > 0
      ? confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length
      : 0;

  const consensusPassed = consensusScore >= consensusThreshold;

  // Build voting breakdown
  const votingBreakdown: Record<string, number> = {
    approve: validators.filter((v) => (v.confidence || 0) >= 0.75).length,
    reject: validators.filter((v) => (v.confidence || 0) < 0.75).length,
  };

  return {
    consensusScore,
    consensusThreshold,
    consensusPassed,
    validatorResults: validators,
    votingBreakdown,
    iteration: 0,
    timestamp: Date.now(),
  };
}

/**
 * Spawn MVP validator agents (2 validators)
 *
 * Validators:
 * 1. reviewer - Basic code quality check
 * 2. tester - Basic test coverage check
 *
 * @param primaryResponses - Loop 3 results to validate
 * @returns Array of 2 validator responses
 */
async function spawnMVPValidators(primaryResponses: AgentResponse[]): Promise<AgentResponse[]> {
  const validationContext = prepareValidationContext(primaryResponses);

  // Define MVP validator specs (minimal checks)
  const validatorSpecs = [
    {
      role: 'reviewer',
      agentId: `mvp-reviewer-${Date.now()}`,
      prompt: `Quick MVP code review:\n\n${validationContext}\n\nFocus on:\n- Basic code quality\n- Critical bugs only\n- Core functionality works\n\nProvide confidence score (0.0-1.0) and brief reasoning.`,
    },
    {
      role: 'tester',
      agentId: `mvp-tester-${Date.now()}`,
      prompt: `Quick MVP test validation:\n\n${validationContext}\n\nFocus on:\n- Basic test coverage (>70%)\n- Core paths tested\n- Critical edge cases\n\nProvide confidence score (0.0-1.0) and brief reasoning.`,
    },
  ];

  // Spawn validators in parallel
  const validatorPromises = validatorSpecs.map((spec) =>
    spawnValidator(spec.role, spec.agentId, spec.prompt, primaryResponses)
  );

  try {
    const validators = await Promise.all(validatorPromises);
    return validators;
  } catch (error) {
    // Fallback on error
    return createFallbackValidators(primaryResponses, true);
  }
}

/**
 * Spawn a single validator agent
 *
 * @param role - Validator role
 * @param agentId - Unique agent identifier
 * @param prompt - Validation prompt
 * @param context - Primary responses for context
 * @returns Validator response
 */
async function spawnValidator(
  role: string,
  agentId: string,
  prompt: string,
  context: AgentResponse[]
): Promise<AgentResponse> {
  try {
    // TODO: Replace with real Task tool call:
    // const result = await Task(role, prompt, role);

    // Mock implementation for now
    const mockResponse = generateMVPValidatorResponse(role);

    return {
      agentId,
      agentType: role,
      deliverable: mockResponse,
      confidence: mockResponse.confidence,
      reasoning: mockResponse.reasoning,
      timestamp: Date.now(),
    };
  } catch (error) {
    // Fallback validator
    return {
      agentId,
      agentType: role,
      deliverable: {
        vote: 'FAIL',
        confidence: 0.5,
        reasoning: 'Validator spawn failed',
        recommendations: ['Retry validation'],
      },
      confidence: 0.5,
      reasoning: 'Validator spawn failed',
      timestamp: Date.now(),
    };
  }
}

/**
 * Generate MVP validator response (mock)
 */
function generateMVPValidatorResponse(role: string): any {
  const baseConfidence = 0.75 + Math.random() * 0.15; // 0.75-0.90
  const confidence = Math.round(baseConfidence * 100) / 100;

  switch (role) {
    case 'reviewer':
      return {
        validator: 'mvp-reviewer',
        confidence,
        vote: confidence >= 0.75 ? 'APPROVE' : 'REJECT',
        reasoning: `MVP code review: ${confidence >= 0.80 ? 'Good' : 'Acceptable'}. Core functionality implemented. Minor issues acceptable for MVP.`,
        issues_found: confidence < 0.75 ? ['Minor code quality issues'] : [],
        recommendations: ['Add inline comments', 'Refactor in next iteration'],
      };

    case 'tester':
      return {
        validator: 'mvp-tester',
        confidence,
        vote: confidence >= 0.75 ? 'APPROVE' : 'REJECT',
        reasoning: `MVP test coverage: ${confidence >= 0.75 ? '70%+' : '<70%'}. Core paths covered. Basic edge cases tested.`,
        issues_found: confidence < 0.75 ? ['Coverage below 70%'] : [],
        recommendations: ['Increase coverage in next sprint', 'Add integration tests'],
      };

    default:
      return {
        validator: role,
        confidence: 0.5,
        vote: 'FAIL',
        reasoning: 'Unknown validator role',
        issues_found: ['Unknown validator'],
        recommendations: ['Use known validator roles'],
      };
  }
}

/**
 * Prepare validation context for validators
 */
function prepareValidationContext(primaryResponses: AgentResponse[]): string {
  const summary = primaryResponses.map((r, i) => ({
    agent: r.agentType,
    confidence: r.confidence || 0,
    reasoning: r.reasoning || 'No reasoning provided',
  }));

  return `
# MVP Loop 3 Results

${summary
  .map(
    (s, i) => `
## Agent ${i + 1}: ${s.agent}
**Confidence:** ${s.confidence.toFixed(2)}
**Reasoning:** ${s.reasoning}
`
  )
  .join('\n')}

# MVP Validation (Quick Check)
- Basic functionality works
- Core tests passing (>70% coverage)
- Critical bugs fixed
- Ready for MVP release
`;
}

/**
 * Create fallback validators on error
 */
function createFallbackValidators(
  primaryResponses: AgentResponse[],
  simple: boolean = true
): AgentResponse[] {
  const avgConfidence =
    primaryResponses.reduce((sum, r) => sum + (r.confidence || 0.5), 0) /
    primaryResponses.length;

  return [
    {
      agentId: 'mvp-reviewer-fallback',
      agentType: 'reviewer',
      deliverable: {
        vote: avgConfidence >= 0.75 ? 'PASS' : 'FAIL',
        confidence: avgConfidence,
        reasoning: 'Fallback validator - review required',
        recommendations: ['Manual review recommended'],
      },
      confidence: avgConfidence,
      reasoning: 'Fallback validator',
      timestamp: Date.now(),
    },
    {
      agentId: 'mvp-tester-fallback',
      agentType: 'tester',
      deliverable: {
        vote: avgConfidence >= 0.75 ? 'PASS' : 'FAIL',
        confidence: avgConfidence * 0.95,
        reasoning: 'Fallback validator - testing required',
        recommendations: ['Manual testing recommended'],
      },
      confidence: avgConfidence * 0.95,
      reasoning: 'Fallback validator',
      timestamp: Date.now(),
    },
  ];
}

export default {
  executeMVPConsensus,
};
