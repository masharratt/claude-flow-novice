// Stub: CLI decision parser
// Created to satisfy test imports

export type DecisionType = 'PROCEED' | 'ITERATE' | 'ABORT';

export interface CLIDecision {
  decision: DecisionType;
  exitCode: number;
  message: string;
}

export function parseDecisionCLI(args: string[]): CLIDecision {
  // Stub implementation
  const decision = args[0]?.toUpperCase() as DecisionType || 'ABORT';

  return {
    decision,
    exitCode: decision === 'PROCEED' ? 0 : decision === 'ITERATE' ? 1 : 2,
    message: `Decision: ${decision}`,
  };
}

export class DecisionCLIParser {
  parse(args: string[]): CLIDecision {
    return parseDecisionCLI(args);
  }
}
