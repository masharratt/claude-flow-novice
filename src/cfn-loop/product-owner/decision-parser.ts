/**
 * Product Owner Decision Parser
 * Parses Product Owner agent output to extract decision, reasoning, and validation
 *
 * Prevents "consensus on vapor" (claiming completion without deliverables)
 * Handles multiple output formats with robust fallback patterns
 */

import { promises as fs } from 'fs';
import { execSync } from 'child_process';

/**
 * Parsed decision from Product Owner output
 */
export interface ParsedDecision {
  decision: 'PROCEED' | 'ITERATE' | 'ABORT';
  reasoning: string;
  deliverables: string[];
  confidence: number;
  validationErrors: string[];
  auditAnalysis?: string;
  agentPerformanceObservations?: string;
  raw: {
    fullOutput: string;
    decisionLine?: string;
  };
}

/**
 * Decision Parser Options
 */
export interface DecisionParserOptions {
  strict?: boolean;
  validateDeliverables?: boolean;
  taskContext?: string;
  taskId?: string;
}

/**
 * Decision Parser Error
 */
export class DecisionParserError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'DecisionParserError';
  }
}

/**
 * Parse Product Owner output and extract decision
 */
export class DecisionParser {
  private strict: boolean;
  private validateDeliverables: boolean;
  private taskContext?: string;
  private taskId?: string;

  constructor(options: DecisionParserOptions = {}) {
    this.strict = options.strict ?? true;
    this.validateDeliverables = options.validateDeliverables ?? true;
    this.taskContext = options.taskContext;
    this.taskId = options.taskId;
  }

  /**
   * Parse decision from text output
   */
  public parse(output: string): ParsedDecision {
    if (!output || typeof output !== 'string') {
      throw new DecisionParserError(
        'Invalid output: must be non-empty string',
        'INVALID_OUTPUT'
      );
    }

    const decision = this.extractDecision(output);
    const reasoning = this.extractReasoning(output);
    const confidence = this.extractConfidence(output);
    const deliverables = this.extractDeliverables(output);
    const auditAnalysis = this.extractAuditAnalysis(output);
    const agentPerformanceObservations = this.extractAgentPerformance(output);

    // Validate decision
    const validationErrors = this.validateDecision(
      decision,
      reasoning,
      deliverables,
      confidence
    );

    // Prevent "consensus on vapor"
    if (decision === 'PROCEED' && this.validateDeliverables) {
      const vapourCheck = this.checkConsensusOnVapor(output, deliverables);
      if (vapourCheck.isVapor) {
        validationErrors.push(...vapourCheck.errors);
        if (this.strict) {
          return {
            decision: 'ITERATE',
            reasoning: `Override PROCEED → ITERATE: ${vapourCheck.errors.join('; ')}`,
            deliverables: [],
            confidence: Math.min(confidence, 0.7),
            validationErrors: vapourCheck.errors,
            raw: {
              fullOutput: output,
              decisionLine: this.findDecisionLine(output)
            }
          };
        }
      }
    }

    return {
      decision,
      reasoning: reasoning || 'No reasoning provided',
      deliverables,
      confidence,
      validationErrors,
      auditAnalysis,
      agentPerformanceObservations,
      raw: {
        fullOutput: output,
        decisionLine: this.findDecisionLine(output)
      }
    };
  }

