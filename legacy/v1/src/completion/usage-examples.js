/**
 * Usage Examples and Help Text for CLI Wizard
 * Phase 2 Implementation - User Experience Enhancement
 *
 * Provides comprehensive examples and guidance for 95% user success rate
 */

export const USAGE_EXAMPLES = {
  setup: {
    basic: 'claude-flow-novice validate setup',
    reset: 'claude-flow-novice validate setup --reset',
    verbose: 'claude-flow-novice validate setup --verbose',
  },

  showConfig: {
    basic: 'claude-flow-novice validate show-config',
    json: 'claude-flow-novice validate show-config --json',
    verbose: 'claude-flow-novice validate show-config --verbose',
  },

  test: {
    basic: 'claude-flow-novice validate test',
    fix: 'claude-flow-novice validate test --fix',
    verbose: 'claude-flow-novice validate test --verbose',
  },
};

export const HELP_TEXT = {
  overview: `
🔧 Completion Validation Framework Setup

The validation framework ensures high-quality completions through:
• Framework-specific truth thresholds (TDD: 95%, BDD: 90%, SPARC: 92%)
• Automated quality gates for test coverage and code quality
• Byzantine fault-tolerant consensus validation
• Real-time completion interception and validation

Target completion time: Under 5 minutes for 95% of users
`,

  quickStart: `
🚀 QUICK START GUIDE

1. Run the setup wizard:
   claude-flow-novice validate setup

2. The wizard will:
   • Auto-detect your project framework (90%+ accuracy)
   • Configure appropriate quality gates
   • Set up validation thresholds
   • Test the configuration

3. Verify your setup:
   claude-flow-novice validate test

4. View your configuration anytime:
   claude-flow-novice validate show-config
`,

  frameworks: {
    javascript: `
📦 JAVASCRIPT PROJECT DETECTED

Default Configuration:
• Truth Score Threshold: 85%
• Test Coverage Threshold: 90%
• Testing Framework: Jest (if detected)
• File Patterns: **/*.test.js, **/*.spec.js

The wizard detected JavaScript based on:
• package.json presence
• .js file extensions
• Node.js dependencies
• Testing framework indicators
`,

    typescript: `
📘 TYPESCRIPT PROJECT DETECTED

Default Configuration:
• Truth Score Threshold: 90%
• Test Coverage Threshold: 95%
• Testing Framework: Jest with TypeScript
• File Patterns: **/*.test.ts, **/*.spec.ts

The wizard detected TypeScript based on:
• tsconfig.json presence
• .ts/.tsx file extensions
• TypeScript dependencies in package.json
• Type definition files
`,

    python: `
🐍 PYTHON PROJECT DETECTED

Default Configuration:
• Truth Score Threshold: 88%
• Test Coverage Threshold: 92%
• Testing Framework: pytest (if detected)
• File Patterns: **/test_*.py, **/*_test.py

The wizard detected Python based on:
• requirements.txt or setup.py presence
• .py file extensions
• Python-specific files (Pipfile, pyproject.toml)
• Python package structure
`,

    tdd: `
🔄 TEST-DRIVEN DEVELOPMENT (TDD)

Strict Configuration:
• Truth Score Threshold: 95%
• Test Coverage Threshold: 98%
• Test-First Development Required
• Red-Green-Refactor Cycle Validation

TDD mode ensures:
• Tests written before implementation
• Complete test coverage
• Refactoring safety
• Clean, maintainable code
`,

    bdd: `
📋 BEHAVIOR-DRIVEN DEVELOPMENT (BDD)

Scenario-Based Configuration:
• Truth Score Threshold: 90%
• Scenario Coverage Threshold: 95%
• Gherkin Syntax Compliance
• Feature-Scenario-Step Structure

BDD mode validates:
• Clear behavior specifications
• Stakeholder-readable scenarios
• Complete feature coverage
• Acceptance criteria fulfillment
`,

    sparc: `
🏗️ SPARC METHODOLOGY

Structured Configuration:
• Truth Score Threshold: 92%
• Phase Completion: 100%
• Architecture Documentation Required
• All Phases Must Complete

SPARC phases:
• Specification: Clear requirements
• Pseudocode: Algorithm design
• Architecture: System structure
• Refinement: TDD implementation
• Completion: Integration & deployment
`,
  },

  troubleshooting: `
🔧 TROUBLESHOOTING GUIDE

COMMON ISSUES:

1. Framework Detection Failed
   Symptoms: "Unknown framework" or low confidence
   Solutions:
   • Ensure project files are in current directory
   • Check file permissions
   • Add missing configuration files (package.json, requirements.txt)
   • Use manual framework selection

2. Configuration Test Failed
   Symptoms: Validation errors during test
   Solutions:
   • Verify project structure is complete
   • Check network connectivity for Byzantine consensus
   • Ensure sufficient disk space for configuration files
   • Run with --verbose for detailed error information

3. Quality Gates Too Strict
   Symptoms: Frequent validation failures
   Solutions:
   • Review and adjust thresholds in setup wizard
   • Consider project maturity and team experience
   • Enable partial validation for non-critical completions
   • Consult team on appropriate quality standards

4. Setup Taking Too Long
   Symptoms: Wizard not completing within 5 minutes
   Solutions:
   • Use framework defaults (don't customize unless needed)
   • Ensure stable internet connection
   • Close other resource-intensive applications
   • Consider simplified configuration

NEED MORE HELP?
• Run: claude-flow-novice validate setup --verbose
• Check logs in .claude-flow/logs/
• Visit documentation: https://github.com/ruvnet/claude-flow
`,

  bestPractices: `
✨ BEST PRACTICES

SETUP RECOMMENDATIONS:
• Run setup wizard in project root directory
• Use auto-detected framework when confidence > 70%
• Start with default quality gates, adjust based on experience
• Enable Byzantine consensus for production projects
• Test configuration before first use

QUALITY GATE GUIDELINES:
• Truth Score: Start at 85%, increase gradually to 90-95%
• Test Coverage: 90% for most projects, 95%+ for critical systems
• Code Quality: 85% baseline, adjust for team coding standards
• Documentation: 80% for internal projects, 90%+ for public APIs

FRAMEWORK-SPECIFIC TIPS:
• JavaScript: Use Jest for consistent testing experience
• TypeScript: Enable strict mode in tsconfig.json
• Python: Use pytest with coverage reporting
• TDD: Write tests first, maintain high coverage
• BDD: Focus on clear, stakeholder-readable scenarios
• SPARC: Complete each phase before proceeding

TEAM ADOPTION:
• Start with one project as pilot
• Train team on validation framework concepts
• Establish team-wide quality standards
• Regular review and adjustment of thresholds
• Share success stories and lessons learned
`,

  examples: `
📚 USAGE EXAMPLES

FIRST-TIME SETUP:
$ claude-flow-novice validate setup
🔧 Starting Completion Validation Setup...
📁 Analyzing your project structure...
✨ Detected: TYPESCRIPT (92% confidence)
✅ Setup completed successfully!

CHECKING CONFIGURATION:
$ claude-flow-novice validate show-config
📋 Current Completion Validation Configuration

Framework Settings:
  Framework: typescript

Quality Gates:
  Truth Score: 90%
  Test Coverage: 95%
  Code Quality: 85%
  Documentation: 80%

TESTING SETUP:
$ claude-flow-novice validate test
🧪 Testing Completion Validation Configuration
✅ Test Results:
  Framework Detection: typescript (92% confidence)
  Quality Gates: 4 thresholds configured
  Byzantine Consensus: Functional

CUSTOMIZED SETUP (Advanced):
$ claude-flow-novice validate setup --verbose
# Follow wizard prompts to customize:
# - Framework selection
# - Quality gate thresholds
# - Advanced validation settings

RESET TO DEFAULTS:
$ claude-flow-novice validate setup --reset
# Resets all configuration to framework defaults

JSON OUTPUT (for automation):
$ claude-flow-novice validate show-config --json
{
  "framework": "typescript",
  "qualityGates": {
    "truthScore": 0.90,
    "testCoverage": 0.95
  }
}
`,
};

