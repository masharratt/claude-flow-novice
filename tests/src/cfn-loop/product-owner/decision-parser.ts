// Stub: CFN Loop product owner decision parser
// Created to satisfy test imports

export type DecisionType = 'PROCEED' | 'ITERATE' | 'ABORT';

export interface ParsedDecision {
  decision: DecisionType;
  confidence: number;
  reasoning: string;
  recommendations?: string[];
}

export class DecisionParser {
  parse(output: string): ParsedDecision {
    // Stub implementation - basic parsing
    const upperOutput = output.toUpperCase();

    if (upperOutput.includes('PROCEED')) {
      return {
        decision: 'PROCEED',
        confidence: 0.9,
        reasoning: 'Parsed from output',
      };
    }

    if (upperOutput.includes('ITERATE')) {
      return {
        decision: 'ITERATE',
        confidence: 0.85,
        reasoning: 'Parsed from output',
      };
    }

    return {
      decision: 'ABORT',
      confidence: 0.7,
      reasoning: 'Default decision',
    };
  }
}

export function parseDecision(output: string): ParsedDecision {
  const parser = new DecisionParser();
  return parser.parse(output);
}
