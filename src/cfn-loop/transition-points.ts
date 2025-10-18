export enum CFNTransitionPoint {
  LOOP_2_START = 'LOOP_2_START', // Before validator spawn
  LOOP_3_RELAUNCH = 'LOOP_3_RELAUNCH', // Before worker re-spawn on LOOP decision
  LOOP_4_DECISION = 'LOOP_4_DECISION', // Before Product Owner decision
  PHASE_TRANSITION = 'PHASE_TRANSITION', // Between phases in epic/sprint
}

export interface TransitionContext {
  point: CFNTransitionPoint;
  phaseId: string;
  mode: 'mvp' | 'standard' | 'enterprise';
  iteration: number;
  lastConsensus?: number;
  concerns?: string[];
  maxIterations: number;
  consensusThreshold: number;
}

export const INJECTION_CONFIG: Record<
  CFNTransitionPoint,
  {
    targetAudience: string;
    includeIterationHistory: boolean;
    includeDecisionReminder: boolean;
  }
> = {
  [CFNTransitionPoint.LOOP_2_START]: {
    targetAudience: 'validators',
    includeIterationHistory: false,
    includeDecisionReminder: false,
  },
  [CFNTransitionPoint.LOOP_3_RELAUNCH]: {
    targetAudience: 'workers',
    includeIterationHistory: true,
    includeDecisionReminder: true,
  },
  [CFNTransitionPoint.LOOP_4_DECISION]: {
    targetAudience: 'product-owner',
    includeIterationHistory: true,
    includeDecisionReminder: true,
  },
  [CFNTransitionPoint.PHASE_TRANSITION]: {
    targetAudience: 'coordinator',
    includeIterationHistory: false,
    includeDecisionReminder: false,
  },
};
