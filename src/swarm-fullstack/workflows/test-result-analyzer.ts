/**
 * Test Result Analyzer - Intelligent Failure Categorization and Analysis
 *
 * Analyzes test results to categorize failures, identify patterns, and provide
 * actionable insights for fixing issues.
 *
 * Key Features:
 * - Failure pattern recognition
 * - Root cause analysis
 * - Impact assessment
 * - Priority classification
 * - Suggested fix strategies
 */

import { EventEmitter } from 'events';
import { ILogger } from '../../core/logger.js';
import { TestExecutionResult, TestFailure, TestWarning } from './iterative-build-test.js';

export interface FailureAnalysis {
  testResults: TestExecutionResult;
  summary: FailureSummary;
  categories: Map<string, TestFailure[]>;
  patterns: FailurePattern[];
  rootCauses: RootCause[];
  recommendations: AnalysisRecommendation[];
  impactAssessment: ImpactAssessment;
}

export interface FailureSummary {
  totalFailures: number;
  criticalFailures: number;
  highFailures: number;
  mediumFailures: number;
  lowFailures: number;
  byLayer: Map<string, number>;
  byCategory: Map<string, number>;
  bySeverity: Map<string, number>;
}

export interface FailurePattern {
  id: string;
  pattern: string;
  description: string;
  occurrences: number;
  affectedTests: string[];
  confidence: number; // 0-1
  suggestedFix: string;
  relatedPatterns: string[];
}

export interface RootCause {
  id: string;
  category: string;
  description: string;
  evidence: string[];
  confidence: number; // 0-1
  affectedComponents: string[];
  potentialSolutions: string[];
  priority: number; // 0-100
}

export interface AnalysisRecommendation {
  type: 'fix' | 'refactor' | 'investigate' | 'monitor';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  reasoning: string;
  estimatedEffort: number; // minutes
  expectedImpact: number; // 0-100, percentage of failures addressed
}

export interface ImpactAssessment {
  usersAffected: 'none' | 'few' | 'many' | 'all';
  featuresAffected: string[];
  businessImpact: 'low' | 'medium' | 'high' | 'critical';
  urgency: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export class TestResultAnalyzer extends EventEmitter {
  private knownPatterns = new Map<string, FailurePattern>();
  private failureHistory = new Map<string, TestFailure[]>();

  constructor(private logger: ILogger) {
    super();
    this.initializeKnownPatterns();
  }

  /**
   * Analyze test failures and provide comprehensive analysis
   */
  async analyzeFailures(testResults: TestExecutionResult): Promise<FailureAnalysis> {
    this.logger.info('Analyzing test failures', {
      totalFailures: testResults.failed,
      totalTests: testResults.totalTests,
    });

    try {
      // Generate failure summary
      const summary = this.generateFailureSummary(testResults);

      // Categorize failures
      const categories = this.categorizeFailures(testResults.failures);

      // Detect patterns
      const patterns = await this.detectPatterns(testResults.failures);

      // Identify root causes
      const rootCauses = await this.identifyRootCauses(testResults.failures, patterns);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        testResults.failures,
        patterns,
        rootCauses,
      );

      // Assess impact
      const impactAssessment = this.assessImpact(testResults.failures);

      const analysis: FailureAnalysis = {
        testResults,
        summary,
        categories,
        patterns,
        rootCauses,
        recommendations,
        impactAssessment,
      };

      this.emit('analysis:completed', { analysis });

      return analysis;
    } catch (error) {
      this.logger.error('Failed to analyze test failures', { error });
      throw error;
    }
  }

