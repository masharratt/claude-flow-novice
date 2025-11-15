/**
 * Agent Output Parser
 * Legacy stdout parser for backward compatibility
 *
 * @version 1.0.0
 * @description Converts unstructured text output to structured JSON
 */

import type {
  AgentOutput,
  Loop3Output,
  Loop2Output,
  ProductOwnerOutput,
  ParseResult,
  Deliverable,
  Issue,
  AgentError,
} from '../types/agent-output';

// ============================================================================
// Parser Class
// ============================================================================

/**
 * AgentOutputParser: Legacy text output parser
 * Provides best-effort parsing of unstructured stdout
 */
export class AgentOutputParser {
  /**
   * Parse stdout text to structured agent output
   */
  public parse(text: string): ParseResult {
    const errors: string[] = [];
    let confidence = 0.5; // Default confidence for legacy parsing

    try {
      // Attempt to parse as JSON first
      const jsonOutput = this.tryParseJSON(text);
      if (jsonOutput) {
        return {
          success: true,
          output: jsonOutput,
          errors: [],
          confidence: 0.95,
        };
      }

      // Detect output type from text patterns
      const outputType = this.detectOutputType(text);

      // Parse based on detected type
      switch (outputType) {
        case 'loop3':
          return this.parseLoop3Text(text);
        case 'loop2':
          return this.parseLoop2Text(text);
        case 'product_owner':
          return this.parseProductOwnerText(text);
        default:
          return {
            success: false,
            errors: ['Unable to detect agent output type from text'],
            confidence: 0.0,
          };
      }
    } catch (error) {
      return {
        success: false,
        errors: [
          `Parse error: ${error instanceof Error ? error.message : String(error)}`,
        ],
        confidence: 0.0,
      };
    }
  }

