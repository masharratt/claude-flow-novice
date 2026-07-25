#!/usr/bin/env tsx
/**
 * Validate Team Configuration Files
 * Part of Task 2.4: Configuration File Cleanup
 *
 * Validates all JSON team configuration files against the CFN config schema
 */

import { validateConfig } from '../src/lib/config-validator.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const teamConfigDir = path.join(__dirname, '../docker/config/teams');

async function validateTeamConfigs() {
  console.log('=== Team Configuration Validation ===\n');
  console.log(`Scanning: ${teamConfigDir}\n`);

  const files = fs.readdirSync(teamConfigDir)
    .filter(f => f.endsWith('.json') && !f.includes('README'));

  if (files.length === 0) {
    console.log('No JSON config files found');
    return { passed: 0, failed: 0, passRate: 0 };
  }

  let passCount = 0;
  let failCount = 0;
  const results: Array<{ file: string; valid: boolean; errors?: string[] }> = [];

  for (const file of files) {
    const filePath = path.join(teamConfigDir, file);
    try {
      const config = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const validation = await validateConfig(config);

      if (validation.valid) {
        console.log(`✅ ${file}: Valid`);
        passCount++;
        results.push({ file, valid: true });
      } else {
        console.log(`❌ ${file}: Invalid`);
        console.log(`   Errors: ${validation.errors.join(', ')}`);
        failCount++;
        results.push({ file, valid: false, errors: validation.errors });
      }
    } catch (error) {
      console.log(`❌ ${file}: Parse error - ${error.message}`);
      failCount++;
      results.push({ file, valid: false, errors: [error.message] });
    }
  }

  const passRate = Math.round(passCount / (passCount + failCount) * 100);

  console.log(`\n=== Validation Summary ===`);
  console.log(`Total files: ${files.length}`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Pass rate: ${passRate}%`);

  return { passed: passCount, failed: failCount, passRate, results };
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateTeamConfigs()
    .then(result => {
      process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Validation script failed:', error);
      process.exit(1);
    });
}

export { validateTeamConfigs };
