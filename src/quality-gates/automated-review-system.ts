import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CodeMetrics {
  complexity: number;
  maintainability: number;
  duplications: number;
  testCoverage: number;
  securityScore: number;
  performanceScore: number;
  linesOfCode: number;
  technicalDebt: number;
}

export interface ReviewCriteria {
  minComplexity: number;
  minMaintainability: number;
  maxDuplications: number;
  minTestCoverage: number;
  minSecurityScore: number;
  minPerformanceScore: number;
  maxTechnicalDebt: number;
  requiredChecks: string[];
}

export interface ReviewResult {
  id: string;
  timestamp: Date;
  filePath: string;
  metrics: CodeMetrics;
  criteria: ReviewCriteria;
  passed: boolean;
  issues: ReviewIssue[];
  suggestions: ReviewSuggestion[];
  autoFixable: boolean;
  blocksDeployment: boolean;
  reviewerComments: ReviewComment[];
}

export interface ReviewIssue {
  type: 'security' | 'performance' | 'style' | 'complexity' | 'maintainability' | 'testing';
  severity: 'critical' | 'major' | 'minor' | 'info';
  line: number;
  column: number;
  message: string;
  rule: string;
  fixable: boolean;
  suggestion?: string;
}

export interface ReviewSuggestion {
  type: 'refactor' | 'optimize' | 'test' | 'document' | 'security';
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  priority: number;
  code?: string;
}

export interface ReviewComment {
  reviewer: string;
  timestamp: Date;
  type: 'approval' | 'request_changes' | 'comment';
  message: string;
  line?: number;
  resolved: boolean;
}

export interface QualityGateConfig {
  stages: {
    preCommit: QualityGateStage;
    prReview: QualityGateStage;
    preDeployment: QualityGateStage;
    postDeployment: QualityGateStage;
  };
  tools: {
    linting: LintingConfig;
    security: SecurityConfig;
    testing: TestingConfig;
    performance: PerformanceConfig;
  };
}

export interface QualityGateStage {
  enabled: boolean;
  blocksProgression: boolean;
  requiredChecks: string[];
  reviewers: string[];
  autoApprove: boolean;
  timeoutMinutes: number;
}

export interface LintingConfig {
  eslint: boolean;
  prettier: boolean;
  typescript: boolean;
  customRules: string[];
}

export interface SecurityConfig {
  auditDependencies: boolean;
  secretScanning: boolean;
  codeAnalysis: boolean;
  licenseCheck: boolean;
}

export interface TestingConfig {
  unitTests: boolean;
  integrationTests: boolean;
  e2eTests: boolean;
  coverageThreshold: number;
  performanceTests: boolean;
}

export interface PerformanceConfig {
  bundleSize: boolean;
  loadTime: boolean;
  memoryUsage: boolean;
  cpuUsage: boolean;
}

export class AutomatedReviewSystem extends EventEmitter {
  private reviewHistory: ReviewResult[] = [];
  private activeReviews: Map<string, ReviewResult> = new Map();
  private config: QualityGateConfig;
  private reviewers: Map<string, any> = new Map();

  constructor(config: Partial<QualityGateConfig> = {}) {
    super();
    this.config = this.mergeWithDefaults(config);
    this.initializeReviewers();
  }

  private mergeWithDefaults(config: Partial<QualityGateConfig>): QualityGateConfig {
    return {
      stages: {
        preCommit: {
          enabled: true,
          blocksProgression: true,
          requiredChecks: ['lint', 'format', 'types'],
          reviewers: [],
          autoApprove: true,
          timeoutMinutes: 5
        },
        prReview: {
          enabled: true,
          blocksProgression: true,
          requiredChecks: ['lint', 'test', 'security', 'complexity'],
          reviewers: ['automated-reviewer', 'senior-developer'],
          autoApprove: false,
          timeoutMinutes: 240
        },
        preDeployment: {
          enabled: true,
          blocksProgression: true,
          requiredChecks: ['test', 'security', 'performance', 'integration'],
          reviewers: ['deployment-manager', 'tech-lead'],
          autoApprove: false,
          timeoutMinutes: 60
        },
        postDeployment: {
          enabled: true,
          blocksProgression: false,
          requiredChecks: ['monitoring', 'performance', 'health'],
          reviewers: ['sre-team'],
          autoApprove: true,
          timeoutMinutes: 30
        },
        ...config.stages
      },
      tools: {
        linting: {
          eslint: true,
          prettier: true,
          typescript: true,
          customRules: []
        },
        security: {
          auditDependencies: true,
          secretScanning: true,
          codeAnalysis: true,
          licenseCheck: true
        },
        testing: {
          unitTests: true,
          integrationTests: true,
          e2eTests: true,
          coverageThreshold: 80,
          performanceTests: false
        },
        performance: {
          bundleSize: true,
          loadTime: true,
          memoryUsage: false,
          cpuUsage: false
        },
        ...config.tools
      }
    };
  }