  /**
   * Attempt to parse text as JSON
   */
  private tryParseJSON(text: string): AgentOutput | null {
    try {
      // Try parsing the entire text
      const obj = JSON.parse(text);
      if (this.isValidAgentOutput(obj)) {
        return obj as AgentOutput;
      }

      // Try extracting JSON from markdown code blocks
      const jsonMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const obj = JSON.parse(jsonMatch[1]);
        if (this.isValidAgentOutput(obj)) {
          return obj as AgentOutput;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Basic validation for agent output structure
   */
  private isValidAgentOutput(obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    const record = obj as Record<string, unknown>;
    return (
      typeof record.success === 'boolean' &&
      typeof record.confidence === 'number' &&
      typeof record.output_type === 'string' &&
      (record.output_type === 'loop3' ||
        record.output_type === 'loop2' ||
        record.output_type === 'product_owner')
    );
  }

  /**
   * Detect output type from text patterns
   */
  private detectOutputType(text: string): string {
    const lower = text.toLowerCase();

    // Check for Product Owner decision keywords
    if (
      /\b(PROCEED|ITERATE|ABORT)\b/.test(text) &&
      /\b(decision|rationale)\b/i.test(lower)
    ) {
      return 'product_owner';
    }

    // Check for Loop 2 validation keywords
    if (
      /\b(approved|rejected|consensus|validation)\b/i.test(lower) &&
      /\b(issues?|recommendations?)\b/i.test(lower)
    ) {
      return 'loop2';
    }

    // Check for Loop 3 implementation keywords
    if (
      /\b(deliverables?|implementation|created|modified)\b/i.test(lower) ||
      /\b(files? (created|modified))\b/i.test(lower)
    ) {
      return 'loop3';
    }

    return 'unknown';
  }

  /**
   * Parse Loop 3 implementer text output
   */
  private parseLoop3Text(text: string): ParseResult {
    const output: Loop3Output = {
      output_type: 'loop3',
      success: true,
      confidence: this.extractConfidence(text),
      iteration: this.extractIteration(text),
      deliverables: this.extractDeliverables(text),
      errors: this.extractErrors(text),
      metadata: {
        agent_type: this.extractAgentType(text) || 'unknown',
        timestamp: new Date().toISOString(),
      },
    };

    // Extract optional fields
    const summary = this.extractSummary(text);
    if (summary) {
      output.summary = summary;
    }

    const metrics = this.extractMetrics(text);
    if (Object.keys(metrics).length > 0) {
      output.metrics = metrics;
    }

    return {
      success: true,
      output,
      errors: [],
      confidence: 0.7,
    };
  }

  /**
   * Parse Loop 2 validator text output
   */
  private parseLoop2Text(text: string): ParseResult {
    const output: Loop2Output = {
      output_type: 'loop2',
      success: true,
      confidence: this.extractConfidence(text),
      iteration: this.extractIteration(text),
      validation_type: this.extractValidationType(text),
      issues: this.extractIssues(text),
      recommendations: this.extractRecommendations(text),
      approved: this.extractApproval(text),
      errors: this.extractErrors(text),
      metadata: {
        agent_type: this.extractAgentType(text) || 'reviewer',
        timestamp: new Date().toISOString(),
      },
    };

    const summary = this.extractSummary(text);
    if (summary) {
      output.summary = summary;
    }

    return {
      success: true,
      output,
      errors: [],
      confidence: 0.7,
    };
  }

  /**
   * Parse Product Owner text output
   */
  private parseProductOwnerText(text: string): ParseResult {
    const decision = this.extractDecision(text);
    if (!decision) {
      return {
        success: false,
        errors: ['Unable to extract Product Owner decision'],
        confidence: 0.0,
      };
    }

    const output: ProductOwnerOutput = {
      output_type: 'product_owner',
      success: true,
      confidence: this.extractConfidence(text),
      iteration: this.extractIteration(text),
      decision,
      rationale: this.extractRationale(text),
      deliverables_validated: this.extractDeliverablesValidated(text),
      next_action: this.extractNextAction(text),
      errors: this.extractErrors(text),
      metadata: {
        agent_type: 'product-owner',
        timestamp: new Date().toISOString(),
      },
    };

    const consensusScore = this.extractConsensusScore(text);
    if (consensusScore !== null) {
      output.consensus_score = consensusScore;
    }

    const gateScore = this.extractGateScore(text);
    if (gateScore !== null) {
      output.gate_score = gateScore;
    }

    return {
      success: true,
      output,
      errors: [],
      confidence: 0.75,
    };
  }

  // ============================================================================
  // Extraction Helper Methods
  // ============================================================================

  /**
   * Extract confidence score from text
   */
  private extractConfidence(text: string): number {
    // Look for explicit confidence score (fixed regex to match only valid decimals)
    const match =
      text.match(/confidence[:\s]+([0-9]+(?:\.[0-9]+)?)/i) ||
      text.match(/confidence score[:\s]+([0-9]+(?:\.[0-9]+)?)/i);

    if (match) {
      const value = parseFloat(match[1]);
      // Handle both 0.0-1.0 and 0-100 formats
      if (value >= 0 && value <= 1) {
        return value;
      }
      if (value > 1 && value <= 100) {
        return value / 100;
      }
    }

    // Default confidence for parsed text
    return 0.7;
  }

  /**
   * Extract iteration number from text
   */
  private extractIteration(text: string): number {
    const match =
      text.match(/iteration[:\s]+(\d+)/i) ||
      text.match(/iteration (\d+)/i);

    if (match) {
      return parseInt(match[1], 10);
    }

    return 1; // Default to iteration 1
  }

  /**
   * Extract agent type from text
   */
  private extractAgentType(text: string): string | null {
    const match =
      text.match(/agent[_\s]?type[:\s]+([a-z-]+)/i) ||
      text.match(/agent[:\s]+([a-z-]+)/i);

    return match ? match[1] : null;
  }

  /**
   * Extract summary from text
   */
  private extractSummary(text: string): string | null {
    const match =
      text.match(/summary[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)/is) ||
      text.match(/## Summary\s*\n(.+?)(?:\n\n|\n#|$)/is);

    return match ? match[1].trim() : null;
  }

  /**
   * Extract deliverables from text
   */
  private extractDeliverables(text: string): Deliverable[] {
    const deliverables: Deliverable[] = [];

    // Look for file listings
    const filePatterns = [
      /(?:created|modified|deleted)[:\s]+([^\n]+)/gi,
      /[-*]\s+(?:created|modified|deleted)[:\s]+([^\n]+)/gi,
      /[-*]\s+`([^`]+)`\s+-\s+(created|modified|deleted)/gi,
    ];

    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const path = match[1].trim().replace(/`/g, '');
        const status = this.extractDeliverableStatus(match[0]);

        deliverables.push({
          path,
          type: this.guessDeliverableType(path),
          status: status || 'created',
        });
      }
    }

    return deliverables;
  }