  /**
   * Generate failure summary statistics
   */
  private generateFailureSummary(testResults: TestExecutionResult): FailureSummary {
    const failures = testResults.failures;

    const summary: FailureSummary = {
      totalFailures: failures.length,
      criticalFailures: failures.filter((f) => f.severity === 'critical').length,
      highFailures: failures.filter((f) => f.severity === 'high').length,
      mediumFailures: failures.filter((f) => f.severity === 'medium').length,
      lowFailures: failures.filter((f) => f.severity === 'low').length,
      byLayer: new Map(),
      byCategory: new Map(),
      bySeverity: new Map(),
    };

    // Group by layer
    for (const failure of failures) {
      const layerCount = summary.byLayer.get(failure.layer) || 0;
      summary.byLayer.set(failure.layer, layerCount + 1);

      const categoryCount = summary.byCategory.get(failure.category) || 0;
      summary.byCategory.set(failure.category, categoryCount + 1);

      const severityCount = summary.bySeverity.get(failure.severity) || 0;
      summary.bySeverity.set(failure.severity, severityCount + 1);
    }

    return summary;
  }

  /**
   * Categorize failures by characteristics
   */
  private categorizeFailures(failures: TestFailure[]): Map<string, TestFailure[]> {
    const categories = new Map<string, TestFailure[]>();

    for (const failure of failures) {
      const category = this.determineCategory(failure);

      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(failure);
    }

    return categories;
  }

  /**
   * Determine failure category from error patterns
   */
  private determineCategory(failure: TestFailure): string {
    const error = failure.error.toLowerCase();
    const stack = failure.stackTrace.toLowerCase();

    // API/Network failures
    if (
      error.includes('fetch') ||
      error.includes('network') ||
      error.includes('xhr') ||
      error.includes('api')
    ) {
      return 'network-api';
    }

    // Database/Data failures
    if (
      error.includes('database') ||
      error.includes('query') ||
      error.includes('connection') ||
      error.includes('transaction')
    ) {
      return 'database';
    }

    // Rendering/UI failures
    if (
      error.includes('render') ||
      error.includes('component') ||
      error.includes('dom') ||
      error.includes('element not found')
    ) {
      return 'rendering';
    }

    // State management failures
    if (
      error.includes('state') ||
      error.includes('store') ||
      error.includes('reducer') ||
      error.includes('dispatch')
    ) {
      return 'state-management';
    }

    // Authentication/Authorization failures
    if (
      error.includes('auth') ||
      error.includes('permission') ||
      error.includes('unauthorized') ||
      error.includes('forbidden')
    ) {
      return 'authentication';
    }

    // Validation failures
    if (
      error.includes('validation') ||
      error.includes('invalid') ||
      error.includes('required field')
    ) {
      return 'validation';
    }

    // Timing/Race condition failures
    if (
      error.includes('timeout') ||
      error.includes('race') ||
      error.includes('async') ||
      error.includes('promise')
    ) {
      return 'timing-async';
    }

    // Memory/Resource failures
    if (
      error.includes('memory') ||
      error.includes('heap') ||
      error.includes('resource') ||
      error.includes('leak')
    ) {
      return 'resource';
    }

    // Configuration failures
    if (
      error.includes('config') ||
      error.includes('environment') ||
      error.includes('variable')
    ) {
      return 'configuration';
    }

    // Dependency failures
    if (
      error.includes('module') ||
      error.includes('import') ||
      error.includes('require') ||
      error.includes('dependency')
    ) {
      return 'dependency';
    }

    return 'unknown';
  }

