/**
 * Unified Output Processing Module for CFN Loop
 * Consolidates Loop 2 (validators) and Loop 3 (implementers) output parsing
 *
 * Purpose:
 * - Extract confidence scores from agent outputs
 * - Parse feedback/issues from validator outputs
 * - Validate parsed results against schema
 * - Calculate consensus from multiple validator results
 * - Verify deliverables from implementation results
 *
 * Replaces:
 * - .claude/skills/cfn-loop2-output-processing/parse-feedback.sh
 * - .claude/skills/cfn-loop3-output-processing/parse-confidence.sh
 * - .claude/skills/cfn-loop3-output-processing/calculate-confidence.sh
 */

/**
 * Core type definitions for output processing
 */

/**
 * Result from Loop 3 (Implementer) output processing
 * Represents work completed by coding/development agents
 */
export interface Loop3Result {
  agentId: string;
  confidence: number;
  confidenceSource: 'explicit' | 'calculated' | 'fallback';
  filesChanged: number;
  deliverables: string[];
  testsPassedCount?: number;
  testsFailed?: number;
  passRate?: number;
  output: string;
  iteration: number;
  timestamp: string;
}

/**
 * Feedback item categorized by severity
 */
export interface FeedbackItem {
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  text: string;
}

/**
 * Result from Loop 2 (Validator) output processing
 * Represents validation/review feedback from reviewers and testers
 */
export interface Loop2Result {
  validatorId: string;
  score: number;
  scoreSource: 'explicit' | 'calculated' | 'qualitative';
  issues: FeedbackItem[];
  criticalCount: number;
  warningCount: number;
  suggestionCount: number;
  recommendations: string[];
  output: string;
  iteration: number;
  timestamp: string;
}

/**
 * Consensus calculation from multiple Loop 2 validators
 */
export interface ConsensusResult {
  averageScore: number;
  threshold: number;
  passed: boolean;
  validatorCount: number;
  scoredCount: number;
  minScore: number;
  maxScore: number;
  summary: string;
  details: {
    criticalIssuesTotal: number;
    warningIssuesTotal: number;
    suggestionsTotal: number;
  };
}

/**
 * Configuration for parsing behavior
 */
export interface ParsingConfig {
  strictMode: boolean;
  fallbackConfidence: number;
  minimumDeliverables: number;
  confidenceRange: [number, number];
}

/**
 * Confidence extraction patterns
 * Priority order matters - first match wins
 */
const CONFIDENCE_PATTERNS = [
  {
    name: 'explicit_header',
    regex: /Validation Confidence:\s*([0-9.]+)/i,
    priority: 1,
  },
  {
    name: 'explicit_generic',
    regex: /[Cc]onfidence:\s*([0-9.]+)/,
    priority: 2,
  },
  {
    name: 'score_field',
    regex: /[Ss]core:\s*([0-9.]+)/,
    priority: 3,
  },
  {
    name: 'percentage',
    regex: /([0-9]{1,3})%/,
    priority: 4,
    transform: (match: string) => parseFloat(match) / 100,
  },
  {
    name: 'parentheses',
    regex: /\(([0-9.]+)\)/,
    priority: 5,
  },
];

/**
 * Qualitative confidence mappings
 */
const QUALITATIVE_CONFIDENCE: Record<string, number> = {
  'very high': 0.95,
  'extremely high': 0.95,
  'excellent': 0.95,
  'outstanding': 0.95,
  'high': 0.90,
  'strong': 0.90,
  'good': 0.75,
  'moderate': 0.75,
  'medium': 0.75,
  'fair': 0.60,
  'low': 0.50,
  'weak': 0.50,
  'poor': 0.40,
  'very low': 0.30,
};

/**
 * Parse confidence score from agent output
 * Uses multi-pattern approach with fallbacks
 *
 * @param output Agent output text
 * @param config Parsing configuration
 * @returns Confidence score (0.0-1.0) and source
 */
