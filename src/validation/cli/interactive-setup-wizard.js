/**
 * Interactive Setup Wizard
 * Phase 2 Critical Implementation - <5 minute setup completion
 *
 * Provides guided, interactive setup for completion validation with:
 * - Framework auto-detection (>90% accuracy)
 * - Experience level detection
 * - Step-by-step user onboarding
 * - Configuration migration and persistence
 */

import fs from 'fs/promises';
import path from 'path';
import { prompts } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { FrameworkDetector } from '../../completion/framework-detector.js';
import { TruthConfigManager } from '../truth-config-manager.js';
import { logger } from '../../core/logger.js';

const EXPERIENCE_LEVELS = {
  NOVICE: 'novice',
  INTERMEDIATE: 'intermediate',
  EXPERT: 'expert'
};

const FRAMEWORK_MAPPING = {
  javascript: { name: 'JavaScript/Node.js', config: 'TDD' },
  typescript: { name: 'TypeScript', config: 'TDD' },
  python: { name: 'Python', config: 'BDD' },
  rust: { name: 'Rust', config: 'TDD' },
  unknown: { name: 'Custom Framework', config: 'CUSTOM' }
};

export class InteractiveSetupWizard {
  constructor(options = {}) {
    this.basePath = options.basePath || process.cwd();
    this.logger = logger.child({ component: 'InteractiveSetupWizard' });
    this.frameworkDetector = new FrameworkDetector({ basePath: this.basePath });
    this.configManager = new TruthConfigManager({
      configDir: path.join(this.basePath, '.swarm', 'configs')
    });

    this.setupStartTime = null;
    this.userPreferences = {};
    this.detectedFramework = null;
    this.migrationData = null;
  }

  /**
   * Main setup wizard entry point - optimized for <5 minute completion
   */
  async runSetupWizard(options = {}) {
    this.setupStartTime = Date.now();

    try {
      console.log(chalk.blue.bold('🚀 Claude Flow Novice - Completion Validation Setup\n'));
      console.log(chalk.gray('Setting up intelligent completion validation for your project...'));
      console.log(chalk.gray('Target completion time: < 5 minutes\n'));

      // Phase 1: Quick Project Analysis (30 seconds)
      await this.performQuickAnalysis();

      // Phase 2: Experience Level & Preferences (90 seconds)
      await this.gatherUserPreferences();

      // Phase 3: Framework Configuration (60 seconds)
      await this.configureFramework();

      // Phase 4: Quality Gates Setup (60 seconds)
      await this.setupQualityGates();

      // Phase 5: Final Configuration & Testing (60 seconds)
      await this.finalizeAndTest();

      const setupTime = (Date.now() - this.setupStartTime) / 1000;

      console.log(chalk.green.bold('\n🎉 Setup Complete!'));
      console.log(chalk.gray(`⏱️  Setup completed in ${setupTime.toFixed(1)} seconds`));

      if (setupTime > 300) {
        console.log(chalk.yellow('⚠️  Setup took longer than 5 minutes. Consider pre-configuring for next time.'));
      }

      this.displayQuickStart();

      return {
        success: true,
        setupTime: setupTime,
        configuration: this.userPreferences,
        framework: this.detectedFramework
      };

    } catch (error) {
      this.logger.error('Setup wizard failed', error);
      console.log(chalk.red(`\n❌ Setup failed: ${error.message}`));

      return {
        success: false,
        error: error.message,
        setupTime: (Date.now() - this.setupStartTime) / 1000
      };
    }
  }

  /**
   * Phase 1: Quick Project Analysis (30 seconds target)
   */
  async performQuickAnalysis() {
    const spinner = ora('Analyzing your project structure...').start();

    try {
      // Initialize components
      await this.frameworkDetector.initialize();
      await this.configManager.initialize();

      // Detect framework with caching
      this.detectedFramework = await this.frameworkDetector.detectFramework();

      // Check for existing configurations
      this.migrationData = await this.checkExistingConfigs();

      spinner.succeed(chalk.green('Project analysis complete'));

      // Show detection results
      this.displayDetectionResults();

    } catch (error) {
      spinner.fail('Project analysis failed');
      throw error;
    }
  }

