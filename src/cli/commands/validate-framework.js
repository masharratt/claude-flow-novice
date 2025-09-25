/**
 * CLI Command: validate framework
 * Comprehensive framework validation with user-friendly interface
 *
 * COMMANDS:
 * - claude-flow-novice validate framework add <framework-file>
 * - claude-flow-novice validate framework test <framework-id>
 * - claude-flow-novice validate framework list
 * - claude-flow-novice validate framework remove <framework-id>
 * - claude-flow-novice validate framework export <framework-id>
 *
 * FEATURES:
 * - Interactive framework creation wizard
 * - Real-time validation feedback with progress bars
 * - Detailed error reporting with suggestions
 * - Framework testing and verification
 * - Integration with Byzantine consensus system
 * - Security vulnerability scanning
 */

import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { table } from 'table';
import EnhancedCustomFrameworkValidator from '../validation/custom-framework-validator.js';
import { defaultFrameworkValidator } from '../schemas/custom-framework-schema.js';

/**
 * Framework Validation CLI Handler
 */
export class FrameworkValidationCLI {
  constructor(options = {}) {
    this.options = {
      interactive: options.interactive !== false,
      verbose: options.verbose === true,
      autoFix: options.autoFix === true,
      ...options
    };

    this.validator = null;
    this.spinner = null;
  }

  /**
   * Initialize the validation CLI
   */
  async initialize() {
    if (this.validator) return;

    this.spinner = ora('Initializing framework validation system...').start();

    try {
      this.validator = new EnhancedCustomFrameworkValidator({
        enableByzantineValidation: true,
        enableSecuritySandbox: true
      });

      await this.validator.initialize();

      this.spinner.succeed(chalk.green('Framework validation system initialized'));

    } catch (error) {
      this.spinner.fail(chalk.red(`Failed to initialize: ${error.message}`));
      throw error;
    }
  }

  /**
   * Main CLI handler
   */
  async handleCommand(args) {
    await this.initialize();

    const [subcommand, ...subArgs] = args;

    switch (subcommand) {
      case 'add':
        return this.handleAdd(subArgs);
      case 'test':
        return this.handleTest(subArgs);
      case 'list':
        return this.handleList(subArgs);
      case 'remove':
        return this.handleRemove(subArgs);
      case 'export':
        return this.handleExport(subArgs);
      case 'wizard':
        return this.handleWizard(subArgs);
      case 'validate':
        return this.handleValidate(subArgs);
      default:
        return this.showHelp();
    }
  }

  /**
   * Handle: claude-flow-novice validate framework add <framework-file>
   */
  async handleAdd(args) {
    const [frameworkFile] = args;

    if (!frameworkFile) {
      console.error(chalk.red('❌ Error: Framework file path is required'));
      console.log(chalk.yellow('💡 Usage: claude-flow-novice validate framework add <framework-file>'));
      return { success: false, error: 'Missing framework file path' };
    }

    try {
      // Check if file exists
      const frameworkPath = path.resolve(frameworkFile);
      await fs.access(frameworkPath);

      // Load and parse framework definition
      const frameworkContent = await fs.readFile(frameworkPath, 'utf8');
      let frameworkDefinition;

      try {
        frameworkDefinition = JSON.parse(frameworkContent);
      } catch (parseError) {
        console.error(chalk.red('❌ Error: Invalid JSON in framework file'));
        console.error(chalk.gray(`   ${parseError.message}`));
        return { success: false, error: 'Invalid JSON format' };
      }

      // Display framework info
      this.displayFrameworkInfo(frameworkDefinition);

      // Ask for confirmation if interactive
      if (this.options.interactive) {
        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: 'Add this custom framework?',
          default: true
        }]);

