#!/usr/bin/env node
// demo-preferences.js - Demonstration of preference wizard functionality
import chalk from 'chalk';
import PreferenceWizard from './preference-wizard.js';
import PreferenceManager from './preference-manager.js';

async function demonstratePreferenceSystem() {
  console.log(chalk.blue.bold('🎬 Claude Flow Novice - Preference System Demo\n'));

  try {
    // Demo 1: Preference Manager Default Loading
    console.log(chalk.yellow('📋 Demo 1: Loading Default Preferences'));
    const manager = new PreferenceManager();
    const defaults = await manager.loadPreferences();
    console.log(chalk.green('✅ Default preferences loaded:'));
    console.log(chalk.gray(JSON.stringify(defaults.experience, null, 2)));
    console.log(chalk.gray(JSON.stringify(defaults.workflow, null, 2)));

    // Demo 2: Setting and Getting Preferences
    console.log(chalk.yellow('\n🔧 Demo 2: Setting and Getting Preferences'));
    await manager.set('documentation.verbosity', 'detailed', 'project');
    await manager.set('workflow.concurrency', 4, 'project');

    const verbosity = await manager.get('documentation.verbosity');
    const concurrency = await manager.get('workflow.concurrency');

    console.log(chalk.green(`✅ Verbosity set to: ${verbosity}`));
    console.log(chalk.green(`✅ Concurrency set to: ${concurrency}`));

    // Demo 3: Preference Validation
    console.log(chalk.yellow('\n🔍 Demo 3: Preference Validation'));
    const validation = await manager.validate();
    console.log(chalk.green(`✅ Preferences valid: ${validation.valid}`));
    if (validation.errors.length > 0) {
      console.log(chalk.red('❌ Validation errors:'));
      validation.errors.forEach((error) => console.log(chalk.red(`  • ${error}`)));
    }

    // Demo 4: Contextual Preferences
    console.log(chalk.yellow('\n🎯 Demo 4: Contextual Preference Adaptation'));
    const contextualPrefs = await manager.getContextualPreferences({
      taskComplexity: 'simple',
      systemResources: 'limited',
    });
    console.log(chalk.green('✅ Contextual preferences adapted:'));
    console.log(
      chalk.gray(`  • Documentation verbosity: ${contextualPrefs.documentation.verbosity}`),
    );
    console.log(chalk.gray(`  • Workflow concurrency: ${contextualPrefs.workflow.concurrency}`));

    // Demo 5: Preference Suggestions
    console.log(chalk.yellow('\n💡 Demo 5: Preference Suggestions'));
    const suggestions = await manager.generateSuggestions();
    console.log(chalk.green(`✅ Generated ${suggestions.length} suggestions:`));
    suggestions.slice(0, 3).forEach((suggestion, index) => {
      console.log(
        chalk.blue(`  ${index + 1}. ${suggestion.key}: ${JSON.stringify(suggestion.value)}`),
      );
      console.log(chalk.gray(`     Reason: ${suggestion.reason}`));
    });

    // Demo 6: Project Detection
    console.log(chalk.yellow('\n🔍 Demo 6: Project Detection'));
    const wizard = new PreferenceWizard();
    const projectInfo = await wizard.projectDetection.analyze();
    console.log(chalk.green('✅ Project detected:'));
    console.log(chalk.gray(`  • Language: ${projectInfo.language}`));
    console.log(chalk.gray(`  • Frameworks: ${projectInfo.frameworks.join(', ') || 'None'}`));
    console.log(chalk.gray(`  • Build tool: ${projectInfo.buildTool || 'None'}`));

    // Demo 7: Export/Import Demo Data
    console.log(chalk.yellow('\n📤 Demo 7: Export/Import Functionality'));
    const tempFile = '/tmp/demo-preferences.json';
    await manager.export(tempFile, 'all');
    console.log(chalk.green(`✅ Preferences exported to ${tempFile}`));

    // Demo 8: Schema Information
    console.log(chalk.yellow('\n📚 Demo 8: Preference Schema'));
    const schema = manager.schema.getValidationSchema();
    const keyCount = Object.keys(schema).length;
    console.log(chalk.green(`✅ Schema contains ${keyCount} main categories:`));
    Object.keys(schema).forEach((key) => {
      console.log(chalk.gray(`  • ${key}.*`));
    });

    console.log(chalk.green.bold('\n🎉 All preference system demos completed successfully!'));
    console.log(chalk.blue('\nTo try the interactive wizard, run:'));
    console.log(chalk.white('  claude-flow-novice preferences setup'));
  } catch (error) {
    console.error(chalk.red('❌ Demo failed:'), error.message);
    if (process.env.DEBUG) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstratePreferenceSystem().catch((error) => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export default demonstratePreferenceSystem;
