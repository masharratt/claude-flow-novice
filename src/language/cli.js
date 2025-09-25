#!/usr/bin/env node

import { program } from 'commander';
import { LanguageDetector } from './language-detector.js';
import { ClaudeMdGenerator } from './claude-md-generator.js';
import { IntegrationSystem } from './integration-system.js';
import path from 'path';

/**
 * Claude Flow Language Detection CLI
 *
 * Command-line interface for language detection and CLAUDE.md generation
 */

program
  .name('claude-flow-lang')
  .description('Intelligent language detection and CLAUDE.md generation for Claude Flow')
  .version('1.0.0');

// Main detect command
program
  .command('detect')
  .description('Detect languages and frameworks in current project')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-v, --verbose', 'Verbose output')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    try {
      console.log('🔍 Detecting project languages and frameworks...');

      const detector = new LanguageDetector(options.path);
      const results = await detector.detectProject();

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log('\n📊 Detection Results:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        console.log(`\n🎯 Project Type: ${results.projectType}`);
        console.log(`📈 Confidence: ${(results.confidence * 100).toFixed(1)}%`);

        if (Object.keys(results.languages).length > 0) {
          console.log('\n💻 Languages:');
          for (const [lang, score] of Object.entries(results.languages)) {
            const percentage = (score * 100).toFixed(1);
            const bar = '█'.repeat(Math.floor(score * 20));
            console.log(`  ${lang.padEnd(15)} ${bar.padEnd(20)} ${percentage}%`);
          }
        }

        if (Object.keys(results.frameworks).length > 0) {
          console.log('\n🚀 Frameworks:');
          for (const [framework, score] of Object.entries(results.frameworks)) {
            const percentage = (score * 100).toFixed(1);
            const bar = '▓'.repeat(Math.floor(score * 20));
            console.log(`  ${framework.padEnd(15)} ${bar.padEnd(20)} ${percentage}%`);
          }
        }

        if (Object.keys(results.dependencies).length > 0 && options.verbose) {
          console.log('\n📦 Dependencies:');
          const deps = Object.keys(results.dependencies).slice(0, 10);
          console.log(`  ${deps.join(', ')}${Object.keys(results.dependencies).length > 10 ? '...' : ''}`);
        }

        const recommendations = detector.getRecommendations();
        if (recommendations.linting.length > 0) {
          console.log(`\n💡 Recommended Tools:`);
          console.log(`  Linting: ${recommendations.linting.join(', ')}`);
          console.log(`  Testing: ${recommendations.testing.join(', ')}`);
          if (recommendations.building.length > 0) {
            console.log(`  Building: ${recommendations.building.join(', ')}`);
          }
        }
      }

    } catch (error) {
      console.error('❌ Detection failed:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Generate CLAUDE.md command
program
  .command('generate')
  .description('Generate CLAUDE.md file based on detected languages')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-f, --force', 'Force regeneration even if file exists')
  .option('--no-backup', 'Skip creating backup of existing file')
  .option('-t, --template <path>', 'Custom template path')
  .action(async (options) => {
    try {
      console.log('📝 Generating CLAUDE.md file...');

      const generator = new ClaudeMdGenerator(options.path, {
        backupExisting: options.backup,
        templatePath: options.template,
        forceRegenerate: options.force
      });

      const content = await generator.generateClaudeMd();

      console.log(`✅ CLAUDE.md generated successfully (${content.length} characters)`);
      console.log(`📄 File location: ${path.join(options.path, 'CLAUDE.md')}`);

    } catch (error) {
      console.error('❌ Generation failed:', error.message);
      process.exit(1);
    }
  });

// Initialize project command
program
  .command('init')
  .description('Initialize language detection and CLAUDE.md generation for project')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-i, --interactive', 'Run interactive setup')
  .option('--skip-validation', 'Skip project validation')
  .action(async (options) => {
    try {
      console.log('🚀 Initializing Claude Flow language detection...');

      const integration = new IntegrationSystem(options.path);

      if (options.interactive) {
        console.log('🎯 Starting interactive setup...');
        await integration.interactiveSetup();
      }

      if (!options.skipValidation) {
        console.log('🔎 Validating project...');
        const validation = await integration.validateProject();

        if (validation.issues.length > 0) {
          console.log('⚠️  Validation issues found:');
          validation.issues.forEach(issue => {
            console.log(`  • ${issue.message}`);
            if (issue.suggestion) {
              console.log(`    💡 ${issue.suggestion}`);
            }
          });
        }

        if (validation.suggestions.length > 0) {
          console.log('💡 Suggestions:');
          validation.suggestions.forEach(suggestion => {
            console.log(`  • ${suggestion.message}`);
            if (suggestion.suggestion) {
              console.log(`    → ${suggestion.suggestion}`);
            }
          });
        }
      }

      const result = await integration.initialize();

      if (result.skipped) {
        console.log(`⏭️  Initialization skipped: ${result.reason}`);
      } else {
        console.log('✅ Initialization completed successfully');
        console.log(`📊 Detected: ${Object.keys(result.detection.languages).join(', ')}`);
        if (result.claudeGenerated) {
          console.log('📄 CLAUDE.md file generated');
        }
      }

    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      process.exit(1);
    }
  });

// Update command for when new technologies are added
program
  .command('update')
  .description('Update CLAUDE.md when new languages/frameworks are detected')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-c, --check-only', 'Only check for changes, don\'t update')
  .action(async (options) => {
    try {
      console.log('🔄 Checking for project changes...');

      const integration = new IntegrationSystem(options.path);
      const result = await integration.updateForNewTechnology();

      if (result.changes.hasChanges) {
        console.log(`📈 Changes detected: ${result.changes.summary}`);

        if (result.changes.newTechnologies.length > 0) {
          console.log('🆕 New technologies:');
          result.changes.newTechnologies.forEach(tech => {
            console.log(`  • ${tech.name} (${tech.type})`);
          });
        }

        if (!options.checkOnly && result.updated) {
          console.log('✅ CLAUDE.md updated successfully');
        } else if (options.checkOnly) {
          console.log('🔍 Check complete - use "update" without --check-only to apply changes');
        }
      } else {
        console.log('✨ No changes detected');
      }

    } catch (error) {
      console.error('❌ Update failed:', error.message);
      process.exit(1);
    }
  });

// Report command
program
  .command('report')
  .description('Generate comprehensive project analysis report')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-o, --output <file>', 'Output file path')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      console.log('📊 Generating project report...');

      const integration = new IntegrationSystem(options.path);
      const report = await integration.generateProjectReport();

      if (options.output) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.output, JSON.stringify(report, null, 2));
        console.log(`📄 Report saved to: ${options.output}`);
      } else if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        // Display formatted report
        console.log('\n📊 Project Analysis Report');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        console.log(`\n🏗️  Project: ${report.project.name}`);
        console.log(`📍 Path: ${report.project.path}`);
        console.log(`📅 Analyzed: ${new Date(report.project.analyzedAt).toLocaleString()}`);

        console.log(`\n🎯 Project Type: ${report.detection.projectType}`);
        console.log(`📈 Detection Confidence: ${(report.detection.confidence * 100).toFixed(1)}%`);

        if (report.validation.issues.length > 0) {
          console.log(`\n⚠️  Issues Found:`);
          report.validation.issues.forEach(issue => {
            console.log(`  • ${issue.message}`);
          });
        }

        if (report.suggestions.length > 0) {
          console.log(`\n💡 Recommendations:`);
          report.suggestions.forEach(suggestion => {
            const priority = suggestion.priority === 'high' ? '🔴' :
                           suggestion.priority === 'medium' ? '🟡' : '🟢';
            console.log(`  ${priority} ${suggestion.message}`);
          });
        }

        if (report.nextSteps.length > 0) {
          console.log(`\n📋 Next Steps:`);
          report.nextSteps.forEach((step, index) => {
            console.log(`  ${index + 1}. ${step}`);
          });
        }
      }

    } catch (error) {
      console.error('❌ Report generation failed:', error.message);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate project structure and configuration')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      console.log('🔎 Validating project...');

      const integration = new IntegrationSystem(options.path);
      const validation = await integration.validateProject();

      if (options.json) {
        console.log(JSON.stringify(validation, null, 2));
      } else {
        console.log(`\n📋 Validation Results`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        if (validation.valid) {
          console.log('✅ Project validation passed');
        } else {
          console.log('⚠️  Project validation found issues');
        }

        if (validation.issues.length > 0) {
          console.log(`\n❌ Issues (${validation.issues.length}):`);
          validation.issues.forEach(issue => {
            console.log(`  • ${issue.message}`);
            if (issue.suggestion) {
              console.log(`    💡 ${issue.suggestion}`);
            }
          });
        }

        if (validation.suggestions.length > 0) {
          console.log(`\n💡 Suggestions (${validation.suggestions.length}):`);
          validation.suggestions.forEach(suggestion => {
            console.log(`  • ${suggestion.message}`);
            if (suggestion.suggestion) {
              console.log(`    → ${suggestion.suggestion}`);
            }
          });
        }
      }

      // Exit with error code if validation failed
      if (!validation.valid) {
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  });

// Configuration commands
const configCommand = program
  .command('config')
  .description('Manage configuration and preferences');

configCommand
  .command('show')
  .description('Show current configuration')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (options) => {
    try {
      const integration = new IntegrationSystem(options.path);
      const config = await integration.loadConfiguration();

      console.log('⚙️  Current Configuration:');
      console.log(JSON.stringify(config, null, 2));

    } catch (error) {
      console.error('❌ Failed to load configuration:', error.message);
      process.exit(1);
    }
  });

configCommand
  .command('set <key> <value>')
  .description('Set configuration value')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (key, value, options) => {
    try {
      const integration = new IntegrationSystem(options.path);
      const config = await integration.loadConfiguration();

      // Parse value as JSON if possible, otherwise as string
      let parsedValue;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }

      // Set nested key if dot notation is used
      const keys = key.split('.');
      let current = config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = parsedValue;

      await integration.updateConfiguration(config);
      console.log(`✅ Configuration updated: ${key} = ${value}`);

    } catch (error) {
      console.error('❌ Failed to update configuration:', error.message);
      process.exit(1);
    }
  });

// Cleanup command
program
  .command('cleanup')
  .description('Clean up old backup files and reports')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-d, --days <days>', 'Files older than N days', '30')
  .action(async (options) => {
    try {
      console.log(`🧹 Cleaning up files older than ${options.days} days...`);

      const integration = new IntegrationSystem(options.path);
      const result = await integration.cleanup(parseInt(options.days));

      console.log(`✅ Cleanup completed: ${result.cleanedCount} files removed`);

    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      process.exit(1);
    }
  });

// Global error handler
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Parse command line arguments
program.parse();

export { program };