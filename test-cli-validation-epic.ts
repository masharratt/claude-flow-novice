#!/usr/bin/env ts-node
/**
 * Manual test for CLI Validation Epic Parser
 *
 * Note: This test works with the compiled JavaScript output
 */
import path from 'path';
import * as fs from 'fs';

const epicDir = path.join(process.cwd(), 'planning/cli-validation-epic');

async function main() {
  try {
    console.log('=== Testing Epic Parser with CLI Validation Epic ===\n');

    // Dynamic import to avoid build-time resolution issues
    const { EpicParser } = await import('./.claude-flow-novice/dist/src/parsers/epic-parser.js');

    const parser = new EpicParser({ epicDirectory: epicDir });
    const result = parser.parse();

    console.log('✅ Parsing succeeded!\n');
    console.log('Epic ID:', result.epicId);
    console.log('Name:', result.name);
    console.log('Status:', result.status);
    console.log('Owner:', result.owner);
    console.log('Estimated Duration:', result.estimatedDuration);
    console.log('Phases:', result.phases.length);

    result.phases.forEach((phase, index) => {
      console.log(`\nPhase ${index + 1}: ${phase.name}`);
      console.log(`  - Phase ID: ${phase.phaseId}`);
      console.log(`  - Sprints: ${phase.sprints?.length || 0}`);
      console.log(`  - Status: ${phase.status}`);
      console.log(`  - Dependencies: ${phase.dependencies?.join(', ') || 'None'}`);

      if (phase.sprints) {
        phase.sprints.forEach((sprint, sprintIndex) => {
          console.log(`    Sprint ${sprintIndex + 1}: ${sprint.name}`);
          console.log(`      - Sprint ID: ${sprint.sprintId}`);
          console.log(`      - Status: ${sprint.status}`);
          console.log(`      - Dependencies: ${sprint.dependencies?.join(', ') || 'None'}`);
          console.log(`      - Acceptance Criteria: ${sprint.acceptanceCriteria?.length || 0}`);
        });
      }
    });

    const validation = parser.getValidationResult();
    console.log('\n=== 📊 Validation Stats ===');
    console.log('  - Total Phases:', validation.stats?.totalPhases);
    console.log('  - Total Sprints:', validation.stats?.totalSprints);
    console.log('  - Completed Sprints:', validation.stats?.completedSprints);
    console.log('  - Dependencies:', validation.stats?.dependencyCount);
    console.log('  - Cycles Detected:', validation.stats?.cyclesDetected);

    console.log('\n✅ Validation Result:', validation.valid ? 'PASSED ✓' : 'FAILED ✗');

    if (validation.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${validation.warnings.length}):`);
      validation.warnings.forEach(w => console.log(`  - [${w.type}] ${w.message}`));
    }

    if (validation.errors.length > 0) {
      console.log(`\n❌ Errors (${validation.errors.length}):`);
      validation.errors.forEach(e => console.log(`  - [${e.type}] ${e.message}`));
    }

    // Test JSON output
    console.log('\n=== 📝 Saving Configuration ===');
    const outputFile = 'cli-validation-config.json';
    parser.parseAndSave(outputFile);

    // Verify output
    if (fs.existsSync(outputFile)) {
      const savedConfig = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      console.log('✅ Config file created and validated');
      console.log('   File size:', fs.statSync(outputFile).size, 'bytes');
      console.log('   Phases in file:', savedConfig.phases.length);

      // Expected structure verification
      const checks = [
        { name: '3 phases parsed', pass: savedConfig.phases.length === 3 },
        { name: 'Epic ID present', pass: !!savedConfig.epicId },
        { name: 'Name present', pass: !!savedConfig.name },
        { name: 'All phases have sprints', pass: savedConfig.phases.every((p: any) => p.sprints && p.sprints.length > 0) },
        { name: 'Scope boundaries present', pass: savedConfig.description && savedConfig.description.length > 0 },
        { name: 'No circular dependencies', pass: validation.stats?.cyclesDetected === 0 },
      ];

      console.log('\n=== ✓ Structure Verification ===');
      checks.forEach(check => {
        const icon = check.pass ? '✅' : '❌';
        console.log(`  ${icon} ${check.name}`);
      });

      const allPassed = checks.every(c => c.pass);
      console.log(`\n${allPassed ? '🎉' : '⚠️ '} Overall: ${allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
    }

  } catch (error: any) {
    console.error('\n❌ Parser failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
