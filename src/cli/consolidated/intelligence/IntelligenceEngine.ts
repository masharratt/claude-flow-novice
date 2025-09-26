/**
 * IntelligenceEngine - Smart task analysis and agent selection
 * Analyzes natural language input to select optimal agents and workflows
 */

import { TierManager, UserTier, CommandMetadata } from '../core/TierManager.js';

export interface TaskAnalysis {
  intent: string;
  domain: string;
  complexity: number;
  estimatedTime: string;
  recommendedAgents: AgentRecommendation[];
  workflow: WorkflowStep[];
  confidence: number;
}

export interface AgentRecommendation {
  type: string;
  role: string;
  priority: number;
  reasoning: string;
  estimatedDuration: string;
}

export interface WorkflowStep {
  id: string;
  action: string;
  agent: string;
  dependencies: string[];
  description: string;
  parallel: boolean;
}

export interface ProjectContext {
  type: 'web' | 'mobile' | 'api' | 'desktop' | 'ml' | 'unknown';
  framework?: string;
  language: string[];
  hasTests: boolean;
  hasCi: boolean;
  packageManager: string;
  gitInitialized: boolean;
  dependencies: string[];
}

export class IntelligenceEngine {
  private tierManager: TierManager;
  private projectContext: ProjectContext | null = null;

  // Domain classification patterns
  private readonly domainPatterns = {
    frontend: /\b(ui|frontend|react|vue|angular|component|styling|css|html|responsive|mobile)\b/i,
    backend: /\b(api|server|backend|database|auth|endpoint|middleware|rest|graphql|microservice)\b/i,
    testing: /\b(test|testing|unit|integration|e2e|coverage|mock|spec|tdd|bdd)\b/i,
    deployment: /\b(deploy|deployment|ci|cd|docker|kubernetes|aws|azure|production|staging)\b/i,
    security: /\b(security|auth|authentication|authorization|jwt|oauth|encryption|vulnerability)\b/i,
    performance: /\b(performance|optimization|speed|cache|lazy|bundle|memory|cpu)\b/i,
    database: /\b(database|db|sql|nosql|mongodb|postgres|mysql|migration|schema)\b/i,
    documentation: /\b(docs|documentation|readme|guide|tutorial|example|comment)\b/i
  };

  // Complexity indicators
  private readonly complexityIndicators = {
    simple: /\b(simple|basic|quick|easy|small|add|create|generate)\b/i,
    medium: /\b(implement|build|develop|integrate|configure|setup|refactor)\b/i,
    complex: /\b(architect|design|optimize|scale|migrate|complex|advanced|enterprise)\b/i
  };

  // Agent specializations mapped to capabilities
  private readonly agentCapabilities = {
    'researcher': ['analysis', 'planning', 'requirements', 'documentation'],
    'coder': ['implementation', 'coding', 'features', 'algorithms'],
    'tester': ['testing', 'quality', 'validation', 'coverage'],
    'reviewer': ['code-review', 'security', 'best-practices', 'standards'],
    'architect': ['system-design', 'architecture', 'scalability', 'patterns'],
    'backend-dev': ['api', 'server', 'database', 'microservices'],
    'frontend-dev': ['ui', 'react', 'vue', 'angular', 'styling'],
    'devops': ['deployment', 'ci-cd', 'infrastructure', 'monitoring'],
    'security-expert': ['security', 'authentication', 'encryption', 'audit'],
    'perf-optimizer': ['performance', 'optimization', 'benchmarking', 'profiling'],
    'ml-developer': ['machine-learning', 'ai', 'data-science', 'models']
  };

  constructor(tierManager: TierManager) {
    this.tierManager = tierManager;
  }