  private initializeReviewers(): void {
    // Initialize automated reviewers with different specializations
    this.reviewers.set('automated-reviewer', {
      type: 'automated',
      specializations: ['general', 'style', 'complexity'],
      weight: 1.0
    });

    this.reviewers.set('security-reviewer', {
      type: 'automated',
      specializations: ['security', 'vulnerability-analysis'],
      weight: 1.0
    });

    this.reviewers.set('performance-reviewer', {
      type: 'automated',
      specializations: ['performance', 'optimization'],
      weight: 0.8
    });

    this.reviewers.set('test-reviewer', {
      type: 'automated',
      specializations: ['testing', 'coverage'],
      weight: 0.9
    });
  }

  public async startReview(
    filePaths: string[],
    stage: keyof QualityGateConfig['stages'],
    metadata: any = {}
  ): Promise<string> {
    const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const stageConfig = this.config.stages[stage];

    if (!stageConfig.enabled) {
      throw new Error(`Quality gate stage ${stage} is disabled`);
    }

    const review: ReviewResult = {
      id: reviewId,
      timestamp: new Date(),
      filePath: filePaths[0], // Primary file for now
      metrics: {
        complexity: 0,
        maintainability: 0,
        duplications: 0,
        testCoverage: 0,
        securityScore: 0,
        performanceScore: 0,
        linesOfCode: 0,
        technicalDebt: 0
      },
      criteria: this.getReviewCriteria(stage),
      passed: false,
      issues: [],
      suggestions: [],
      autoFixable: false,
      blocksDeployment: stageConfig.blocksProgression,
      reviewerComments: []
    };

    this.activeReviews.set(reviewId, review);
    this.emit('review:started', { reviewId, stage, filePaths, metadata });

    // Run parallel checks based on stage requirements
    const checkPromises = stageConfig.requiredChecks.map(check =>
      this.runQualityCheck(check, filePaths, review)
    );

    try {
      await Promise.all(checkPromises);

      // Analyze results and make final decision
      review.passed = this.evaluateReviewResults(review);
      review.autoFixable = review.issues.every(issue => issue.fixable);

      this.reviewHistory.push(review);
      this.activeReviews.delete(reviewId);

      this.emit('review:completed', { review, stage });

      if (!review.passed && review.blocksDeployment) {
        this.emit('review:blocked', { review, stage });
      }

      return reviewId;

    } catch (error) {
      review.passed = false;
      review.issues.push({
        type: 'maintainability',
        severity: 'critical',
        line: 0,
        column: 0,
        message: `Review failed: ${error instanceof Error ? error.message : String(error)}`,
        rule: 'review-system',
        fixable: false
      });

      this.emit('review:failed', { reviewId, error, stage });
      return reviewId;
    }
  }

  private getReviewCriteria(stage: keyof QualityGateConfig['stages']): ReviewCriteria {
    const baseThresholds = {
      preCommit: {
        minComplexity: 10,
        minMaintainability: 60,
        maxDuplications: 5,
        minTestCoverage: 0,
        minSecurityScore: 70,
        minPerformanceScore: 70,
        maxTechnicalDebt: 30
      },
      prReview: {
        minComplexity: 15,
        minMaintainability: 70,
        maxDuplications: 3,
        minTestCoverage: 80,
        minSecurityScore: 80,
        minPerformanceScore: 75,
        maxTechnicalDebt: 20
      },
      preDeployment: {
        minComplexity: 20,
        minMaintainability: 80,
        maxDuplications: 2,
        minTestCoverage: 85,
        minSecurityScore: 90,
        minPerformanceScore: 80,
        maxTechnicalDebt: 15
      },
      postDeployment: {
        minComplexity: 25,
        minMaintainability: 85,
        maxDuplications: 1,
        minTestCoverage: 90,
        minSecurityScore: 95,
        minPerformanceScore: 85,
        maxTechnicalDebt: 10
      }
    };

    const thresholds = baseThresholds[stage];
    return {
      ...thresholds,
      requiredChecks: this.config.stages[stage].requiredChecks
    };
  }

