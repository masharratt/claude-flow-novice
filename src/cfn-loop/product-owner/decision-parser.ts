import type { Decision } from './types.js';

export type DecisionType = 'PROCEED' | 'ITERATE' | 'ABORT';

export interface ParsedDecision {
  decision: DecisionType;
  confidence: number;
  reasoning: string;
  recommendations: string[];
  deliverables: string[];
  validationErrors: string[];
  auditAnalysis?: string;
  agentPerformanceObservations?: string;
  raw: {
    fullOutput: string;
    decisionLine?: string;
  };
}

export interface DecisionParserOptions {
  strict?: boolean;
  validateDeliverables?: boolean;
  taskContext?: string;
}

export class DecisionParserError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'DecisionParserError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, DecisionParserError.prototype);
  }
}

const DECISION_KEYWORDS: DecisionType[] = ['PROCEED', 'ITERATE', 'ABORT'];
const GOAP_TO_DECISION: Record<string, DecisionType> = {
  LOOP: 'ITERATE',
  ESCALATE: 'ABORT',
  DEFER: 'ITERATE',
};

export class DecisionParser {
  private readonly strict: boolean;
  private readonly validateDeliverables: boolean;
  private readonly taskContext?: string;

  constructor(options: DecisionParserOptions = {}) {
    this.strict = options.strict ?? false;
    this.validateDeliverables = options.validateDeliverables ?? false;
    this.taskContext = options.taskContext;
  }

  parse(output: string): ParsedDecision {
    if (output === null || output === undefined || typeof output !== 'string') {
      throw new DecisionParserError('Input must be a string', 'INVALID_INPUT', { received: typeof output });
    }
    if (output.trim() === '' && this.strict) {
      throw new DecisionParserError('Empty input', 'NO_DECISION_FOUND', { input: output });
    }

    const decision = this.extractDecision(output);
    const decisionLine = this.extractDecisionLine(output, decision);
    const confidence = this.extractConfidence(output);
    const reasoning = this.extractReasoning(output);
    const deliverables = this.extractDeliverables(output);
    const auditAnalysis = this.extractSection(output, 'Audit Analysis');
    const agentPerformanceObservations = this.extractSection(output, 'Agent Performance');

    const validationErrors = this.validate(decision, confidence, reasoning);

    return {
      decision,
      confidence,
      reasoning,
      recommendations: [],
      deliverables,
      validationErrors,
      auditAnalysis,
      agentPerformanceObservations,
      raw: { fullOutput: output, decisionLine },
    };
  }

  private extractDecision(output: string): DecisionType {
    // 1. Labeled "Decision: KEYWORD" takes priority
    const labeledMatch = output.match(/decision:\s*(\w+)/i);
    if (labeledMatch) {
      const kw = labeledMatch[1]!.toUpperCase();
      if (DECISION_KEYWORDS.includes(kw as DecisionType)) return kw as DecisionType;
      if (kw in GOAP_TO_DECISION) return GOAP_TO_DECISION[kw]!;
    }

    // 2. Parenthesised "(KEYWORD)"
    const parenMatch = output.match(/\((\w+)\)/);
    if (parenMatch) {
      const kw = parenMatch[1]!.toUpperCase();
      if (DECISION_KEYWORDS.includes(kw as DecisionType)) return kw as DecisionType;
      if (kw in GOAP_TO_DECISION) return GOAP_TO_DECISION[kw]!;
    }

    // 3. JSON {"decision": "KEYWORD"}
    const jsonDecision = this.tryJsonDecision(output);
    if (jsonDecision) return jsonDecision;

    // 4. First occurrence of any keyword as standalone word
    const upper = output.toUpperCase();
    const allKeywords: Array<{ index: number; mapped: DecisionType }> = [];

    for (const kw of DECISION_KEYWORDS) {
      const re = new RegExp(`\\b${kw}\\b`);
      const m = upper.match(re);
      if (m?.index !== undefined) allKeywords.push({ index: m.index, mapped: kw });
    }
    for (const [kw, mapped] of Object.entries(GOAP_TO_DECISION)) {
      const re = new RegExp(`\\b${kw}\\b`);
      const m = upper.match(re);
      if (m?.index !== undefined) allKeywords.push({ index: m.index, mapped });
    }

    allKeywords.sort((a, b) => a.index - b.index);

    if (allKeywords.length > 0) {
      return allKeywords[0]!.mapped;
    }

    if (this.strict) {
      throw new DecisionParserError('No decision found in output', 'NO_DECISION_FOUND', { output });
    }
    return 'ITERATE';
  }