  /**
   * Phase 2: Experience Level & Preferences (90 seconds target)
   */
  async gatherUserPreferences() {
    console.log(chalk.blue('\n📋 User Preferences'));

    // Experience level detection
    const experienceLevel = await prompts.select({
      message: 'What\'s your experience level with automated testing?',
      choices: [
        {
          name: 'Novice - I\'m new to testing and want guided setup',
          value: EXPERIENCE_LEVELS.NOVICE,
          description: 'Recommended settings with explanations'
        },
        {
          name: 'Intermediate - I know the basics and want some control',
          value: EXPERIENCE_LEVELS.INTERMEDIATE,
          description: 'Balanced automation with customization options'
        },
        {
          name: 'Expert - I want full control over configuration',
          value: EXPERIENCE_LEVELS.EXPERT,
          description: 'Advanced options and minimal hand-holding'
        }
      ]
    });

    this.userPreferences.experienceLevel = experienceLevel;

    // Quick preference gathering based on experience level
    if (experienceLevel === EXPERIENCE_LEVELS.NOVICE) {
      await this.gatherNovicePreferences();
    } else if (experienceLevel === EXPERIENCE_LEVELS.INTERMEDIATE) {
      await this.gatherIntermediatePreferences();
    } else {
      await this.gatherExpertPreferences();
    }
  }

  /**
   * Novice user preferences - pre-configured with explanations
   */
  async gatherNovicePreferences() {
    this.userPreferences.autoHooks = true;
    this.userPreferences.strictMode = false;
    this.userPreferences.verbose = true;

    const framework = FRAMEWORK_MAPPING[this.detectedFramework?.detected] || FRAMEWORK_MAPPING.unknown;

    console.log(chalk.green(`✅ Using recommended settings for ${framework.name}:`));
    console.log(chalk.gray('  • Automatic completion hooks enabled'));
    console.log(chalk.gray('  • Beginner-friendly validation thresholds'));
    console.log(chalk.gray('  • Verbose feedback and explanations'));
    console.log(chalk.gray('  • Truth score threshold optimized for learning'));

    const confirmDefaults = await prompts.confirm({
      message: 'Use these recommended settings?',
      default: true
    });

    if (!confirmDefaults) {
      await this.gatherIntermediatePreferences();
    }
  }

  /**
   * Intermediate user preferences - balanced options
   */
  async gatherIntermediatePreferences() {
    const preferences = await prompts.checkbox({
      message: 'Select your preferred features:',
      choices: [
        { name: 'Automatic completion hooks', value: 'autoHooks', checked: true },
        { name: 'Strict validation mode', value: 'strictMode', checked: false },
        { name: 'Verbose feedback', value: 'verbose', checked: true },
        { name: 'GitHub integration', value: 'githubIntegration', checked: false },
        { name: 'Custom quality gates', value: 'customGates', checked: false }
      ]
    });

    preferences.forEach(pref => {
      this.userPreferences[pref] = true;
    });
  }

  /**
   * Expert user preferences - full customization
   */
  async gatherExpertPreferences() {
    console.log(chalk.yellow('Expert mode - Full customization available'));

    const customConfig = await prompts.confirm({
      message: 'Create custom truth scoring configuration?',
      default: false
    });

    if (customConfig) {
      await this.createCustomTruthConfig();
    }

    // Advanced options
    const advancedOptions = await prompts.checkbox({
      message: 'Advanced options:',
      choices: [
        { name: 'Byzantine fault tolerance', value: 'byzantineMode', checked: true },
        { name: 'Neural pattern learning', value: 'neuralLearning', checked: false },
        { name: 'Distributed validation', value: 'distributedMode', checked: false },
        { name: 'Custom validation hooks', value: 'customHooks', checked: false },
        { name: 'Performance optimization', value: 'performanceMode', checked: true }
      ]
    });

    advancedOptions.forEach(option => {
      this.userPreferences[option] = true;
    });
  }

