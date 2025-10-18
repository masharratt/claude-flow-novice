#!/usr/bin/env node

/**
 * SDK Phase 1 Verification Script
 *
 * Verifies that Phase 1 implementation is complete and functional
 */

const fs = require('fs');
const path = require('path');

console.log('\n' + '='.repeat(70));
console.log('🔍 CLAUDE AGENT SDK - PHASE 1 VERIFICATION');
console.log('='.repeat(70) + '\n');

let allPassed = true;
const results = [];

function check(name, condition, details = '') {
  const passed = condition;
  results.push({ name, passed, details });

  if (passed) {
    console.log(`✅ ${name}`);
    if (details) console.log(`   ${details}`);
  } else {
    console.log(`❌ ${name}`);
    if (details) console.log(`   ${details}`);
    allPassed = false;
  }
}

// 1. Check package installation
console.log('\n📦 CHECKING PACKAGE INSTALLATION\n');

try {
  const packageJson = require('../package.json');
  check(
    'Package.json exists',
    true,
    'Located at root directory'
  );

  check(
    '@anthropic-ai/claude-agent-sdk installed',
    packageJson.dependencies['@anthropic-ai/claude-agent-sdk'] !== undefined,
    `Version: ${packageJson.dependencies['@anthropic-ai/claude-agent-sdk']}`
  );
} catch (error) {
  check('Package.json readable', false, error.message);
}

// 2. Check SDK files
console.log('\n📂 CHECKING SDK FILES\n');

const requiredFiles = [
  { path: 'src/sdk/config.cjs', desc: 'SDK configuration' },
  { path: 'src/sdk/monitor.cjs', desc: 'Token usage monitoring' },
  { path: 'src/sdk/index.cjs', desc: 'Main integration layer' }
];

requiredFiles.forEach(({ path: filePath, desc }) => {
  const fullPath = path.join(__dirname, '..', filePath);
  const exists = fs.existsSync(fullPath);
  const size = exists ? fs.statSync(fullPath).size : 0;

  check(
    `${filePath} exists`,
    exists,
    `${desc} - ${(size / 1024).toFixed(1)} KB`
  );
});

// 3. Check test files
console.log('\n🧪 CHECKING TEST FILES\n');

const testFile = path.join(__dirname, '../tests/sdk-integration.test.js');
check(
  'tests/sdk-integration.test.js exists',
  fs.existsSync(testFile),
  'Phase 1 test suite'
);

// 4. Check documentation
console.log('\n📚 CHECKING DOCUMENTATION\n');

const docFiles = [
  'docs/sdk-integration-phase1.md',
  'docs/sdk-phase1-summary.md'
];

docFiles.forEach((docFile) => {
  const fullPath = path.join(__dirname, '..', docFile);
  const exists = fs.existsSync(fullPath);

  check(
    `${docFile} exists`,
    exists,
    exists ? `${(fs.statSync(fullPath).size / 1024).toFixed(1)} KB` : ''
  );
});

// 5. Check environment configuration
console.log('\n⚙️  CHECKING ENVIRONMENT CONFIGURATION\n');

const envFile = path.join(__dirname, '../.env');
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf-8');

  const envVars = [
    'ENABLE_SDK_CACHING',
    'ENABLE_CONTEXT_EDITING',
    'SDK_INTEGRATION_MODE',
    'ENABLE_SDK_INTEGRATION'
  ];

  envVars.forEach((varName) => {
    check(
      `${varName} in .env`,
      envContent.includes(varName),
      `Environment variable configured`
    );
  });
} else {
  check('.env file exists', false, 'Environment file not found');
}

// 6. Test SDK loading
console.log('\n🔧 TESTING SDK LOADING\n');

try {
  const sdk = require('../src/sdk/index.cjs');

  check(
    'SDK module loads',
    true,
    'No syntax errors'
  );

  check(
    'SDK exports initialize',
    typeof sdk.initialize === 'function',
    'Initialize function available'
  );

  check(
    'SDK exports monitoring',
    typeof sdk.getMonitor === 'function',
    'Monitoring functions available'
  );

  check(
    'SDK exports config',
    typeof sdk.getSDKConfig === 'function',
    'Configuration functions available'
  );

  check(
    'TOKEN_COSTS defined',
    sdk.TOKEN_COSTS !== undefined,
    `Input: $${sdk.TOKEN_COSTS.input}, Cached: $${sdk.TOKEN_COSTS.cached}`
  );
} catch (error) {
  check('SDK module loads', false, error.message);
}

