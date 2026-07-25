/**
 * Timeout Calculator
 * Calculates mode and phase-specific timeouts for agent execution
 */

export type Mode = 'mvp' | 'standard' | 'enterprise';

const BASE_TIMEOUTS: Record<Mode, number> = {
  mvp: 1800,       // 30 minutes
  standard: 3600,  // 60 minutes
  enterprise: 7200 // 120 minutes
};

const PHASE_MULTIPLIERS: Record<string, number> = {
  'phase-1': 1.0,   // Backend work
  'phase-2': 1.5,   // React components
  'phase-3': 2.0,   // Advanced components
  'phase-4': 1.0    // Testing/integration
};

/**
 * Calculates timeout based on mode and optional phase
 * @param params Mode and optional phase identifier
 * @returns Timeout in seconds
 */
export function calculateTimeout(params: {
  mode: Mode;
  phase?: string;
}): number {
  const baseTimeout = BASE_TIMEOUTS[params.mode] || BASE_TIMEOUTS.standard;

  if (!params.phase) {
    return baseTimeout;
  }

  // Normalize phase to lowercase for case-insensitive matching
  const normalizedPhase = params.phase.toLowerCase();
  const multiplier = PHASE_MULTIPLIERS[normalizedPhase] || 1.0;

  return Math.floor(baseTimeout * multiplier);
}