  /**
   * Phase 3: Framework Configuration (60 seconds target)
   */
  async configureFramework() {
    console.log(chalk.blue('\n🔧 Framework Configuration'));

    const frameworkInfo = FRAMEWORK_MAPPING[this.detectedFramework?.detected] || FRAMEWORK_MAPPING.unknown;

    if (this.detectedFramework?.confidence > 0.8) {
      console.log(chalk.green(`✅ Detected: ${frameworkInfo.name} (${(this.detectedFramework.confidence * 100).toFixed(1)}% confidence)`));

      const useDetected = await prompts.confirm({
        message: `Configure for ${frameworkInfo.name}?`,
        default: true
      });

      if (useDetected) {
        await this.applyFrameworkConfig(frameworkInfo.config);
        return;
      }
    }

    // Manual framework selection
    const selectedFramework = await prompts.select({
      message: 'Select your development framework:',
      choices: [
        { name: 'JavaScript/Node.js with Jest', value: 'TDD' },
        { name: 'TypeScript with Jest', value: 'TDD' },
        { name: 'Python with pytest', value: 'BDD' },
        { name: 'Rust with cargo test', value: 'TDD' },
        { name: 'SPARC Methodology', value: 'SPARC' },
        { name: 'Custom Framework', value: 'CUSTOM' }
      ]
    });

    await this.applyFrameworkConfig(selectedFramework);
  }

  /**
   * Apply framework-specific configuration
   */
  async applyFrameworkConfig(frameworkType) {
    const spinner = ora('Configuring framework settings...').start();

    try {
      // Create configuration from framework preset
      const config = await this.configManager.createFromFramework(frameworkType, {
        name: `${frameworkType} Configuration - ${new Date().toLocaleDateString()}`,
        description: `Auto-generated configuration for ${frameworkType} framework`,
        tags: [frameworkType.toLowerCase(), 'auto-generated']
      });

      // Apply user preferences
      if (this.userPreferences.strictMode) {
        config.threshold += 0.05; // Increase threshold for strict mode
      }

      if (this.userPreferences.experienceLevel === EXPERIENCE_LEVELS.NOVICE) {
        config.threshold -= 0.05; // Lower threshold for beginners
        config.confidence.level = Math.max(0.8, config.confidence.level - 0.05);
      }

      this.userPreferences.truthConfig = config;

      spinner.succeed(`${frameworkType} framework configured`);

    } catch (error) {
      spinner.fail('Framework configuration failed');
      throw error;
    }
  }

  /**
   * Phase 4: Quality Gates Setup (60 seconds target)
   */
  async setupQualityGates() {
    console.log(chalk.blue('\n🚧 Quality Gates Setup'));

    if (this.userPreferences.experienceLevel === EXPERIENCE_LEVELS.NOVICE) {
      console.log(chalk.green('✅ Using recommended quality gates for beginners'));
      this.userPreferences.qualityGates = {
        truthScore: 0.75,
        testCoverage: 80,
        codeQuality: 'B',
        documentationCoverage: 60
      };
      return;
    }

    const customizeGates = await prompts.confirm({
      message: 'Customize quality gate thresholds?',
      default: false
    });

    if (!customizeGates) {
      this.userPreferences.qualityGates = this.getDefaultQualityGates();
      return;
    }

    // Custom quality gates
    const truthThreshold = await prompts.number({
      message: 'Truth score threshold (0.0-1.0):',
      default: 0.85,
      validate: (value) => value >= 0 && value <= 1 || 'Must be between 0.0 and 1.0'
    });

    const coverageThreshold = await prompts.number({
      message: 'Test coverage threshold (%):',
      default: 90,
      validate: (value) => value >= 0 && value <= 100 || 'Must be between 0 and 100'
    });

    this.userPreferences.qualityGates = {
      truthScore: truthThreshold,
      testCoverage: coverageThreshold,
      codeQuality: 'A',
      documentationCoverage: 80
    };
  }

  /**
   * Phase 5: Final Configuration & Testing (60 seconds target)
   */
  async finalizeAndTest() {
    console.log(chalk.blue('\n🧪 Finalizing Configuration'));

    const spinner = ora('Saving configuration...').start();

    try {
      // Save configuration
      const configName = `setup_${new Date().toISOString().slice(0, 10)}`;
      await this.configManager.saveConfiguration(
        this.userPreferences.truthConfig,
        configName
      );

      // Create user preferences file
      await this.saveUserPreferences();

      // Test configuration
      spinner.text = 'Testing configuration...';
      const testResult = await this.testConfiguration();

      if (testResult.success) {
        spinner.succeed('Configuration saved and tested successfully');
      } else {
        spinner.warn(`Configuration saved with warnings: ${testResult.warnings?.join(', ')}`);
      }

    } catch (error) {
      spinner.fail('Configuration finalization failed');
      throw error;
    }
  }

