#!/usr/bin/env node
/**
 * Validate Template Bundling
 *
 * Verifies that:
 * 1. All template directories exist
 * 2. Required files are present in each template
 * 3. Templates can be read and parsed
 * 4. Package.json includes templates/ directory
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const REQUIRED_TEMPLATES = [
  'basic-swarm',
  'fleet-manager',
  'event-bus',
  'custom-agent'
];

const REQUIRED_FILES = {
  'basic-swarm': ['CLAUDE.md', 'package.json', '.claude/settings.json', 'coordination.md', 'memory-bank.md'],
  'fleet-manager': ['CLAUDE.md', 'package.json', '.claude/settings.json'],
  'event-bus': ['CLAUDE.md', 'package.json', '.claude/settings.json'],
  'custom-agent': ['CLAUDE.md', 'package.json', '.claude/settings.json']
};

async function validateTemplates() {
  const results = {
    success: true,
    templatesChecked: 0,
    filesChecked: 0,
    errors: [],
    warnings: []
  };

  console.log('🔍 Validating Template Bundling...\n');

  // Check templates directory exists
  const templatesDir = join(projectRoot, 'templates');
  try {
    await fs.access(templatesDir);
    console.log('✅ Templates directory exists:', templatesDir);
  } catch (err) {
    results.success = false;
    results.errors.push('Templates directory not found');
    console.log('❌ Templates directory not found:', templatesDir);
    return results;
  }

  // Check each required template
  for (const template of REQUIRED_TEMPLATES) {
    const templateDir = join(templatesDir, template);

    try {
      await fs.access(templateDir);
      console.log(`\n✅ Template directory exists: ${template}/`);
      results.templatesChecked++;

      // Check required files
      const requiredFiles = REQUIRED_FILES[template] || [];
      for (const file of requiredFiles) {
        const filePath = join(templateDir, file);

        try {
          const stats = await fs.stat(filePath);

          if (stats.size === 0) {
            results.warnings.push(`${template}/${file} is empty`);
            console.log(`  ⚠️  ${file} (EMPTY)`);
          } else {
            console.log(`  ✅ ${file} (${stats.size} bytes)`);
          }

          results.filesChecked++;

          // Validate JSON files can be parsed
          if (file.endsWith('.json')) {
            try {
              const content = await fs.readFile(filePath, 'utf8');
              JSON.parse(content);
              console.log(`     ✓ Valid JSON`);
            } catch (err) {
              results.errors.push(`${template}/${file} contains invalid JSON`);
              console.log(`     ❌ Invalid JSON: ${err.message}`);
              results.success = false;
            }
          }

          // Validate Markdown files are not empty
          if (file.endsWith('.md')) {
            try {
              const content = await fs.readFile(filePath, 'utf8');
              if (content.trim().length < 10) {
                results.warnings.push(`${template}/${file} appears to be empty or too short`);
                console.log(`     ⚠️  Content too short (${content.length} chars)`);
              } else {
                console.log(`     ✓ ${content.length} characters`);
              }
            } catch (err) {
              results.errors.push(`Failed to read ${template}/${file}`);
              console.log(`     ❌ Failed to read: ${err.message}`);
            }
          }
        } catch (err) {
          results.errors.push(`${template}/${file} not found`);
          console.log(`  ❌ ${file} not found`);
          results.success = false;
        }
      }
    } catch (err) {
      results.success = false;
      results.errors.push(`Template directory ${template} not found`);
      console.log(`❌ Template directory not found: ${template}/`);
    }
  }

  // Check package.json includes templates
  console.log('\n🔍 Checking package.json...');
  try {
    const packagePath = join(projectRoot, 'package.json');
    const packageContent = await fs.readFile(packagePath, 'utf8');
    const packageJson = JSON.parse(packageContent);

    if (packageJson.files && packageJson.files.includes('templates/')) {
      console.log('✅ package.json includes "templates/" in files array');
    } else {
      results.success = false;
      results.errors.push('package.json does not include "templates/" in files array');
      console.log('❌ package.json does not include "templates/" in files array');
    }
  } catch (err) {
    results.warnings.push(`Failed to validate package.json: ${err.message}`);
    console.log(`⚠️  Failed to validate package.json: ${err.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Templates checked: ${results.templatesChecked}/${REQUIRED_TEMPLATES.length}`);
  console.log(`Files validated: ${results.filesChecked}`);
  console.log(`Errors: ${results.errors.length}`);
  console.log(`Warnings: ${results.warnings.length}`);

  if (results.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    results.errors.forEach(err => console.log(`  • ${err}`));
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.warnings.forEach(warn => console.log(`  • ${warn}`));
  }

  console.log('\n' + '='.repeat(60));
  if (results.success) {
    console.log('✅ VALIDATION PASSED');
    console.log('\nTemplates are ready for bundling with npm package!');
  } else {
    console.log('❌ VALIDATION FAILED');
    console.log('\nFix errors before publishing.');
    process.exit(1);
  }

  return results;
}

// Run validation
validateTemplates().catch(err => {
  console.error('❌ Validation failed:', err);
  process.exit(1);
});
