export type RecoveryAction =
  | 'retry_with_backoff'
  | 'allocate_resources'
  | 'repair_docker_env'
  | 'switch_to_fallback_agent'
  | 'escalate_to_operator'
  | 'skip_task';

export interface ErrorRecoveryContext {
  errorType: string;
  attemptCount: number;
  budgetExhausted: boolean;
  circuitOpen: boolean;
  resourceAvailable: boolean;
  fallbackAvailable: boolean;
  maxAttempts?: number;
  escalateToOperatorCost?: number;
}

export interface RecoveryPlan {
  action: RecoveryAction;
  cost: number;
  reachable: boolean;
}