export const ERROR_MESSAGES = {
  setupFailed: {
    title: '❌ Setup Failed',
    common: [
      "Check that you're in the project root directory",
      'Ensure you have write permissions',
      'Verify internet connectivity for consensus features',
      'Try running with --verbose for more details',
    ],
  },

  frameworkDetectionFailed: {
    title: '⚠️ Framework Detection Issues',
    common: [
      'Add missing configuration files (package.json, tsconfig.json, requirements.txt)',
      'Ensure project files are present in current directory',
      'Consider manual framework selection',
      'Check file permissions and accessibility',
    ],
  },

  configurationInvalid: {
    title: '🔧 Configuration Problems',
    common: [
      'Review quality gate thresholds (must be 0-100%)',
      'Check validation settings for correct values',
      'Verify framework selection is supported',
      'Consider resetting to defaults',
    ],
  },

  testFailed: {
    title: '🧪 Configuration Test Failed',
    common: [
      'Run setup wizard first: claude-flow-novice validate setup',
      'Check project structure and required files',
      'Verify network connectivity for Byzantine features',
      'Review error details with --verbose flag',
    ],
  },
};

export const SUCCESS_MESSAGES = {
  setupComplete: `
🎉 Setup Completed Successfully!

Your completion validation framework is ready to use.

Next steps:
• claude-flow-novice validate test    # Verify your configuration
• claude-flow-novice validate show-config   # View current settings

The framework will now:
✓ Automatically detect project framework
✓ Validate completions against quality gates
✓ Provide Byzantine fault-tolerant consensus
✓ Maintain high code quality standards
`,

  configurationValid: `
✅ Configuration Valid

Your validation setup is working correctly:
• Framework detection is functional
• Quality gates are properly configured
• Byzantine consensus is available
• All tests passed successfully
`,

  highConfidenceDetection: `
🎯 High-Confidence Detection

Framework detected with high accuracy:
• Strong evidence found in project structure
• Configuration optimized for detected framework
• Quality gates set to framework best practices
• Ready for production validation
`,
};