  async analyzeTask(input: string, context?: any): Promise<TaskAnalysis> {
    // Analyze project context if not cached
    if (!this.projectContext) {
      this.projectContext = await this.detectProjectContext();
    }

    const intent = this.extractIntent(input);
    const domain = this.classifyDomain(input);
    const complexity = this.assessComplexity(input);
    const agents = this.recommendAgents(input, domain, complexity);
    const workflow = this.generateWorkflow(agents, input, complexity);

    return {
      intent,
      domain,
      complexity,
      estimatedTime: this.estimateTime(complexity, agents.length),
      recommendedAgents: agents,
      workflow,
      confidence: this.calculateConfidence(input, domain, agents)
    };
  }

  private extractIntent(input: string): string {
    const intentPatterns = {
      'create': /\b(create|make|build|generate|add|new)\b/i,
      'modify': /\b(update|change|modify|edit|refactor|improve)\b/i,
      'fix': /\b(fix|repair|debug|solve|resolve|correct)\b/i,
      'test': /\b(test|verify|validate|check|ensure)\b/i,
      'deploy': /\b(deploy|release|publish|launch)\b/i,
      'optimize': /\b(optimize|improve|enhance|speed|performance)\b/i,
      'analyze': /\b(analyze|review|audit|examine|investigate)\b/i,
      'setup': /\b(setup|configure|install|initialize)\b/i
    };

    for (const [intent, pattern] of Object.entries(intentPatterns)) {
      if (pattern.test(input)) {
        return intent;
      }
    }

    return 'general';
  }

  private classifyDomain(input: string): string {
    let maxMatches = 0;
    let bestDomain = 'general';

    for (const [domain, pattern] of Object.entries(this.domainPatterns)) {
      const matches = (input.match(pattern) || []).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        bestDomain = domain;
      }
    }

