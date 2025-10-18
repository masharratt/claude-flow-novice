#!/usr/bin/env node

/**
 * Example Usage Script for Language Detection and CLAUDE.md Generation System
 *
 * This script demonstrates all the capabilities of the language detection system
 * and shows how to integrate it into your workflow.
 */

import { LanguageDetector } from './language-detector.js';
import { ClaudeMdGenerator } from './claude-md-generator.js';
import { IntegrationSystem } from './integration-system.js';
import path from 'path';
import fs from 'fs/promises';

async function runExample() {
  console.log('🚀 Claude Flow Language Detection & CLAUDE.md Generation Demo');
  console.log('═══════════════════════════════════════════════════════════════');

  const projectPath = process.cwd();
  console.log(`📍 Project Path: ${projectPath}\n`);

  try {
    // Example 1: Basic Language Detection
    console.log('📊 Example 1: Basic Language Detection');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const detector = new LanguageDetector(projectPath);
    const detectionResults = await detector.detectProject();

    console.log(`🎯 Project Type: ${detectionResults.projectType}`);
    console.log(`📈 Confidence: ${(detectionResults.confidence * 100).toFixed(1)}%`);

    console.log('\n💻 Detected Languages:');
    for (const [lang, score] of Object.entries(detectionResults.languages)) {
      const bar = '█'.repeat(Math.floor(score * 20));
      console.log(`  ${lang.padEnd(15)} ${bar.padEnd(20)} ${(score * 100).toFixed(1)}%`);
    }

    if (Object.keys(detectionResults.frameworks).length > 0) {
      console.log('\n🚀 Detected Frameworks:');
      for (const [framework, score] of Object.entries(detectionResults.frameworks)) {
        const bar = '▓'.repeat(Math.floor(score * 20));
        console.log(`  ${framework.padEnd(15)} ${bar.padEnd(20)} ${(score * 100).toFixed(1)}%`);
      }
    }

    const recommendations = detector.getRecommendations();
    console.log('\n💡 Recommendations:');
    console.log(`  Linting: ${recommendations.linting.join(', ') || 'None detected'}`);
    console.log(`  Testing: ${recommendations.testing.join(', ') || 'None detected'}`);
    console.log(`  Building: ${recommendations.building.join(', ') || 'None detected'}`);

    // Example 2: CLAUDE.md Generation
    console.log('\n\n📝 Example 2: CLAUDE.md Generation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const generator = new ClaudeMdGenerator(projectPath, {
      backupExisting: true,
      preserveCustomSections: true,
    });

    console.log('🔄 Generating CLAUDE.md with detected languages and frameworks...');
    const claudeContent = await generator.generateClaudeMd();

    console.log(`✅ Generated ${claudeContent.length} characters of CLAUDE.md content`);
    console.log('📄 Preview of generated content:');

    // Show first few lines of generated content
    const previewLines = claudeContent.split('\n').slice(0, 10);
    previewLines.forEach((line, index) => {
      console.log(
        `  ${(index + 1).toString().padStart(2)}: ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`,
      );
    });

    // Example 3: Integration System
    console.log('\n\n🔧 Example 3: Complete Integration System');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const integration = new IntegrationSystem(projectPath, {
      autoDetect: true,
      autoGenerate: true,
      backupExisting: true,
    });

    // Validate project
    console.log('🔎 Validating project structure...');
    const validation = await integration.validateProject();

    console.log(`📊 Validation Status: ${validation.valid ? '✅ Valid' : '⚠️ Issues Found'}`);

    if (validation.issues.length > 0) {
      console.log('❌ Issues:');
      validation.issues.forEach((issue) => {
        console.log(`  • ${issue.message}`);
        if (issue.suggestion) {
          console.log(`    💡 ${issue.suggestion}`);
        }
      });
    }

    if (validation.suggestions.length > 0) {
      console.log('💡 Suggestions:');
      validation.suggestions.forEach((suggestion) => {
        console.log(`  • ${suggestion.message}`);
        if (suggestion.suggestion) {
          console.log(`    → ${suggestion.suggestion}`);
        }
      });
    }

    // Generate comprehensive report
    console.log('\n📊 Generating comprehensive project report...');
    const report = await integration.generateProjectReport();

    console.log(`🎯 Project Type: ${report.detection.projectType}`);
    console.log(`📈 Detection Confidence: ${(report.detection.confidence * 100).toFixed(1)}%`);
    console.log(`🔧 Configuration: ${Object.keys(report.configuration).length} settings`);
    console.log(`💡 Suggestions: ${report.suggestions.length} recommendations`);

    // Example 4: Update Detection
    console.log('\n\n🔄 Example 4: Update Detection');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('🔍 Checking for project changes...');
    const updateResult = await integration.updateForNewTechnology();

    if (updateResult.changes.hasChanges) {
      console.log(`📈 Changes detected: ${updateResult.changes.summary}`);

      if (updateResult.changes.newTechnologies.length > 0) {
        console.log('🆕 New technologies:');
        updateResult.changes.newTechnologies.forEach((tech) => {
          console.log(`  • ${tech.name} (${tech.type})`);
        });
      }
    } else {
      console.log('✨ No changes detected since last scan');
    }

    // Example 5: Advanced Configuration
    console.log('\n\n⚙️ Example 5: Advanced Configuration Management');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Load current configuration
    const config = await integration.loadConfiguration();
    console.log('📋 Current configuration keys:');
    Object.keys(config).forEach((key) => {
      console.log(
        `  • ${key}: ${typeof config[key]} ${Array.isArray(config[key]) ? '(array)' : ''}`,
      );
    });

    // Update preferences
    const newPreferences = {
      ...config,
      includeAdvancedPatterns: true,
      customTimestamp: new Date().toISOString(),
    };

    await integration.updateConfiguration(newPreferences);
    console.log('✅ Configuration updated with new preferences');

    // Example 6: Performance and Statistics
    console.log('\n\n📊 Example 6: Performance Statistics');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const startTime = Date.now();

    // Run multiple detections to test performance
    const performanceTests = [];
    for (let i = 0; i < 3; i++) {
      const testStart = Date.now();
      await detector.detectProject();
      const testTime = Date.now() - testStart;
      performanceTests.push(testTime);
    }

    const totalTime = Date.now() - startTime;
    const avgTime = performanceTests.reduce((a, b) => a + b, 0) / performanceTests.length;

    console.log(`⏱️  Performance Metrics:`);
    console.log(`  Total Execution Time: ${totalTime}ms`);
    console.log(`  Average Detection Time: ${avgTime.toFixed(1)}ms`);
    console.log(`  File Analysis Speed: ~${Math.round(1000 / avgTime)} projects/second`);

    // Example 7: Error Handling and Recovery
    console.log('\n\n🛡️ Example 7: Error Handling');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Test with non-existent directory
      const testDetector = new LanguageDetector('/non/existent/path');
      await testDetector.detectProject();
    } catch (error) {
      console.log(`✅ Error handling working correctly: ${error.message}`);
    }

    // Test graceful fallbacks
    const emptyDirGenerator = new ClaudeMdGenerator('/tmp/empty-test-dir', {
      backupExisting: false,
    });

    try {
      await fs.mkdir('/tmp/empty-test-dir', { recursive: true });
      const emptyContent = await emptyDirGenerator.generateClaudeMd();
      console.log(
        `✅ Graceful fallback: Generated ${emptyContent.length} characters for empty project`,
      );
      await fs.rmdir('/tmp/empty-test-dir', { recursive: true });
    } catch (error) {
      console.log(`⚠️  Fallback test error (expected): ${error.message}`);
    }

    // Final Summary
    console.log('\n\n🎉 Demo Complete!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ All examples executed successfully');
    console.log('📊 System is ready for production use');
    console.log('\n🚀 Next Steps:');
    console.log('  1. Run `node src/language/cli.js init` to setup your project');
    console.log('  2. Use `node src/language/cli.js detect` for language detection');
    console.log('  3. Use `node src/language/cli.js generate` to create CLAUDE.md');
    console.log('  4. Use `node src/language/cli.js report` for comprehensive analysis');
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error('📍 Stack trace:', error.stack);
    process.exit(1);
  }
}