  private tryJsonDecision(output: string): DecisionType | null {
    const jsonMatch = output.match(/\{[^}]+\}/s);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const d = (parsed['decision'] as string | undefined)?.toUpperCase();
      if (!d) return null;
      if (DECISION_KEYWORDS.includes(d as DecisionType)) return d as DecisionType;
      if (d in GOAP_TO_DECISION) return GOAP_TO_DECISION[d]!;
    } catch {
      // not valid json
    }
    return null;
  }

  private extractDecisionLine(output: string, decision: DecisionType): string | undefined {
    const lines = output.split('\n');
    return lines.find((l) => l.toUpperCase().includes(decision));
  }

  private extractConfidence(output: string): number {
    const jsonMatch = output.match(/\{[^}]+\}/s);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        const c = parsed['confidence'];
        if (typeof c === 'number') return Math.min(1, Math.max(0, c));
      } catch { /* ignore */ }
    }

    const pctMatch = output.match(/confidence:\s*([\d.]+)%/i);
    if (pctMatch) {
      const v = parseFloat(pctMatch[1]!) / 100;
      return Math.min(1, Math.max(0, v));
    }

    const numMatch = output.match(/confidence:\s*([\d.]+)/i);
    if (numMatch) {
      const v = parseFloat(numMatch[1]!);
      return Math.min(1, Math.max(0, v));
    }

    return 0.75;
  }

  private extractReasoning(output: string): string {
    const jsonMatch = output.match(/\{[^}]+\}/s);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        const r = parsed['reasoning'] ?? parsed['reason'];
        if (typeof r === 'string') return r;
      } catch { /* ignore */ }
    }

    const labelMatch = output.match(/(?:reasoning|because):\s*(.+?)(?=\n(?:[A-Z][a-zA-Z]+:)|\n\n|$)/is);
    if (labelMatch) return labelMatch[1]!.trim();

    return '';
  }

  private extractDeliverables(output: string): string[] {
    const jsonMatch = output.match(/\{[^}]+\}/s);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        const d = parsed['deliverables'];
        if (Array.isArray(d)) return d.map(String);
      } catch { /* ignore */ }
    }

    const sectionMatch = output.match(/deliverables:\s*\n((?:\s*[-*•].+\n?)+)/i);
    if (!sectionMatch) return [];

    const lines = sectionMatch[1]!
      .split('\n')
      .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
      .filter((l) => l.length > 0);

    return [...new Set(lines)];
  }

  private extractSection(output: string, label: string): string | undefined {
    const re = new RegExp(`${label}:\\s*(.+?)(?=\\n[A-Z][a-zA-Z ]+:|\\n\\n|$)`, 'is');
    const match = output.match(re);
    return match ? match[1]!.trim() : undefined;
  }

  private validate(decision: DecisionType, confidence: number, reasoning: string): string[] {
    const errors: string[] = [];

    if ((decision === 'ITERATE' || decision === 'ABORT') && !reasoning) {
      errors.push('ITERATE/ABORT decision requires reasoning');
    }

    if (decision === 'ABORT' && confidence > 0.7) {
      errors.push('ABORT with high confidence is unusual — verify intent');
    }

    if (decision === 'PROCEED' && confidence < 0.7) {
      errors.push('PROCEED with low confidence — verify threshold');
    }

    if (this.taskContext && this.validateDeliverables) {
      const isImplementationTask = /create|implement|build|write|add/i.test(this.taskContext);
      if (isImplementationTask) {
        // vapor check placeholder — full check requires git status at runtime
      }
    }

    return errors;
  }
}

export async function parseDecision(
  output: string,
  options?: DecisionParserOptions,
): Promise<ParsedDecision> {
  return new DecisionParser(options).parse(output);
}

export function toOrchestratorDecision(internal: Decision): DecisionType {
  switch (internal) {
    case 'PROCEED':  return 'PROCEED';
    case 'LOOP':     return 'ITERATE';
    case 'DEFER':    return 'ITERATE';
    case 'ESCALATE': return 'ABORT';
  }
}
