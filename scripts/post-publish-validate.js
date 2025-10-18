#!/usr/bin/env node
const { execSync } = require('child_process');
const semver = require('semver');

async function validatePublishedPackage() {
  console.log('🔍 Validating Published Package');

  // 1. Verify Package Installability
  try {
    const installOutput = execSync('npm pack && npm install -g ./claude-flow-novice-*.tgz', { encoding: 'utf-8' });
    console.log('✅ Package installed successfully');
  } catch (error) {
    console.error('❌ Package installation failed:', error.message);
    process.exit(1);
  }

  // 2. Smoke Tests
  try {
    const smokeTestOutput = execSync('npm run smoke-test', { encoding: 'utf-8' });
    console.log('✅ Smoke tests passed');
  } catch (error) {
    console.error('❌ Smoke tests failed:', error.message);
    process.exit(1);
  }

  // 3. Version Consistency Check
  const localVersion = require('../package.json').version;
  const publishedVersion = JSON.parse(execSync('npm view claude-flow-novice version --json')).trim();

  if (!semver.eq(localVersion, publishedVersion)) {
    console.error(`❌ Version mismatch: local (${localVersion}) vs published (${publishedVersion})`);
    process.exit(1);
  }

  // 4. Package Size Verification
  const packageSize = parseInt(execSync('npm pack --dry-run | grep -o "[0-9]* files"').toString().trim());
  if (packageSize > 100) {  // Adjust threshold as needed
    console.error(`❌ Package too large: ${packageSize} files`);
    process.exit(1);
  }

  console.log('🎉 Package Published and Validated Successfully!');
}

validatePublishedPackage().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});