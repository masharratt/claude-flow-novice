/**
 * Interactive CLI Setup Wizard for Completion Validation Framework
 * Phase 2 Implementation - Wizard Developer
 *
 * Provides interactive configuration with framework detection and quality gates
 * Target: 95% users complete setup in <5 minutes
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { TruthConfigManager } from './TruthConfigManager.js';

export class CompletionValidationCLIWizard {
  constructor(options = {}) {
    this.configManager = options.configManager || new TruthConfigManager();
    this.verbose = options.verbose || false;
  }

  /**
   * Main setup wizard entry point
   */
  async runSetupWizard() {
    console.log(chalk.blue.bold('\n🔧 Claude Flow Novice - Completion Validation Setup Wizard'));
    console.log(chalk.gray('Configure your validation framework in under 5 minutes\n'));

    const spinner = ora('Initializing configuration manager...').start();

    try {
      await this.configManager.initialize();
      spinner.succeed('Configuration manager initialized');

      // Step 1: Framework Detection
      const detectionResult = await this.runFrameworkDetection();

      // Step 2: Quality Gates Configuration
      const qualityGates = await this.configureQualityGates(detectionResult);

      // Step 3: Validation Settings
      const validationSettings = await this.configureValidationSettings();

      // Step 4: Final Configuration
      const finalConfig = await this.buildFinalConfiguration({
        framework: detectionResult.selectedFramework,
        qualityGates,
        validationSettings
      });

      // Step 5: Save and Test Configuration
      await this.saveAndTestConfiguration(finalConfig);

      console.log(chalk.green.bold('\n✅ Setup completed successfully!'));
      console.log(chalk.gray('Your completion validation framework is ready to use.'));

      return {
        success: true,
        configuration: finalConfig,
        setupTime: Date.now()
      };

    } catch (error) {
      spinner.fail('Setup failed');
      console.error(chalk.red(`\n❌ Setup error: ${error.message}`));

      if (this.verbose) {
        console.error(chalk.gray(error.stack));
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Step 1: Framework Detection with user confirmation
   */
  async runFrameworkDetection() {
    const spinner = ora('Analyzing your project structure...').start();

    const detection = await this.configManager.detectFramework();
    spinner.stop();

    console.log(chalk.yellow('\n📁 Project Analysis Results:'));

    if (detection.confidence > 0.7) {
      console.log(chalk.green(`✨ Detected: ${detection.detected.toUpperCase()} (${Math.round(detection.confidence * 100)}% confidence)`));

      if (detection.evidence) {
        this.displayEvidence(detection.evidence);
      }

      const { confirmFramework } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmFramework',
          message: `Use ${detection.detected} configuration?`,
          default: true
        }
      ]);

      if (confirmFramework) {
        return {
          selectedFramework: detection.detected,
          autoDetected: true,
          confidence: detection.confidence
        };
      }
    } else {
      console.log(chalk.yellow(`⚠️ Auto-detection uncertain (${Math.round(detection.confidence * 100)}% confidence)`));

      if (detection.evidence) {
        this.displayEvidence(detection.evidence);
      }
    }

    // Manual framework selection
    const frameworks = [
      { name: 'JavaScript (Node.js)', value: 'javascript' },
      { name: 'TypeScript', value: 'typescript' },
      { name: 'Python', value: 'python' },
      { name: 'Test-Driven Development (TDD)', value: 'tdd' },
      { name: 'Behavior-Driven Development (BDD)', value: 'bdd' },
      { name: 'SPARC Methodology', value: 'sparc' }
    ];

    const { manualFramework } = await inquirer.prompt([
      {
        type: 'list',
        name: 'manualFramework',
        message: 'Select your development framework:',
        choices: frameworks
      }
    ]);

    return {
      selectedFramework: manualFramework,
      autoDetected: false,
      confidence: 1.0
    };
  }

  /**
   * Step 2: Quality Gates Configuration
   */
  async configureQualityGates(detectionResult) {
    console.log(chalk.yellow('\n🎯 Quality Gates Configuration'));

    // Get framework-specific defaults
    const frameworkDefaults = this.configManager.config.frameworkSpecific[detectionResult.selectedFramework];
    const globalDefaults = this.configManager.config.qualityGates;

    const defaults = { ...globalDefaults, ...frameworkDefaults };

    console.log(chalk.gray(`Framework defaults for ${detectionResult.selectedFramework}:`));
    console.log(chalk.gray(`- Truth Score: ${Math.round(defaults.truthScore * 100)}%`));
    console.log(chalk.gray(`- Test Coverage: ${Math.round(defaults.testCoverage * 100)}%`));

    const { customizeGates } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'customizeGates',
        message: 'Customize quality gate thresholds?',
        default: false
      }
    ]);

    if (!customizeGates) {
      return defaults;
    }

    // Custom quality gates configuration
    const customGates = await inquirer.prompt([
      {
        type: 'number',
        name: 'truthScore',
        message: 'Truth Score threshold (0-100):',
        default: Math.round(defaults.truthScore * 100),
        validate: (value) => {
          if (value < 0 || value > 100) return 'Value must be between 0 and 100';
          if (value < 70) return 'Warning: Values below 70% may be too permissive';
          return true;
        }
      },
      {
        type: 'number',
        name: 'testCoverage',
        message: 'Test Coverage threshold (0-100):',
        default: Math.round(defaults.testCoverage * 100),
        validate: (value) => {
          if (value < 0 || value > 100) return 'Value must be between 0 and 100';
          if (value < 80) return 'Warning: Values below 80% may be insufficient';
          return true;
        }
      },
      {
        type: 'number',
        name: 'codeQuality',
        message: 'Code Quality threshold (0-100):',
        default: Math.round(defaults.codeQuality * 100),
        validate: (value) => {
          if (value < 0 || value > 100) return 'Value must be between 0 and 100';
          return true;
        }
      },
      {
        type: 'number',
        name: 'documentationScore',
        message: 'Documentation Score threshold (0-100):',
        default: Math.round(defaults.documentationScore * 100),
        validate: (value) => {
          if (value < 0 || value > 100) return 'Value must be between 0 and 100';
          return true;
        }
      }
    ]);

    // Convert percentages back to decimals
    return {
      truthScore: customGates.truthScore / 100,
      testCoverage: customGates.testCoverage / 100,
      codeQuality: customGates.codeQuality / 100,
      documentationScore: customGates.documentationScore / 100
    };
  }

  /**
   * Step 3: Validation Settings Configuration
   */
  async configureValidationSettings() {
    console.log(chalk.yellow('\n⚙️ Validation Settings'));

    const { advancedSettings } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'advancedSettings',
        message: 'Configure advanced validation settings?',
        default: false
      }
    ]);

    const defaults = this.configManager.config.validationSettings;

    if (!advancedSettings) {
      return defaults;
    }

    const settings = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'byzantineConsensusEnabled',
        message: 'Enable Byzantine consensus validation?',
        default: defaults.byzantineConsensusEnabled
      },
      {
        type: 'number',
        name: 'consensusTimeout',
        message: 'Consensus timeout (ms):',
        default: defaults.consensusTimeout,
        validate: (value) => value >= 1000 ? true : 'Timeout must be at least 1000ms'
      },
      {
        type: 'number',
        name: 'requiredValidators',
        message: 'Required validators for consensus:',
        default: defaults.requiredValidators,
        validate: (value) => value >= 1 ? true : 'Must have at least 1 validator'
      },
      {
        type: 'confirm',
        name: 'allowPartialValidation',
        message: 'Allow partial validation for non-critical completions?',
        default: defaults.allowPartialValidation
      },
      {
        type: 'confirm',
        name: 'strictMode',
        message: 'Enable strict mode (more rigorous validation)?',
        default: defaults.strictMode
      }
    ]);

    return settings;
  }

  /**
   * Step 4: Build Final Configuration
   */
  async buildFinalConfiguration({ framework, qualityGates, validationSettings }) {
    return {
      version: '2.0.0',
      framework,
      qualityGates,
      validationSettings,
      setupWizard: {
        completed: true,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
    };
  }

  /**
   * Step 5: Save and Test Configuration
   */
  async saveAndTestConfiguration(config) {
    const spinner = ora('Saving configuration...').start();

    try {
      // Save configuration
      await this.configManager.updateConfiguration(config);
      spinner.text = 'Testing configuration...';

      // Test configuration
      const testResults = await this.configManager.testConfiguration();

      if (testResults.configurationValid) {
        spinner.succeed('Configuration saved and tested successfully');

        console.log(chalk.green('\n✅ Configuration Test Results:'));
        if (testResults.frameworkDetection) {
          console.log(chalk.gray(`- Framework: ${testResults.frameworkDetection.detected} (${Math.round(testResults.frameworkDetection.confidence * 100)}%)`));
        }
        console.log(chalk.gray(`- Quality Gates: ${Object.keys(testResults.qualityGates).length} configured`));
        console.log(chalk.gray(`- Validation: ${testResults.validationSettings.byzantineConsensus ? 'Byzantine consensus ready' : 'Basic validation'}`));

      } else {
        spinner.fail('Configuration test failed');
        console.log(chalk.red('\n❌ Configuration Issues:'));
        testResults.errors.forEach(error => {
          console.log(chalk.red(`  • ${error}`));
        });
        throw new Error('Configuration validation failed');
      }

    } catch (error) {
      spinner.fail('Configuration save/test failed');
      throw error;
    }
  }

  /**
   * Display current configuration
   */
  async showConfiguration() {
    console.log(chalk.blue.bold('\n📋 Current Completion Validation Configuration'));

    try {
      await this.configManager.initialize();
      const config = await this.configManager.getCurrentConfiguration();

      console.log(chalk.yellow('\nFramework Settings:'));
      console.log(`  Framework: ${config.framework || 'auto'}`);

      console.log(chalk.yellow('\nQuality Gates:'));
      const gates = config.qualityGates;
      console.log(`  Truth Score: ${Math.round(gates.truthScore * 100)}%`);
      console.log(`  Test Coverage: ${Math.round(gates.testCoverage * 100)}%`);
      console.log(`  Code Quality: ${Math.round(gates.codeQuality * 100)}%`);
      console.log(`  Documentation: ${Math.round(gates.documentationScore * 100)}%`);

      console.log(chalk.yellow('\nValidation Settings:'));
      const validation = config.validationSettings;
      console.log(`  Byzantine Consensus: ${validation.byzantineConsensusEnabled ? 'Enabled' : 'Disabled'}`);
      console.log(`  Consensus Timeout: ${validation.consensusTimeout}ms`);
      console.log(`  Required Validators: ${validation.requiredValidators}`);
      console.log(`  Strict Mode: ${validation.strictMode ? 'Enabled' : 'Disabled'}`);

      if (config.setupWizard?.completed) {
        console.log(chalk.gray(`\nSetup completed: ${new Date(config.setupWizard.timestamp).toLocaleString()}`));
      }

    } catch (error) {
      console.error(chalk.red(`Configuration error: ${error.message}`));
    }
  }

  /**
   * Test current configuration
   */
  async testConfiguration() {
    console.log(chalk.blue.bold('\n🧪 Testing Completion Validation Configuration'));

    const spinner = ora('Running configuration tests...').start();

    try {
      await this.configManager.initialize();
      const results = await this.configManager.testConfiguration();

      if (results.configurationValid) {
        spinner.succeed('Configuration tests passed');

        console.log(chalk.green('\n✅ Test Results:'));

        if (results.frameworkDetection) {
          const detection = results.frameworkDetection;
          console.log(`  Framework Detection: ${detection.detected} (${Math.round(detection.confidence * 100)}% confidence)`);

          if (detection.evidence && Object.keys(detection.evidence).length > 0) {
            console.log('  Evidence found:');
            Object.entries(detection.evidence).forEach(([key, value]) => {
              if (value === true) {
                console.log(chalk.gray(`    ✓ ${key}`));
              } else if (typeof value === 'number' && value > 0) {
                console.log(chalk.gray(`    ✓ ${key}: ${value} files`));
              }
            });
          }
        }

        if (Object.keys(results.qualityGates).length > 0) {
          console.log(`  Quality Gates: ${Object.keys(results.qualityGates).length} thresholds configured`);
        }

        if (results.validationSettings.byzantineConsensus !== undefined) {
          console.log(`  Byzantine Consensus: ${results.validationSettings.byzantineConsensus ? 'Functional' : 'Not available'}`);
        }

      } else {
        spinner.fail('Configuration tests failed');

        console.log(chalk.red('\n❌ Configuration Issues:'));
        results.errors.forEach(error => {
          console.log(chalk.red(`  • ${error}`));
        });

        console.log(chalk.yellow('\n💡 Suggestions:'));
        console.log('  • Run: claude-flow-novice validate setup');
        console.log('  • Check your project structure');
        console.log('  • Verify framework installation');
      }

    } catch (error) {
      spinner.fail('Configuration test failed');
      console.error(chalk.red(`\nTest error: ${error.message}`));

      if (this.verbose) {
        console.error(chalk.gray(error.stack));
      }
    }
  }

  // Helper methods

  displayEvidence(evidence) {
    console.log(chalk.gray('  Evidence found:'));

    Object.entries(evidence).forEach(([key, value]) => {
      if (value === true) {
        console.log(chalk.gray(`    ✓ ${key}`));
      } else if (typeof value === 'number' && value > 0) {
        console.log(chalk.gray(`    ✓ ${key}: ${value} files`));
      }
    });
  }

  async close() {
    if (this.configManager) {
      await this.configManager.close();
    }
  }
}

/**
 * CLI Command Handlers
 */

export async function setupCommand(options = {}) {
  const wizard = new CompletionValidationCLIWizard({
    verbose: options.verbose
  });

  try {
    const result = await wizard.runSetupWizard();
    await wizard.close();
    return result;
  } catch (error) {
    await wizard.close();
    throw error;
  }
}

export async function showConfigCommand(options = {}) {
  const wizard = new CompletionValidationCLIWizard({
    verbose: options.verbose
  });

  try {
    await wizard.showConfiguration();
    await wizard.close();
  } catch (error) {
    await wizard.close();
    throw error;
  }
}

export async function testConfigCommand(options = {}) {
  const wizard = new CompletionValidationCLIWizard({
    verbose: options.verbose
  });

  try {
    await wizard.testConfiguration();
    await wizard.close();
  } catch (error) {
    await wizard.close();
    throw error;
  }
}