  /**
   * Display framework detection results
   */
  displayDetectionResults() {
    if (!this.detectedFramework) return;

    console.log(chalk.blue('\n🔍 Project Analysis Results'));

    if (this.detectedFramework.detected !== 'unknown') {
      const confidence = (this.detectedFramework.confidence * 100).toFixed(1);
      const framework = FRAMEWORK_MAPPING[this.detectedFramework.detected];

      console.log(chalk.green(`✅ Framework: ${framework.name} (${confidence}% confidence)`));

      // Show evidence
      if (this.detectedFramework.evidence.files.packageJson) {
        console.log(chalk.gray('  📦 package.json detected'));
      }
      if (this.detectedFramework.evidence.files.tsFiles) {
        console.log(chalk.gray(`  📄 ${this.detectedFramework.evidence.files.tsFiles} TypeScript files`));
      }
      if (this.detectedFramework.evidence.files.jsFiles) {
        console.log(chalk.gray(`  📄 ${this.detectedFramework.evidence.files.jsFiles} JavaScript files`));
      }
      if (this.detectedFramework.evidence.files.pyFiles) {
        console.log(chalk.gray(`  📄 ${this.detectedFramework.evidence.files.pyFiles} Python files`));
      }
      if (this.detectedFramework.evidence.files.rsFiles) {
        console.log(chalk.gray(`  📄 ${this.detectedFramework.evidence.files.rsFiles} Rust files`));
      }

      // Show testing frameworks
      if (this.detectedFramework.evidence.testingFrameworks.length > 0) {
        console.log(chalk.gray(`  🧪 Testing: ${this.detectedFramework.evidence.testingFrameworks.join(', ')}`));
      }

    } else {
      console.log(chalk.yellow('⚠️  Could not detect framework automatically'));
      console.log(chalk.gray('  We\'ll guide you through manual configuration'));
    }
  }

  /**
   * Check for existing configurations and migration opportunities
   */
  async checkExistingConfigs() {
    try {
      // Check for existing .swarm directory
      const swarmDir = path.join(this.basePath, '.swarm');
      const swarmExists = await this.dirExists(swarmDir);

      // Check for other config files
      const configFiles = [
        'jest.config.js', 'jest.config.json',
        'pytest.ini', 'pyproject.toml',
        '.eslintrc.js', '.eslintrc.json',
        'tsconfig.json',
        'Cargo.toml', 'Cargo.lock'
      ];

      const existingConfigs = [];
      for (const configFile of configFiles) {
        if (await this.fileExists(path.join(this.basePath, configFile))) {
          existingConfigs.push(configFile);
        }
      }

      return {
        hasSwarmConfig: swarmExists,
        existingConfigs: existingConfigs,
        canMigrate: swarmExists || existingConfigs.length > 0
      };

    } catch (error) {
      return { hasSwarmConfig: false, existingConfigs: [], canMigrate: false };
    }
  }

  /**
   * Create custom truth scoring configuration
   */
  async createCustomTruthConfig() {
    console.log(chalk.blue('\n🎛️  Custom Truth Configuration'));

    const threshold = await prompts.number({
      message: 'Truth score threshold (0.0-1.0):',
      default: 0.80,
      validate: (value) => value >= 0 && value <= 1 || 'Must be between 0.0 and 1.0'
    });

    const weights = {};
    const weightComponents = [
      { key: 'agentReliability', name: 'Agent Reliability', default: 0.30 },
      { key: 'crossValidation', name: 'Cross Validation', default: 0.25 },
      { key: 'externalVerification', name: 'External Verification', default: 0.20 },
      { key: 'factualConsistency', name: 'Factual Consistency', default: 0.15 },
      { key: 'logicalCoherence', name: 'Logical Coherence', default: 0.10 }
    ];

    console.log(chalk.yellow('Configure truth scoring weights (must sum to 1.0):'));

    for (const component of weightComponents) {
      const weight = await prompts.number({
        message: `${component.name} weight:`,
        default: component.default,
        validate: (value) => value >= 0 && value <= 1 || 'Must be between 0.0 and 1.0'
      });
      weights[component.key] = weight;
    }

    // Normalize weights to sum to 1.0
    const weightSum = Object.values(weights).reduce((sum, w) => sum + w, 0);
    if (Math.abs(weightSum - 1.0) > 0.001) {
      console.log(chalk.yellow(`Normalizing weights (sum was ${weightSum.toFixed(3)})`));
      Object.keys(weights).forEach(key => {
        weights[key] = weights[key] / weightSum;
      });
    }

    this.userPreferences.customTruthConfig = {
      threshold,
      weights
    };
  }

