/**
 * Gate Check Helper - Test-Driven Validation
 * Validates Loop 3 self-assessment against test pass rate thresholds
 */

import { getModeConfig, OrchestratorMode } from '../../../../../../../src/planning/orchestration/mode-config';

export type Mode = OrchestratorMode;

export interface GateCheckParams {
  passRate: number;
  threshold?: number | undefined;
  mode: Mode;
}

export interface GateCheckResult {
  passed: boolean;
  passRate: number;
  threshold: number;
  mode: Mode;
  gap: number;
  reason: string;
}

/**
 * Get threshold for a specific mode
 */
export function getModeThreshold(mode: Mode): number {
  return getModeConfig(mode).gateThreshold;
}

/**
 * Perform gate check
 */
export function gateCheck(params: GateCheckParams): GateCheckResult {
  const { passRate, mode } = params;

  // Use custom threshold if provided, otherwise use mode-specific
  const threshold = params.threshold !== undefined ? params.threshold : getModeThreshold(mode);

  // Determine if gate passed
  const passed = passRate >= threshold;

  // Calculate gap (threshold - passRate)
  // Positive gap = need improvement (failing)
  // Zero gap = exactly at threshold
  // Negative gap = exceeded threshold (passing)
  const gap = parseFloat((threshold - passRate).toFixed(4));

  // Generate reason
  const reason = passed
    ? `Gate PASSED: Pass rate ${passRate.toFixed(4)} >= threshold ${threshold.toFixed(4)} (${mode} mode)`
    : `Gate FAILED: Pass rate ${passRate.toFixed(4)} < threshold ${threshold.toFixed(4)} (${mode} mode)`;

  return {
    passed,
    passRate,
    threshold,
    mode,
    gap,
    reason,
  };
}

/**
 * CLI entry point for bash wrapper
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  // Parse command line arguments
  let passRate = 0;
  let threshold: number | undefined = undefined;
  let mode: Mode = 'standard';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    switch (arg) {
      case '--pass-rate': {
        const nextArg = args[++i];
        if (nextArg) passRate = parseFloat(nextArg);
        break;
      }
      case '--threshold': {
        const nextArg = args[++i];
        if (nextArg) threshold = parseFloat(nextArg);
        break;
      }
      case '--mode': {
        const nextArg = args[++i];
        if (nextArg) mode = nextArg as Mode;
        break;
      }
    }
  }

  const params: GateCheckParams = { passRate, mode };
  if (threshold !== undefined) {
    params.threshold = threshold;
  }

  const result = gateCheck(params);

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}