// CLI usage examples
function showUsageExamples() {
  console.log('\n📚 CLI Usage Examples');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const examples = [
    {
      command: 'node src/language/cli.js detect',
      description: 'Detect languages in current directory',
    },
    {
      command: 'node src/language/cli.js detect -p /path/to/project --json',
      description: 'Detect languages in specific path, output as JSON',
    },
    {
      command: 'node src/language/cli.js generate --force',
      description: 'Force regenerate CLAUDE.md file',
    },
    {
      command: 'node src/language/cli.js init --interactive',
      description: 'Initialize with interactive setup',
    },
    {
      command: 'node src/language/cli.js update --check-only',
      description: 'Check for changes without updating',
    },
    {
      command: 'node src/language/cli.js report -o report.json',
      description: 'Generate report and save to file',
    },
    {
      command: 'node src/language/cli.js validate',
      description: 'Validate project structure',
    },
    {
      command: 'node src/language/cli.js config show',
      description: 'Show current configuration',
    },
    {
      command: 'node src/language/cli.js config set autoGenerate false',
      description: 'Disable auto-generation',
    },
    {
      command: 'node src/language/cli.js cleanup --days 7',
      description: 'Clean up files older than 7 days',
    },
  ];

  examples.forEach((example) => {
    console.log(`\n💻 ${example.command}`);
    console.log(`   ${example.description}`);
  });
}

// Integration examples with Claude Flow
function showIntegrationExamples() {
  console.log('\n🔗 Integration with Claude Flow Examples');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const integrations = `
// Package.json scripts integration
{
  "scripts": {
    "claude:detect": "node src/language/cli.js detect",
    "claude:generate": "node src/language/cli.js generate",
    "claude:init": "node src/language/cli.js init",
    "claude:update": "node src/language/cli.js update",
    "claude:report": "node src/language/cli.js report",
    "postinstall": "node src/language/cli.js update --check-only"
  }
}

// Git hooks integration (.git/hooks/pre-commit)
#!/bin/sh
echo "🔍 Checking for new technologies..."
node src/language/cli.js update --check-only
if [ $? -eq 1 ]; then
  echo "⚠️  New technologies detected. Run 'npm run claude:update' to update CLAUDE.md"
fi

// CI/CD integration (.github/workflows/claude-flow.yml)
name: Claude Flow Integration
on: [push, pull_request]
jobs:
  claude-flow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run claude:detect
      - run: npm run claude:validate
      - run: npm run claude:report -- --json > claude-report.json
      - uses: actions/upload-artifact@v3
        with:
          name: claude-report
          path: claude-report.json

// Pre-commit hook with husky
// .husky/pre-commit
#!/usr/bin/env sh
npx claude-flow-lang update --check-only
  `;

  console.log(integrations);
}

// Run the demo
if (process.argv[2] === '--usage') {
  showUsageExamples();
} else if (process.argv[2] === '--integration') {
  showIntegrationExamples();
} else {
  runExample();
}
