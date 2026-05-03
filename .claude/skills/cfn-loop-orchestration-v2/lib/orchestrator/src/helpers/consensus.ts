/**
 * Consensus Collection and Validation
 * Collects Loop 2 validator scores and validates against thresholds
 */

import { getModeConfig, OrchestratorMode } from '../../../../../../../src/planning/orchestration/mode-config';

export interface ConsensusResult {
  scores: number[];
  average: number;
  count: number;
  min: number;
  max: number;
}

export interface ConsensusValidation {
  passed: boolean;
  average: number;
  threshold: number;
  mode: string;
  gap: number;
}

export type Mode = OrchestratorMode;

/**
 * Collects consensus scores from multiple validators
 * @param scores Array of validator confidence scores (0.0-1.0)
 * @returns ConsensusResult with statistics
 */
export function collectConsensus(scores: number[]): ConsensusResult {
  if (!scores || scores.length === 0) {
    throw new Error('No consensus scores provided');
  }

  // Validate all scores are in valid range
  for (const score of scores) {
    if (score < 0 || score > 1.0) {
      throw new Error(`Invalid consensus score: ${score} (must be 0.0-1.0)`);
    }
  }

  // Calculate statistics
  const sum = scores.reduce((acc, score) => acc + score, 0);
  const average = sum / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  return {
    scores,
    average,
    count: scores.length,
    min,
    max
  };
}

/**
 * Validates consensus against mode-specific threshold
 * @param params Validation parameters
 * @returns ConsensusValidation result
 */
export function validateConsensus(params: {
  average: number;
  threshold?: number | undefined;
  mode: Mode | string;
}): ConsensusValidation {
  // Use explicit threshold if provided, otherwise use mode default
  const modeConfig = getModeConfig(params.mode as OrchestratorMode);
  const threshold = params.threshold !== undefined
    ? params.threshold
    : (modeConfig ? modeConfig.consensusThreshold : 0.90);

  const passed = params.average >= threshold;
  const gap = params.average - threshold;

  return {
    passed,
    average: params.average,
    threshold,
    mode: params.mode,
    gap
  };
}