/**
 * Get context-appropriate help text
 */
export function getHelpForContext(context, options = {}) {
  const { framework, confidence, error } = options;

  switch (context) {
    case 'setup-start':
      return HELP_TEXT.overview + HELP_TEXT.quickStart;

    case 'framework-detected':
      if (framework && HELP_TEXT.frameworks[framework]) {
        return HELP_TEXT.frameworks[framework];
      }
      return 'Framework detected successfully. Proceeding with configuration...';

    case 'setup-error':
      return (
        ERROR_MESSAGES.setupFailed.title +
        '\n' +
        ERROR_MESSAGES.setupFailed.common.map((msg) => `  • ${msg}`).join('\n') +
        '\n\n' +
        HELP_TEXT.troubleshooting
      );

    case 'test-error':
      return (
        ERROR_MESSAGES.testFailed.title +
        '\n' +
        ERROR_MESSAGES.testFailed.common.map((msg) => `  • ${msg}`).join('\n')
      );

    case 'examples':
      return HELP_TEXT.examples;

    case 'best-practices':
      return HELP_TEXT.bestPractices;

    default:
      return HELP_TEXT.overview;
  }
}

/**
 * Get error message with context
 */
export function getErrorMessage(errorType, details = {}) {
  const errorConfig = ERROR_MESSAGES[errorType];
  if (!errorConfig) {
    return 'An unexpected error occurred. Please try again or run with --verbose for more details.';
  }

  let message = errorConfig.title + '\n\n';
  message += errorConfig.common.map((msg) => `  • ${msg}`).join('\n');

  if (details.verbose && details.error) {
    message += '\n\nDetailed Error:\n' + details.error;
  }

  return message;
}

/**
 * Get success message with context
 */
export function getSuccessMessage(successType, details = {}) {
  const message = SUCCESS_MESSAGES[successType];
  if (!message) {
    return '✅ Operation completed successfully!';
  }

  return message;
}
