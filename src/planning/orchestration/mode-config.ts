export interface ModeConfig {
  gateThreshold: number;
  consensusThreshold: number;
  maxIterations: number;
  validatorCount: number;
}

export type OrchestratorMode = 'mvp' | 'standard' | 'enterprise';

export const MODE_CONFIGS: Record<OrchestratorMode, ModeConfig> = {
  mvp:        { gateThreshold: 0.70, consensusThreshold: 0.80, maxIterations: 5,  validatorCount: 2 },
  standard:   { gateThreshold: 0.95, consensusThreshold: 0.90, maxIterations: 10, validatorCount: 3 },
  enterprise: { gateThreshold: 0.98, consensusThreshold: 0.95, maxIterations: 15, validatorCount: 5 },
};

export function getModeConfig(mode: OrchestratorMode): ModeConfig {
  return MODE_CONFIGS[mode];
}