export function parseConfidence(
  output: string,
  config: Partial<ParsingConfig> = {}
): { score: number; source: 'explicit' | 'qualitative' | 'none' } {
  if (!output || output.trim().length === 0) {
    return { score: 0.0, source: 'none' };
  }

  const normalizedOutput = output.toLowerCase();

  // Try explicit numeric patterns
  for (const pattern of CONFIDENCE_PATTERNS) {
    const match = output.match(pattern.regex);
    if (match && match[1]) {
      let score = parseFloat(match[1]);

      // Transform if needed (e.g., percentage to decimal)
      if (pattern.transform) {
        score = pattern.transform(match[1]);
      }

      // Validate range
      if (score >= 0.0 && score <= 1.0) {
        return { score, source: 'explicit' };
      }

      // Handle percentage that might be > 1.0
      if (score > 1.0 && score <= 100.0) {
        return { score: score / 100, source: 'explicit' };
      }
    }
  }

  // Try qualitative mappings
  for (const [qualifier, score] of Object.entries(QUALITATIVE_CONFIDENCE)) {
    if (
      normalizedOutput.includes(qualifier) &&
      normalizedOutput.includes('confidence')
    ) {
      return { score, source: 'qualitative' };
    }
  }

  return { score: 0.0, source: 'none' };
}

/**
 * Extract feedback items from validator output
 * Looks for structured sections (### CRITICAL, ### WARNING, ### SUGGESTION)
 *
 * @param output Validator output text
 * @returns Categorized feedback items
 */
export function extractFeedback(output: string): FeedbackItem[] {
  if (!output || output.trim().length === 0) {
    return [];
  }

  const feedbackItems: FeedbackItem[] = [];
  const severities = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;

  for (const severity of severities) {
    // Pattern 1: Look for markdown sections (### SEVERITY Issues/Items)
    const sectionRegex = new RegExp(
      `### ${severity}[^\\n]*\\n([\\s\\S]*?)(?=###|$)`,
      'i'
    );
    const sectionMatch = output.match(sectionRegex);

    if (sectionMatch && sectionMatch[1]) {
      const content = sectionMatch[1];
      // Extract bullet points
      const itemRegex = /^[-*•]\s+(.+)$/gm;
      let itemMatch;

      while ((itemMatch = itemRegex.exec(content)) !== null) {
        const text = itemMatch[1].trim();
        if (text && text.toLowerCase() !== 'no issues found') {
          feedbackItems.push({
            severity,
            text,
          });
        }
      }
    }

    // Pattern 2: Look for inline format (SEVERITY: item)
    if (feedbackItems.length === 0) {
      const inlineRegex = new RegExp(
        `^${severity}:?\\s+(.+)$`,
        'gim'
      );
      let inlineMatch;

      while ((inlineMatch = inlineRegex.exec(output)) !== null) {
        const text = inlineMatch[1].trim();
        if (text && text.toLowerCase() !== 'none') {
          feedbackItems.push({
            severity,
            text,
          });
        }
      }
    }
  }

  return feedbackItems;
}

/**
 * Extract recommendations from validator output
 * Looks for "Recommendations:" or "Suggestions:" sections
 *
 * @param output Validator output text
 * @returns List of recommendations
 */
export function extractRecommendations(output: string): string[] {
  if (!output || output.trim().length === 0) {
    return [];
  }

  const recommendations: string[] = [];

  // Pattern 1: Look for "Recommendations:" or "Suggestions:" section
  const recRegex = /(?:Recommendations?|Suggestions?):\s*\n([\s\S]*?)(?=\n\n|$)/i;
  const recMatch = output.match(recRegex);

  if (recMatch && recMatch[1]) {
    const content = recMatch[1];
    const itemRegex = /^[-*•]\s+(.+)$/gm;
    let itemMatch;

    while ((itemMatch = itemRegex.exec(content)) !== null) {
      const text = itemMatch[1].trim();
      if (text) {
        recommendations.push(text);
      }
    }
  }

  return recommendations;
}

/**
 * Verify deliverables and calculate confidence fallback for Loop 3
 * Used when no explicit confidence is found
 *
 * @param filesChanged Number of files changed
 * @param deliverables List of changed files
 * @param testsInfo Optional test results
 * @returns Calculated confidence score
 */
