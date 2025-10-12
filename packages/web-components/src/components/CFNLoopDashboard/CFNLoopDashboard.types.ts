/**
 * CFNLoopDashboard Types
 * Type definitions for CFN Loop monitoring dashboard
 */

export type LoopType = 0 | 1 | 2 | 3 | 4;

export type LoopStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'blocked';

export type ProductOwnerDecision =
  | 'PROCEED'
  | 'DEFER'
  | 'ESCALATE';

export interface ConfidenceScore {
  value: number;
  threshold: number;
  status: 'pass' | 'fail' | 'warning';
  timestamp: string;
}

export interface PhaseProgress {
  phaseId: string;
  phaseName: string;
  currentLoop: LoopType;
  loopStatus: LoopStatus;
  progress: number;
  confidence?: ConfidenceScore;
}

export interface AgentActivity {
  agentId: string;
  agentName: string;
  agentType: string;
  action: string;
  timestamp: string;
  confidence?: number;
  status: 'success' | 'failure' | 'in-progress';
}

export interface ConsensusMetrics {
  validatorCount: number;
  consensusScore: number;
  threshold: number;
  status: 'pass' | 'fail' | 'in-progress';
  validators: Array<{
    agentId: string;
    score: number;
    recommendations: string[];
  }>;
}

export interface LoopMetrics {
  loopType: LoopType;
  loopName: string;
  status: LoopStatus;
  startTime?: string;
  endTime?: string;
  duration?: number;
  confidence?: ConfidenceScore;
  consensus?: ConsensusMetrics;
  retryCount?: number;
  maxRetries?: number;
}

export interface ProductOwnerDecisionInfo {
  decision: ProductOwnerDecision;
  reasoning: string;
  timestamp: string;
  confidence: number;
  nextSteps: string[];
  backlogItems?: string[];
}

export interface CFNLoopState {
  swarmId: string;
  objective: string;
  currentPhase: PhaseProgress;
  loops: LoopMetrics[];
  recentActivity: AgentActivity[];
  productOwnerDecision?: ProductOwnerDecisionInfo;
  overallConfidence: number;
}

export interface CFNLoopDashboardProps {
  /**
   * Current CFN Loop state
   */
  loopState: CFNLoopState;

  /**
   * Callback when phase is selected for details
   */
  onPhaseSelect?: (phaseId: string) => void;

  /**
   * Callback when agent is selected for details
   */
  onAgentSelect?: (agentId: string) => void;

  /**
   * Show detailed metrics
   * @default false
   */
  showDetailedMetrics?: boolean;

  /**
   * Maximum number of activities to display
   * @default 10
   */
  maxActivities?: number;

  /**
   * Auto-refresh interval in milliseconds
   * @default undefined (no auto-refresh)
   */
  refreshInterval?: number;

  /**
   * Callback when refresh is triggered
   */
  onRefresh?: () => void;

  /**
   * Component className
   */
  className?: string;

  /**
   * Component test ID
   */
  'data-testid'?: string;
}

export interface LoopStepConfig {
  loopType: LoopType;
  label: string;
  description: string;
  icon: React.ReactNode;
}
