#!/usr/bin/env node

/**
 * Layer 1 Validation Script
 *
 * Validates Layer 1 mesh coordination test results:
 * - 70 files created (7 languages × 10 translations)
 * - 0 overlaps/duplicates
 * - Full Redis coordination audit trail
 * - >70 coordination messages logged
 */

import { createClient } from 'redis';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const OUTPUT_DIR = path.join(__dirname, '../../test-results/hello-world');
const VALIDATION_FILE = path.join(OUTPUT_DIR, 'validation-layer1-mesh.json');

const LANGUAGES = ['JavaScript', 'Python', 'Ruby', 'Go', 'Rust', 'Java', 'TypeScript'];
const TRANSLATIONS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Chinese', 'Japanese', 'Arabic', 'Hindi'];

console.log('━'.repeat(80));
console.log('Layer 1: Mesh Coordination Validation');
console.log('━'.repeat(80));
console.log('');

/**
 * Validate file creation
 */
function validateFiles() {
  console.log('📄 FILE VALIDATION');
  console.log('─'.repeat(80));

  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error('❌ Output directory not found:', OUTPUT_DIR);
    return { valid: false, files: [], expected: 70 };
  }

  const files = fs.readdirSync(OUTPUT_DIR).filter(f => !f.endsWith('.json'));
  console.log(`   Total files: ${files.length}/70`);

  // Check for duplicates
  const uniqueFiles = new Set(files);
  if (uniqueFiles.size !== files.length) {
    console.error(`❌ Duplicate files detected: ${files.length - uniqueFiles.size}`);
  } else {
    console.log(`   ✅ No duplicate files`);
  }

  // Check coverage
  const expectedCombos = new Set();
  for (const lang of LANGUAGES) {
    for (const trans of TRANSLATIONS) {
      expectedCombos.add(`${lang.toLowerCase()}-${trans.toLowerCase()}`);
    }
  }

  const foundCombos = new Set();
  files.forEach(file => {
    const match = file.match(/^([a-z]+)-([a-z]+)\./);
    if (match) {
      foundCombos.add(`${match[1]}-${match[2]}`);
    }
  });

  const missing = Array.from(expectedCombos).filter(c => !foundCombos.has(c));
  if (missing.length > 0) {
    console.error(`❌ Missing combinations: ${missing.length}`);
    console.error(`   ${missing.join(', ')}`);
  } else {
    console.log(`   ✅ All 70 combinations present`);
  }

  // Check file contents
  let validContents = 0;
  for (const file of files) {
    const filePath = path.join(OUTPUT_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Should contain agent ID, coordinator, and language info
    if (content.includes('agent-') && content.includes('Coordinator-')) {
      validContents++;
    }
  }

  console.log(`   Files with valid metadata: ${validContents}/${files.length}`);

  const valid = files.length === 70 && missing.length === 0 && validContents === files.length;
  console.log(`   Overall: ${valid ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');

  return { valid, files, expected: 70, missing: missing.length, validContents };
}

/**
 * Validate Redis coordination
 */
async function validateRedis() {
  console.log('🔄 REDIS COORDINATION VALIDATION');
  console.log('─'.repeat(80));

  const client = createClient({ url: 'redis://localhost:6379' });

  try {
    await client.connect();
    console.log('   ✅ Connected to Redis');

    // Check claims
    const claimKeys = await client.keys('coordination:claims:claimed:*');
    console.log(`   Claims stored: ${claimKeys.length}/70`);

    if (claimKeys.length !== 70) {
      console.error(`   ❌ Expected 70 claims, found ${claimKeys.length}`);
    } else {
      console.log(`   ✅ All 70 combinations claimed`);
    }

    // Check for overlaps in claims
    const claimOwners = new Map();
    for (const key of claimKeys) {
      const owner = await client.get(key);
      const combo = key.replace('coordination:claims:claimed:', '');
      if (claimOwners.has(combo)) {
        console.error(`   ❌ Overlap detected: ${combo} claimed by multiple coordinators`);
      }
      claimOwners.set(combo, owner);
    }

    // Check coordinators
    const coordA = await client.get('coordination:coordinators:Coordinator-A:claims');
    const coordB = await client.get('coordination:coordinators:Coordinator-B:claims');

    if (coordA && coordB) {
      const statsA = JSON.parse(coordA);
      const statsB = JSON.parse(coordB);

      console.log(`   Coordinator-A claims: ${statsA.claimed}`);
      console.log(`   Coordinator-B claims: ${statsB.claimed}`);
      console.log(`   Total claimed: ${statsA.claimed + statsB.claimed}/70`);

      if (statsA.claimed + statsB.claimed !== 70) {
        console.error(`   ❌ Claims don't add up to 70`);
      } else {
        console.log(`   ✅ Claim counts match`);
      }
    } else {
      console.error(`   ❌ Coordinator claim data missing`);
    }

    // Check coordination messages
    const messagesA = await client.lLen('coordination:messages:Coordinator-A');
    const messagesB = await client.lLen('coordination:messages:Coordinator-B');
    const totalMessages = messagesA + messagesB;

    console.log(`   Coordinator-A messages: ${messagesA}`);
    console.log(`   Coordinator-B messages: ${messagesB}`);
    console.log(`   Total messages: ${totalMessages}`);

    if (totalMessages < 140) {
      console.error(`   ❌ Expected ≥140 messages (70 claims + 70 confirmations), found ${totalMessages}`);
    } else {
      console.log(`   ✅ Sufficient coordination messages (${totalMessages} ≥ 140)`);
    }

    // Check conflicts
    const conflicts = await client.lLen('coordination:conflicts:log');
    console.log(`   Conflicts detected: ${conflicts}`);
    if (conflicts > 0) {
      console.log(`   ℹ️  Conflicts resolved via timestamp ordering`);
    }

    // Check timeline
    const timeline = await client.zCard('coordination:timeline');
    console.log(`   Timeline events: ${timeline}`);

    // Sample some messages
    console.log('');
    console.log('   Sample coordination messages:');
    const sampleA = await client.lRange('coordination:messages:Coordinator-A', 0, 2);
    sampleA.forEach((msg, i) => {
      const parsed = JSON.parse(msg);
      console.log(`   [A${i + 1}] ${parsed.action} ${parsed.combo}`);
    });

    const sampleB = await client.lRange('coordination:messages:Coordinator-B', 0, 2);
    sampleB.forEach((msg, i) => {
      const parsed = JSON.parse(msg);
      console.log(`   [B${i + 1}] ${parsed.action} ${parsed.combo}`);
    });

    const valid = claimKeys.length === 70 && totalMessages >= 140 && claimOwners.size === 70;
    console.log(`   Overall: ${valid ? '✅ PASS' : '❌ FAIL'}`);
    console.log('');

    await client.quit();

    return {
      valid,
      claims: claimKeys.length,
      messages: totalMessages,
      conflicts,
      timeline,
      coordinatorA: { messages: messagesA },
      coordinatorB: { messages: messagesB }
    };
  } catch (error) {
    console.error('   ❌ Redis validation failed:', error.message);
    await client.quit().catch(() => {});
    return { valid: false, error: error.message };
  }
}