  /**
   * Extract deliverable status from text
   */
  private extractDeliverableStatus(
    text: string
  ): 'created' | 'modified' | 'deleted' | null {
    const lower = text.toLowerCase();
    if (lower.includes('created')) return 'created';
    if (lower.includes('modified')) return 'modified';
    if (lower.includes('deleted')) return 'deleted';
    return null;
  }

  /**
   * Guess deliverable type from file path
   */
  private guessDeliverableType(path: string): Deliverable['type'] {
    const lower = path.toLowerCase();

    if (lower.match(/\.test\.|\.spec\.|test\/|tests\//)) return 'test';
    if (lower.match(/\.md$|readme|docs?\//)) return 'documentation';
    if (lower.match(/\.json$|\.ya?ml$|\.toml$|\.ini$/)) return 'config';
    if (lower.match(/schema|\.graphql$/)) return 'schema';
    if (lower.match(/\.sh$|\.bash$|scripts?\//)) return 'script';
    if (lower.match(/\.ts$|\.js$|\.py$|src\//)) return 'implementation';

    return 'other';
  }

  /**
   * Extract metrics from text
   */
  private extractMetrics(text: string): Record<string, number> {
    const metrics: Record<string, number> = {};

    const patterns = [
      { key: 'files_created', pattern: /(\d+)\s+files?\s+created/i },
      { key: 'files_modified', pattern: /(\d+)\s+files?\s+modified/i },
      { key: 'lines_of_code', pattern: /(\d+)\s+lines?\s+of\s+code/i },
      {
        key: 'test_coverage',
        pattern: /(?:coverage|test coverage)[:\s]+([0-9]+(?:\.[0-9]+)?)%?/i,
      },
      { key: 'tests_passed', pattern: /(\d+)\s+tests?\s+passed/i },
      { key: 'tests_failed', pattern: /(\d+)\s+tests?\s+failed/i },
    ];

    for (const { key, pattern } of patterns) {
      const match = text.match(pattern);
      if (match) {
        let value = parseFloat(match[1]);
        // Convert percentage to 0.0-1.0 for test_coverage
        if (key === 'test_coverage' && value > 1) {
          value = value / 100;
        }
        metrics[key] = value;
      }
    }

    return metrics;
  }

  /**
   * Extract validation type from text
   */
  private extractValidationType(text: string): Loop2Output['validation_type'] {
    const lower = text.toLowerCase();

    if (lower.includes('security')) return 'security';
    if (lower.includes('test')) return 'test';
    if (lower.includes('architecture')) return 'architecture';
    if (lower.includes('performance')) return 'performance';
    if (lower.includes('compliance')) return 'compliance';

    return 'review'; // Default
  }

  /**
   * Extract issues from text
   */
  private extractIssues(text: string): Issue[] {
    const issues: Issue[] = [];

    // Look for issue listings
    const issuePatterns = [
      /[-*]\s+\[([^\]]+)\]\s+([^\n]+)/g,
      /[-*]\s+(critical|high|medium|low|info)[:\s]+([^\n]+)/gi,
    ];

    for (const pattern of issuePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const severity = this.parseSeverity(match[1]);
        const message = match[2].trim();

        issues.push({
          severity,
          category: 'other',
          message,
        });
      }
    }

    return issues;
  }

  /**
   * Parse severity from text
   */
  private parseSeverity(text: string): Issue['severity'] {
    const lower = text.toLowerCase();

    if (lower.includes('critical')) return 'critical';
    if (lower.includes('high')) return 'high';
    if (lower.includes('medium')) return 'medium';
    if (lower.includes('low')) return 'low';

    return 'info';
  }

  /**
   * Extract recommendations from text
   */
  private extractRecommendations(text: string): string[] {
    const recommendations: string[] = [];

    // Look for recommendation listings
    const patterns = [
      /recommendation[s]?[:\s]+([^\n]+)/gi,
      /[-*]\s+(?:recommend|suggestion)[:\s]+([^\n]+)/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        recommendations.push(match[1].trim());
      }
    }

    return recommendations;
  }

  /**
   * Extract approval status from text
   */
  private extractApproval(text: string): boolean {
    const lower = text.toLowerCase();

    // Explicit approval/rejection
    if (/\bapproved\b/i.test(text)) return true;
    if (/\brejected\b/i.test(text)) return false;

    // Implicit approval from consensus (fixed regex to match only valid decimals)
    if (/consensus[:\s]+([0-9]+(?:\.[0-9]+)?)/i.test(text)) {
      const match = text.match(/consensus[:\s]+([0-9]+(?:\.[0-9]+)?)/i);
      if (match) {
        const score = parseFloat(match[1]);
        return score >= 0.9; // Default threshold
      }
    }

    return false; // Default to not approved
  }

  /**
   * Extract Product Owner decision
   */
  private extractDecision(
    text: string
  ): ProductOwnerOutput['decision'] | null {
    const match = text.match(/\b(PROCEED|ITERATE|ABORT)\b/);
    return match ? (match[1] as ProductOwnerOutput['decision']) : null;
  }

  /**
   * Extract rationale from text
   */
  private extractRationale(text: string): string {
    const match =
      text.match(/rationale[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)/is) ||
      text.match(/reason[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)/is);

    return match
      ? match[1].trim()
      : 'No rationale provided in legacy output';
  }

  /**
   * Extract deliverables validated status
   */
  private extractDeliverablesValidated(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.includes('deliverables validated') ||
      lower.includes('all deliverables') ||
      lower.includes('deliverables complete')
    );
  }

  /**
   * Extract next action from text
   */
  private extractNextAction(text: string): string {
    const match =
      text.match(/next[_\s]action[:\s]+([^\n]+)/i) ||
      text.match(/action[:\s]+([^\n]+)/i);

    if (match) {
      return match[1].trim();
    }

    // Infer from decision
    const decision = this.extractDecision(text);
    if (decision === 'PROCEED') return 'mark_task_complete';
    if (decision === 'ITERATE') return 'start_next_iteration';
    if (decision === 'ABORT') return 'abort_task';

    return 'unknown';
  }

  /**
   * Extract consensus score from text
   */
  private extractConsensusScore(text: string): number | null {
    const match =
      text.match(/consensus[_\s]score[:\s]+([0-9]+(?:\.[0-9]+)?)/i) ||
      text.match(/consensus[:\s]+([0-9]+(?:\.[0-9]+)?)/i);

    if (match) {
      const value = parseFloat(match[1]);
      return value >= 0 && value <= 1 ? value : value / 100;
    }

    return null;
  }

  /**
   * Extract gate score from text
   */
  private extractGateScore(text: string): number | null {
    const match =
      text.match(/gate[_\s]score[:\s]+([0-9]+(?:\.[0-9]+)?)/i) ||
      text.match(/gate[:\s]+([0-9]+(?:\.[0-9]+)?)/i);

    if (match) {
      const value = parseFloat(match[1]);
      return value >= 0 && value <= 1 ? value : value / 100;
    }

    return null;
  }

  /**
   * Extract errors from text
   */
  private extractErrors(text: string): AgentError[] {
    const errors: AgentError[] = [];

    // Look for error listings
    const errorPatterns = [
      /error[:\s]+\[([^\]]+)\]\s+([^\n]+)/gi,
      /\[ERROR\]\s+([^\n]+)/gi,
    ];

    for (const pattern of errorPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const code = match[1] || 'UNKNOWN_ERROR';
        const message = match[2] || match[1];

        errors.push({
          code: code.trim(),
          message: message.trim(),
        });
      }
    }

    return errors;
  }
}

// ============================================================================
// Singleton Instance and Convenience Functions
// ============================================================================

let parserInstance: AgentOutputParser | null = null;

/**
 * Get or create parser instance
 */
export function getParser(): AgentOutputParser {
  if (!parserInstance) {
    parserInstance = new AgentOutputParser();
  }
  return parserInstance;
}

/**
 * Parse text output to structured agent output
 */
export function parseAgentOutput(text: string): ParseResult {
  return getParser().parse(text);
}

/**
 * Reset parser instance (useful for testing)
 */
export function resetParser(): void {
  parserInstance = null;
}

export default AgentOutputParser;