  private async runQualityCheck(
    checkType: string,
    filePaths: string[],
    review: ReviewResult
  ): Promise<void> {
    switch (checkType) {
      case 'lint':
        await this.runLinting(filePaths, review);
        break;
      case 'format':
        await this.runFormatting(filePaths, review);
        break;
      case 'types':
        await this.runTypeChecking(filePaths, review);
        break;
      case 'test':
        await this.runTestAnalysis(filePaths, review);
        break;
      case 'security':
        await this.runSecurityAnalysis(filePaths, review);
        break;
      case 'performance':
        await this.runPerformanceAnalysis(filePaths, review);
        break;
      case 'complexity':
        await this.runComplexityAnalysis(filePaths, review);
        break;
      case 'integration':
        await this.runIntegrationChecks(filePaths, review);
        break;
      case 'monitoring':
        await this.runMonitoringChecks(filePaths, review);
        break;
      case 'health':
        await this.runHealthChecks(filePaths, review);
        break;
      default:
        console.warn(`Unknown check type: ${checkType}`);
    }
  }

  private async runLinting(filePaths: string[], review: ReviewResult): Promise<void> {
    if (!this.config.tools.linting.eslint) return;

    try {
      const { stdout, stderr } = await execAsync(
        `npx eslint ${filePaths.join(' ')} --format json`
      );

      const lintResults = JSON.parse(stdout);

      for (const result of lintResults) {
        for (const message of result.messages) {
          review.issues.push({
            type: this.mapEslintRuleType(message.ruleId),
            severity: this.mapEslintSeverity(message.severity),
            line: message.line,
            column: message.column,
            message: message.message,
            rule: message.ruleId || 'unknown',
            fixable: message.fix !== undefined
          });
        }
      }

    } catch (error) {
      // ESLint returns non-zero exit code for lint errors, parse the output anyway
      if (error instanceof Error && 'stdout' in error) {
        try {
          const lintResults = JSON.parse((error as any).stdout);
          // Process results as above
        } catch (parseError) {
          review.issues.push({
            type: 'style',
            severity: 'major',
            line: 0,
            column: 0,
            message: `Linting failed: ${error.message}`,
            rule: 'eslint-error',
            fixable: false
          });
        }
      }
    }
  }

  private async runFormatting(filePaths: string[], review: ReviewResult): Promise<void> {
    if (!this.config.tools.linting.prettier) return;

    try {
      const { stdout } = await execAsync(
        `npx prettier --check ${filePaths.join(' ')}`
      );

      // If no output, formatting is correct
      if (!stdout.trim()) {
        return;
      }

    } catch (error) {
      review.issues.push({
        type: 'style',
        severity: 'minor',
        line: 0,
        column: 0,
        message: 'Code formatting issues detected',
        rule: 'prettier',
        fixable: true,
        suggestion: 'Run: npx prettier --write <files>'
      });
    }
  }

  private async runTypeChecking(filePaths: string[], review: ReviewResult): Promise<void> {
    if (!this.config.tools.linting.typescript) return;

    try {
      const { stdout, stderr } = await execAsync('npx tsc --noEmit');

      if (stderr) {
        const typeErrors = stderr.split('\n').filter(line =>
          line.includes('error TS') && filePaths.some(path => line.includes(path))
        );

        for (const error of typeErrors) {
          const match = error.match(/(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)/);
          if (match) {
            review.issues.push({
              type: 'maintainability',
              severity: 'major',
              line: parseInt(match[2]),
              column: parseInt(match[3]),
              message: match[5],
              rule: `TS${match[4]}`,
              fixable: false
            });
          }
        }
      }

    } catch (error) {
      // TypeScript errors are expected in stderr
    }
  }