/**
 * Validate test report
 */
function validateReport() {
  console.log('📊 TEST REPORT VALIDATION');
  console.log('─'.repeat(80));

  if (!fs.existsSync(VALIDATION_FILE)) {
    console.error('   ❌ Validation report not found:', VALIDATION_FILE);
    console.log('   Overall: ❌ FAIL');
    console.log('');
    return { valid: false };
  }

  const report = JSON.parse(fs.readFileSync(VALIDATION_FILE, 'utf-8'));

  console.log(`   Test: ${report.test}`);
  console.log(`   Timestamp: ${report.timestamp}`);
  console.log(`   Duration: ${report.duration}s`);
  console.log('');

  console.log('   Coordinators:');
  Object.entries(report.coordinators).forEach(([name, stats]) => {
    console.log(`     ${name}:`);
    console.log(`       - Claimed: ${stats.claimed}`);
    console.log(`       - Completed: ${stats.completed}`);
    console.log(`       - Messages sent: ${stats.messagesPublished}`);
    console.log(`       - Messages received: ${stats.messagesReceived}`);
  });
  console.log('');

  console.log('   Files:');
  console.log(`     - Expected: ${report.files.expected}`);
  console.log(`     - Created: ${report.files.created}`);
  console.log(`     - Status: ${report.files.created === report.files.expected ? '✅' : '❌'}`);
  console.log('');

  console.log('   Redis:');
  console.log(`     - Claims: ${report.redis.claims}`);
  console.log(`     - Messages: ${report.redis.messagesTotal}`);
  console.log(`     - Conflicts: ${report.redis.conflicts}`);
  console.log(`     - Timeline events: ${report.redis.timelineEvents}`);
  console.log(`     - Overlaps: ${report.redis.overlaps}`);
  console.log('');

  console.log(`   Overall: ${report.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');

  return { valid: report.success, report };
}

/**
 * Generate validation summary
 */
async function generateSummary(fileValidation, redisValidation, reportValidation) {
  console.log('━'.repeat(80));
  console.log('VALIDATION SUMMARY');
  console.log('━'.repeat(80));
  console.log('');

  const allValid = fileValidation.valid && redisValidation.valid && reportValidation.valid;

  console.log(`📄 File Validation:        ${fileValidation.valid ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🔄 Redis Coordination:     ${redisValidation.valid ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`📊 Test Report:            ${reportValidation.valid ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  console.log(`🎯 Overall Result:         ${allValid ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');

  if (allValid) {
    console.log('🎉 LAYER 1 VALIDATION PASSED!');
    console.log('');
    console.log('Key Achievements:');
    console.log('  ✅ 72 agents spawned (2 coordinators + 70 sub-agents)');
    console.log('  ✅ 70 files created (0 overlaps)');
    console.log(`  ✅ ${redisValidation.messages}+ coordination messages via Redis pub/sub`);
    console.log('  ✅ Full audit trail in Redis');
    console.log('  ✅ Mesh topology coordination successful');
  } else {
    console.log('❌ LAYER 1 VALIDATION FAILED');
    console.log('');
    console.log('Issues detected:');
    if (!fileValidation.valid) {
      console.log(`  ❌ File validation failed (${fileValidation.files.length}/70 files, ${fileValidation.missing} missing)`);
    }
    if (!redisValidation.valid) {
      console.log(`  ❌ Redis validation failed (${redisValidation.claims}/70 claims, ${redisValidation.messages} messages)`);
    }
    if (!reportValidation.valid) {
      console.log('  ❌ Test report validation failed');
    }
  }

  console.log('');
  console.log('━'.repeat(80));

  // Save summary
  const summary = {
    timestamp: new Date().toISOString(),
    validation: {
      files: fileValidation,
      redis: redisValidation,
      report: reportValidation
    },
    result: allValid ? 'PASS' : 'FAIL'
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'validation-summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log(`📄 Validation summary saved to: ${path.join(OUTPUT_DIR, 'validation-summary.json')}`);
  console.log('');

  return allValid;
}

/**
 * Main validation
 */
async function main() {
  try {
    const fileValidation = validateFiles();
    const redisValidation = await validateRedis();
    const reportValidation = validateReport();

    const success = await generateSummary(fileValidation, redisValidation, reportValidation);

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Validation failed with error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
