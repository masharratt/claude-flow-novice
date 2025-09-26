/**
 * SPARC Phase Validation Integration - Real SPARC Framework Validation
 * Replaces simulated validation with actual SPARC phase completion checks
 *
 * CRITICAL FEATURES:
 * - Real SPARC phase validation (Specification, Pseudocode, Architecture, Refinement, Completion)
 * - Integration with existing SPARC CLI commands
 * - File-based phase completion verification
 * - Byzantine consensus validation of SPARC deliverables
 * - Quality gates for each SPARC phase
 */

import { spawn, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { ByzantineConsensus } from '../../core/byzantine-consensus.js';

export class SPARCIntegration {
  constructor(options = {}) {
    this.options = {
      timeout: options.timeout || 180000, // 3 minutes per phase
      enableByzantineValidation: options.enableByzantineValidation !== false,
      sparcConfigPath: options.sparcConfigPath,
      qualityGates: options.qualityGates || {},
      phaseWeights: options.phaseWeights || {
        specification: 0.25,
        pseudocode: 0.2,
        architecture: 0.25,
        refinement: 0.15,
        completion: 0.15,
      },
      ...options,
    };

    this.byzantineConsensus = new ByzantineConsensus();
    this.executionHistory = new Map();
    this.phaseValidators = new Map();
  }

  /**
   * Validate real SPARC phase completions
   * NO MORE SIMULATION - Real SPARC framework validation only
   */
  async validateSPARCCompletion(projectPath, sparcConfig = {}) {
    const validationId = this.generateValidationId();
    const startTime = performance.now();

    try {
      console.log(`📋 Executing real SPARC phase validation [${validationId}]...`);

      // Validate SPARC setup and configuration
      const sparcSetup = await this.validateSPARCSetup(projectPath);
      if (!sparcSetup.valid) {
        throw new Error(`SPARC setup invalid: ${sparcSetup.errors.join(', ')}`);
      }

      // Execute real SPARC phase validations
      const phaseResults = await this.validateAllSPARCPhases(projectPath, sparcConfig);

      // Calculate real SPARC completion percentage
      const completionMetrics = this.calculateSPARCCompletion(phaseResults);

      // Validate SPARC quality gates
      const qualityGateResults = await this.validateSPARCQualityGates(phaseResults, projectPath);

      // Byzantine consensus validation of SPARC deliverables
      const byzantineValidation = await this.validateResultsWithConsensus({
        validationId,
        phaseResults,
        completionMetrics,
        qualityGateResults,
        projectPath,
      });

      // Generate cryptographic proof
      const cryptographicProof = this.generateSPARCResultProof({
        validationId,
        phaseResults,
        completionMetrics,
        byzantineValidation,
        timestamp: Date.now(),
      });

      const result = {
        validationId,
        framework: 'sparc',
        realValidation: true, // Confirms no simulation
        sparcCompletion: {
          overallCompletion: completionMetrics.overallCompletion,
          phaseCompletion: completionMetrics.phaseCompletion,
          totalScore: completionMetrics.totalScore,
          success: completionMetrics.overallCompletion >= 0.8, // 80% SPARC completion threshold
        },
        phaseResults: {
          specification: phaseResults.specification,
          pseudocode: phaseResults.pseudocode,
          architecture: phaseResults.architecture,
          refinement: phaseResults.refinement,
          completion: phaseResults.completion,
        },
        qualityGates: {
          passed: qualityGateResults.passed,
          totalGates: qualityGateResults.totalGates,
          passedGates: qualityGateResults.passedGates,
          failedGates: qualityGateResults.failedGates,
          details: qualityGateResults.details,
        },
        byzantineValidation: {
          consensusAchieved: byzantineValidation.consensusAchieved,
          validatorCount: byzantineValidation.validatorCount,
          tamperedResults: byzantineValidation.tamperedResults,
          cryptographicProof,
        },
        performance: {
          validationTime: performance.now() - startTime,
          phaseValidationTimes: this.getPhaseValidationTimes(phaseResults),
        },
        deliverables: await this.catalogSPARCDeliverables(projectPath),
        errors: this.extractValidationErrors(phaseResults),
      };

      // Store execution history
      this.executionHistory.set(validationId, result);

      console.log(
        `✅ SPARC validation completed [${validationId}]: ${(result.sparcCompletion.overallCompletion * 100).toFixed(1)}% complete`,
      );

      return result;
    } catch (error) {
      const errorResult = {
        validationId,
        framework: 'sparc',
        realValidation: true,
        success: false,
        error: error.message,
        validationTime: performance.now() - startTime,
      };

      this.executionHistory.set(validationId, errorResult);
      throw new Error(`SPARC validation failed [${validationId}]: ${error.message}`);
    }
  }

  /**
   * Validate SPARC setup and CLI availability
   */
  async validateSPARCSetup(projectPath) {
    const errors = [];
    let packageJson = null;
    let sparcConfig = null;

    try {
      // Check package.json for SPARC CLI
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
      packageJson = JSON.parse(packageJsonContent);

      const hasSPARC =
        packageJson.devDependencies?.['claude-flow'] ||
        packageJson.dependencies?.['claude-flow'] ||
        packageJson.scripts?.sparc ||
        packageJson.scripts?.['sparc:run'];

      if (!hasSPARC) {
        console.warn('SPARC CLI not found in package.json, checking global installation...');

        // Check for global SPARC installation
        const globalCheck = await this.checkGlobalSPARCInstallation();
        if (!globalCheck.available) {
          errors.push('SPARC CLI not found in project dependencies or global installation');
        }
      }
    } catch (error) {
      errors.push(`Cannot read package.json: ${error.message}`);
    }

    try {
      // Check for SPARC configuration
      const configPaths = [
        path.join(projectPath, 'sparc.config.js'),
        path.join(projectPath, 'sparc.config.json'),
        path.join(projectPath, '.sparcrc'),
        path.join(projectPath, 'package.json'), // sparc field in package.json
      ];

      for (const configPath of configPaths) {
        try {
          await fs.access(configPath);
          if (configPath.endsWith('package.json')) {
            // Check for sparc field in package.json
            if (packageJson?.sparc) {
              sparcConfig = configPath;
              break;
            }
          } else {
            sparcConfig = configPath;
            break;
          }
        } catch (error) {
          // Config file doesn't exist, continue checking
        }
      }
    } catch (error) {
      console.warn(`SPARC configuration check failed: ${error.message}`);
    }

    try {
      // Check for SPARC directories/files indicating SPARC usage
      const sparcIndicators = [
        path.join(projectPath, 'docs'),
        path.join(projectPath, 'architecture'),
        path.join(projectPath, 'specifications'),
        path.join(projectPath, 'README.md'),
        path.join(projectPath, 'ARCHITECTURE.md'),
        path.join(projectPath, 'SPECIFICATION.md'),
      ];

      let sparcIndicatorsFound = false;
      for (const indicatorPath of sparcIndicators) {
        try {
          await fs.access(indicatorPath);
          sparcIndicatorsFound = true;
          break;
        } catch (error) {
          // Indicator doesn't exist, continue checking
        }
      }

      if (!sparcIndicatorsFound) {
        console.warn('No SPARC project indicators found (docs, architecture, specifications)');
      }
    } catch (error) {
      console.warn(`SPARC project structure check failed: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      packageJson,
      sparcConfig,
    };
  }

  /**
   * Check for global SPARC CLI installation
   */
  async checkGlobalSPARCInstallation() {
    return new Promise((resolve) => {
      exec('npx claude-flow sparc --version', (error, stdout, stderr) => {
        resolve({
          available: !error,
          version: stdout.includes('version') ? stdout.trim() : null,
          error: error?.message,
        });
      });
    });
  }

  /**
   * Validate all SPARC phases with real checks
   */
  async validateAllSPARCPhases(projectPath, sparcConfig) {
    const phaseResults = {};

    // Define SPARC phases in order
    const phases = ['specification', 'pseudocode', 'architecture', 'refinement', 'completion'];

    for (const phase of phases) {
      try {
        console.log(`🔍 Validating SPARC ${phase} phase...`);
        const phaseStartTime = performance.now();

        const phaseResult = await this.validateSPARCPhase(projectPath, phase, sparcConfig);

        phaseResults[phase] = {
          ...phaseResult,
          validationTime: performance.now() - phaseStartTime,
        };
      } catch (error) {
        phaseResults[phase] = {
          completed: false,
          score: 0,
          error: error.message,
          validationTime: 0,
          deliverables: [],
        };
      }
    }

    return phaseResults;
  }

  /**
   * Validate individual SPARC phase with real deliverable checks
   */
  async validateSPARCPhase(projectPath, phase, sparcConfig) {
    const phaseValidation = {
      completed: false,
      score: 0,
      deliverables: [],
      qualityMetrics: {},
      errors: [],
    };

    try {
      // Execute SPARC CLI command for phase validation
      const cliResult = await this.executeSPARCCLIValidation(projectPath, phase);

      // Check for phase-specific deliverables
      const deliverables = await this.checkPhaseDeliverables(projectPath, phase);

      // Validate deliverable quality
      const qualityMetrics = await this.validateDeliverableQuality(
        projectPath,
        phase,
        deliverables,
      );

      // Calculate phase completion score
      const completionScore = this.calculatePhaseCompletionScore(phase, {
        cliResult,
        deliverables,
        qualityMetrics,
      });

      phaseValidation.completed = completionScore >= 0.7; // 70% threshold per phase
      phaseValidation.score = completionScore;
      phaseValidation.deliverables = deliverables;
      phaseValidation.qualityMetrics = qualityMetrics;
      phaseValidation.cliValidation = cliResult;
    } catch (error) {
      phaseValidation.errors.push(error.message);
    }

    return phaseValidation;
  }

  /**
   * Execute SPARC CLI validation command
   */
  async executeSPARCCLIValidation(projectPath, phase) {
    return new Promise((resolve) => {
      const command = `cd "${projectPath}" && npx claude-flow sparc run ${phase} --validate-only`;

      exec(command, { timeout: this.options.timeout }, (error, stdout, stderr) => {
        const result = {
          success: !error,
          exitCode: error?.code || 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          command,
          timestamp: Date.now(),
        };

        // Parse SPARC CLI output for validation metrics
        result.validationMetrics = this.parseSPARCCLIOutput(stdout);

        resolve(result);
      });
    });
  }

  /**
   * Parse SPARC CLI output for validation information
   */
  parseSPARCCLIOutput(stdout) {
    const metrics = {
      phaseScore: 0,
      completeness: 0,
      qualityScore: 0,
      deliverableCount: 0,
    };

    // Extract metrics from SPARC CLI output
    const scoreMatch = stdout.match(/Phase Score:\s*([\d.]+)/);
    if (scoreMatch) {
      metrics.phaseScore = parseFloat(scoreMatch[1]);
    }

    const completenessMatch = stdout.match(/Completeness:\s*([\d.]+)%/);
    if (completenessMatch) {
      metrics.completeness = parseFloat(completenessMatch[1]) / 100;
    }

    const qualityMatch = stdout.match(/Quality Score:\s*([\d.]+)/);
    if (qualityMatch) {
      metrics.qualityScore = parseFloat(qualityMatch[1]);
    }

    const deliverableMatch = stdout.match(/Deliverables:\s*(\d+)/);
    if (deliverableMatch) {
      metrics.deliverableCount = parseInt(deliverableMatch[1]);
    }

    return metrics;
  }

  /**
   * Check for phase-specific deliverables (real file system checks)
   */
  async checkPhaseDeliverables(projectPath, phase) {
    const deliverables = [];

    const phaseDeliverableMap = {
      specification: [
        'SPECIFICATION.md',
        'docs/specification.md',
        'specs/requirements.md',
        'README.md',
      ],
      pseudocode: ['PSEUDOCODE.md', 'docs/pseudocode.md', 'docs/algorithms.md', 'docs/logic.md'],
      architecture: [
        'ARCHITECTURE.md',
        'docs/architecture.md',
        'docs/design.md',
        'architecture/',
        'diagrams/',
      ],
      refinement: ['src/', 'lib/', 'tests/', 'test/', '__tests__/'],
      completion: ['dist/', 'build/', 'package.json', 'README.md', 'CHANGELOG.md'],
    };

    const expectedDeliverables = phaseDeliverableMap[phase] || [];

    for (const deliverable of expectedDeliverables) {
      try {
        const deliverablePath = path.join(projectPath, deliverable);
        const stats = await fs.stat(deliverablePath);

        deliverables.push({
          path: deliverable,
          exists: true,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.isFile() ? stats.size : 0,
          modified: stats.mtime,
          quality: await this.assessDeliverableQuality(deliverablePath, phase, stats),
        });
      } catch (error) {
        deliverables.push({
          path: deliverable,
          exists: false,
          error: error.message,
          quality: { score: 0, issues: ['deliverable_missing'] },
        });
      }
    }

    return deliverables;
  }

  /**
   * Assess individual deliverable quality
   */
  async assessDeliverableQuality(deliverablePath, phase, stats) {
    const quality = {
      score: 0,
      metrics: {},
      issues: [],
    };

    try {
      if (stats.isFile() && deliverablePath.endsWith('.md')) {
        // Analyze Markdown documentation quality
        const content = await fs.readFile(deliverablePath, 'utf8');
        quality.metrics = this.analyzeMarkdownQuality(content, phase);
        quality.score = this.calculateDocumentationScore(quality.metrics);
      } else if (stats.isDirectory()) {
        // Analyze directory structure
        const files = await fs.readdir(deliverablePath);
        quality.metrics = {
          fileCount: files.length,
          hasStructure: files.length > 0,
          isEmpty: files.length === 0,
        };
        quality.score = files.length > 0 ? 0.8 : 0.2;
      } else {
        // Basic file existence check
        quality.score = 0.5; // Exists but not specifically analyzed
      }
    } catch (error) {
      quality.issues.push(`quality_assessment_failed: ${error.message}`);
    }

    return quality;
  }

  /**
   * Analyze Markdown document quality for SPARC phases
   */
  analyzeMarkdownQuality(content, phase) {
    const metrics = {
      wordCount: content.split(/\s+/).length,
      headingCount: (content.match(/^#+\s/gm) || []).length,
      listCount: (content.match(/^[-*+]\s/gm) || []).length,
      codeBlockCount: (content.match(/```/g) || []).length / 2,
      linkCount: (content.match(/\[.*?\]\(.*?\)/g) || []).length,
      hasTitle: /^#\s/.test(content),
      hasIntroduction: /introduction|overview|summary/i.test(content),
      phaseSpecificMetrics: this.analyzePhaseSpecificContent(content, phase),
    };

    return metrics;
  }

  /**
   * Analyze phase-specific content requirements
   */
  analyzePhaseSpecificContent(content, phase) {
    const phaseAnalyzers = {
      specification: (content) => ({
        hasRequirements: /requirements|functional|non-functional/i.test(content),
        hasUserStories: /user story|as a|i want|so that/i.test(content),
        hasAcceptanceCriteria: /acceptance|criteria|given.*when.*then/i.test(content),
      }),

      pseudocode: (content) => ({
        hasAlgorithms: /algorithm|procedure|function|method/i.test(content),
        hasFlowControl: /if|else|while|for|loop/i.test(content),
        hasDataStructures: /array|list|object|hash|tree|graph/i.test(content),
      }),

      architecture: (content) => ({
        hasComponents: /component|module|service|class/i.test(content),
        hasRelationships: /relationship|dependency|interface|api/i.test(content),
        hasPatterns: /pattern|mvc|mvp|observer|singleton/i.test(content),
      }),

      refinement: (content) => ({
        hasImplementation: /implementation|code|development/i.test(content),
        hasTestStrategy: /test|testing|unit|integration/i.test(content),
        hasRefactoring: /refactor|optimize|improve|enhance/i.test(content),
      }),

      completion: (content) => ({
        hasDeployment: /deploy|production|release|build/i.test(content),
        hasDocumentation: /documentation|readme|guide/i.test(content),
        hasMaintenance: /maintain|support|monitor|update/i.test(content),
      }),
    };

    const analyzer = phaseAnalyzers[phase];
    return analyzer ? analyzer(content) : {};
  }

  /**
   * Calculate documentation quality score
   */
  calculateDocumentationScore(metrics) {
    let score = 0;

    // Basic content metrics (40% of score)
    if (metrics.wordCount > 100) score += 0.15;
    if (metrics.wordCount > 500) score += 0.15;
    if (metrics.headingCount >= 2) score += 0.1;

    // Structure metrics (30% of score)
    if (metrics.hasTitle) score += 0.1;
    if (metrics.hasIntroduction) score += 0.1;
    if (metrics.listCount > 0) score += 0.1;

    // Phase-specific content (30% of score)
    const phaseMetrics = metrics.phaseSpecificMetrics || {};
    const phaseRequirements = Object.values(phaseMetrics);
    const metRequirements = phaseRequirements.filter(Boolean).length;
    const totalRequirements = phaseRequirements.length;

    if (totalRequirements > 0) {
      score += (metRequirements / totalRequirements) * 0.3;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Validate deliverable quality across phase
   */
  async validateDeliverableQuality(projectPath, phase, deliverables) {
    const qualityMetrics = {
      overallQuality: 0,
      deliverableCount: deliverables.length,
      qualityDistribution: { high: 0, medium: 0, low: 0 },
      issues: [],
    };

    let totalQuality = 0;
    let validDeliverables = 0;

    for (const deliverable of deliverables) {
      if (deliverable.exists && deliverable.quality) {
        totalQuality += deliverable.quality.score;
        validDeliverables++;

        // Categorize quality
        if (deliverable.quality.score >= 0.8) {
          qualityMetrics.qualityDistribution.high++;
        } else if (deliverable.quality.score >= 0.5) {
          qualityMetrics.qualityDistribution.medium++;
        } else {
          qualityMetrics.qualityDistribution.low++;
        }

        // Collect issues
        if (deliverable.quality.issues) {
          qualityMetrics.issues.push(...deliverable.quality.issues);
        }
      }
    }

    qualityMetrics.overallQuality = validDeliverables > 0 ? totalQuality / validDeliverables : 0;

    return qualityMetrics;
  }

  /**
   * Calculate phase completion score based on multiple factors
   */
  calculatePhaseCompletionScore(phase, validationData) {
    let score = 0;

    // CLI validation score (40%)
    if (validationData.cliResult.success) {
      const cliMetrics = validationData.cliResult.validationMetrics;
      score += (cliMetrics.phaseScore || 0.5) * 0.4;
    }

    // Deliverable existence and quality (40%)
    const existingDeliverables = validationData.deliverables.filter((d) => d.exists);
    const deliverableScore =
      existingDeliverables.length > 0
        ? existingDeliverables.reduce((sum, d) => sum + (d.quality?.score || 0), 0) /
          existingDeliverables.length
        : 0;
    score += deliverableScore * 0.4;

    // Overall quality metrics (20%)
    score += (validationData.qualityMetrics.overallQuality || 0) * 0.2;

    return Math.min(score, 1.0);
  }

  /**
   * Calculate overall SPARC completion metrics
   */
  calculateSPARCCompletion(phaseResults) {
    const phases = Object.keys(this.options.phaseWeights);
    const phaseCompletion = {};
    let weightedScore = 0;
    let totalWeight = 0;

    for (const phase of phases) {
      const phaseResult = phaseResults[phase];
      const weight = this.options.phaseWeights[phase] || 0;

      if (phaseResult) {
        phaseCompletion[phase] = {
          completed: phaseResult.completed,
          score: phaseResult.score || 0,
          weight,
        };

        weightedScore += (phaseResult.score || 0) * weight;
        totalWeight += weight;
      }
    }

    const overallCompletion = totalWeight > 0 ? weightedScore / totalWeight : 0;

    return {
      overallCompletion,
      phaseCompletion,
      totalScore: weightedScore,
      completedPhases: phases.filter((phase) => phaseResults[phase]?.completed).length,
      totalPhases: phases.length,
    };
  }

  /**
   * Validate SPARC quality gates
   */
  async validateSPARCQualityGates(phaseResults, projectPath) {
    const defaultQualityGates = [
      { name: 'specification_quality', phase: 'specification', threshold: 0.7, metric: 'score' },
      { name: 'architecture_completeness', phase: 'architecture', threshold: 0.8, metric: 'score' },
      { name: 'implementation_coverage', phase: 'refinement', threshold: 0.75, metric: 'score' },
      { name: 'overall_completion', phase: null, threshold: 0.8, metric: 'overall' },
    ];

    const qualityGates = this.options.qualityGates.gates || defaultQualityGates;
    const results = {
      passed: true,
      totalGates: qualityGates.length,
      passedGates: 0,
      failedGates: 0,
      details: [],
    };

    for (const gate of qualityGates) {
      let actualValue = 0;
      let passed = false;

      if (gate.phase) {
        const phaseResult = phaseResults[gate.phase];
        actualValue = phaseResult?.[gate.metric] || 0;
      } else if (gate.metric === 'overall') {
        const completionMetrics = this.calculateSPARCCompletion(phaseResults);
        actualValue = completionMetrics.overallCompletion;
      }

      passed = actualValue >= gate.threshold;

      if (passed) {
        results.passedGates++;
      } else {
        results.failedGates++;
        results.passed = false;
      }

      results.details.push({
        name: gate.name,
        phase: gate.phase,
        threshold: gate.threshold,
        actualValue,
        passed,
        metric: gate.metric,
      });
    }

    return results;
  }

  /**
   * Byzantine consensus validation of SPARC deliverables
   */
  async validateResultsWithConsensus(validationData) {
    if (!this.options.enableByzantineValidation) {
      return { consensusAchieved: true, validatorCount: 0, tamperedResults: false };
    }

    try {
      const validators = this.generateSPARCValidators(validationData);

      const proposal = {
        type: 'sparc_phase_validation',
        validationId: validationData.validationId,
        completionMetrics: {
          overallCompletion: validationData.completionMetrics.overallCompletion,
          completedPhases: validationData.completionMetrics.completedPhases,
          totalPhases: validationData.completionMetrics.totalPhases,
        },
        qualityGates: {
          passed: validationData.qualityGateResults.passed,
          passedGates: validationData.qualityGateResults.passedGates,
          totalGates: validationData.qualityGateResults.totalGates,
        },
        deliverableCount: this.countTotalDeliverables(validationData.phaseResults),
        executionHash: this.generateExecutionHash(validationData),
        timestamp: Date.now(),
      };

      const consensus = await this.byzantineConsensus.achieveConsensus(proposal, validators);
      const tamperedResults = this.detectResultTampering(validationData, consensus);

      return {
        consensusAchieved: consensus.achieved,
        consensusRatio: consensus.consensusRatio,
        validatorCount: validators.length,
        tamperedResults,
        byzantineProof: consensus.byzantineProof,
        votes: consensus.votes,
      };
    } catch (error) {
      console.error('Byzantine consensus validation failed:', error);
      return {
        consensusAchieved: false,
        error: error.message,
        tamperedResults: true,
      };
    }
  }

  /**
   * Generate specialized SPARC validators
   */
  generateSPARCValidators(validationData) {
    const baseValidatorCount = 5;
    const completionBonus = validationData.completionMetrics.overallCompletion < 0.8 ? 1.5 : 1;

    const validatorCount = Math.ceil(baseValidatorCount * completionBonus);

    return Array.from({ length: validatorCount }, (_, i) => ({
      id: `sparc-validator-${i}`,
      specialization: [
        'specification_review',
        'architecture_validation',
        'implementation_check',
        'documentation_audit',
        'completion_verification',
      ][i % 5],
      reputation: 0.85 + Math.random() * 0.15,
      riskTolerance: validationData.completionMetrics.overallCompletion >= 0.8 ? 'medium' : 'low',
    }));
  }

  // Helper methods

  generateValidationId() {
    return `sparc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateExecutionHash(validationData) {
    const hashData = JSON.stringify({
      phaseResults: Object.keys(validationData.phaseResults).map((phase) => ({
        phase,
        completed: validationData.phaseResults[phase].completed,
        score: validationData.phaseResults[phase].score,
      })),
      completionMetrics: validationData.completionMetrics,
      timestamp: Date.now(),
    });

    return createHash('md5').update(hashData).digest('hex');
  }

  generateSPARCResultProof(data) {
    const proofString = JSON.stringify({
      validationId: data.validationId,
      phaseResults: data.phaseResults,
      completionMetrics: data.completionMetrics,
      timestamp: data.timestamp,
    });

    const hash = createHash('sha256').update(proofString).digest('hex');

    return {
      algorithm: 'sha256',
      hash,
      timestamp: data.timestamp,
      proofData: proofString.length,
      validator: 'sparc-integration',
      byzantineValidated: data.byzantineValidation?.consensusAchieved || false,
    };
  }

  countTotalDeliverables(phaseResults) {
    return Object.values(phaseResults).reduce(
      (total, phase) => total + (phase.deliverables?.length || 0),
      0,
    );
  }

  getPhaseValidationTimes(phaseResults) {
    const times = {};
    for (const [phase, result] of Object.entries(phaseResults)) {
      times[phase] = result.validationTime || 0;
    }
    return times;
  }

  extractValidationErrors(phaseResults) {
    const errors = [];
    for (const [phase, result] of Object.entries(phaseResults)) {
      if (result.errors && result.errors.length > 0) {
        errors.push(...result.errors.map((error) => ({ phase, error })));
      }
    }
    return errors;
  }

  async catalogSPARCDeliverables(projectPath) {
    const deliverables = {
      documentation: [],
      code: [],
      tests: [],
      configuration: [],
    };

    try {
      // Catalog different types of deliverables
      const docPatterns = ['**/*.md', 'docs/**/*', 'specifications/**/*'];
      const codePatterns = ['src/**/*', 'lib/**/*'];
      const testPatterns = ['test/**/*', 'tests/**/*', '**/*.test.*', '**/*.spec.*'];
      const configPatterns = ['*.json', '*.js', '*.yml', '*.yaml', '*.toml'];

      const { glob } = await import('glob');

      // Documentation files
      for (const pattern of docPatterns) {
        const files = await glob(path.join(projectPath, pattern));
        deliverables.documentation.push(...files);
      }

      // Code files
      for (const pattern of codePatterns) {
        const files = await glob(path.join(projectPath, pattern));
        deliverables.code.push(...files);
      }

      // Test files
      for (const pattern of testPatterns) {
        const files = await glob(path.join(projectPath, pattern));
        deliverables.tests.push(...files);
      }

      // Configuration files
      for (const pattern of configPatterns) {
        const files = await glob(path.join(projectPath, pattern));
        deliverables.configuration.push(...files);
      }
    } catch (error) {
      console.warn('Could not catalog SPARC deliverables:', error.message);
    }

    return deliverables;
  }

  detectResultTampering(validationData, consensus) {
    const suspiciousVotes = consensus.votes.filter(
      (vote) => vote.confidence < 0.5 || (vote.reason && vote.reason.includes('suspicious')),
    );

    const expectedHash = this.generateExecutionHash(validationData);
    const hashMatch = validationData.executionHash === expectedHash;

    return {
      detected: suspiciousVotes.length > consensus.votes.length * 0.3 || !hashMatch,
      suspiciousVoteCount: suspiciousVotes.length,
      hashIntegrityCheck: hashMatch,
      indicators: suspiciousVotes.map((vote) => vote.reason).filter(Boolean),
    };
  }

  /**
   * Get execution history for analysis
   */
  getExecutionHistory(validationId) {
    if (validationId) {
      return this.executionHistory.get(validationId);
    }
    return Array.from(this.executionHistory.values());
  }

  /**
   * Calculate false completion rate for SPARC validation
   */
  calculateFalseCompletionRate() {
    const executions = Array.from(this.executionHistory.values());
    const totalExecutions = executions.length;

    if (totalExecutions === 0) return { rate: 0, sample: 0 };

    const falseCompletions = executions.filter(
      (exec) =>
        exec.sparcCompletion?.success &&
        (!exec.qualityGates?.passed || exec.sparcCompletion.overallCompletion < 0.8),
    );

    return {
      rate: falseCompletions.length / totalExecutions,
      sample: totalExecutions,
      falseCompletions: falseCompletions.length,
    };
  }
}

export default SPARCIntegration;