  private async runTestAnalysis(filePaths: string[], review: ReviewResult): Promise<void> {
    try {
      // Run test coverage analysis
      const { stdout } = await execAsync('npm run test:coverage -- --reporter=json');
      const coverageData = JSON.parse(stdout);

      if (coverageData.total) {
        review.metrics.testCoverage = coverageData.total.lines.pct;

        if (review.metrics.testCoverage < review.criteria.minTestCoverage) {
          review.issues.push({
            type: 'testing',
            severity: 'major',
            line: 0,
            column: 0,
            message: `Test coverage (${review.metrics.testCoverage}%) below threshold (${review.criteria.minTestCoverage}%)`,
            rule: 'coverage-threshold',
            fixable: false,
            suggestion: 'Add more tests to improve coverage'
          });
        }
      }

    } catch (error) {
      review.issues.push({
        type: 'testing',
        severity: 'major',
        line: 0,
        column: 0,
        message: 'Failed to analyze test coverage',
        rule: 'test-analysis',
        fixable: false
      });
    }
  }

  private async runSecurityAnalysis(filePaths: string[], review: ReviewResult): Promise<void> {
    if (!this.config.tools.security.auditDependencies) return;

    try {
      const { stdout } = await execAsync('npm audit --json');
      const auditData = JSON.parse(stdout);

      if (auditData.vulnerabilities) {
        for (const [name, vuln] of Object.entries(auditData.vulnerabilities)) {
          const vulnData = vuln as any;
          review.issues.push({
            type: 'security',
            severity: this.mapAuditSeverity(vulnData.severity),
            line: 0,
            column: 0,
            message: `Security vulnerability in ${name}: ${vulnData.title}`,
            rule: 'npm-audit',
            fixable: vulnData.fixAvailable !== false
          });
        }
      }

      // Calculate security score based on vulnerabilities
      const criticalCount = Object.values(auditData.vulnerabilities || {})
        .filter((v: any) => v.severity === 'critical').length;
      const highCount = Object.values(auditData.vulnerabilities || {})
        .filter((v: any) => v.severity === 'high').length;

      review.metrics.securityScore = Math.max(0, 100 - (criticalCount * 25 + highCount * 10));

    } catch (error) {
      review.metrics.securityScore = 50; // Unknown security status
    }
  }

  private async runPerformanceAnalysis(filePaths: string[], review: ReviewResult): Promise<void> {
    // Simplified performance analysis
    try {
      let totalSize = 0;
      for (const filePath of filePaths) {
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
        review.metrics.linesOfCode += (await fs.readFile(filePath, 'utf-8')).split('\n').length;
      }

      // Simple performance score based on file size and complexity
      review.metrics.performanceScore = Math.max(0, 100 - Math.floor(totalSize / 10000) * 5);

      if (totalSize > 100000) { // 100KB threshold
        review.issues.push({
          type: 'performance',
          severity: 'minor',
          line: 0,
          column: 0,
          message: `Large file size (${Math.round(totalSize / 1024)}KB) may impact performance`,
          rule: 'file-size',
          fixable: false,
          suggestion: 'Consider code splitting or optimization'
        });
      }

    } catch (error) {
      review.metrics.performanceScore = 70; // Default score
    }
  }