export function calculateFallbackConfidence(
  filesChanged: number,
  deliverables: string[] = [],
  testsInfo?: { passed: number; failed: number }
): number {
  // No files changed = no delivery
  if (filesChanged === 0) {
    return 0.0;
  }

  // Minimal changes
  if (filesChanged <= 2) {
    return 0.5;
  }

  // Moderate changes
  if (filesChanged <= 5) {
    return 0.75;
  }

  // Significant changes
  let confidence = 0.85;

  // Boost if tests provided and passed
  if (testsInfo) {
    const totalTests = testsInfo.passed + testsInfo.failed;
    if (totalTests > 0) {
      const passRate = testsInfo.passed / totalTests;
      if (passRate === 1.0) {
        confidence = 0.95;
      } else if (passRate >= 0.9) {
        confidence = 0.90;
      } else if (passRate >= 0.8) {
        confidence = 0.85;
      }
    }
  }

  return confidence;
}

/**
 * Validate confidence score is in valid range
 *
 * @param score Confidence score to validate
 * @param min Minimum valid score (default 0.0)
 * @param max Maximum valid score (default 1.0)
 * @returns true if score is valid
 */
export function isValidConfidence(
  score: number,
  min: number = 0.0,
  max: number = 1.0
): boolean {
  return !isNaN(score) && score >= min && score <= max;
}

/**
 * Parse complete Loop 3 agent output
 * Extracts confidence and deliverable information
 *
 * @param agentOutput Raw agent output
 * @param agentId Agent identifier
 * @param iteration Current iteration number
 * @param gitStatus Optional git status information
 * @returns Parsed Loop 3 result
 */
