// preferences.js - CLI integration for preference management
import chalk from 'chalk';
import ora from 'ora';
import PreferenceWizard from '../preferences/preference-wizard.js';
import PreferenceManager from '../preferences/preference-manager.js';

/**
 * Handle preference commands
 */
export async function preferencesCommand(args, flags) {
  const subCommand = args[0];

  if (!subCommand || subCommand === 'help') {
    showPreferencesHelp();
    return;
  }

  const manager = new PreferenceManager();

  try {
    switch (subCommand) {
      case 'setup':
        return await runSetupWizard(flags);

      case 'show':
        return await showPreferences(manager, args[1], flags);

      case 'set':
        return await setPreference(manager, args[1], args[2], flags);

      case 'get':
        return await getPreference(manager, args[1], flags);

      case 'reset':
        return await resetPreferences(manager, flags);

      case 'validate':
        return await validatePreferences(manager, flags);

      case 'export':
        return await exportPreferences(manager, args[1], flags);

      case 'import':
        return await importPreferences(manager, args[1], flags);

      case 'suggest':
        return await suggestPreferences(manager, flags);

      case 'list':
        return await listPreferenceKeys(manager, flags);

      default:
        console.error(chalk.red(`Unknown preference command: ${subCommand}`));
        console.log('\nUse "claude-flow-novice preferences help" for available commands');
        process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (flags.verbose) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

/**
 * Run the setup wizard
 */
async function runSetupWizard(flags) {
  console.log(chalk.blue.bold('🧙‍♂️ Claude Flow Novice - Preference Setup Wizard'));

  if (flags.force) {
    console.log(chalk.yellow('⚠️  Force mode: Existing preferences will be overwritten'));
  }

  const wizard = new PreferenceWizard();

  try {
    const preferences = await wizard.run({
      force: flags.force,
      verbose: flags.verbose,
    });

    console.log(chalk.green('\n✅ Setup completed successfully!'));

    if (flags.verbose) {
      console.log(chalk.gray('\nCreated preferences:'));
      console.log(JSON.stringify(preferences, null, 2));
    }

    console.log(chalk.blue('\nNext steps:'));
    console.log('  • Run: claude-flow-novice preferences show');
    console.log('  • Try: claude-flow-novice agent spawn researcher');
    console.log('  • Update: claude-flow-novice preferences set <key> <value>');
  } catch (error) {
    console.error(chalk.red('❌ Setup failed:'), error.message);
    if (flags.verbose) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

/**
 * Show current preferences
 */
async function showPreferences(manager, scope, flags) {
  const spinner = ora('Loading preferences...').start();

  try {
    const preferences =
      scope && scope !== 'all' ? await manager.list(scope) : await manager.loadPreferences();

    spinner.succeed('Preferences loaded');

    if (flags.json) {
      console.log(JSON.stringify(preferences, null, 2));
      return;
    }

    console.log(chalk.blue.bold('\n📋 Current Preferences'));

    if (scope) {
      console.log(chalk.gray(`Scope: ${scope}`));
    }

    displayPreferencesTree(preferences);

    // Show metadata if available
    if (preferences.meta) {
      console.log(chalk.blue('\n🔍 Metadata'));
      console.log(`  Version: ${preferences.meta.version || 'unknown'}`);
      console.log(`  Created: ${preferences.meta.createdAt || 'unknown'}`);
      console.log(`  Updated: ${preferences.meta.updatedAt || 'unknown'}`);

      if (preferences.meta.wizard) {
        console.log(`  Source: Setup wizard`);
      }
    }
  } catch (error) {
    spinner.fail('Failed to load preferences');
    throw error;
  }
}

/**
 * Set a preference value
 */
async function setPreference(manager, key, value, flags) {
  if (!key || value === undefined) {
    console.error(chalk.red('Usage: claude-flow-novice preferences set <key> <value>'));
    console.log('\nExample: claude-flow-novice preferences set documentation.verbosity detailed');
    process.exit(1);
  }

  const spinner = ora(`Setting ${key} = ${value}...`).start();

  try {
    // Parse value if it looks like JSON
    let parsedValue = value;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (!isNaN(value)) parsedValue = parseInt(value);
    else if (value.startsWith('[') || value.startsWith('{')) {
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Keep as string if JSON parsing fails
      }
    }

    const scope = flags.global ? 'global' : 'project';
    await manager.set(key, parsedValue, scope);

    spinner.succeed(`Preference updated: ${key} = ${parsedValue}`);

    if (scope === 'global') {
      console.log(chalk.gray('Applied to global preferences (affects all projects)'));
    } else {
      console.log(chalk.gray('Applied to project preferences'));
    }
  } catch (error) {
    spinner.fail(`Failed to set preference: ${error.message}`);
    throw error;
  }
}

/**
 * Get a specific preference value
 */
async function getPreference(manager, key, flags) {
  if (!key) {
    console.error(chalk.red('Usage: claude-flow-novice preferences get <key>'));
    console.log('\nExample: claude-flow-novice preferences get documentation.verbosity');
    process.exit(1);
  }

  const spinner = ora(`Getting ${key}...`).start();

  try {
    const value = await manager.get(key);
    spinner.succeed(`Found preference: ${key}`);

    if (flags.json) {
      console.log(JSON.stringify({ [key]: value }, null, 2));
    } else {
      console.log(`${chalk.blue(key)}: ${chalk.green(JSON.stringify(value))}`);
    }
  } catch (error) {
    spinner.fail(`Failed to get preference: ${error.message}`);
    throw error;
  }
}

/**
 * Reset preferences
 */
async function resetPreferences(manager, flags) {
  if (!flags.force) {
    const inquirer = await import('inquirer');
    const { confirm } = await inquirer.default.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to reset all preferences to defaults?',
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow('Reset cancelled'));
      return;
    }
  }

  const scope = flags.global ? 'global' : 'project';
  const spinner = ora(`Resetting ${scope} preferences...`).start();

  try {
    await manager.reset(scope);
    spinner.succeed(`${scope === 'global' ? 'Global' : 'Project'} preferences reset to defaults`);

    console.log(chalk.blue('\nTo reconfigure, run: claude-flow-novice preferences setup'));
  } catch (error) {
    spinner.fail(`Failed to reset preferences: ${error.message}`);
    throw error;
  }
}

/**
 * Validate preferences
 */
async function validatePreferences(manager, flags) {
  const spinner = ora('Validating preferences...').start();

  try {
    const result = await manager.validate();

    if (result.valid) {
      spinner.succeed('Preferences are valid');
      console.log(chalk.green('✅ All preferences are valid'));
    } else {
      spinner.warn('Preference validation issues found');
      console.log(chalk.yellow('⚠️  Validation issues:'));
      result.errors.forEach((error) => {
        console.log(chalk.red(`  • ${error}`));
      });
    }

    if (flags.verbose) {
      console.log(chalk.gray('\nValidated preferences:'));
      console.log(JSON.stringify(result.preferences, null, 2));
    }
  } catch (error) {
    spinner.fail(`Validation failed: ${error.message}`);
    throw error;
  }
}

/**
 * Export preferences
 */
async function exportPreferences(manager, filePath, flags) {
  if (!filePath) {
    filePath = `preferences-${new Date().toISOString().split('T')[0]}.json`;
  }

  const spinner = ora(`Exporting preferences to ${filePath}...`).start();

  try {
    const scope = flags.global ? 'global' : flags.project ? 'project' : 'all';
    const exportedPath = await manager.export(filePath, scope);

    spinner.succeed(`Preferences exported to ${exportedPath}`);
    console.log(chalk.gray(`Scope: ${scope}`));
  } catch (error) {
    spinner.fail(`Export failed: ${error.message}`);
    throw error;
  }
}

/**
 * Import preferences
 */
async function importPreferences(manager, filePath, flags) {
  if (!filePath) {
    console.error(chalk.red('Usage: claude-flow-novice preferences import <file-path>'));
    process.exit(1);
  }

  const spinner = ora(`Importing preferences from ${filePath}...`).start();

  try {
    const scope = flags.global ? 'global' : 'project';
    await manager.import(filePath, scope);

    spinner.succeed(`Preferences imported from ${filePath}`);
    console.log(chalk.gray(`Applied to ${scope} scope`));
  } catch (error) {
    spinner.fail(`Import failed: ${error.message}`);
    throw error;
  }
}

/**
 * Suggest preference improvements
 */
async function suggestPreferences(manager, flags) {
  const spinner = ora('Analyzing preferences for suggestions...').start();

  try {
    const suggestions = await manager.generateSuggestions();

    spinner.succeed('Preference analysis complete');

    if (suggestions.length === 0) {
      console.log(chalk.green('✅ Your preferences look good! No suggestions at this time.'));
      return;
    }

    console.log(chalk.blue.bold('\n💡 Preference Suggestions'));

    suggestions.forEach((suggestion, index) => {
      const impactColor =
        suggestion.impact === 'high' ? 'red' : suggestion.impact === 'medium' ? 'yellow' : 'gray';
      console.log(`\n${index + 1}. ${chalk.blue(suggestion.key)}`);
      console.log(`   ${suggestion.reason}`);
      console.log(`   Suggested value: ${chalk.green(JSON.stringify(suggestion.value))}`);
      console.log(`   Impact: ${chalk[impactColor](suggestion.impact)}`);
    });

    console.log(chalk.gray('\nTo apply suggestions:'));
    suggestions.forEach((suggestion) => {
      console.log(
        chalk.gray(
          `  claude-flow-novice preferences set ${suggestion.key} ${JSON.stringify(suggestion.value)}`,
        ),
      );
    });
  } catch (error) {
    spinner.fail(`Analysis failed: ${error.message}`);
    throw error;
  }
}

/**
 * List all available preference keys
 */
async function listPreferenceKeys(manager, flags) {
  const spinner = ora('Loading preference schema...').start();

  try {
    const schema = manager.schema.getValidationSchema();
    const currentPrefs = await manager.loadPreferences();

    spinner.succeed('Preference keys loaded');

    console.log(chalk.blue.bold('\n📚 Available Preference Keys'));

    displaySchemaKeys('', schema, currentPrefs);
  } catch (error) {
    spinner.fail(`Failed to load preference keys: ${error.message}`);
    throw error;
  }
}

/**
 * Display preferences in a tree format
 */
function displayPreferencesTree(preferences, prefix = '') {
  for (const [key, value] of Object.entries(preferences)) {
    if (key === 'meta') continue; // Skip metadata

    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      console.log(`${chalk.blue.bold(fullKey)}:`);
      displayPreferencesTree(value, fullKey);
    } else {
      const displayValue = Array.isArray(value) ? `[${value.join(', ')}]` : JSON.stringify(value);
      console.log(`  ${chalk.cyan(fullKey)}: ${chalk.green(displayValue)}`);
    }
  }
}

/**
 * Display schema keys with current values
 */
function displaySchemaKeys(prefix, schema, currentPrefs, level = 0) {
  const indent = '  '.repeat(level);

  for (const [key, spec] of Object.entries(schema)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const currentValue = getNestedValue(currentPrefs, fullKey);

    if (spec.type === 'object' || (spec.properties && typeof spec.properties === 'object')) {
      console.log(`${indent}${chalk.blue.bold(fullKey)}/`);
      displaySchemaKeys(fullKey, spec.properties || spec, currentPrefs, level + 1);
    } else {
      let typeInfo = spec.type || 'any';
      if (spec.values) {
        typeInfo += ` (${spec.values.join('|')})`;
      } else if (spec.min !== undefined || spec.max !== undefined) {
        typeInfo += ` [${spec.min || 0}..${spec.max || '∞'}]`;
      }

      const currentDisplay =
        currentValue !== undefined ? chalk.green(` = ${JSON.stringify(currentValue)}`) : '';

      console.log(
        `${indent}${chalk.cyan(fullKey)} ${chalk.gray(`(${typeInfo})`)}${currentDisplay}`,
      );
    }
  }
}

/**
 * Helper: Get nested value using dot notation
 */
function getNestedValue(obj, key) {
  return key.split('.').reduce((current, prop) => current?.[prop], obj);
}

/**
 * Show preferences help
 */
function showPreferencesHelp() {
  console.log(chalk.blue.bold('Claude Flow Novice - Preferences Management\n'));

  console.log(chalk.yellow.bold('COMMANDS:'));
  console.log('  setup                    Run interactive preference wizard');
  console.log('  show [scope]             Display current preferences');
  console.log('  set <key> <value>        Set a preference value');
  console.log('  get <key>                Get a preference value');
  console.log('  reset [scope]            Reset preferences to defaults');
  console.log('  validate                 Validate current preferences');
  console.log('  export [file]            Export preferences to file');
  console.log('  import <file>            Import preferences from file');
  console.log('  suggest                  Get preference improvement suggestions');
  console.log('  list                     List all available preference keys');
  console.log('  help                     Show this help\n');

  console.log(chalk.yellow.bold('OPTIONS:'));
  console.log('  --global                 Apply to global preferences (all projects)');
  console.log('  --project                Apply to project preferences (default)');
  console.log('  --force                  Skip confirmations');
  console.log('  --json                   Output in JSON format');
  console.log('  --verbose                Show detailed output\n');

  console.log(chalk.yellow.bold('EXAMPLES:'));
  console.log('  claude-flow-novice preferences setup');
  console.log('  claude-flow-novice preferences show');
  console.log('  claude-flow-novice preferences set documentation.verbosity detailed');
  console.log('  claude-flow-novice preferences set workflow.concurrency 4');
  console.log('  claude-flow-novice preferences get feedback.tone');
  console.log('  claude-flow-novice preferences suggest');
  console.log('  claude-flow-novice preferences export my-settings.json');
  console.log('  claude-flow-novice preferences reset --force\n');

  console.log(chalk.yellow.bold('PREFERENCE CATEGORIES:'));
  console.log('  experience.*             User experience level and background');
  console.log('  documentation.*          Documentation verbosity and style');
  console.log('  feedback.*               Communication tone and error handling');
  console.log('  workflow.*               Agent coordination and automation');
  console.log('  advanced.*               Advanced features and integrations');
  console.log('  project.*                Project-specific detected settings\n');
}

export default preferencesCommand;
