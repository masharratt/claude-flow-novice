#!/usr/bin/env node

/**
 * Phase 3 Framework Compliance Testing Script
 *
 * Executes comprehensive framework compliance testing for the Completion Validation Framework
 * that will validate testing completion using Byzantine consensus.
 *
 * CRITICAL: This script tests the same system that will validate YOUR testing completion!
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Phase3FrameworkComplianceTester from '../tests/phase3-framework-compliance-tester.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ComplianceTestRunner {
  constructor() {
    this.startTime = Date.now();
    this.results = null;

    // Test configuration
    this.config = {
      testProjectCount: 12, // Test each framework with 12 projects
      accuracyThreshold: 0.90,
      byzantineValidation: true,
      detailedReporting: true,
      outputDirectory: join(__dirname, '../compliance-reports'),

      // Framework-specific configurations
      frameworkConfigs: {
        TDD: {
          minTruthScore: 0.90,
          minCoverage: 0.95,
          requireRedGreenRefactor: true
        },
        BDD: {
          minTruthScore: 0.85,
          minScenarioCoverage: 0.90,
          requireGherkin: true
        },
        SPARC: {
          minTruthScore: 0.80,
          requireAllPhases: true,
          phaseCompletionThreshold: 1.0
        },
        CLEAN_ARCHITECTURE: {
          minTruthScore: 0.85,
          customThresholds: true
        },
        DDD: {
          minTruthScore: 0.85,
          customThresholds: true
        }
      }
    };
  }

  async runComplianceTests() {
    console.log('🚀 Starting Phase 3 Framework Compliance Testing');
    console.log('=' .repeat(80));
    console.log(`📊 Configuration:`);
    console.log(`   • Test projects per framework: ${this.config.testProjectCount}`);
    console.log(`   • Accuracy threshold: ${(this.config.accuracyThreshold * 100).toFixed(0)}%`);
    console.log(`   • Byzantine validation: ${this.config.byzantineValidation ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   • Total frameworks to test: ${Object.keys(this.config.frameworkConfigs).length}`);
    console.log('=' .repeat(80));

    try {
      // Initialize the compliance tester
      const tester = new Phase3FrameworkComplianceTester(this.config);

      // Set up event listeners for detailed progress tracking
      this.setupEventListeners(tester);

      // Execute comprehensive compliance testing
      console.log('🔧 Initializing compliance testing system...');
      const initResult = await tester.initialize();

      if (!initResult.success) {
        throw new Error('Failed to initialize compliance tester');
      }

      console.log(`✅ System initialized in ${initResult.duration.toFixed(2)}ms`);
      console.log('');

      // Run the full compliance test suite
      console.log('🧪 Executing comprehensive framework compliance tests...');
      console.log('');

      this.results = await tester.executeComplianceTesting();

      // Generate and display results
      await this.displayResults();

      // Save detailed report
      await this.saveDetailedReport();

      // Cleanup
      await tester.shutdown();

      const success = this.results.overallScore >= this.config.accuracyThreshold;

      console.log('');
      console.log('=' .repeat(80));
      if (success) {
        console.log('✅ PHASE 3 FRAMEWORK COMPLIANCE TESTING COMPLETED SUCCESSFULLY');
        console.log(`🎯 Overall Score: ${(this.results.overallScore * 100).toFixed(2)}% (≥${(this.config.accuracyThreshold * 100).toFixed(0)}% required)`);

        if (this.results.byzantineValidated) {
          console.log('🛡️ Results validated by Byzantine consensus with cryptographic proof');
        }

        process.exit(0);
      } else {
        console.log('❌ PHASE 3 FRAMEWORK COMPLIANCE TESTING FAILED');
        console.log(`📉 Overall Score: ${(this.results.overallScore * 100).toFixed(2)}% (below ${(this.config.accuracyThreshold * 100).toFixed(0)}% threshold)`);

        console.log('');
        console.log('🚨 CRITICAL ISSUES FOUND:');
        this.displayCriticalIssues();

        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Compliance testing failed with error:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }

  setupEventListeners(tester) {
    tester.on('initialized', (data) => {
      console.log(`🔧 Tester initialized (Byzantine: ${data.byzantineEnabled ? 'ON' : 'OFF'})`);
    });

    tester.on('frameworkTestStarted', (data) => {
      console.log(`📋 Testing ${data.framework} framework...`);
    });

    tester.on('frameworkTestCompleted', (data) => {
      const status = data.compliant ? '✅' : '❌';
      console.log(`${status} ${data.framework}: ${(data.complianceRate * 100).toFixed(1)}% compliant`);
    });

    tester.on('detectionAccuracyTested', (data) => {
      const status = data.accuracyMet ? '✅' : '❌';
      console.log(`${status} Detection Accuracy: ${(data.accuracy * 100).toFixed(2)}%`);
    });

    tester.on('validationRulesTested', (data) => {
      console.log(`⚖️ Validation Rules: ${data.frameworksCompliant}/${data.totalFrameworks} frameworks compliant`);
    });

    tester.on('crossFrameworkPreventionTested', (data) => {
      const status = data.effective ? '✅' : '❌';
      console.log(`${status} Cross-framework Prevention: ${(data.preventionRate * 100).toFixed(1)}%`);
    });

    tester.on('byzantineConsensusCompleted', (data) => {
      const status = data.consensusAchieved ? '✅' : '❌';
      console.log(`${status} Byzantine Consensus: ${(data.consensusRatio * 100).toFixed(1)}% validator approval`);
    });

    tester.on('complianceTestingComplete', (data) => {
      console.log('🏁 All compliance tests completed');
    });
  }

  async displayResults() {
    const { results, report } = this.results;

    console.log('');
    console.log('📊 COMPLIANCE TESTING RESULTS');
    console.log('=' .repeat(80));

    // Framework Compliance Results
    console.log('🧪 FRAMEWORK COMPLIANCE RESULTS:');
    console.log('');

    for (const [framework, data] of results.frameworkCompliance) {
      const status = data.frameworkCompliant ? '✅' : '❌';
      console.log(`${status} ${data.name}:`);
      console.log(`   • Truth Threshold: ${data.truthThreshold} (avg: ${data.averageTruthScore.toFixed(3)})`);
      console.log(`   • Compliance Rate: ${(data.complianceRate * 100).toFixed(1)}% (${data.projectsPassed}/${data.projectsTestedCount})`);
      console.log(`   • Avg Validation Time: ${data.averageValidationTime.toFixed(2)}ms`);

      if (!data.frameworkCompliant && data.complianceIssues.length > 0) {
        console.log(`   • Issues: ${data.complianceIssues.join(', ')}`);
      }
      console.log('');
    }

    // Detection Accuracy Results
    const detectionResults = results.detectionAccuracy.get('overall');
    if (detectionResults) {
      const status = detectionResults.accuracyRate >= 0.90 ? '✅' : '❌';
      console.log(`${status} FRAMEWORK DETECTION ACCURACY:`);
      console.log(`   • Overall: ${(detectionResults.accuracyRate * 100).toFixed(2)}% (${detectionResults.correctDetections}/${detectionResults.totalCases})`);
      console.log(`   • JavaScript: ${(detectionResults.languageAccuracy.javascript.accuracy * 100).toFixed(1)}%`);
      console.log(`   • TypeScript: ${(detectionResults.languageAccuracy.typescript.accuracy * 100).toFixed(1)}%`);
      console.log(`   • Python: ${(detectionResults.languageAccuracy.python.accuracy * 100).toFixed(1)}%`);
      console.log(`   • Mixed Projects: ${(detectionResults.languageAccuracy.mixed.accuracy * 100).toFixed(1)}%`);
      console.log('');
    }

    // Validation Rules Results
    console.log('⚖️ VALIDATION RULES ACCURACY:');
    for (const [framework, data] of results.validationRules) {
      const status = data.executionAccuracy >= 0.90 ? '✅' : '❌';
      console.log(`${status} ${framework}: ${(data.executionAccuracy * 100).toFixed(1)}% (${data.rulesPassed}/${data.rulesExecuted} rules)`);
    }
    console.log('');

    // Cross-framework Prevention Results
    const preventionResults = results.crossFrameworkPrevention.get('overall');
    if (preventionResults) {
      const status = preventionResults.preventionRate >= 0.90 ? '✅' : '❌';
      console.log(`${status} CROSS-FRAMEWORK VALIDATION PREVENTION:`);
      console.log(`   • Prevention Rate: ${(preventionResults.preventionRate * 100).toFixed(1)}%`);
      console.log(`   • Successful Preventions: ${preventionResults.preventionSuccesses}/${preventionResults.totalTests}`);
      console.log('');
    }

    // Byzantine Consensus Results
    const byzantineResults = results.byzantineValidation.get('compliance');
    if (byzantineResults) {
      const status = byzantineResults.consensusAchieved ? '✅' : '❌';
      console.log(`${status} BYZANTINE CONSENSUS VALIDATION:`);
      console.log(`   • Consensus Achieved: ${byzantineResults.consensusAchieved ? 'YES' : 'NO'}`);
      console.log(`   • Consensus Ratio: ${(byzantineResults.consensusRatio * 100).toFixed(1)}%`);
      console.log(`   • Validator Approval: ${byzantineResults.approvalVotes}/${byzantineResults.validatorCount}`);

      if (byzantineResults.cryptographicEvidence) {
        console.log(`   • Cryptographic Proof: ${byzantineResults.cryptographicEvidence.consensusHash?.substring(0, 16)}...`);
      }
      console.log('');
    }

    // Performance Metrics
    console.log('⏱️ PERFORMANCE METRICS:');
    const perfMetrics = report.performanceMetrics;
    console.log(`   • Total Execution Time: ${perfMetrics.totalExecutionTime}`);
    console.log(`   • Average Time Per Project: ${perfMetrics.averageTimePerProject}`);
    console.log(`   • Test Throughput: ${perfMetrics.testThroughput}`);
    console.log(`   • Total Projects Tested: ${perfMetrics.totalProjectsTested}`);
    console.log('');

    // Overall Score
    console.log('🎯 OVERALL COMPLIANCE SCORE:');
    console.log(`   ${(this.results.overallScore * 100).toFixed(2)}%`);

    if (this.results.overallScore >= this.config.accuracyThreshold) {
      console.log('   🎉 MEETS COMPLIANCE REQUIREMENTS');
    } else {
      console.log('   ⚠️ BELOW COMPLIANCE THRESHOLD');
    }
  }

  displayCriticalIssues() {
    const criticalIssues = this.results.report.criticalIssues || [];

    if (criticalIssues.length === 0) {
      console.log('   No critical issues found');
      return;
    }

    criticalIssues.forEach((issue, index) => {
      console.log(`   ${index + 1}. ${issue.type}:`);
      console.log(`      • ${issue.description}`);
      console.log(`      • Impact: ${issue.impact}`);
      if (issue.framework) {
        console.log(`      • Framework: ${issue.framework}`);
      }
      console.log('');
    });
  }

  async saveDetailedReport() {
    try {
      const fs = await import('fs/promises');

      // Ensure output directory exists
      try {
        await fs.mkdir(this.config.outputDirectory, { recursive: true });
      } catch (error) {
        // Directory already exists
      }

      // Save detailed JSON report
      const reportPath = join(this.config.outputDirectory, `phase3-compliance-report-${Date.now()}.json`);
      await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));

      // Save summary report
      const summaryPath = join(this.config.outputDirectory, `phase3-compliance-summary-${Date.now()}.md`);
      const summaryReport = this.generateMarkdownSummary();
      await fs.writeFile(summaryPath, summaryReport);

      console.log('');
      console.log('📄 REPORTS SAVED:');
      console.log(`   • Detailed Report: ${reportPath}`);
      console.log(`   • Summary Report: ${summaryPath}`);

    } catch (error) {
      console.error('⚠️ Failed to save reports:', error.message);
    }
  }

  generateMarkdownSummary() {
    const { results, report } = this.results;
    const timestamp = new Date().toISOString();

    let markdown = `# Phase 3 Framework Compliance Testing Report

Generated: ${timestamp}
Overall Score: ${(this.results.overallScore * 100).toFixed(2)}%
Test Duration: ${((Date.now() - this.startTime) / 1000).toFixed(2)}s

## Executive Summary

${this.results.overallScore >= this.config.accuracyThreshold ? '✅ **COMPLIANCE ACHIEVED**' : '❌ **COMPLIANCE FAILED**'}

- Total Frameworks Tested: ${Object.keys(this.config.frameworkConfigs).length}
- Total Projects Tested: ${Object.keys(this.config.frameworkConfigs).length * this.config.testProjectCount}
- Byzantine Validation: ${this.config.byzantineValidation ? 'ENABLED' : 'DISABLED'}

## Framework Compliance Results

`;

    for (const [framework, data] of results.frameworkCompliance) {
      const status = data.frameworkCompliant ? '✅' : '❌';
      markdown += `### ${status} ${data.name}

- **Truth Threshold**: ${data.truthThreshold} (Average: ${data.averageTruthScore.toFixed(3)})
- **Compliance Rate**: ${(data.complianceRate * 100).toFixed(1)}% (${data.projectsPassed}/${data.projectsTestedCount})
- **Validation Time**: ${data.averageValidationTime.toFixed(2)}ms average

`;

      if (!data.frameworkCompliant && data.complianceIssues?.length > 0) {
        markdown += `**Issues**:
${data.complianceIssues.map(issue => `- ${issue}`).join('\n')}

`;
      }
    }

    // Detection Accuracy
    const detectionResults = results.detectionAccuracy.get('overall');
    if (detectionResults) {
      const status = detectionResults.accuracyRate >= 0.90 ? '✅' : '❌';
      markdown += `## ${status} Framework Detection Accuracy

- **Overall Accuracy**: ${(detectionResults.accuracyRate * 100).toFixed(2)}%
- **JavaScript**: ${(detectionResults.languageAccuracy.javascript.accuracy * 100).toFixed(1)}%
- **TypeScript**: ${(detectionResults.languageAccuracy.typescript.accuracy * 100).toFixed(1)}%
- **Python**: ${(detectionResults.languageAccuracy.python.accuracy * 100).toFixed(1)}%

`;
    }

    // Validation Rules
    markdown += `## Validation Rules Accuracy

`;
    for (const [framework, data] of results.validationRules) {
      const status = data.executionAccuracy >= 0.90 ? '✅' : '❌';
      markdown += `- ${status} **${framework}**: ${(data.executionAccuracy * 100).toFixed(1)}% (${data.rulesPassed}/${data.rulesExecuted} rules)
`;
    }

    // Byzantine Consensus
    const byzantineResults = results.byzantineValidation.get('compliance');
    if (byzantineResults) {
      const status = byzantineResults.consensusAchieved ? '✅' : '❌';
      markdown += `
## ${status} Byzantine Consensus Validation

- **Consensus Achieved**: ${byzantineResults.consensusAchieved ? 'YES' : 'NO'}
- **Consensus Ratio**: ${(byzantineResults.consensusRatio * 100).toFixed(1)}%
- **Validator Approval**: ${byzantineResults.approvalVotes}/${byzantineResults.validatorCount}

`;
    }

    // Recommendations
    if (report.recommendations?.length > 0) {
      markdown += `## Recommendations

`;
      report.recommendations.forEach((rec, index) => {
        markdown += `${index + 1}. **${rec.category}** (${rec.severity}): ${rec.issue}
   - ${rec.recommendation}

`;
      });
    }

    // Performance Metrics
    const perfMetrics = report.performanceMetrics;
    markdown += `## Performance Metrics

- **Total Execution Time**: ${perfMetrics.totalExecutionTime}
- **Test Throughput**: ${perfMetrics.testThroughput}
- **Projects Tested**: ${perfMetrics.totalProjectsTested}
- **Memory Usage**: ${JSON.stringify(perfMetrics.memoryUsage)}

`;

    return markdown;
  }
}

// Execute compliance testing if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new ComplianceTestRunner();
  runner.runComplianceTests().catch(error => {
    console.error('💥 Fatal error during compliance testing:', error);
    process.exit(1);
  });
}

export default ComplianceTestRunner;