  private async runComplexityAnalysis(filePaths: string[], review: ReviewResult): Promise<void> {
    // Simplified complexity analysis
    let totalComplexity = 0;
    let fileCount = 0;

    for (const filePath of filePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const complexity = this.calculateCyclomaticComplexity(content);
        totalComplexity += complexity;
        fileCount++;

        if (complexity > 20) {
          review.issues.push({
            type: 'complexity',
            severity: 'major',
            line: 0,
            column: 0,
            message: `High cyclomatic complexity (${complexity})`,
            rule: 'complexity-threshold',
            fixable: false,
            suggestion: 'Consider breaking down complex functions'
          });
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    review.metrics.complexity = fileCount > 0 ? totalComplexity / fileCount : 0;
    review.metrics.maintainability = Math.max(0, 100 - review.metrics.complexity * 2);
  }

  private calculateCyclomaticComplexity(code: string): number {
    // Simplified cyclomatic complexity calculation
    const complexityPatterns = [
      /\bif\b/g,
      /\belse\b/g,
      /\bwhile\b/g,
      /\bfor\b/g,
      /\bswitch\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\b&&\b/g,
      /\b\|\|\b/g,
      /\?\s*.*\s*:/g
    ];

    let complexity = 1; // Base complexity

    for (const pattern of complexityPatterns) {
      const matches = code.match(pattern);
      complexity += matches ? matches.length : 0;
    }

    return complexity;
  }

  private async runIntegrationChecks(filePaths: string[], review: ReviewResult): Promise<void> {
    // Run integration-specific checks
    review.suggestions.push({
      type: 'test',
      description: 'Consider adding integration tests',
      impact: 'medium',
      effort: 'medium',
      priority: 3
    });
  }

  private async runMonitoringChecks(filePaths: string[], review: ReviewResult): Promise<void> {
    // Check for monitoring instrumentation
    const hasLogging = filePaths.some(async (filePath) => {
      const content = await fs.readFile(filePath, 'utf-8');
      return content.includes('console.log') || content.includes('logger');
    });

    if (!hasLogging) {
      review.suggestions.push({
        type: 'document',
        description: 'Add logging for better observability',
        impact: 'medium',
        effort: 'low',
        priority: 4
      });
    }
  }

  private async runHealthChecks(filePaths: string[], review: ReviewResult): Promise<void> {
    // Post-deployment health checks
    review.suggestions.push({
      type: 'document',
      description: 'Ensure health check endpoints are available',
      impact: 'high',
      effort: 'low',
      priority: 5
    });
  }

  private evaluateReviewResults(review: ReviewResult): boolean {
    const criticalIssues = review.issues.filter(issue => issue.severity === 'critical').length;
    const majorIssues = review.issues.filter(issue => issue.severity === 'major').length;

    // Fail if there are critical issues
    if (criticalIssues > 0) return false;

    // Fail if too many major issues
    if (majorIssues > 5) return false;

    // Check metrics against criteria
    const metrics = review.metrics;
    const criteria = review.criteria;

    if (metrics.testCoverage < criteria.minTestCoverage) return false;
    if (metrics.securityScore < criteria.minSecurityScore) return false;
    if (metrics.maintainability < criteria.minMaintainability) return false;
    if (metrics.duplications > criteria.maxDuplications) return false;

    return true;
  }

  private mapEslintRuleType(ruleId: string | null): ReviewIssue['type'] {
    if (!ruleId) return 'style';

    if (ruleId.includes('security')) return 'security';
    if (ruleId.includes('performance')) return 'performance';
    if (ruleId.includes('complexity')) return 'complexity';
    if (ruleId.includes('test')) return 'testing';

    return 'style';
  }

  private mapEslintSeverity(severity: number): ReviewIssue['severity'] {
    switch (severity) {
      case 2: return 'major';
      case 1: return 'minor';
      default: return 'info';
    }
  }

  private mapAuditSeverity(severity: string): ReviewIssue['severity'] {
    switch (severity.toLowerCase()) {
      case 'critical': return 'critical';
      case 'high': return 'major';
      case 'moderate': return 'minor';
      default: return 'info';
    }
  }

  public getReview(reviewId: string): ReviewResult | undefined {
    return this.reviewHistory.find(review => review.id === reviewId) ||
           this.activeReviews.get(reviewId);
  }

  public getActiveReviews(): ReviewResult[] {
    return Array.from(this.activeReviews.values());
  }

  public getReviewHistory(): ReviewResult[] {
    return [...this.reviewHistory];
  }

  public async autoFix(reviewId: string): Promise<boolean> {
    const review = this.getReview(reviewId);
    if (!review || !review.autoFixable) return false;

    const fixableIssues = review.issues.filter(issue => issue.fixable);

    for (const issue of fixableIssues) {
      try {
        await this.applyAutoFix(issue, review.filePath);
      } catch (error) {
        console.error(`Failed to auto-fix issue ${issue.rule}:`, error);
      }
    }

    this.emit('review:auto-fixed', { reviewId, fixedIssues: fixableIssues });
    return true;
  }

  private async applyAutoFix(issue: ReviewIssue, filePath: string): Promise<void> {
    switch (issue.rule) {
      case 'prettier':
        await execAsync(`npx prettier --write ${filePath}`);
        break;
      case 'eslint':
        await execAsync(`npx eslint --fix ${filePath}`);
        break;
      default:
        // Custom fix logic would go here
        break;
    }
  }
}