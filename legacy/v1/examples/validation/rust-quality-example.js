/**
 * Example: Rust Quality Validator Integration
 * Demonstrates how to use the RustQualityValidator for comprehensive Rust code analysis
 */

import path from 'path';
import { RustQualityValidator } from '../../src/validation/quality-validators/rust-quality-validator.js';
import { ByzantineConsensus } from '../../src/core/byzantine-consensus.js';

/**
 * Example 1: Basic Rust Quality Validation
 */
async function basicRustQualityValidation() {
  console.log('🦀 Example 1: Basic Rust Quality Validation');

  const validator = new RustQualityValidator({
    timeout: 300000, // 5 minutes
    enableByzantineValidation: true,
    qualityThresholds: {
      maxComplexity: 15,
      maxFileLines: 1000,
      maxFunctionLines: 100,
      minDocCoverage: 0.8,
      maxClippyWarnings: 5,
      maxClippyErrors: 0
    }
  });

  const projectPath = './rust-sample-project';

  try {
    const result = await validator.validateRustQuality(projectPath);

    console.log('\n📊 Quality Validation Results:');
    console.log(`Overall Quality Score: ${result.codeQuality.overallScore}/10`);
    console.log(`Project Type: ${result.project.structure.projectType}`);

    console.log('\n🔍 Clippy Analysis:');
    console.log(`- Passed: ${result.clippy.passed}`);
    console.log(`- Warnings: ${result.clippy.warnings}`);
    console.log(`- Errors: ${result.clippy.errors}`);
    console.log(`- Performance Impact: ${result.clippy.performanceImpact.executionTime}ms`);

    console.log('\n📋 Format Check:');
    console.log(`- Passed: ${result.formatting.passed}`);
    console.log(`- Files Checked: ${result.formatting.filesChecked}`);
    console.log(`- Needs Formatting: ${result.formatting.filesNeedingFormatting}`);

    console.log('\n🔒 Security Audit:');
    console.log(`- Passed: ${result.security.passed}`);
    console.log(`- Vulnerabilities: ${result.security.vulnerabilities.length}`);

    console.log('\n🧠 Complexity Analysis:');
    console.log(`- Average Complexity: ${result.complexity.averageComplexity}`);
    console.log(`- Max Complexity: ${result.complexity.maxComplexity}`);
    console.log(`- Complex Functions: ${result.complexity.complexFunctions.length}`);

    console.log('\n📚 Documentation:');
    console.log(`- Coverage: ${(result.documentation.coverage * 100).toFixed(1)}%`);
    console.log(`- Missing Docs: ${result.documentation.missingDocs.length}`);

    console.log('\n⚡ Performance Metrics:');
    console.log(`- Compile Time: ${result.performance.compileTime}ms`);
    console.log(`- Binary Size: ${result.performance.binarySize} bytes`);

    console.log('\n💡 Recommendations:');
    result.recommendations.forEach(rec => {
      console.log(`- [${rec.priority.toUpperCase()}] ${rec.category}: ${rec.message}`);
    });

    return result;
  } catch (error) {
    console.error(`❌ Validation failed: ${error.message}`);
    throw error;
  }
}

/**
 * Example 2: CI/CD Integration
 */
async function cicdIntegration() {
  console.log('\n🔄 Example 2: CI/CD Integration');

  const validator = new RustQualityValidator({
    timeout: 600000, // 10 minutes for CI
    enableByzantineValidation: false, // Disabled in CI for speed
    clippyConfig: {
      denyWarnings: true,
      forbiddenLints: [
        'clippy::all',
        'clippy::pedantic',
        'clippy::nursery'
      ],
      allowedLints: [
        'clippy::module_name_repetitions' // Allow specific exceptions
      ]
    },
    qualityThresholds: {
      maxComplexity: 12,
      maxFileLines: 800,
      maxFunctionLines: 80,
      minDocCoverage: 0.75,
      maxClippyWarnings: 3,
      maxClippyErrors: 0
    }
  });

  const projectPath = process.env.GITHUB_WORKSPACE || './';

  try {
    console.log('🚀 Running CI/CD quality checks...');

    const result = await validator.validateRustQuality(projectPath, {
      minimumQuality: 7.0 // Fail CI if quality score below 7.0
    });

    // CI-specific reporting
    const passed = result.codeQuality.passed;
    const score = result.codeQuality.overallScore;

    if (passed) {
      console.log(`✅ Quality check PASSED (Score: ${score}/10)`);

      // Generate CI artifacts
      await generateCIArtifacts(result);

      process.exit(0);
    } else {
      console.log(`❌ Quality check FAILED (Score: ${score}/10)`);

      // Print failure details
      printFailureDetails(result);

      process.exit(1);
    }

  } catch (error) {
    console.error(`💥 CI quality check crashed: ${error.message}`);
    process.exit(2);
  }
}