  /**
   * Parse decision from file
   */
  public async parseFile(filePath: string): Promise<ParsedDecision> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parse(content);
    } catch (error) {
      throw new DecisionParserError(
        `Failed to read decision file: ${filePath}`,
        'FILE_READ_ERROR',
        { originalError: String(error) }
      );
    }
  }

  /**
   * Extract decision keyword (PROCEED, ITERATE, ABORT)
   * Multiple fallback patterns for robustness
   */
  private extractDecision(output: string): 'PROCEED' | 'ITERATE' | 'ABORT' {
    // Pattern 1: Explicit "Decision: PROCEED"
    let match = output.match(/Decision:\s*(PROCEED|ITERATE|ABORT)/i);
    if (match) {
      return match[1].toUpperCase() as 'PROCEED' | 'ITERATE' | 'ABORT';
    }

    // Pattern 2: Standalone keyword at start of line
    match = output.match(/^(PROCEED|ITERATE|ABORT)/im);
    if (match) {
      return match[1].toUpperCase() as 'PROCEED' | 'ITERATE' | 'ABORT';
    }

    // Pattern 3: Decision in parentheses
    match = output.match(/\((PROCEED|ITERATE|ABORT)\)/i);
    if (match) {
      return match[1].toUpperCase() as 'PROCEED' | 'ITERATE' | 'ABORT';
    }

    // Pattern 4: JSON format
    try {
      const jsonMatch = output.match(/\{[\s\S]*?"decision"\s*:\s*"(PROCEED|ITERATE|ABORT)"[\s\S]*?\}/i);
      if (jsonMatch) {
        const json = JSON.parse(jsonMatch[0]);
        if (json.decision && /^(PROCEED|ITERATE|ABORT)$/i.test(json.decision)) {
          return json.decision.toUpperCase() as 'PROCEED' | 'ITERATE' | 'ABORT';
        }
      }
    } catch {
      // JSON parse failed, continue to next pattern
    }

    // Pattern 5: First occurrence of keyword (case-insensitive)
    const keywords = output.match(/\b(PROCEED|ITERATE|ABORT)\b/i);
    if (keywords) {
      return keywords[1].toUpperCase() as 'PROCEED' | 'ITERATE' | 'ABORT';
    }

    // Default: No decision found
    if (this.strict) {
      throw new DecisionParserError(
        'Could not extract decision from Product Owner output',
        'NO_DECISION_FOUND',
        { availablePatterns: ['Decision:', 'Standalone keyword', 'Parentheses', 'JSON', 'First keyword'] }
      );
    }

    // Non-strict: default to ITERATE (safe fallback)
    return 'ITERATE';
  }

  /**
   * Extract reasoning explanation
   */
  private extractReasoning(output: string): string {
    // Pattern 1: Explicit "Reasoning: ..."
    let match = output.match(/Reasoning:\s*(.+?)(?:\n[A-Z]|\$|$)/i);
    if (match) {
      return match[1].trim();
    }

    // Pattern 2: "Because" or "Explanation"
    match = output.match(/(?:Because|Explanation):\s*(.+?)(?:\n[A-Z]|\$|$)/i);
    if (match) {
      return match[1].trim();
    }

    // Pattern 3: JSON format
    try {
      const jsonMatch = output.match(/\{[\s\S]*?"reasoning"\s*:\s*"(.+?)"[\s\S]*?\}/i);
      if (jsonMatch) {
        const json = JSON.parse(jsonMatch[0]);
        if (json.reasoning) {
          return json.reasoning;
        }
      }
    } catch {
      // JSON parse failed
    }

    // Pattern 4: Extract paragraph after decision
    const decisionIndex = output.search(/Decision:|PROCEED|ITERATE|ABORT/i);
    if (decisionIndex !== -1) {
      const afterDecision = output.substring(decisionIndex + 20);
      match = afterDecision.match(/(.{20,500}?)(?:\n\n|Confidence|$)/);
      if (match) {
        return match[1].trim();
      }
    }

    return '';
  }

  /**
   * Extract confidence score
   */
  private extractConfidence(output: string): number {
    // Pattern 1: Confidence as percentage (check first, more specific)
    let match = output.match(/Confidence:\s*(\d+)%/i);
    if (match) {
      return parseFloat(match[1]) / 100;
    }

    // Pattern 2: "Confidence: 0.95" (decimal, must not be followed by %)
    match = output.match(/Confidence:\s*(0?\.[0-9]+|[0-9]+\.[0-9]+)/i);
    if (match) {
      const value = parseFloat(match[1]);
      return Math.min(Math.max(value, 0), 1); // Clamp to 0-1
    }

    // Pattern 3: JSON format
    try {
      const jsonMatch = output.match(/\{[\s\S]*?"confidence"\s*:\s*([0-9.]+)[\s\S]*?\}/i);
      if (jsonMatch) {
        const json = JSON.parse(jsonMatch[0]);
        if (typeof json.confidence === 'number') {
          return Math.min(Math.max(json.confidence, 0), 1);
        }
      }
    } catch {
      // JSON parse failed
    }

    // Default: moderate confidence
    return 0.75;
  }

  /**
   * Extract deliverables mentioned in output
   */
  private extractDeliverables(output: string): string[] {
    const deliverables: string[] = [];

    // Pattern 1: Bulleted lists after "Deliverables" section
    const deliverablesSection = output.match(
      /(?:Deliverables|Deliverable|Outputs?):\s*([\s\S]*?)(?:\n\n|Confidence|$)/i
    );

    if (deliverablesSection) {
      const items = deliverablesSection[1].match(/[-*•]\s+(.+?)(?=\n|$)/gm);
      if (items) {
        items.forEach(item => {
          const cleaned = item.replace(/^[-*•]\s+/, '').trim();
          if (cleaned.length > 0) {
            deliverables.push(cleaned);
          }
        });
      }
    }

    // Pattern 2: JSON array format
    try {
      const jsonMatch = output.match(/\{[\s\S]*?"deliverables"\s*:\s*\[([\s\S]*?)\][\s\S]*?\}/i);
      if (jsonMatch) {
        const json = JSON.parse(jsonMatch[0]);
        if (Array.isArray(json.deliverables)) {
          deliverables.push(...json.deliverables);
        }
      }
    } catch {
      // JSON parse failed
    }

    // Remove duplicates using Set
    const uniqueSet = new Set(deliverables);
    return Array.from(uniqueSet);
  }

  /**
   * Extract audit analysis section
   */
  private extractAuditAnalysis(output: string): string | undefined {
    // Match "Audit Analysis: ..." to end of line or next capital letter
    const match = output.match(/Audit Analysis:\s*(.+?)(?:\n[A-Z]|\n$|$)/i);
    if (match) {
      return match[1].trim();
    }
    return undefined;
  }

  /**
   * Extract agent performance observations
   */
  private extractAgentPerformance(output: string): string | undefined {
    // Match "Agent Performance: ..." to end of line or end of string
    const match = output.match(/Agent Performance:\s*(.+?)(?:\n|$)/i);
    if (match) {
      return match[1].trim();
    }
    return undefined;
  }

  /**
   * Find the line containing the decision
   */
  private findDecisionLine(output: string): string | undefined {
    const lines = output.split('\n');
    for (const line of lines) {
      if (/Decision:|PROCEED|ITERATE|ABORT/i.test(line)) {
        return line.trim();
      }
    }
    return undefined;
  }

  /**
   * Validate decision consistency
   */
  private validateDecision(
    decision: string,
    reasoning: string,
    deliverables: string[],
    confidence: number
  ): string[] {
    const errors: string[] = [];

    // Check confidence is valid
    if (confidence < 0 || confidence > 1) {
      errors.push(`Invalid confidence score: ${confidence} (must be 0-1)`);
    }

    // ITERATE requires explanation
    if (decision === 'ITERATE' && !reasoning) {
      errors.push('ITERATE decision requires reasoning for improvements');
    }

    // ABORT requires strong reasoning
    if (decision === 'ABORT' && confidence > 0.5) {
      errors.push('ABORT decision should have lower confidence (indicates critical issue)');
    }

    // PROCEED with low confidence is suspicious
    if (decision === 'PROCEED' && confidence < 0.6) {
      errors.push('PROCEED decision with low confidence (<0.6) indicates uncertainty');
    }

    return errors;
  }

  /**
   * Check for "consensus on vapor" (claims complete without deliverables)
   */
  private checkConsensusOnVapor(
    output: string,
    deliverables: string[]
  ): { isVapor: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if task requires files
    if (!this.taskContext) {
      return { isVapor: false, errors: [] };
    }

    const requiresImplementation = /create|build|implement|generate|write|add|code|file|component|module|test/i.test(
      this.taskContext
    );

    if (!requiresImplementation) {
      return { isVapor: false, errors: [] };
    }

    // Check actual file changes in git
    try {
      const changedFiles = execSync('git status --short 2>/dev/null | grep -E "^(A|M|\\?\\?)" | wc -l', {
        encoding: 'utf-8'
      }).trim();

      const fileCount = parseInt(changedFiles, 10) || 0;

      if (fileCount === 0 && deliverables.length === 0) {
        errors.push('No files created despite implementation task - consensus on plans only (consensus on vapor)');
        return { isVapor: true, errors };
      }

      if (fileCount === 0 && deliverables.length > 0) {
        errors.push('Deliverables claimed but no files created - high risk of vapor consensus');
        return { isVapor: true, errors };
      }
    } catch {
      // Git command failed, skip vapor check
      // This is non-critical in non-git environments
    }

    return { isVapor: false, errors };
  }
}

/**
 * Parse decision from output string (convenience function)
 */
export async function parseDecision(
  output: string,
  options?: DecisionParserOptions
): Promise<ParsedDecision> {
  const parser = new DecisionParser(options);
  return parser.parse(output);
}

/**
 * Parse decision from file (convenience function)
 */
export async function parseDecisionFile(
  filePath: string,
  options?: DecisionParserOptions
): Promise<ParsedDecision> {
  const parser = new DecisionParser(options);
  return parser.parseFile(filePath);
}

export default DecisionParser;