export function parseLoop3Output(
  agentOutput: string,
  agentId: string,
  iteration: number = 1,
  gitStatus?: {
    before: string;
    after: string;
  }
): Loop3Result {
  const { score: confidenceScore, source: confidenceSource } = parseConfidence(
    agentOutput
  );

  let filesChanged = 0;
  let deliverables: string[] = [];

  // Calculate deliverables from git status if provided
  if (gitStatus?.before && gitStatus?.after) {
    const beforeLines = gitStatus.before.split('\n').filter((l) => l.trim());
    const afterLines = gitStatus.after.split('\n').filter((l) => l.trim());

    // Simple set difference - files in after but not in before
    const changedSet = new Set(afterLines);
    beforeLines.forEach((line) => changedSet.delete(line));

    deliverables = Array.from(changedSet);
    filesChanged = deliverables.length;
  }

  // Determine final confidence
  let finalConfidence = confidenceScore;
  let finalSource: Loop3Result['confidenceSource'] = confidenceSource as any;

  if (confidenceScore === 0.0) {
    // No explicit confidence found, use fallback
    finalConfidence = calculateFallbackConfidence(filesChanged, deliverables);
    finalSource = 'calculated';
  }

  // Extract test information if present
  const testPassRegex = /tests?\s+passed:\s*(\d+)/i;
  const testFailRegex = /tests?\s+failed:\s*(\d+)/i;
  const testPassMatch = agentOutput.match(testPassRegex);
  const testFailMatch = agentOutput.match(testFailRegex);

  const testsPassedCount = testPassMatch
    ? parseInt(testPassMatch[1], 10)
    : undefined;
  const testsFailed = testFailMatch ? parseInt(testFailMatch[1], 10) : undefined;

  let passRate: number | undefined;
  if (testsPassedCount !== undefined && testsFailed !== undefined) {
    const total = testsPassedCount + testsFailed;
    passRate = total > 0 ? testsPassedCount / total : 0;
  }

  return {
    agentId,
    confidence: parseFloat(finalConfidence.toFixed(2)),
    confidenceSource: finalSource,
    filesChanged,
    deliverables,
    testsPassedCount,
    testsFailed,
    passRate,
    output: agentOutput,
    iteration,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Parse complete Loop 2 validator output
 * Extracts confidence and feedback
 *
 * @param validatorOutput Raw validator output
 * @param validatorId Validator identifier
 * @param iteration Current iteration number
 * @returns Parsed Loop 2 result
 */
export function parseLoop2Output(
  validatorOutput: string,
  validatorId: string,
  iteration: number = 1
): Loop2Result {
  const { score, source: scoreSource } = parseConfidence(validatorOutput);
  const feedbackItems = extractFeedback(validatorOutput);
  const recommendations = extractRecommendations(validatorOutput);

  // Count by severity
  const criticalCount = feedbackItems.filter(
    (f) => f.severity === 'CRITICAL'
  ).length;
  const warningCount = feedbackItems.filter(
    (f) => f.severity === 'WARNING'
  ).length;
  const suggestionCount = feedbackItems.filter(
    (f) => f.severity === 'SUGGESTION'
  ).length;

  // Validate score
  let finalScore = score;
  let finalSource = scoreSource;

  if (!isValidConfidence(finalScore)) {
    finalScore = 0.0;
    finalSource = 'calculated';
  }

  return {
    validatorId,
    score: parseFloat(finalScore.toFixed(2)),
    scoreSource: finalSource as any,
    issues: feedbackItems,
    criticalCount,
    warningCount,
    suggestionCount,
    recommendations,
    output: validatorOutput,
    iteration,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Calculate consensus from multiple Loop 2 validator results
 * Determines if validators agree on code quality
 *
 * @param results Array of Loop 2 results
 * @param threshold Minimum average score to pass (default 0.70)
 * @returns Consensus assessment
 */
export function calculateConsensus(
  results: Loop2Result[],
  threshold: number = 0.70
): ConsensusResult {
  if (results.length === 0) {
    return {
      averageScore: 0.0,
      threshold,
      passed: false,
      validatorCount: 0,
      scoredCount: 0,
      minScore: 0.0,
      maxScore: 0.0,
      summary: 'No validators provided',
      details: {
        criticalIssuesTotal: 0,
        warningIssuesTotal: 0,
        suggestionsTotal: 0,
      },
    };
  }

  // Filter valid scores
  const validResults = results.filter((r) => isValidConfidence(r.score));

  if (validResults.length === 0) {
    return {
      averageScore: 0.0,
      threshold,
      passed: false,
      validatorCount: results.length,
      scoredCount: 0,
      minScore: 0.0,
      maxScore: 0.0,
      summary: 'No valid confidence scores from validators',
      details: {
        criticalIssuesTotal: results.reduce((sum, r) => sum + r.criticalCount, 0),
        warningIssuesTotal: results.reduce((sum, r) => sum + r.warningCount, 0),
        suggestionsTotal: results.reduce((sum, r) => sum + r.suggestionCount, 0),
      },
    };
  }

  const scores = validResults.map((r) => r.score);
  const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const passed = averageScore >= threshold;

  // Calculate total issues
  const criticalIssuesTotal = results.reduce((sum, r) => sum + r.criticalCount, 0);
  const warningIssuesTotal = results.reduce((sum, r) => sum + r.warningCount, 0);
  const suggestionsTotal = results.reduce((sum, r) => sum + r.suggestionCount, 0);

  // Build summary
  const roundedAverage = parseFloat(averageScore.toFixed(2));
  const consensusPercentage = Math.round(averageScore * 100);
  const decision = passed ? 'PASS' : 'FAIL';
  let issues = [];

  if (criticalIssuesTotal > 0) {
    issues.push(`${criticalIssuesTotal} critical`);
  }
  if (warningIssuesTotal > 0) {
    issues.push(`${warningIssuesTotal} warnings`);
  }

  const issueString = issues.length > 0 ? ` (${issues.join(', ')})` : '';
  const summary = `${decision}: ${consensusPercentage}% consensus from ${validResults.length} validators${issueString}`;

  return {
    averageScore: roundedAverage,
    threshold,
    passed,
    validatorCount: results.length,
    scoredCount: validResults.length,
    minScore: parseFloat(minScore.toFixed(2)),
    maxScore: parseFloat(maxScore.toFixed(2)),
    summary,
    details: {
      criticalIssuesTotal,
      warningIssuesTotal,
      suggestionsTotal,
    },
  };
}

/**
 * Detect if output appears to be default/unprocessed
 * (e.g., 0.70 confidence with no feedback)
 *
 * @param result Loop 2 result to check
 * @returns true if output appears to be default
 */
export function isDefaultOutput(result: Loop2Result): boolean {
  return (
    result.score === 0.7 &&
    result.issues.length === 0 &&
    result.recommendations.length === 0 &&
    result.scoreSource === 'explicit'
  );
}

/**
 * Format result as JSON for CLI output
 *
 * @param data Result object to format
 * @returns JSON string
 */
export function formatAsJson<T>(data: T): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Parse JSON string safely
 *
 * @param json JSON string to parse
 * @returns Parsed object or null if invalid
 */
export function parseJson<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