/**
 * Example 3: Multi-Project Validation
 */
async function multiProjectValidation() {
  console.log('\n🏗️ Example 3: Multi-Project Validation');

  const projects = [
    './backend-service',
    './cli-tool',
    './shared-library'
  ];

  const validator = new RustQualityValidator({
    timeout: 900000, // 15 minutes total
    enableByzantineValidation: true,
    performanceMetrics: true,
    securityAudit: true
  });

  const results = [];

  for (const projectPath of projects) {
    try {
      console.log(`\n🔍 Validating ${projectPath}...`);

      const result = await validator.validateRustQuality(projectPath);
      results.push({
        project: projectPath,
        result,
        passed: result.codeQuality.passed
      });

      console.log(`  Score: ${result.codeQuality.overallScore}/10`);
      console.log(`  Status: ${result.codeQuality.passed ? '✅ PASS' : '❌ FAIL'}`);

    } catch (error) {
      console.error(`  ❌ Failed to validate ${projectPath}: ${error.message}`);
      results.push({
        project: projectPath,
        error: error.message,
        passed: false
      });
    }
  }

  // Generate multi-project report
  await generateMultiProjectReport(results);

  const allPassed = results.every(r => r.passed);
  console.log(`\n🏁 Multi-project validation: ${allPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);

  return results;
}

/**
 * Example 4: Performance Benchmarking
 */
async function performanceBenchmarking() {
  console.log('\n⚡ Example 4: Performance Benchmarking');

  const validator = new RustQualityValidator({
    timeout: 1200000, // 20 minutes
    performanceMetrics: true,
    qualityThresholds: {
      maxCompileTime: 180000, // 3 minutes max compile time
      maxBinarySize: 10 * 1024 * 1024 // 10MB max binary
    }
  });

  const projectPath = './performance-critical-service';

  try {
    console.log('🔥 Running performance-focused validation...');

    const result = await validator.validateRustQuality(projectPath, {
      focusOnPerformance: true,
      enableOptimizationAnalysis: true
    });

    console.log('\n📈 Performance Analysis:');
    console.log(`- Compile Time: ${result.performance.compileTime}ms`);
    console.log(`- Binary Size: ${(result.performance.binarySize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`- Optimization Level: ${result.performance.optimizationLevel}`);

    // Performance-specific recommendations
    const perfRecommendations = result.recommendations
      .filter(r => r.category === 'performance' || r.category === 'clippy')
      .filter(r => r.message.includes('perf') || r.message.includes('performance'));

    console.log('\n🚀 Performance Recommendations:');
    perfRecommendations.forEach(rec => {
      console.log(`- ${rec.message}`);
      if (rec.details) {
        rec.details.forEach(detail => console.log(`  • ${detail}`));
      }
    });

    return result;

  } catch (error) {
    console.error(`❌ Performance benchmarking failed: ${error.message}`);
    throw error;
  }
}

/**
 * Example 5: Security-Focused Validation
 */
async function securityFocusedValidation() {
  console.log('\n🔐 Example 5: Security-Focused Validation');

  const validator = new RustQualityValidator({
    timeout: 600000,
    securityAudit: true,
    clippyConfig: {
      forbiddenLints: [
        'clippy::all',
        'clippy::pedantic',
        'clippy::suspicious',
        'clippy::security'
      ]
    }
  });

  const projectPath = './security-critical-app';

  try {
    console.log('🛡️ Running security-focused validation...');

    const result = await validator.validateRustQuality(projectPath);

    console.log('\n🔍 Security Analysis Results:');
    console.log(`- Security Audit Passed: ${result.security.passed}`);
    console.log(`- Vulnerabilities Found: ${result.security.vulnerabilities.length}`);
    console.log(`- Security Advisories: ${result.security.advisories.length}`);
    console.log(`- Unmaintained Dependencies: ${result.security.unmaintainedDeps.length}`);

    // Detailed vulnerability reporting
    if (result.security.vulnerabilities.length > 0) {
      console.log('\n🚨 Security Vulnerabilities:');
      result.security.vulnerabilities.forEach(vuln => {
        console.log(`- ${vuln.advisory.title}`);
        console.log(`  Severity: ${vuln.advisory.severity}`);
        console.log(`  Affected: ${vuln.advisory.package}`);
      });
    }

    // Security-focused clippy lints
    const securityLints = result.clippy.details
      ?.filter(lint => lint.code?.includes('security') || lint.message.includes('unsafe'));

    if (securityLints?.length > 0) {
      console.log('\n⚠️ Security-Related Clippy Warnings:');
      securityLints.forEach(lint => {
        console.log(`- ${lint.message}`);
      });
    }

    return result;

  } catch (error) {
    console.error(`❌ Security validation failed: ${error.message}`);
    throw error;
  }
}

// Helper functions

async function generateCIArtifacts(result) {
  const report = {
    timestamp: new Date().toISOString(),
    qualityScore: result.codeQuality.overallScore,
    passed: result.codeQuality.passed,
    summary: {
      clippy: {
        warnings: result.clippy.warnings,
        errors: result.clippy.errors
      },
      formatting: {
        passed: result.formatting.passed,
        unformattedFiles: result.formatting.filesNeedingFormatting
      },
      security: {
        vulnerabilities: result.security.vulnerabilities.length
      },
      complexity: {
        average: result.complexity.averageComplexity,
        max: result.complexity.maxComplexity
      },
      documentation: {
        coverage: result.documentation.coverage
      }
    },
    recommendations: result.recommendations
  };

  // Write CI report (would typically write to file system)
  console.log('📄 Generated CI quality report');

  // In real CI, you might write to:
  // await fs.writeFile('./quality-report.json', JSON.stringify(report, null, 2));
}

function printFailureDetails(result) {
  console.log('\n📋 Failure Details:');

  if (!result.clippy.passed) {
    console.log(`🔍 Clippy: ${result.clippy.errors} errors, ${result.clippy.warnings} warnings`);
  }

  if (!result.formatting.passed) {
    console.log(`📋 Formatting: ${result.formatting.filesNeedingFormatting} files need formatting`);
  }

  if (!result.security.passed) {
    console.log(`🔒 Security: ${result.security.vulnerabilities.length} vulnerabilities found`);
  }

  if (!result.complexity.passed) {
    console.log(`🧠 Complexity: Average ${result.complexity.averageComplexity} (threshold: ${result.codeQuality.thresholds.maxComplexity})`);
  }

  if (!result.documentation.passed) {
    console.log(`📚 Documentation: ${(result.documentation.coverage * 100).toFixed(1)}% coverage (threshold: ${result.codeQuality.thresholds.minDocCoverage * 100}%)`);
  }
}

async function generateMultiProjectReport(results) {
  const summary = {
    totalProjects: results.length,
    passedProjects: results.filter(r => r.passed).length,
    failedProjects: results.filter(r => !r.passed).length,
    averageQuality: results
      .filter(r => r.result?.codeQuality?.overallScore)
      .reduce((sum, r) => sum + r.result.codeQuality.overallScore, 0) / results.length
  };

  console.log('\n📊 Multi-Project Summary:');
  console.log(`- Total Projects: ${summary.totalProjects}`);
  console.log(`- Passed: ${summary.passedProjects}`);
  console.log(`- Failed: ${summary.failedProjects}`);
  console.log(`- Average Quality: ${summary.averageQuality.toFixed(2)}/10`);

  return summary;
}

// Run examples
async function runExamples() {
  console.log('🦀 Rust Quality Validator Examples\n');

  try {
    // Example 1: Basic validation
    await basicRustQualityValidation();

    // Example 2: CI/CD integration (comment out if not in CI environment)
    // await cicdIntegration();

    // Example 3: Multi-project validation
    // await multiProjectValidation();

    // Example 4: Performance benchmarking
    // await performanceBenchmarking();

    // Example 5: Security-focused validation
    // await securityFocusedValidation();

  } catch (error) {
    console.error(`Examples failed: ${error.message}`);
  }
}

// Export for use as module
export {
  basicRustQualityValidation,
  cicdIntegration,
  multiProjectValidation,
  performanceBenchmarking,
  securityFocusedValidation
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples();
}