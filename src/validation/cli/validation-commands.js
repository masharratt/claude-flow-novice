/**
 * Validation Commands Implementation
 * Phase 2 Critical Implementation - Essential CLI Commands
 *
 * Implements all missing CLI commands identified in Phase 2 gaps:
 * - claude-flow-novice validate setup (Interactive configuration)
 * - claude-flow-novice validate check (Manual completion validation)
 * - claude-flow-novice validate enable-hooks (Enable automatic interception)
 * - claude-flow-novice validate disable-hooks (Disable automatic interception)
 * - claude-flow-novice validate add-framework (Custom framework addition)
 * - claude-flow-novice validate configure-gates (Quality threshold tuning)
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { prompts } from '@inquirer/prompts';
import { InteractiveSetupWizard } from './interactive-setup-wizard.js';
import { FrameworkDetector } from '../../completion/framework-detector.js';
import { TruthConfigManager } from '../truth-config-manager.js';
import { CompletionInterceptor } from '../completion-interceptor.js';
import { logger } from '../../core/logger.js';

export class ValidationCommands {
  constructor(options = {}) {
    this.basePath = options.basePath || process.cwd();
    this.logger = logger.child({ component: 'ValidationCommands' });
    this.configPath = path.join(this.basePath, '.swarm');
    this.preferencesPath = path.join(this.configPath, 'user-preferences.json');
  }

  /**
   * Interactive Setup Command
   * Target: <5 minute completion time for 95% of users
   */
  async setupCommand(options = {}) {
    console.log(chalk.blue.bold('🔧 Claude Flow Novice - Interactive Setup\n'));

    try {
      const wizard = new InteractiveSetupWizard({ basePath: this.basePath });
      const result = await wizard.runSetupWizard(options);

      await wizard.cleanup();

      return result;
    } catch (error) {
      this.logger.error('Setup command failed', error);
      throw error;
    }
  }

  /**
   * Manual Completion Validation Check Command
   */
  async checkCommand(options = {}) {
    console.log(chalk.blue.bold('🔍 Manual Completion Validation Check\n'));

    const spinner = ora('Initializing validation system...').start();

    try {
      // Load configuration
      const configManager = new TruthConfigManager({
        configDir: path.join(this.configPath, 'configs'),
      });
      await configManager.initialize();

      // Check if configuration exists
      const configs = await configManager.listConfigurations();
      if (configs.length === 0) {
        spinner.fail('No configuration found');
        console.log(chalk.yellow('\n⚠️  No validation configuration found.'));
        console.log(chalk.gray('Run setup first: claude-flow-novice validate setup'));
        return { success: false, error: 'No configuration found' };
      }

      // Load the most recent configuration
      const latestConfig = configs[0];
      const config = await configManager.loadConfiguration(latestConfig.filepath);

      spinner.succeed('Configuration loaded');

      // Framework detection
      spinner.start('Detecting project framework...');
      const detector = new FrameworkDetector({ basePath: this.basePath });
      await detector.initialize();
      const frameworkResult = await detector.detectFramework();
      await detector.close();

      spinner.succeed(
        `Framework detected: ${frameworkResult.detected} (${(frameworkResult.confidence * 100).toFixed(1)}% confidence)`,
      );

      // Validation check
      spinner.start('Running validation checks...');
      const checkResults = await this.runValidationChecks(config, frameworkResult);
      spinner.stop();

      // Display results
      this.displayCheckResults(checkResults);

      // Auto-fix if requested and issues found
      if (options.fix && checkResults.issues.length > 0) {
        await this.autoFixIssues(checkResults.issues);
      }

      return {
        success: checkResults.passed,
        results: checkResults,
      };
    } catch (error) {
      spinner.fail('Validation check failed');
      this.logger.error('Check command failed', error);
      throw error;
    }
  }

  /**
   * Enable Automatic Interception Hooks
   */
  async enableHooksCommand(options = {}) {
    console.log(chalk.blue.bold('🔗 Enabling Automatic Completion Hooks\n'));

    const spinner = ora('Configuring automatic interception...').start();

    try {
      // Check if configuration exists
      if (!(await this.fileExists(this.preferencesPath))) {
        spinner.fail('Configuration not found');
        console.log(chalk.yellow('⚠️  Run setup first: claude-flow-novice validate setup'));
        return { success: false, error: 'No configuration found' };
      }

      // Load user preferences
      const preferences = await this.loadUserPreferences();

      // Initialize completion interceptor
      const interceptor = new CompletionInterceptor({
        basePath: this.basePath,
        config: preferences.truthConfig,
      });

      await interceptor.initialize();

      // Enable hooks
      await interceptor.enableHooks();

      // Update preferences
      preferences.hooksEnabled = true;
      preferences.hooksEnabledDate = new Date().toISOString();
      await this.saveUserPreferences(preferences);

      spinner.succeed('Automatic hooks enabled successfully');

      console.log(chalk.green('\n✅ Completion validation hooks are now active!'));
      console.log(chalk.gray('All future completions will be automatically validated.'));
      console.log(chalk.gray('\nTo disable: claude-flow-novice validate disable-hooks'));

      return { success: true };
    } catch (error) {
      spinner.fail('Failed to enable hooks');
      this.logger.error('Enable hooks command failed', error);
      throw error;
    }
  }

  /**
   * Disable Automatic Interception Hooks
   */
  async disableHooksCommand(options = {}) {
    console.log(chalk.blue.bold('🔓 Disabling Automatic Completion Hooks\n'));

    const spinner = ora('Removing automatic interception...').start();

    try {
      // Initialize completion interceptor
      const interceptor = new CompletionInterceptor({
        basePath: this.basePath,
      });

      await interceptor.initialize();

      // Disable hooks
      await interceptor.disableHooks();

      // Update preferences if they exist
      if (await this.fileExists(this.preferencesPath)) {
        const preferences = await this.loadUserPreferences();
        preferences.hooksEnabled = false;
        preferences.hooksDisabledDate = new Date().toISOString();
        await this.saveUserPreferences(preferences);
      }

      spinner.succeed('Automatic hooks disabled successfully');

      console.log(chalk.yellow('\n⚠️  Completion validation hooks have been disabled.'));
      console.log(
        chalk.gray('Manual validation is still available via: claude-flow-novice validate check'),
      );
      console.log(chalk.gray('\nTo re-enable: claude-flow-novice validate enable-hooks'));

      return { success: true };
    } catch (error) {
      spinner.fail('Failed to disable hooks');
      this.logger.error('Disable hooks command failed', error);
      throw error;
    }
  }

  /**
   * Add Custom Framework Support
   */
  async addFrameworkCommand(options = {}) {
    console.log(chalk.blue.bold('🎯 Add Custom Framework Support\n'));

    try {
      // Gather framework information
      const frameworkInfo = await this.gatherFrameworkInfo();

      // Create framework configuration
      const frameworkConfig = await this.createFrameworkConfig(frameworkInfo);

      // Save framework configuration
      await this.saveCustomFramework(frameworkConfig);

      console.log(chalk.green('\n✅ Custom framework added successfully!'));
      console.log(chalk.gray(`Framework: ${frameworkInfo.name}`));
      console.log(chalk.gray(`File patterns: ${frameworkInfo.filePatterns.join(', ')}`));
      console.log(chalk.gray(`Testing framework: ${frameworkInfo.testingFramework}`));

      return {
        success: true,
        framework: frameworkConfig,
      };
    } catch (error) {
      this.logger.error('Add framework command failed', error);
      throw error;
    }
  }

  /**
   * Configure Quality Gates
   */
  async configureGatesCommand(options = {}) {
    console.log(chalk.blue.bold('🚧 Configure Quality Gates\n'));

    try {
      // Load current configuration
      if (!(await this.fileExists(this.preferencesPath))) {
        console.log(chalk.yellow('⚠️  Run setup first: claude-flow-novice validate setup'));
        return { success: false, error: 'No configuration found' };
      }

      const preferences = await this.loadUserPreferences();

      // Display current gates
      this.displayCurrentGates(preferences.qualityGates);

      // Ask if user wants to modify
      const shouldModify = await prompts.confirm({
        message: 'Modify quality gate thresholds?',
        default: false,
      });

      if (!shouldModify) {
        console.log(chalk.gray('Quality gates unchanged.'));
        return { success: true };
      }

      // Configure new thresholds
      const newGates = await this.configureQualityThresholds(preferences.qualityGates);

      // Validate new configuration
      const validation = await this.validateQualityGates(newGates);
      if (!validation.valid) {
        console.log(chalk.red(`❌ Invalid configuration: ${validation.errors.join(', ')}`));
        return { success: false, error: 'Invalid configuration' };
      }

      // Save updated configuration
      preferences.qualityGates = newGates;
      preferences.gatesModifiedDate = new Date().toISOString();
      await this.saveUserPreferences(preferences);

      console.log(chalk.green('\n✅ Quality gates updated successfully!'));
      this.displayCurrentGates(newGates);

      return {
        success: true,
        qualityGates: newGates,
      };
    } catch (error) {
      this.logger.error('Configure gates command failed', error);
      throw error;
    }
  }

  /**
   * Show Current Configuration
   */
  async showConfigCommand(options = {}) {
    console.log(chalk.blue.bold('📊 Current Validation Configuration\n'));

    try {
      if (!(await this.fileExists(this.preferencesPath))) {
        console.log(chalk.yellow('⚠️  No configuration found. Run setup first.'));
        return { success: false, error: 'No configuration found' };
      }

      const preferences = await this.loadUserPreferences();

      if (options.json) {
        console.log(JSON.stringify(preferences, null, 2));
        return { success: true, config: preferences };
      }

      this.displayConfiguration(preferences);

      return { success: true, config: preferences };
    } catch (error) {
      this.logger.error('Show config command failed', error);
      throw error;
    }
  }

  // Helper Methods

  /**
   * Run comprehensive validation checks
   */
  async runValidationChecks(config, frameworkResult) {
    const checks = [];
    const issues = [];
    let passed = 0;

    // Framework detection check
    if (frameworkResult.confidence > 0.7) {
      checks.push({
        name: 'Framework Detection',
        status: 'pass',
        details: `${frameworkResult.detected} (${(frameworkResult.confidence * 100).toFixed(1)}%)`,
      });
      passed++;
    } else {
      checks.push({
        name: 'Framework Detection',
        status: 'warn',
        details: 'Low confidence detection',
      });
      issues.push('Framework detection has low confidence - consider manual configuration');
    }

    // Configuration validation check
    try {
      const configManager = new TruthConfigManager();
      const validation = await configManager.validateConfiguration(config);

      if (validation.valid) {
        checks.push({
          name: 'Configuration Validation',
          status: 'pass',
          details: 'Configuration is valid',
        });
        passed++;
      } else {
        checks.push({
          name: 'Configuration Validation',
          status: 'fail',
          details: validation.errors.join(', '),
        });
        issues.push(...validation.errors);
      }
    } catch (error) {
      checks.push({ name: 'Configuration Validation', status: 'fail', details: error.message });
      issues.push(`Configuration validation failed: ${error.message}`);
    }

    // File permissions check
    try {
      await this.testFilePermissions();
      checks.push({
        name: 'File Permissions',
        status: 'pass',
        details: 'Read/write access confirmed',
      });
      passed++;
    } catch (error) {
      checks.push({
        name: 'File Permissions',
        status: 'fail',
        details: 'Permission issues detected',
      });
      issues.push('File permission problems - check directory access');
    }

    // Dependencies check
    const depsCheck = await this.checkDependencies();
    if (depsCheck.allPresent) {
      checks.push({
        name: 'Dependencies',
        status: 'pass',
        details: 'All required dependencies available',
      });
      passed++;
    } else {
      checks.push({
        name: 'Dependencies',
        status: 'warn',
        details: `Missing: ${depsCheck.missing.join(', ')}`,
      });
      issues.push(...depsCheck.missing.map((dep) => `Missing dependency: ${dep}`));
    }

    return {
      passed: issues.length === 0,
      totalChecks: checks.length,
      passedChecks: passed,
      checks,
      issues,
    };
  }

  /**
   * Display validation check results
   */
  displayCheckResults(results) {
    console.log(chalk.blue('\n📋 Validation Check Results\n'));

    results.checks.forEach((check) => {
      let icon, color;
      switch (check.status) {
        case 'pass':
          icon = '✅';
          color = chalk.green;
          break;
        case 'warn':
          icon = '⚠️';
          color = chalk.yellow;
          break;
        case 'fail':
          icon = '❌';
          color = chalk.red;
          break;
        default:
          icon = '❓';
          color = chalk.gray;
      }

      console.log(`${icon} ${color(check.name)}: ${check.details}`);
    });

    console.log('');

    if (results.passed) {
      console.log(chalk.green.bold('🎉 All validation checks passed!'));
    } else {
      console.log(chalk.red.bold('❌ Some validation checks failed'));
      console.log(chalk.yellow('\n🔧 Issues found:'));
      results.issues.forEach((issue) => {
        console.log(chalk.gray(`  • ${issue}`));
      });
    }

    console.log(
      chalk.gray(`\n📊 Summary: ${results.passedChecks}/${results.totalChecks} checks passed`),
    );
  }

  /**
   * Gather custom framework information
   */
  async gatherFrameworkInfo() {
    const name = await prompts.text({
      message: 'Framework name:',
      validate: (value) => value.length > 0 || 'Name is required',
    });

    const filePatterns = await prompts.text({
      message: 'File patterns (comma-separated, e.g., *.java,*.kt,*.rs):',
      validate: (value) => value.length > 0 || 'At least one pattern required',
    });

    const testingFramework = await prompts.select({
      message: 'Primary testing approach:',
      choices: [
        { name: 'Unit Testing (TDD-style)', value: 'unit' },
        { name: 'Behavior Testing (BDD-style)', value: 'behavior' },
        { name: 'Integration Testing', value: 'integration' },
        { name: 'Rust Testing (cargo test)', value: 'rust' },
        { name: 'Custom Testing Approach', value: 'custom' },
      ],
    });

    const truthThreshold = await prompts.number({
      message: 'Truth score threshold (0.0-1.0):',
      default: 0.75,
      validate: (value) => (value >= 0 && value <= 1) || 'Must be between 0.0 and 1.0',
    });

    return {
      name,
      filePatterns: filePatterns.split(',').map((p) => p.trim()),
      testingFramework,
      truthThreshold,
    };
  }

  /**
   * Create framework configuration from user input
   */
  async createFrameworkConfig(frameworkInfo) {
    const configManager = new TruthConfigManager();
    await configManager.initialize();

    // Create custom configuration based on testing approach
    let baseFramework = 'CUSTOM';
    if (frameworkInfo.testingFramework === 'unit') {
      baseFramework = 'TDD';
    } else if (frameworkInfo.testingFramework === 'behavior') {
      baseFramework = 'BDD';
    } else if (frameworkInfo.testingFramework === 'rust') {
      baseFramework = 'TDD'; // Rust uses TDD-style testing with cargo test
    }

    const config = await configManager.createFromFramework(baseFramework, {
      name: frameworkInfo.name,
      description: `Custom configuration for ${frameworkInfo.name} framework`,
      threshold: frameworkInfo.truthThreshold,
      tags: ['custom', frameworkInfo.testingFramework],
    });

    await configManager.cleanup();

    return {
      ...frameworkInfo,
      truthConfig: config,
      id: `custom_${frameworkInfo.name.toLowerCase().replace(/\s+/g, '_')}`,
      createdDate: new Date().toISOString(),
    };
  }

  /**
   * Configure quality thresholds interactively
   */
  async configureQualityThresholds(currentGates) {
    console.log(chalk.blue('\n🎯 Configure Quality Thresholds\n'));

    const truthScore = await prompts.number({
      message: 'Truth score threshold (0.0-1.0):',
      default: currentGates.truthScore,
      validate: (value) => (value >= 0 && value <= 1) || 'Must be between 0.0 and 1.0',
    });

    const testCoverage = await prompts.number({
      message: 'Test coverage threshold (%):',
      default: currentGates.testCoverage,
      validate: (value) => (value >= 0 && value <= 100) || 'Must be between 0 and 100',
    });

    const codeQuality = await prompts.select({
      message: 'Minimum code quality grade:',
      choices: [
        { name: 'A - Excellent', value: 'A' },
        { name: 'B - Good', value: 'B' },
        { name: 'C - Acceptable', value: 'C' },
        { name: 'D - Poor', value: 'D' },
      ],
      default: currentGates.codeQuality,
    });

    const documentationCoverage = await prompts.number({
      message: 'Documentation coverage threshold (%):',
      default: currentGates.documentationCoverage,
      validate: (value) => (value >= 0 && value <= 100) || 'Must be between 0 and 100',
    });

    return {
      truthScore,
      testCoverage,
      codeQuality,
      documentationCoverage,
    };
  }

  /**
   * Display current quality gates
   */
  displayCurrentGates(gates) {
    console.log(chalk.blue('📊 Quality Gate Thresholds:'));
    console.log(`  🎯 Truth Score: ${chalk.yellow(gates.truthScore.toFixed(2))}`);
    console.log(`  🧪 Test Coverage: ${chalk.yellow(gates.testCoverage + '%')}`);
    console.log(`  📝 Code Quality: ${chalk.yellow(gates.codeQuality)}`);
    console.log(`  📚 Documentation: ${chalk.yellow(gates.documentationCoverage + '%')}`);
  }

  /**
   * Display full configuration
   */
  displayConfiguration(preferences) {
    console.log(chalk.blue('🔧 Framework Configuration:'));
    if (preferences.framework) {
      console.log(`  Framework: ${chalk.yellow(preferences.framework.detected || 'Unknown')}`);
      console.log(
        `  Confidence: ${chalk.yellow((preferences.framework.confidence * 100).toFixed(1) + '%')}`,
      );
    }

    console.log(`  Experience Level: ${chalk.yellow(preferences.experienceLevel || 'Not set')}`);
    console.log(
      `  Hooks Enabled: ${preferences.hooksEnabled ? chalk.green('Yes') : chalk.red('No')}`,
    );
    console.log(`  Setup Date: ${chalk.gray(preferences.setupDate || 'Unknown')}`);

    console.log('');
    this.displayCurrentGates(preferences.qualityGates || {});

    if (preferences.truthConfig) {
      console.log(chalk.blue('\n🎯 Truth Scoring Configuration:'));
      console.log(`  Threshold: ${chalk.yellow(preferences.truthConfig.threshold.toFixed(2))}`);
      console.log(`  Framework: ${chalk.yellow(preferences.truthConfig.framework)}`);
      console.log(
        `  Validation Checks: ${chalk.yellow(Object.values(preferences.truthConfig.checks).filter(Boolean).length)}`,
      );
    }

    // Display framework-specific commands
    this.displayFrameworkCommands(preferences);
  }

  /**
   * Display framework-specific commands based on detected framework
   */
  displayFrameworkCommands(preferences) {
    const framework = preferences.framework?.detected || 'unknown';

    console.log(chalk.blue('\n🚀 Framework-Specific Commands:'));

    switch (framework) {
      case 'javascript':
      case 'typescript':
        console.log(chalk.gray('  npm test                    # Run tests'));
        console.log(chalk.gray('  npm run build              # Build project'));
        console.log(chalk.gray('  npx jest --coverage        # Test with coverage'));
        break;

      case 'python':
        console.log(chalk.gray('  pytest                     # Run tests'));
        console.log(chalk.gray('  pytest --cov=.            # Test with coverage'));
        console.log(chalk.gray('  python -m pytest -v       # Verbose test output'));
        break;

      case 'rust':
        console.log(chalk.gray('  cargo test                 # Run tests'));
        console.log(chalk.gray('  cargo build                # Build project'));
        console.log(chalk.gray('  cargo test -- --nocapture # Test with output'));
        console.log(chalk.gray('  cargo clippy               # Lint code'));
        console.log(chalk.gray('  cargo fmt                  # Format code'));
        console.log(chalk.gray('  cargo check                # Fast compile check'));
        break;

      default:
        console.log(chalk.gray('  # Framework-specific commands will appear here'));
        console.log(chalk.gray('  # after running setup with your project'));
    }
  }

  /**
   * Save custom framework to configuration
   */
  async saveCustomFramework(frameworkConfig) {
    const customFrameworksPath = path.join(this.configPath, 'custom-frameworks.json');

    let customFrameworks = [];
    if (await this.fileExists(customFrameworksPath)) {
      const data = await fs.readFile(customFrameworksPath, 'utf8');
      customFrameworks = JSON.parse(data);
    }

    customFrameworks.push(frameworkConfig);

    await fs.mkdir(path.dirname(customFrameworksPath), { recursive: true });
    await fs.writeFile(customFrameworksPath, JSON.stringify(customFrameworks, null, 2));
  }

  /**
   * Auto-fix common issues
   */
  async autoFixIssues(issues) {
    console.log(chalk.blue('\n🔧 Attempting to fix issues...\n'));

    for (const issue of issues) {
      if (issue.includes('File permission')) {
        await this.fixFilePermissions();
      } else if (issue.includes('Configuration validation')) {
        await this.fixConfigurationIssues();
      } else if (issue.includes('Missing dependency')) {
        await this.suggestDependencyInstallation(issue);
      }
    }
  }

  /**
   * Validate quality gates configuration
   */
  async validateQualityGates(gates) {
    const errors = [];

    if (gates.truthScore < 0 || gates.truthScore > 1) {
      errors.push('Truth score must be between 0.0 and 1.0');
    }

    if (gates.testCoverage < 0 || gates.testCoverage > 100) {
      errors.push('Test coverage must be between 0 and 100');
    }

    if (!['A', 'B', 'C', 'D'].includes(gates.codeQuality)) {
      errors.push('Code quality must be A, B, C, or D');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check for required dependencies
   */
  async checkDependencies() {
    const required = [];
    const missing = [];

    // Check for package.json to determine if this is a Node.js project
    if (await this.fileExists(path.join(this.basePath, 'package.json'))) {
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(this.basePath, 'package.json'), 'utf8'));

        // Check for common testing frameworks
        const testingDeps = ['jest', 'mocha', 'vitest', 'cypress'];
        const hasTesting = testingDeps.some(
          (dep) => pkg.dependencies?.[dep] || pkg.devDependencies?.[dep],
        );

        if (!hasTesting) {
          missing.push('Testing framework (jest, mocha, vitest, or cypress)');
        }
      } catch (error) {
        missing.push('Valid package.json');
      }
    }

    // Check for Cargo.toml to determine if this is a Rust project
    if (await this.fileExists(path.join(this.basePath, 'Cargo.toml'))) {
      try {
        const cargoContent = await fs.readFile(path.join(this.basePath, 'Cargo.toml'), 'utf8');

        // Check for dev-dependencies section (testing is built into Rust)
        if (!cargoContent.includes('[dev-dependencies]') && !cargoContent.includes('[[test]]')) {
          // Rust has built-in testing, but warn if no test dependencies or test configuration
          missing.push('Test configuration (consider adding dev-dependencies or [[test]] section)');
        }
      } catch (error) {
        missing.push('Valid Cargo.toml');
      }
    }

    // Check for Python dependencies
    if (
      (await this.fileExists(path.join(this.basePath, 'requirements.txt'))) ||
      (await this.fileExists(path.join(this.basePath, 'pyproject.toml')))
    ) {
      try {
        let hasTestingFramework = false;

        // Check requirements.txt
        if (await this.fileExists(path.join(this.basePath, 'requirements.txt'))) {
          const requirements = await fs.readFile(
            path.join(this.basePath, 'requirements.txt'),
            'utf8',
          );
          hasTestingFramework = /pytest|unittest2|nose/.test(requirements);
        }

        // Check pyproject.toml
        if (
          !hasTestingFramework &&
          (await this.fileExists(path.join(this.basePath, 'pyproject.toml')))
        ) {
          const pyproject = await fs.readFile(path.join(this.basePath, 'pyproject.toml'), 'utf8');
          hasTestingFramework = /pytest|unittest/.test(pyproject);
        }

        if (!hasTestingFramework) {
          missing.push('Python testing framework (pytest, unittest, or nose)');
        }
      } catch (error) {
        missing.push('Valid Python project configuration');
      }
    }

    return {
      allPresent: missing.length === 0,
      missing,
    };
  }

  /**
   * Test file permissions
   */
  async testFilePermissions() {
    const testDir = path.join(this.configPath, 'temp');
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, 'test.json'), '{}');
    await fs.unlink(path.join(testDir, 'test.json'));
    await fs.rmdir(testDir);
  }

  /**
   * Fix file permission issues
   */
  async fixFilePermissions() {
    console.log(chalk.yellow('  🔧 Fixing file permissions...'));
    try {
      await fs.mkdir(this.configPath, { recursive: true });
      console.log(chalk.green('  ✅ File permissions fixed'));
    } catch (error) {
      console.log(chalk.red('  ❌ Could not fix file permissions'));
    }
  }

  /**
   * Fix configuration issues
   */
  async fixConfigurationIssues() {
    console.log(chalk.yellow('  🔧 Fixing configuration issues...'));
    console.log(chalk.gray('  💡 Consider running: claude-flow-novice validate setup --reset'));
  }

  /**
   * Suggest dependency installation
   */
  async suggestDependencyInstallation(issue) {
    console.log(chalk.yellow(`  🔧 ${issue}`));
    if (issue.includes('cargo') || issue.includes('Rust')) {
      console.log(
        chalk.gray(
          '  💡 Consider installing missing dependencies with cargo or updating Cargo.toml',
        ),
      );
    } else if (issue.includes('Python') || issue.includes('pytest')) {
      console.log(
        chalk.gray(
          '  💡 Consider installing missing dependencies with pip or updating requirements.txt',
        ),
      );
    } else {
      console.log(
        chalk.gray('  💡 Consider installing missing dependencies with npm/yarn/pip/cargo'),
      );
    }
  }

  /**
   * Load user preferences
   */
  async loadUserPreferences() {
    const data = await fs.readFile(this.preferencesPath, 'utf8');
    return JSON.parse(data);
  }

  /**
   * Save user preferences
   */
  async saveUserPreferences(preferences) {
    await fs.mkdir(path.dirname(this.preferencesPath), { recursive: true });
    await fs.writeFile(this.preferencesPath, JSON.stringify(preferences, null, 2));
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export default ValidationCommands;