    return bestDomain;
  }

  private assessComplexity(input: string): number {
    if (this.complexityIndicators.complex.test(input)) return 4;
    if (this.complexityIndicators.medium.test(input)) return 3;
    if (this.complexityIndicators.simple.test(input)) return 2;

    // Base complexity on length and technical terms
    const wordCount = input.split(/\s+/).length;
    const technicalTerms = (input.match(/\b(api|database|authentication|deployment|optimization|architecture)\b/gi) || []).length;

    return Math.min(5, Math.max(1, Math.floor(wordCount / 10) + technicalTerms));
  }

  private recommendAgents(input: string, domain: string, complexity: number): AgentRecommendation[] {
    const recommendations: AgentRecommendation[] = [];
    const currentTier = this.tierManager.getCurrentTier();

    // Always include a researcher for complex tasks
    if (complexity >= 3) {
      recommendations.push({
        type: 'researcher',
        role: 'Requirements Analysis',
        priority: 1,
        reasoning: 'Complex task requires thorough analysis and planning',
        estimatedDuration: '5-10 minutes'
      });
    }

    // Domain-specific agent selection
    switch (domain) {
      case 'frontend':
        recommendations.push({
          type: currentTier === UserTier.NOVICE ? 'coder' : 'frontend-dev',
          role: 'Frontend Development',
          priority: 1,
          reasoning: 'Task involves UI/UX development',
          estimatedDuration: this.getDurationByComplexity(complexity)
        });
        break;

      case 'backend':
        recommendations.push({
          type: currentTier === UserTier.NOVICE ? 'coder' : 'backend-dev',
          role: 'Backend Development',
          priority: 1,
          reasoning: 'Task involves server-side development',
          estimatedDuration: this.getDurationByComplexity(complexity)
        });
        break;

      case 'testing':
        recommendations.push({
          type: 'tester',
          role: 'Quality Assurance',
          priority: 1,
          reasoning: 'Task focuses on testing and quality',
          estimatedDuration: this.getDurationByComplexity(complexity)
        });
        break;

      case 'deployment':
        if (currentTier !== UserTier.NOVICE) {
          recommendations.push({
            type: 'devops',
            role: 'DevOps Engineering',
            priority: 1,
            reasoning: 'Task involves deployment and infrastructure',
            estimatedDuration: this.getDurationByComplexity(complexity)
          });
        } else {
          recommendations.push({
            type: 'coder',
            role: 'Development & Deployment',
            priority: 1,
            reasoning: 'Simplified deployment through general development agent',
            estimatedDuration: this.getDurationByComplexity(complexity)
          });
        }
        break;

      default:
        recommendations.push({
          type: 'coder',
          role: 'General Development',
          priority: 1,
          reasoning: 'General development task',
          estimatedDuration: this.getDurationByComplexity(complexity)
        });
    }

    // Add reviewer for complex tasks if not novice tier
    if (complexity >= 4 && currentTier !== UserTier.NOVICE) {
      recommendations.push({
        type: 'reviewer',
        role: 'Code Review',
        priority: 2,
        reasoning: 'Complex implementation benefits from code review',
        estimatedDuration: '5-15 minutes'
      });
    }

    return recommendations.slice(0, currentTier === UserTier.NOVICE ? 2 : 5);
  }

  private generateWorkflow(agents: AgentRecommendation[], input: string, complexity: number): WorkflowStep[] {
    const steps: WorkflowStep[] = [];

    // Step 1: Research/Analysis (if needed)
    const hasResearcher = agents.some(a => a.type === 'researcher');
    if (hasResearcher) {
      steps.push({
        id: 'analysis',
        action: 'Analyze requirements and plan implementation',
        agent: 'researcher',
        dependencies: [],
        description: 'Research best practices and create implementation plan',
        parallel: false
      });
    }

    // Step 2: Implementation
    const implementationAgents = agents.filter(a => a.type !== 'researcher' && a.type !== 'reviewer');

    if (implementationAgents.length === 1) {
      steps.push({
        id: 'implementation',
        action: 'Implement the requested feature',
        agent: implementationAgents[0].type,
        dependencies: hasResearcher ? ['analysis'] : [],
        description: input,
        parallel: false
      });
    } else {
      // Multiple implementation agents can work in parallel
      implementationAgents.forEach((agent, index) => {
        steps.push({
          id: `implementation_${index}`,
          action: `Implement ${agent.role.toLowerCase()} components`,
          agent: agent.type,
          dependencies: hasResearcher ? ['analysis'] : [],
          description: `${agent.role} implementation for: ${input}`,
          parallel: implementationAgents.length > 1
        });
      });
    }

    // Step 3: Review (if needed)
    const hasReviewer = agents.some(a => a.type === 'reviewer');
    if (hasReviewer) {
      const implementationIds = steps
        .filter(s => s.id.startsWith('implementation'))
        .map(s => s.id);

      steps.push({
        id: 'review',
        action: 'Review implementation for quality and standards',
        agent: 'reviewer',
        dependencies: implementationIds,
        description: 'Code review and quality assurance',
        parallel: false
      });
    }

    return steps;
  }

  private getDurationByComplexity(complexity: number): string {
    const durations = {
      1: '2-5 minutes',
      2: '5-10 minutes',
      3: '10-20 minutes',
      4: '20-40 minutes',
      5: '40+ minutes'
    };
    return durations[complexity as keyof typeof durations] || '10-20 minutes';
  }

  private estimateTime(complexity: number, agentCount: number): string {
    const baseTime = complexity * 5; // Base minutes
    const parallelFactor = agentCount > 1 ? 0.7 : 1; // 30% time reduction for parallel work
    const totalMinutes = Math.round(baseTime * parallelFactor);

    if (totalMinutes < 60) {
      return `${totalMinutes} minutes`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hours}h ${minutes}m`;
    }
  }

  private calculateConfidence(input: string, domain: string, agents: AgentRecommendation[]): number {
    let confidence = 0.7; // Base confidence

    // Boost confidence for clear domain classification
    if (domain !== 'general') confidence += 0.1;

    // Boost confidence for specific keywords
    if (this.hasSpecificKeywords(input)) confidence += 0.1;

    // Boost confidence for appropriate agent selection
    if (agents.length > 0) confidence += 0.1;

    return Math.min(1.0, confidence);
  }

  private hasSpecificKeywords(input: string): boolean {
    const specificKeywords = /\b(react|vue|angular|express|fastapi|django|postgres|mongodb|jwt|docker|kubernetes|aws|azure)\b/i;
    return specificKeywords.test(input);
  }

  async detectProjectContext(): Promise<ProjectContext> {
    try {
      // Read package.json if it exists
      const packageJsonPath = process.cwd() + '/package.json';
      let packageJson: any = {};

      try {
        const fs = await import('fs');
        const content = fs.readFileSync(packageJsonPath, 'utf-8');
        packageJson = JSON.parse(content);
      } catch {
        // No package.json or not readable
      }

      // Detect project type and framework
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      const type = this.detectProjectType(dependencies);
      const framework = this.detectFramework(dependencies);
      const language = this.detectLanguages();

      return {
        type,
        framework,
        language,
        hasTests: this.hasTestFiles(),
        hasCi: this.hasCiConfig(),
        packageManager: this.detectPackageManager(),
        gitInitialized: this.isGitInitialized(),
        dependencies: Object.keys(dependencies)
      };
    } catch (error) {
      return {
        type: 'unknown',
        language: ['javascript'],
        hasTests: false,
        hasCi: false,
        packageManager: 'npm',
        gitInitialized: false,
        dependencies: []
      };
    }
  }

  private detectProjectType(dependencies: Record<string, string>): ProjectContext['type'] {
    if (dependencies.react || dependencies.vue || dependencies.angular) return 'web';
    if (dependencies['react-native'] || dependencies.flutter) return 'mobile';
    if (dependencies.express || dependencies.fastify || dependencies.koa) return 'api';
    if (dependencies.electron || dependencies.tauri) return 'desktop';
    if (dependencies.tensorflow || dependencies.pytorch) return 'ml';
    return 'unknown';
  }

  private detectFramework(dependencies: Record<string, string>): string | undefined {
    if (dependencies.react) return 'react';
    if (dependencies.vue) return 'vue';
    if (dependencies.angular) return 'angular';
    if (dependencies.express) return 'express';
    if (dependencies.fastapi) return 'fastapi';
    if (dependencies.django) return 'django';
    return undefined;
  }

  private detectLanguages(): string[] {
    const languages = ['javascript'];

    try {
      const fs = require('fs');
      const files = fs.readdirSync(process.cwd());

      if (files.some((f: string) => f.endsWith('.ts') || f === 'tsconfig.json')) {
        languages.push('typescript');
      }
      if (files.some((f: string) => f.endsWith('.py'))) {
        languages.push('python');
      }
      if (files.some((f: string) => f.endsWith('.rs') || f === 'Cargo.toml')) {
        languages.push('rust');
      }
    } catch {
      // Fallback to javascript only
    }

    return languages;
  }

  private hasTestFiles(): boolean {
    try {
      const fs = require('fs');
      const files = fs.readdirSync(process.cwd());
      return files.some((f: string) =>
        f.includes('test') || f.includes('spec') || f === 'jest.config.js'
      );
    } catch {
      return false;
    }
  }

  private hasCiConfig(): boolean {
    try {
      const fs = require('fs');
      const files = fs.readdirSync(process.cwd());
      return files.some((f: string) =>
        f === '.github' || f === '.gitlab-ci.yml' || f === 'Jenkinsfile'
      );
    } catch {
      return false;
    }
  }

  private detectPackageManager(): string {
    try {
      const fs = require('fs');
      const files = fs.readdirSync(process.cwd());

      if (files.includes('yarn.lock')) return 'yarn';
      if (files.includes('pnpm-lock.yaml')) return 'pnpm';
      if (files.includes('package-lock.json')) return 'npm';
    } catch {
      // Fallback
    }

    return 'npm';
  }

  private isGitInitialized(): boolean {
    try {
      const fs = require('fs');
      return fs.existsSync(process.cwd() + '/.git');
    } catch {
      return false;
    }
  }

  getProjectContext(): ProjectContext | null {
    return this.projectContext;
  }
}