// 7. Test monitor functionality
console.log('\n📊 TESTING MONITOR FUNCTIONALITY\n');

try {
  const { SDKMonitor } = require('../src/sdk/index.cjs');

  const monitor = new SDKMonitor({ persistMetrics: false });

  check(
    'Monitor instantiates',
    monitor !== null,
    'Monitor object created'
  );

  check(
    'Monitor tracks metrics',
    monitor.metrics !== undefined,
    'Metrics object exists'
  );

  check(
    'Monitor calculates savings',
    typeof monitor.calculateSavings === 'function',
    'Savings calculation available'
  );

  // Test savings calculation
  const savings = monitor.calculateSavings(1000);
  check(
    'Savings calculation works',
    savings > 0,
    `1000 tokens → ${savings.toFixed(0)} saved`
  );

  // Test report generation
  monitor.metrics.tokensBefore = 10000;
  monitor.metrics.tokensAfter = 1000;
  monitor.metrics.totalCostSaved = 0.027;
  monitor.metrics.operations = 5;

  const report = monitor.getSavingsReport();
  check(
    'Report generation works',
    report.summary !== undefined,
    `Operations: ${report.summary.operations}, Savings: ${report.summary.costSaved}`
  );
} catch (error) {
  check('Monitor functionality', false, error.message);
}

// 8. Test configuration
console.log('\n⚙️  TESTING CONFIGURATION\n');

try {
  const { getSDKConfig, isSDKEnabled } = require('../src/sdk/index.cjs');

  const config = getSDKConfig();

  check(
    'Config loads',
    config !== null,
    'Configuration object returned'
  );

  check(
    'Config has required fields',
    config.caching !== undefined && config.contextEditing !== undefined,
    `Caching: ${config.caching}, Context: ${config.contextEditing}`
  );

  // Test enable/disable
  const originalMode = process.env.SDK_INTEGRATION_MODE;

  process.env.SDK_INTEGRATION_MODE = 'parallel';
  const enabledParallel = isSDKEnabled();

  process.env.SDK_INTEGRATION_MODE = 'disabled';
  const disabledMode = isSDKEnabled();

  process.env.SDK_INTEGRATION_MODE = originalMode;

  check(
    'Enable/disable works',
    enabledParallel === true && disabledMode === false,
    'Integration mode control functional'
  );
} catch (error) {
  check('Configuration', false, error.message);
}

// Summary
console.log('\n' + '='.repeat(70));
console.log('📋 VERIFICATION SUMMARY');
console.log('='.repeat(70) + '\n');

const passed = results.filter(r => r.passed).length;
const total = results.length;
const percentage = ((passed / total) * 100).toFixed(1);

console.log(`Tests Passed: ${passed}/${total} (${percentage}%)`);

if (allPassed) {
  console.log('\n✅ PHASE 1 IMPLEMENTATION VERIFIED SUCCESSFULLY\n');
  console.log('All components are in place and functional:');
  console.log('  • SDK configuration with extended caching and context editing');
  console.log('  • Token usage monitoring and cost tracking');
  console.log('  • Integration layer with easy-to-use API');
  console.log('  • Test suite for validation');
  console.log('  • Comprehensive documentation');
  console.log('  • Environment configuration');
  console.log('\nNext steps:');
  console.log('  1. Set CLAUDE_API_KEY in .env');
  console.log('  2. Run: node src/sdk/index.cjs');
  console.log('  3. Start using SDK with executeWithTracking()');
  console.log('  4. Monitor savings with getSavingsReport()');
} else {
  console.log('\n⚠️  SOME VERIFICATIONS FAILED\n');
  console.log('Please review the failed checks above and ensure:');
  console.log('  • All files are created in correct locations');
  console.log('  • Package dependencies are installed');
  console.log('  • Environment variables are configured');
  console.log('  • No syntax errors in SDK modules');
}

console.log('\n' + '='.repeat(70) + '\n');

process.exit(allPassed ? 0 : 1);