  /**
   * Detect patterns in failures
   */
  private async detectPatterns(failures: TestFailure[]): Promise<FailurePattern[]> {
    const patterns: FailurePattern[] = [];
    const errorGroups = new Map<string, TestFailure[]>();

    // Group by similar errors
    for (const failure of failures) {
      const errorKey = this.extractErrorKey(failure.error);
      if (!errorGroups.has(errorKey)) {
        errorGroups.set(errorKey, []);
      }
      errorGroups.get(errorKey)!.push(failure);
    }

    // Create patterns for groups with multiple occurrences
    for (const [errorKey, groupFailures] of errorGroups) {
      if (groupFailures.length > 1) {
        const pattern: FailurePattern = {
          id: `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          pattern: errorKey,
          description: this.generatePatternDescription(groupFailures),
          occurrences: groupFailures.length,
          affectedTests: groupFailures.map((f) => f.testName),
          confidence: Math.min(groupFailures.length / 10, 1),
          suggestedFix: this.suggestFixForPattern(errorKey, groupFailures),
          relatedPatterns: [],
        };

        patterns.push(pattern);
      }
    }

    // Check against known patterns
    for (const pattern of this.knownPatterns.values()) {
      const matchingFailures = failures.filter((f) =>
        this.matchesPattern(f, pattern.pattern),
      );

      if (matchingFailures.length > 0) {
        patterns.push({
          ...pattern,
          occurrences: matchingFailures.length,
          affectedTests: matchingFailures.map((f) => f.testName),
        });
      }
    }

    return patterns;
  }

  /**
   * Extract error key for grouping
   */
  private extractErrorKey(error: string): string {
    // Remove specific values and keep structure
    return error
      .replace(/\d+/g, 'N') // Replace numbers
      .replace(/'[^']*'/g, 'STRING') // Replace strings
      .replace(/"[^"]*"/g, 'STRING')
      .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, 'UUID') // Replace UUIDs
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .toLowerCase();
  }

  /**
   * Generate pattern description
   */
  private generatePatternDescription(failures: TestFailure[]): string {
    const layers = [...new Set(failures.map((f) => f.layer))];
    const categories = [...new Set(failures.map((f) => f.category))];

    return `Pattern affecting ${failures.length} tests in ${layers.join(', ')} layer(s), ${categories.join(', ')} test(s)`;
  }

  /**
   * Suggest fix for pattern
   */
  private suggestFixForPattern(errorKey: string, failures: TestFailure[]): string {
    const category = this.determineCategory(failures[0]);

    const suggestions: Record<string, string> = {
      'network-api': 'Review API endpoint configurations and network connectivity',
      database: 'Check database connection strings and query syntax',
      rendering: 'Verify component props and DOM structure',
      'state-management': 'Validate state updates and action dispatchers',
      authentication: 'Review authentication tokens and permission checks',
      validation: 'Update validation schemas and error handling',
      'timing-async': 'Add proper async/await handling and increase timeouts',
      resource: 'Review resource allocation and cleanup logic',
      configuration: 'Verify environment configuration and variables',
      dependency: 'Update dependencies and check import paths',
    };

    return suggestions[category] || 'Investigate root cause and apply targeted fix';
  }

  /**
   * Check if failure matches pattern
   */
  private matchesPattern(failure: TestFailure, pattern: string): boolean {
    const errorKey = this.extractErrorKey(failure.error);
    return errorKey.includes(pattern.toLowerCase()) || pattern.toLowerCase().includes(errorKey);
  }

  /**
   * Identify root causes
   */
  private async identifyRootCauses(
    failures: TestFailure[],
    patterns: FailurePattern[],
  ): Promise<RootCause[]> {
    const rootCauses: RootCause[] = [];
    const causesMap = new Map<string, RootCause>();

    // Analyze patterns for root causes
    for (const pattern of patterns) {
      const category = this.determineCategory(failures[0]);
      const causeId = `cause_${category}`;

      if (!causesMap.has(causeId)) {
        const rootCause: RootCause = {
          id: causeId,
          category,
          description: this.generateRootCauseDescription(category, pattern),
          evidence: [pattern.description],
          confidence: pattern.confidence,
          affectedComponents: this.extractAffectedComponents(failures),
          potentialSolutions: this.generatePotentialSolutions(category),
          priority: this.calculateRootCausePriority(failures),
        };

        causesMap.set(causeId, rootCause);
      } else {
        const existing = causesMap.get(causeId)!;
        existing.evidence.push(pattern.description);
        existing.confidence = Math.min(existing.confidence + 0.1, 1);
      }
    }

    return Array.from(causesMap.values());
  }

  /**
   * Generate root cause description
   */
  private generateRootCauseDescription(category: string, pattern: FailurePattern): string {
    const descriptions: Record<string, string> = {
      'network-api': 'API communication or network connectivity issues',
      database: 'Database query or connection problems',
      rendering: 'Component rendering or DOM manipulation issues',
      'state-management': 'State synchronization or update problems',
      authentication: 'Authentication or authorization failures',
      validation: 'Data validation or schema mismatch issues',
      'timing-async': 'Asynchronous operation or timing problems',
      resource: 'Resource management or memory issues',
      configuration: 'Configuration or environment setup problems',
      dependency: 'Module dependency or import issues',
    };

    return descriptions[category] || `${category} related issues`;
  }

  /**
   * Extract affected components
   */
  private extractAffectedComponents(failures: TestFailure[]): string[] {
    const components = new Set<string>();

    for (const failure of failures) {
      if (failure.affectedComponents && Array.isArray(failure.affectedComponents)) {
        failure.affectedComponents.forEach(comp => components.add(comp));
      }
    }

    return Array.from(components);
  }

  /**
   * Generate potential solutions
   */
  private generatePotentialSolutions(category: string): string[] {
    const solutions: Record<string, string[]> = {
      'network-api': [
        'Verify API endpoint URLs',
        'Check CORS configuration',
        'Add proper error handling for network failures',
        'Implement retry logic with exponential backoff',
      ],
      database: [
        'Verify database connection strings',
        'Check query syntax and parameters',
        'Add proper transaction handling',
        'Implement connection pooling',
      ],
      rendering: [
        'Verify component props are correctly passed',
        'Check for null/undefined values before rendering',
        'Add proper error boundaries',
        'Use conditional rendering for optional elements',
      ],
      'state-management': [
        'Verify action dispatchers are correctly wired',
        'Check reducer logic for state updates',
        'Add proper state initialization',
        'Use immutable update patterns',
      ],
      authentication: [
        'Verify token generation and validation',
        'Check permission configurations',
        'Add proper session management',
        'Implement token refresh logic',
      ],
      validation: [
        'Update validation schemas',
        'Add comprehensive error messages',
        'Implement client-side validation',
        'Use consistent validation rules',
      ],
      'timing-async': [
        'Add proper async/await handling',
        'Increase timeout values',
        'Implement proper promise chaining',
        'Use Promise.all for parallel operations',
      ],
      resource: [
        'Implement proper cleanup in useEffect/componentWillUnmount',
        'Check for memory leaks',
        'Add resource pooling',
        'Implement proper caching strategies',
      ],
      configuration: [
        'Verify environment variables',
        'Check configuration file syntax',
        'Add proper default values',
        'Use configuration validation',
      ],
      dependency: [
        'Update outdated dependencies',
        'Check import paths',
        'Verify package.json configurations',
        'Use consistent module resolution',
      ],
    };

    return solutions[category] || ['Investigate and apply appropriate fix'];
  }

  /**
   * Calculate root cause priority
   */
  private calculateRootCausePriority(failures: TestFailure[]): number {
    let priority = 50;

    // Severity impact
    const criticalCount = failures.filter((f) => f.severity === 'critical').length;
    const highCount = failures.filter((f) => f.severity === 'high').length;

    priority += criticalCount * 10;
    priority += highCount * 5;

    // Quantity impact
    priority += Math.min(failures.length * 2, 30);

    return Math.min(priority, 100);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    failures: TestFailure[],
    patterns: FailurePattern[],
    rootCauses: RootCause[],
  ): AnalysisRecommendation[] {
    const recommendations: AnalysisRecommendation[] = [];

    // Recommendations from root causes
    for (const cause of rootCauses) {
      const recommendation: AnalysisRecommendation = {
        type: cause.priority > 70 ? 'fix' : cause.priority > 50 ? 'refactor' : 'investigate',
        priority: this.mapPriorityToLevel(cause.priority),
        description: cause.potentialSolutions[0],
        reasoning: `Root cause: ${cause.description}. Affects ${cause.affectedComponents.length} component(s).`,
        estimatedEffort: this.estimateEffort(cause.priority, cause.affectedComponents.length),
        expectedImpact: this.estimateImpact(failures, cause),
      };

      recommendations.push(recommendation);
    }

    // Pattern-based recommendations
    for (const pattern of patterns.slice(0, 3)) {
      // Top 3 patterns
      if (pattern.occurrences > 2) {
        recommendations.push({
          type: 'fix',
          priority: 'high',
          description: pattern.suggestedFix,
          reasoning: `Pattern detected in ${pattern.occurrences} tests`,
          estimatedEffort: 30,
          expectedImpact: (pattern.occurrences / failures.length) * 100,
        });
      }
    }

    // General recommendations
    if (failures.filter((f) => f.category === 'e2e').length > failures.length * 0.5) {
      recommendations.push({
        type: 'investigate',
        priority: 'medium',
        description: 'High number of E2E test failures - review integration points',
        reasoning: 'E2E failures often indicate integration or environment issues',
        estimatedEffort: 45,
        expectedImpact: 40,
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Map priority number to level
   */
  private mapPriorityToLevel(priority: number): 'critical' | 'high' | 'medium' | 'low' {
    if (priority >= 80) return 'critical';
    if (priority >= 60) return 'high';
    if (priority >= 40) return 'medium';
    return 'low';
  }

  /**
   * Estimate effort
   */
  private estimateEffort(priority: number, componentCount: number): number {
    const basEffort = 20; // minutes
    const priorityMultiplier = priority / 50;
    const complexityMultiplier = 1 + componentCount * 0.2;

    return Math.round(basEffort * priorityMultiplier * complexityMultiplier);
  }

  /**
   * Estimate impact
   */
  private estimateImpact(failures: TestFailure[], cause: RootCause): number {
    const relatedFailures = failures.filter((f) =>
      cause.affectedComponents.some((c) => f.affectedComponents.includes(c)),
    );

    return (relatedFailures.length / failures.length) * 100;
  }

  /**
   * Assess impact
   */
  private assessImpact(failures: TestFailure[]): ImpactAssessment {
    const criticalFailures = failures.filter((f) => f.severity === 'critical').length;
    const highFailures = failures.filter((f) => f.severity === 'high').length;

    // Determine users affected
    let usersAffected: ImpactAssessment['usersAffected'] = 'none';
    if (failures.length > 10) usersAffected = 'all';
    else if (failures.length > 5) usersAffected = 'many';
    else if (failures.length > 2) usersAffected = 'few';

    // Features affected
    const featuresAffected = [...new Set(failures.flatMap((f) => f.affectedComponents))];

    // Business impact
    let businessImpact: ImpactAssessment['businessImpact'] = 'low';
    if (criticalFailures > 0) businessImpact = 'critical';
    else if (highFailures > 3) businessImpact = 'high';
    else if (failures.length > 5) businessImpact = 'medium';

    // Urgency
    const urgency = Math.min(
      50 + criticalFailures * 20 + highFailures * 10 + failures.length * 2,
      100,
    );

    // Risk level
    let riskLevel: ImpactAssessment['riskLevel'] = 'low';
    if (criticalFailures > 0) riskLevel = 'critical';
    else if (highFailures > 2) riskLevel = 'high';
    else if (failures.length > 5) riskLevel = 'medium';

    return {
      usersAffected,
      featuresAffected,
      businessImpact,
      urgency,
      riskLevel,
    };
  }

  /**
   * Initialize known patterns
   */
  private initializeKnownPatterns(): void {
    const commonPatterns: FailurePattern[] = [
      {
        id: 'api-timeout',
        pattern: 'timeout',
        description: 'API request timeout pattern',
        occurrences: 0,
        affectedTests: [],
        confidence: 0.9,
        suggestedFix: 'Increase timeout values or optimize API response time',
        relatedPatterns: ['network-api'],
      },
      {
        id: 'null-reference',
        pattern: 'cannot read property',
        description: 'Null reference error pattern',
        occurrences: 0,
        affectedTests: [],
        confidence: 0.95,
        suggestedFix: 'Add null checks and proper initialization',
        relatedPatterns: ['rendering', 'state-management'],
      },
      {
        id: 'async-race',
        pattern: 'promise',
        description: 'Asynchronous operation race condition',
        occurrences: 0,
        affectedTests: [],
        confidence: 0.8,
        suggestedFix: 'Add proper async/await handling and synchronization',
        relatedPatterns: ['timing-async'],
      },
    ];

    for (const pattern of commonPatterns) {
      this.knownPatterns.set(pattern.id, pattern);
    }
  }
}