        if (!confirm) {
          console.log(chalk.yellow('📋 Framework addition cancelled'));
          return { success: false, cancelled: true };
        }
      }

      // Start validation process
      const spinner = ora('Validating custom framework...').start();

      let validationResult;
      try {
        validationResult = await this.validator.validateAndAddFramework(frameworkDefinition);
      } catch (error) {
        spinner.fail(chalk.red('Framework validation failed'));
        console.error(chalk.red(`❌ Error: ${error.message}`));
        return { success: false, error: error.message };
      }

      if (validationResult.success) {
        spinner.succeed(chalk.green('✅ Framework successfully validated and added'));

        // Display success details
        this.displayValidationSuccess(validationResult);

        // Show framework usage instructions
        this.showUsageInstructions(frameworkDefinition.id);

      } else {
        spinner.fail(chalk.red('❌ Framework validation failed'));

        // Display detailed error information
        this.displayValidationErrors(validationResult);

        // Show suggestions for fixing issues
        this.showFixingSuggestions(validationResult);
      }

      return validationResult;

    } catch (error) {
      if (error.code === 'ENOENT') {
        console.error(chalk.red(`❌ Error: Framework file not found: ${frameworkFile}`));
        console.log(chalk.yellow('💡 Tip: Check the file path and ensure the file exists'));
      } else {
        console.error(chalk.red(`❌ Error: ${error.message}`));
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Handle: claude-flow-novice validate framework test <framework-id>
   */
  async handleTest(args) {
    const [frameworkId] = args;

    if (!frameworkId) {
      console.error(chalk.red('❌ Error: Framework ID is required'));
      console.log(chalk.yellow('💡 Usage: claude-flow-novice validate framework test <framework-id>'));
      return { success: false, error: 'Missing framework ID' };
    }

    const spinner = ora(`Testing framework: ${frameworkId}...`).start();

    try {
      // Create mock completion for testing
      const mockCompletion = this.createMockCompletion();

      // Test framework validation
      const testResult = await this.validator.validateCompletionWithCustomFramework(
        mockCompletion,
        frameworkId
      );

      if (testResult.success) {
        spinner.succeed(chalk.green(`✅ Framework test passed: ${frameworkId}`));

        // Display test results
        this.displayTestResults(testResult);

      } else {
        spinner.fail(chalk.red(`❌ Framework test failed: ${frameworkId}`));

        // Display test failure details
        this.displayTestFailure(testResult);
      }

      return testResult;

    } catch (error) {
      spinner.fail(chalk.red(`Framework test error: ${error.message}`));
      console.error(chalk.gray(`   ${error.stack}`));

      return { success: false, error: error.message };
    }
  }

  /**
   * Handle: claude-flow-novice validate framework list
   */
  async handleList(args) {
    const spinner = ora('Loading custom frameworks...').start();

    try {
      const frameworks = await this.getFrameworksList();

      spinner.stop();

      if (frameworks.length === 0) {
        console.log(chalk.yellow('📝 No custom frameworks found'));
        console.log(chalk.gray('   Use "claude-flow-novice validate framework add" to add frameworks'));
        return { success: true, frameworks: [] };
      }

      // Display frameworks in table format
      this.displayFrameworksTable(frameworks);

      return { success: true, frameworks };

    } catch (error) {
      spinner.fail(chalk.red(`Failed to load frameworks: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle: claude-flow-novice validate framework remove <framework-id>
   */
  async handleRemove(args) {
    const [frameworkId] = args;

    if (!frameworkId) {
      console.error(chalk.red('❌ Error: Framework ID is required'));
      console.log(chalk.yellow('💡 Usage: claude-flow-novice validate framework remove <framework-id>'));
      return { success: false, error: 'Missing framework ID' };
    }

    try {
      // Check if framework exists
      const framework = await this.getFramework(frameworkId);

      if (!framework) {
        console.error(chalk.red(`❌ Error: Framework not found: ${frameworkId}`));
        return { success: false, error: 'Framework not found' };
      }

      // Display framework info
      console.log(chalk.cyan('🗑️  Removing custom framework:'));
      this.displayFrameworkInfo(framework);

      // Ask for confirmation
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: chalk.red('Are you sure you want to remove this framework?'),
        default: false
      }]);

      if (!confirm) {
        console.log(chalk.yellow('📋 Framework removal cancelled'));
        return { success: false, cancelled: true };
      }

      const spinner = ora(`Removing framework: ${frameworkId}...`).start();

      // Remove framework
      await this.removeFramework(frameworkId);

      spinner.succeed(chalk.green(`✅ Framework removed: ${frameworkId}`));

      return { success: true, removed: frameworkId };

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle: claude-flow-novice validate framework export <framework-id>
   */
  async handleExport(args) {
    const [frameworkId, outputFile] = args;

    if (!frameworkId) {
      console.error(chalk.red('❌ Error: Framework ID is required'));
      console.log(chalk.yellow('💡 Usage: claude-flow-novice validate framework export <framework-id> [output-file]'));
      return { success: false, error: 'Missing framework ID' };
    }

    try {
      const framework = await this.getFramework(frameworkId);

      if (!framework) {
        console.error(chalk.red(`❌ Error: Framework not found: ${frameworkId}`));
        return { success: false, error: 'Framework not found' };
      }

      // Determine output file
      const exportFile = outputFile || `${frameworkId}-framework.json`;
      const exportPath = path.resolve(exportFile);

      const spinner = ora(`Exporting framework: ${frameworkId}...`).start();

      // Export framework
      await fs.writeFile(exportPath, JSON.stringify(framework, null, 2));

      spinner.succeed(chalk.green(`✅ Framework exported: ${exportPath}`));

      console.log(chalk.gray(`   Framework: ${framework.name} v${framework.version}`));
      console.log(chalk.gray(`   File size: ${this.formatFileSize(JSON.stringify(framework).length)}`));

      return { success: true, exported: exportPath, framework };

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle: claude-flow-novice validate framework wizard
   */
  async handleWizard(args) {
    console.log(chalk.cyan('🧙 Custom Framework Creation Wizard'));
    console.log(chalk.gray('Let\'s create a custom validation framework step by step\n'));

    try {
      // Step 1: Basic Information
      const basicInfo = await this.collectBasicInfo();

      // Step 2: Validation Configuration
      const validationConfig = await this.collectValidationConfig();

      // Step 3: Validation Rules
      const validationRules = await this.collectValidationRules();

      // Step 4: Quality Gates
      const qualityGates = await this.collectQualityGates();

      // Step 5: Advanced Options
      const advancedOptions = await this.collectAdvancedOptions();

      // Build framework definition
      const frameworkDefinition = {
        ...basicInfo,
        validation_config: validationConfig,
        validation_rules: validationRules,
        quality_gates: qualityGates,
        ...advancedOptions,
        metadata: {
          created_at: new Date().toISOString(),
          author: 'wizard',
          generator: 'claude-flow-novice-wizard'
        }
      };

      // Display preview
      console.log(chalk.cyan('\n📋 Framework Preview:'));
      this.displayFrameworkInfo(frameworkDefinition);

      // Ask for confirmation
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Create this framework?',
        default: true
      }]);

      if (!confirm) {
        console.log(chalk.yellow('📋 Framework creation cancelled'));
        return { success: false, cancelled: true };
      }

      // Save framework
      const { saveToFile } = await inquirer.prompt([{
        type: 'confirm',
        name: 'saveToFile',
        message: 'Save framework definition to file?',
        default: true
      }]);

      if (saveToFile) {
        const frameworkFile = `${frameworkDefinition.id}-framework.json`;
        await fs.writeFile(frameworkFile, JSON.stringify(frameworkDefinition, null, 2));
        console.log(chalk.green(`✅ Framework saved to: ${frameworkFile}`));
      }

      // Add to system
      const validationResult = await this.validator.validateAndAddFramework(frameworkDefinition);

      if (validationResult.success) {
        console.log(chalk.green('✅ Framework successfully created and added'));
        this.showUsageInstructions(frameworkDefinition.id);
      } else {
        console.log(chalk.red('❌ Framework creation failed during validation'));
        this.displayValidationErrors(validationResult);
      }

      return validationResult;

    } catch (error) {
      console.error(chalk.red(`❌ Wizard error: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle: claude-flow-novice validate framework validate <completion-file> <framework-id>
   */
  async handleValidate(args) {
    const [completionFile, frameworkId] = args;

    if (!completionFile || !frameworkId) {
      console.error(chalk.red('❌ Error: Both completion file and framework ID are required'));
      console.log(chalk.yellow('💡 Usage: claude-flow-novice validate framework validate <completion-file> <framework-id>'));
      return { success: false, error: 'Missing required arguments' };
    }

    try {
      // Load completion
      const completionPath = path.resolve(completionFile);
      const completionContent = await fs.readFile(completionPath, 'utf8');
      const completion = JSON.parse(completionContent);

      const spinner = ora(`Validating completion with framework: ${frameworkId}...`).start();

      // Validate completion
      const validationResult = await this.validator.validateCompletionWithCustomFramework(
        completion,
        frameworkId
      );

      if (validationResult.success) {
        spinner.succeed(chalk.green('✅ Completion validation passed'));

        // Display validation details
        this.displayValidationDetails(validationResult);

      } else {
        spinner.fail(chalk.red('❌ Completion validation failed'));

        // Display failure details
        this.displayValidationFailure(validationResult);
      }

      return validationResult;

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  // Display and helper methods

  displayFrameworkInfo(framework) {
    console.log(chalk.cyan('\n📋 Framework Information:'));
    console.log(`   ${chalk.bold('ID:')} ${framework.id}`);
    console.log(`   ${chalk.bold('Name:')} ${framework.name}`);
    console.log(`   ${chalk.bold('Version:')} ${framework.version}`);

    if (framework.description) {
      console.log(`   ${chalk.bold('Description:')} ${framework.description}`);
    }

    if (framework.validation_config) {
      console.log(`   ${chalk.bold('Truth Threshold:')} ${framework.validation_config.truth_threshold}`);
    }

    if (framework.validation_rules) {
      console.log(`   ${chalk.bold('Validation Rules:')} ${framework.validation_rules.length}`);
    }

    if (framework.quality_gates) {
      console.log(`   ${chalk.bold('Quality Gates:')} ${framework.quality_gates.length}`);
    }

    if (framework.extends) {
      console.log(`   ${chalk.bold('Extends:')} ${framework.extends}`);
    }

    if (framework.composes) {
      console.log(`   ${chalk.bold('Composes:')} ${framework.composes.join(', ')}`);
    }

    console.log();
  }

  displayValidationSuccess(result) {
    console.log(chalk.green('\n🎉 Validation Results:'));
    console.log(`   ${chalk.bold('Framework ID:')} ${result.frameworkId}`);
    console.log(`   ${chalk.bold('Validation Time:')} ${(result.performance?.totalTime || 0).toFixed(2)}ms`);

    if (result.validationResults) {
      console.log(`   ${chalk.bold('Schema Valid:')} ${result.validationResults.schema?.valid ? '✅' : '❌'}`);
      console.log(`   ${chalk.bold('Security Check:')} ${result.validationResults.security?.secure ? '✅' : '❌'}`);
      console.log(`   ${chalk.bold('Byzantine Approved:')} ${result.validationResults.byzantine?.approved ? '✅' : '❌'}`);
    }

    console.log();
  }

  displayValidationErrors(result) {
    console.log(chalk.red('\n❌ Validation Errors:'));

    if (result.errors) {
      result.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.message || error}`);
        if (error.path) {
          console.log(chalk.gray(`      Path: ${error.path}`));
        }
      });
    }

    if (result.securityViolations) {
      console.log(chalk.red('\n🔒 Security Violations:'));
      result.securityViolations.forEach((violation, index) => {
        console.log(`   ${index + 1}. [${violation.severity.toUpperCase()}] ${violation.message}`);
      });
    }

    if (result.byzantineRejected && result.consensus) {
      console.log(chalk.red('\n🏛️ Byzantine Consensus Rejection:'));
      console.log(`   Consensus Ratio: ${(result.consensus.consensusRatio * 100).toFixed(1)}%`);
      console.log(`   Security Concerns: ${result.consensus.securityConcerns || 0}`);
    }

    console.log();
  }

  showFixingSuggestions(result) {
    console.log(chalk.yellow('💡 Fixing Suggestions:'));

    if (result.errors) {
      result.errors.forEach(error => {
        if (error.type === 'missing_required_field') {
          console.log(`   • Add the required field: ${error.field}`);
        } else if (error.type === 'invalid_id_format') {
          console.log(`   • Framework ID must contain only lowercase letters, numbers, hyphens, and underscores`);
        } else if (error.type === 'truth_threshold_out_of_range') {
          console.log(`   • Set truth_threshold between 0.01 and 0.99`);
        }
      });
    }

    if (result.securityViolations) {
      console.log(`   • Review and remove security violations in validation rules`);
      console.log(`   • Avoid using eval(), Function(), require(), or file system access`);
      console.log(`   • Use safe validation patterns and built-in validators`);
    }

    console.log();
  }

  showUsageInstructions(frameworkId) {
    console.log(chalk.cyan('🚀 Usage Instructions:'));
    console.log(`   Test framework:`);
    console.log(chalk.gray(`     claude-flow-novice validate framework test ${frameworkId}`));
    console.log(`   Validate completion:`);
    console.log(chalk.gray(`     claude-flow-novice validate framework validate completion.json ${frameworkId}`));
    console.log(`   Export framework:`);
    console.log(chalk.gray(`     claude-flow-novice validate framework export ${frameworkId}`));
    console.log();
  }

  displayTestResults(result) {
    console.log(chalk.green('\n📊 Test Results:'));
    console.log(`   ${chalk.bold('Framework:')} ${result.frameworkUsed} v${result.frameworkVersion || '?'}`);
    console.log(`   ${chalk.bold('Truth Score:')} ${(result.truthScore * 100).toFixed(1)}%`);
    console.log(`   ${chalk.bold('Threshold:')} ${(result.frameworkTruthThreshold * 100).toFixed(1)}%`);

    if (result.frameworkValidation) {
      console.log(`   ${chalk.bold('Rules Passed:')} ${result.frameworkValidation.rulesPassed}/${result.frameworkValidation.rulesExecuted}`);
    }

    if (result.qualityGates) {
      console.log(`   ${chalk.bold('Quality Gates:')} ${result.qualityGates.gatesPassed}/${result.qualityGates.gatesApplied}`);
    }

    console.log();
  }

  displayTestFailure(result) {
    console.log(chalk.red('\n❌ Test Failure Details:'));
    console.log(`   ${chalk.bold('Framework:')} ${result.frameworkUsed}`);

    if (result.error) {
      console.log(`   ${chalk.bold('Error:')} ${result.error}`);
    }

    if (result.truthScore !== undefined) {
      console.log(`   ${chalk.bold('Truth Score:')} ${(result.truthScore * 100).toFixed(1)}% (Required: ${(result.frameworkTruthThreshold * 100).toFixed(1)}%)`);
    }

    console.log();
  }

  displayFrameworksTable(frameworks) {
    console.log(chalk.cyan('\n📚 Custom Frameworks:\n'));

    const tableData = [
      ['ID', 'Name', 'Version', 'Rules', 'Gates', 'Threshold', 'Status']
    ];

    frameworks.forEach(framework => {
      tableData.push([
        framework.id,
        framework.name || 'N/A',
        framework.version || 'N/A',
        framework.validation_rules?.length || 0,
        framework.quality_gates?.length || 0,
        `${((framework.validation_config?.truth_threshold || 0) * 100).toFixed(0)}%`,
        framework.metadata?.validated ? '✅' : '❓'
      ]);
    });

    console.log(table(tableData, {
      border: {
        topBody: `─`,
        topJoin: `┬`,
        topLeft: `┌`,
        topRight: `┐`,
        bottomBody: `─`,
        bottomJoin: `┴`,
        bottomLeft: `└`,
        bottomRight: `┘`,
        bodyLeft: `│`,
        bodyRight: `│`,
        bodyJoin: `│`,
        joinBody: `─`,
        joinLeft: `├`,
        joinRight: `┤`,
        joinJoin: `┼`
      }
    }));
  }

  displayValidationDetails(result) {
    console.log(chalk.green('\n📊 Validation Details:'));
    console.log(`   ${chalk.bold('Truth Score:')} ${(result.truthScore * 100).toFixed(1)}%`);

    if (result.truthScoreComponents) {
      console.log(`   ${chalk.bold('Components:')}`);
      Object.entries(result.truthScoreComponents).forEach(([component, score]) => {
        if (component !== 'overall') {
          console.log(`     ${component}: ${(score * 100).toFixed(1)}%`);
        }
      });
    }

    console.log();
  }

  displayValidationFailure(result) {
    console.log(chalk.red('\n❌ Validation Failure:'));
    console.log(`   ${chalk.bold('Framework:')} ${result.frameworkUsed}`);

    if (result.truthScore !== undefined) {
      console.log(`   ${chalk.bold('Truth Score:')} ${(result.truthScore * 100).toFixed(1)}%`);
      console.log(`   ${chalk.bold('Required:')} ${(result.frameworkTruthThreshold * 100).toFixed(1)}%`);
    }

    if (result.error) {
      console.log(`   ${chalk.bold('Error:')} ${result.error}`);
    }

    console.log();
  }

  async collectBasicInfo() {
    return inquirer.prompt([
      {
        type: 'input',
        name: 'id',
        message: 'Framework ID (lowercase, letters, numbers, hyphens, underscores):',
        validate: (input) => {
          if (!input) return 'Framework ID is required';
          if (!/^[a-z0-9-_]+$/.test(input)) return 'Invalid ID format';
          return true;
        }
      },
      {
        type: 'input',
        name: 'name',
        message: 'Framework name:',
        validate: (input) => input ? true : 'Framework name is required'
      },
      {
        type: 'input',
        name: 'version',
        message: 'Version (semver format):',
        default: '1.0.0',
        validate: (input) => {
          if (!/^\d+\.\d+\.\d+/.test(input)) return 'Use semantic versioning (e.g., 1.0.0)';
          return true;
        }
      },
      {
        type: 'input',
        name: 'description',
        message: 'Framework description (optional):'
      }
    ]);
  }

  async collectValidationConfig() {
    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'truth_threshold',
        message: 'Truth score threshold (0.01-0.99):',
        default: 0.85,
        validate: (input) => {
          if (input < 0.01 || input > 0.99) return 'Threshold must be between 0.01 and 0.99';
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'customize_weights',
        message: 'Customize truth component weights?',
        default: false
      }
    ]);

    const config = { truth_threshold: answers.truth_threshold };

    if (answers.customize_weights) {
      const weights = await inquirer.prompt([
        {
          type: 'number',
          name: 'agent_reliability',
          message: 'Agent reliability weight (0-1):',
          default: 0.3,
          validate: (input) => input >= 0 && input <= 1 ? true : 'Weight must be between 0 and 1'
        },
        {
          type: 'number',
          name: 'cross_validation',
          message: 'Cross validation weight (0-1):',
          default: 0.25
        },
        {
          type: 'number',
          name: 'external_verification',
          message: 'External verification weight (0-1):',
          default: 0.2
        },
        {
          type: 'number',
          name: 'factual_consistency',
          message: 'Factual consistency weight (0-1):',
          default: 0.15
        },
        {
          type: 'number',
          name: 'logical_coherence',
          message: 'Logical coherence weight (0-1):',
          default: 0.1
        }
      ]);

      config.truth_component_weights = weights;
    }

    return config;
  }

  async collectValidationRules() {
    const rules = [];
    let addMore = true;

    while (addMore && rules.length < 10) {
      const rule = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: `Validation rule ${rules.length + 1} name:`,
          validate: (input) => input ? true : 'Rule name is required'
        },
        {
          type: 'list',
          name: 'type',
          message: 'Rule type:',
          choices: [
            { name: 'Threshold check', value: 'threshold' },
            { name: 'Value exists', value: 'exists' },
            { name: 'Range check', value: 'range' },
            { name: 'Custom expression', value: 'custom' }
          ]
        }
      ]);

      // Collect type-specific configuration
      const typeConfig = await this.collectRuleTypeConfig(rule.type);

      rules.push({
        name: rule.name,
        validator: {
          type: rule.type,
          config: typeConfig
        }
      });

      if (rules.length < 10) {
        const { continueAdding } = await inquirer.prompt([{
          type: 'confirm',
          name: 'continueAdding',
          message: 'Add another validation rule?',
          default: false
        }]);
        addMore = continueAdding;
      }
    }

    return rules;
  }

  async collectRuleTypeConfig(type) {
    switch (type) {
      case 'threshold':
        return inquirer.prompt([
          {
            type: 'input',
            name: 'field',
            message: 'Field to check (e.g., completion.accuracy):',
            validate: (input) => input ? true : 'Field is required'
          },
          {
            type: 'number',
            name: 'threshold',
            message: 'Threshold value:',
            validate: (input) => typeof input === 'number' ? true : 'Must be a number'
          },
          {
            type: 'list',
            name: 'operator',
            message: 'Comparison operator:',
            choices: ['>=', '>', '<=', '<', '=='],
            default: '>='
          }
        ]);

      case 'exists':
        return inquirer.prompt([
          {
            type: 'input',
            name: 'field',
            message: 'Field that must exist:',
            validate: (input) => input ? true : 'Field is required'
          }
        ]);

      case 'range':
        return inquirer.prompt([
          {
            type: 'input',
            name: 'field',
            message: 'Field to check:',
            validate: (input) => input ? true : 'Field is required'
          },
          {
            type: 'number',
            name: 'min',
            message: 'Minimum value:'
          },
          {
            type: 'number',
            name: 'max',
            message: 'Maximum value:'
          }
        ]);

      case 'custom':
        return inquirer.prompt([
          {
            type: 'input',
            name: 'expression',
            message: 'Custom validation expression (safe only):',
            validate: (input) => {
              if (!input) return 'Expression is required';
              if (input.includes('eval') || input.includes('Function')) {
                return 'Unsafe expressions not allowed';
              }
              return true;
            }
          }
        ]);

      default:
        return {};
    }
  }

  async collectQualityGates() {
    const gates = [];
    let addMore = true;

    while (addMore && gates.length < 5) {
      const gate = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: `Quality gate ${gates.length + 1} name:`,
          validate: (input) => input ? true : 'Gate name is required'
        },
        {
          type: 'list',
          name: 'metric',
          message: 'Metric to check:',
          choices: [
            'truth_score',
            'execution_time',
            'memory_usage',
            'error_rate',
            'test_coverage',
            'code_quality',
            'security_score'
          ]
        },
        {
          type: 'number',
          name: 'threshold',
          message: 'Threshold value:',
          validate: (input) => typeof input === 'number' ? true : 'Must be a number'
        }
      ]);

      gates.push(gate);

      if (gates.length < 5) {
        const { continueAdding } = await inquirer.prompt([{
          type: 'confirm',
          name: 'continueAdding',
          message: 'Add another quality gate?',
          default: false
        }]);
        addMore = continueAdding;
      }
    }

    return gates;
  }

  async collectAdvancedOptions() {
    return inquirer.prompt([
      {
        type: 'confirm',
        name: 'inheritable',
        message: 'Allow other frameworks to extend this framework?',
        default: true
      },
      {
        type: 'confirm',
        name: 'composable',
        message: 'Allow this framework to be used in composition?',
        default: true
      }
    ]);
  }

  createMockCompletion() {
    return {
      title: 'Test Completion',
      description: 'Mock completion for framework testing',
      accuracy: 0.9,
      execution_time: 1500,
      memory_usage: 256000,
      test_coverage: 0.85,
      code_quality_score: 8.5,
      security_score: 0.95,
      evidence: ['test_evidence'],
      confidence: 0.8
    };
  }

  async getFrameworksList() {
    // In production, this would query the framework registry
    try {
      const frameworksPath = path.join(process.cwd(), '.claude-flow-novice', 'frameworks');
      const files = await fs.readdir(frameworksPath);
      const frameworks = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const frameworkPath = path.join(frameworksPath, file);
          const content = await fs.readFile(frameworkPath, 'utf8');
          frameworks.push(JSON.parse(content));
        }
      }

      return frameworks;
    } catch (error) {
      return [];
    }
  }

  async getFramework(frameworkId) {
    // In production, this would query the framework registry
    try {
      const frameworkPath = path.join(process.cwd(), '.claude-flow-novice', 'frameworks', `${frameworkId}.json`);
      const content = await fs.readFile(frameworkPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  async removeFramework(frameworkId) {
    // In production, this would use the framework registry
    const frameworkPath = path.join(process.cwd(), '.claude-flow-novice', 'frameworks', `${frameworkId}.json`);
    await fs.unlink(frameworkPath);
  }

  formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  showHelp() {
    console.log(chalk.cyan('\n🔍 Framework Validation Commands:\n'));

    const commands = [
      ['add <file>', 'Add and validate a custom framework'],
      ['test <id>', 'Test a framework with mock completion'],
      ['list', 'List all custom frameworks'],
      ['remove <id>', 'Remove a custom framework'],
      ['export <id> [file]', 'Export framework to file'],
      ['wizard', 'Interactive framework creation wizard'],
      ['validate <completion> <id>', 'Validate completion with framework']
    ];

    commands.forEach(([cmd, desc]) => {
      console.log(`  ${chalk.yellow('claude-flow-novice validate framework ' + cmd)}  ${desc}`);
    });

    console.log(chalk.gray('\nExamples:'));
    console.log(chalk.gray('  claude-flow-novice validate framework add my-framework.json'));
    console.log(chalk.gray('  claude-flow-novice validate framework wizard'));
    console.log(chalk.gray('  claude-flow-novice validate framework test my-custom-framework'));
    console.log();

    return { success: true, help: true };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.validator) {
      await this.validator.shutdown();
    }

    if (this.spinner && this.spinner.isSpinning) {
      this.spinner.stop();
    }
  }
}

/**
 * Main CLI handler function
 */
export async function handleFrameworkValidationCommand(args, options = {}) {
  const cli = new FrameworkValidationCLI(options);

  try {
    const result = await cli.handleCommand(args);
    return result;
  } finally {
    await cli.cleanup();
  }
}

// Export default handler
export default handleFrameworkValidationCommand;