  /**
   * Save user preferences to configuration file
   */
  async saveUserPreferences() {
    const configPath = path.join(this.basePath, '.swarm', 'user-preferences.json');

    const preferences = {
      ...this.userPreferences,
      setupDate: new Date().toISOString(),
      version: '2.0.0',
      framework: this.detectedFramework
    };

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(preferences, null, 2));
  }

  /**
   * Test the final configuration
   */
  async testConfiguration() {
    try {
      // Test framework detection
      const frameworkTest = this.detectedFramework?.confidence > 0.3;

      // Test truth configuration
      const truthConfigTest = this.userPreferences.truthConfig &&
                             this.userPreferences.truthConfig.threshold > 0;

      // Test file permissions
      const permissionsTest = await this.testFilePermissions();

      const warnings = [];
      if (!frameworkTest) warnings.push('Framework detection has low confidence');
      if (!permissionsTest) warnings.push('File permission issues detected');

      return {
        success: frameworkTest && truthConfigTest && permissionsTest,
        warnings: warnings
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test file permissions for configuration directory
   */
  async testFilePermissions() {
    try {
      const testDir = path.join(this.basePath, '.swarm', 'test');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(path.join(testDir, 'test.json'), '{}');
      await fs.unlink(path.join(testDir, 'test.json'));
      await fs.rmdir(testDir);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get default quality gates based on framework
   */
  getDefaultQualityGates() {
    const framework = this.detectedFramework?.detected || 'unknown';

    const defaults = {
      javascript: { truthScore: 0.85, testCoverage: 90, codeQuality: 'A', documentationCoverage: 80 },
      typescript: { truthScore: 0.90, testCoverage: 95, codeQuality: 'A', documentationCoverage: 85 },
      python: { truthScore: 0.80, testCoverage: 85, codeQuality: 'B', documentationCoverage: 75 },
      rust: { truthScore: 0.88, testCoverage: 92, codeQuality: 'A', documentationCoverage: 82 },
      unknown: { truthScore: 0.75, testCoverage: 80, codeQuality: 'B', documentationCoverage: 70 }
    };

    return defaults[framework] || defaults.unknown;
  }

  /**
   * Display quick start guide
   */
  displayQuickStart() {
    console.log(chalk.blue('\n🚀 Quick Start Guide'));
    console.log(chalk.gray('Your completion validation is now configured. Here\'s what you can do:'));
    console.log('');

    console.log(chalk.yellow('📝 Test Your Setup:'));
    console.log(chalk.gray('  claude-flow-novice validate check'));
    console.log('');

    console.log(chalk.yellow('🔧 Enable Automatic Hooks:'));
    console.log(chalk.gray('  claude-flow-novice validate enable-hooks'));
    console.log('');

    console.log(chalk.yellow('📊 View Configuration:'));
    console.log(chalk.gray('  claude-flow-novice validate show-config'));
    console.log('');

    console.log(chalk.yellow('🔍 Add Custom Framework:'));
    console.log(chalk.gray('  claude-flow-novice validate add-framework'));
    console.log('');

    console.log(chalk.green('💡 Your project is now protected by intelligent completion validation!'));
    console.log(chalk.gray('All future completions will be validated against your quality gates.'));
  }

  /**
   * Utility methods
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async dirExists(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async cleanup() {
    if (this.frameworkDetector) {
      await this.frameworkDetector.close();
    }
    if (this.configManager) {
      await this.configManager.cleanup();
    }
  }
}

export default InteractiveSetupWizard;