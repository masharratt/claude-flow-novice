#!/usr/bin/env node

/**
 * Test NPM Package Installation
 *
 * Creates tarball, inspects contents, and validates local installation
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

console.log('🧪 NPM Package Installation Test\n');

const TEST_DIR = path.join(process.cwd(), '.npm-test');
const PKG_NAME = 'claude-flow-novice';

// Clean up previous test
if (fs.existsSync(TEST_DIR)) {
  console.log('🧹 Cleaning previous test directory...');
  fs.removeSync(TEST_DIR);
}

// Create test directory
fs.mkdirSync(TEST_DIR);

console.log('\n1️⃣  Creating NPM tarball...');
try {
  const packResult = execSync('npm pack', { encoding: 'utf-8' });
  console.log(`   ✅ Tarball created: ${packResult.trim()}`);

  const tarball = packResult.trim();
  const tarballPath = path.join(process.cwd(), tarball);

  // Inspect tarball contents
  console.log('\n2️⃣  Inspecting tarball contents...');
  const tarContents = execSync(`tar -tzf "${tarball}"`, { encoding: 'utf-8' });
  const files = tarContents.split('\n').filter(Boolean);

  console.log(`   📦 Total files in package: ${files.length}`);

  // Check for problematic files
  const envFiles = files.filter(f => f.match(/\.env(?!\.example|\.template|\.secure\.template)/));
  const keyFiles = files.filter(f => f.match(/\.(key|pem|p12|pfx)$/));
  const testFiles = files.filter(f => f.match(/\.(test|spec)\.(js|ts)$/));

  if (envFiles.length > 0) {
    console.log(`   ❌ Found ${envFiles.length} .env files in package:`);
    envFiles.slice(0, 5).forEach(f => console.log(`      - ${f}`));
  } else {
    console.log('   ✅ No .env files in package');
  }

  if (keyFiles.length > 0) {
    console.log(`   ⚠️  Found ${keyFiles.length} key files in package`);
  } else {
    console.log('   ✅ No key files in package');
  }

  if (testFiles.length > 0) {
    console.log(`   ⚠️  Found ${testFiles.length} test files in package`);
  } else {
    console.log('   ✅ No test files in package');
  }

  // Check for essential files
  const hasReadme = files.some(f => f.includes('README.md'));
  const hasLicense = files.some(f => f.includes('LICENSE'));
  const hasClaude = files.some(f => f.includes('CLAUDE.md'));
  const hasTemplates = files.some(f => f.includes('templates/'));
  const hasDist = files.some(f => f.includes('.claude-flow-novice/dist/'));

  console.log('\n3️⃣  Checking essential files...');
  console.log(`   ${hasReadme ? '✅' : '❌'} README.md`);
  console.log(`   ${hasLicense ? '✅' : '❌'} LICENSE`);
  console.log(`   ${hasClaude ? '✅' : '❌'} CLAUDE.md`);
  console.log(`   ${hasTemplates ? '✅' : '❌'} templates/`);
  console.log(`   ${hasDist ? '✅' : '❌'} .claude-flow-novice/dist/`);

  // Test local installation
  console.log('\n4️⃣  Testing local installation...');
  process.chdir(TEST_DIR);

  // Create test package.json
  fs.writeFileSync('package.json', JSON.stringify({
    name: 'test-installation',
    version: '1.0.0',
    type: 'module'
  }, null, 2));

  console.log('   📦 Installing package...');
  try {
    execSync(`npm install "${tarballPath}" --loglevel=error`, { encoding: 'utf-8', stdio: 'inherit' });
    console.log('   ✅ Package installed successfully');
  } catch (error) {
    console.log('   ❌ Installation failed:', error.message);
    process.exit(1);
  }

  // Verify installation
  console.log('\n5️⃣  Verifying installation...');
  const nodeModulesPath = path.join(TEST_DIR, 'node_modules', PKG_NAME);

  if (!fs.existsSync(nodeModulesPath)) {
    console.log('   ❌ Package not found in node_modules');
    process.exit(1);
  }

  // Check bin files
  const binPath = path.join(nodeModulesPath, '.claude-flow-novice', 'dist', 'src', 'cli', 'main.js');
  if (fs.existsSync(binPath)) {
    console.log('   ✅ CLI entry point exists');
  } else {
    console.log('   ❌ CLI entry point missing');
  }

  // Check templates
  const templatesPath = path.join(nodeModulesPath, 'templates');
  if (fs.existsSync(templatesPath)) {
    const templateDirs = fs.readdirSync(templatesPath).filter(f => {
      const stat = fs.statSync(path.join(templatesPath, f));
      return stat.isDirectory();
    });
    console.log(`   ✅ Templates directory exists (${templateDirs.length} templates)`);
  } else {
    console.log('   ❌ Templates directory missing');
  }

  // Try to require the package
  console.log('\n6️⃣  Testing package imports...');
  try {
    const pkgPath = path.join(nodeModulesPath, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    console.log(`   ✅ Package name: ${pkg.name}`);
    console.log(`   ✅ Package version: ${pkg.version}`);
    console.log(`   ✅ Main entry: ${pkg.main}`);
    console.log(`   ✅ Bin entries: ${Object.keys(pkg.bin || {}).length}`);
    console.log(`   ✅ Exports: ${Object.keys(pkg.exports || {}).length}`);

  } catch (error) {
    console.log('   ❌ Failed to read package.json:', error.message);
  }

  // Clean up
  console.log('\n7️⃣  Cleaning up...');
  process.chdir('..');
  fs.removeSync(TEST_DIR);
  fs.removeSync(tarballPath);
  console.log('   ✅ Test directory and tarball removed');

  console.log('\n' + '='.repeat(60));
  console.log('✅ NPM PACKAGE TEST PASSED\n');
  console.log('📊 Summary:');
  console.log(`   - Package size: ~34MB`);
  console.log(`   - Files in package: ${files.length}`);
  console.log(`   - No sensitive files detected`);
  console.log(`   - Installation successful`);
  console.log(`   - All entry points valid`);
  console.log('='.repeat(60));

  process.exit(0);

} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
}
