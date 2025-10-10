#!/usr/bin/env node

/**
 * NPM Package Pre-Publication Validation
 *
 * Validates package before NPM publication:
 * - No .env or secret files in package
 * - Entry points are valid
 * - Dependencies correctly categorized
 * - Templates bundled correctly
 * - Package size acceptable
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const VALIDATION_RESULTS = {
  passed: [],
  warnings: [],
  errors: [],
  confidence: 0
};

console.log('🔍 NPM Package Pre-Publication Validation\n');

// 1. Check for .env files in package
console.log('1️⃣  Checking for .env and secret files...');
try {
  const npmignore = fs.readFileSync('.npmignore', 'utf-8');
  const hasEnvIgnore = npmignore.includes('.env') || npmignore.includes('*.env*');
  const hasKeysIgnore = npmignore.includes('*.key') || npmignore.includes('*.pem');

  if (hasEnvIgnore && hasKeysIgnore) {
    VALIDATION_RESULTS.passed.push('✅ .npmignore excludes .env and secret files');
  } else {
    VALIDATION_RESULTS.errors.push('❌ .npmignore missing .env or secret file patterns');
  }

  // Check for actual .env files
  const envFiles = [];
  const checkDir = (dir, exclude = ['node_modules', '.git', 'dist', '.claude-flow-novice']) => {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (exclude.includes(item)) continue;
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        checkDir(fullPath, exclude);
      } else if (item.match(/^\.env(?!\.example|\.template|\.secure\.template)/)) {
        envFiles.push(fullPath);
      }
    }
  };

  checkDir('.');
  if (envFiles.length > 0) {
    VALIDATION_RESULTS.warnings.push(`⚠️  Found ${envFiles.length} .env files in project - ensure they're excluded`);
    envFiles.slice(0, 5).forEach(f => console.log(`   - ${f}`));
  } else {
    VALIDATION_RESULTS.passed.push('✅ No problematic .env files found');
  }
} catch (error) {
  VALIDATION_RESULTS.errors.push(`❌ Error checking .env files: ${error.message}`);
}

// 2. Validate package.json entry points
console.log('\n2️⃣  Validating package.json entry points...');
try {
  const pkg = require('../package.json');

  // Check main entry
  if (fs.existsSync(pkg.main)) {
    VALIDATION_RESULTS.passed.push(`✅ Main entry point exists: ${pkg.main}`);
  } else {
    VALIDATION_RESULTS.errors.push(`❌ Main entry point missing: ${pkg.main}`);
  }

  // Check bin entries
  let binValid = true;
  for (const [name, binPath] of Object.entries(pkg.bin || {})) {
    if (!fs.existsSync(binPath)) {
      VALIDATION_RESULTS.errors.push(`❌ Bin entry missing: ${name} -> ${binPath}`);
      binValid = false;
    }
  }
  if (binValid && Object.keys(pkg.bin || {}).length > 0) {
    VALIDATION_RESULTS.passed.push(`✅ All ${Object.keys(pkg.bin).length} bin entries valid`);
  }

  // Check exports
  let exportsValid = true;
  for (const [exportName, exportPath] of Object.entries(pkg.exports || {})) {
    if (!fs.existsSync(exportPath)) {
      VALIDATION_RESULTS.warnings.push(`⚠️  Export path missing: ${exportName} -> ${exportPath}`);
      exportsValid = false;
    }
  }
  if (exportsValid && Object.keys(pkg.exports || {}).length > 0) {
    VALIDATION_RESULTS.passed.push(`✅ All ${Object.keys(pkg.exports).length} exports valid`);
  }

  // Check templates in files array
  const hasTemplates = pkg.files.includes('templates/');
  if (hasTemplates) {
    VALIDATION_RESULTS.passed.push('✅ Templates included in files array');
  } else {
    VALIDATION_RESULTS.errors.push('❌ Templates missing from files array');
  }

} catch (error) {
  VALIDATION_RESULTS.errors.push(`❌ Error validating package.json: ${error.message}`);
}

// 3. Check templates directory
console.log('\n3️⃣  Checking templates directory...');
try {
  if (fs.existsSync('templates')) {
    const templateDirs = fs.readdirSync('templates').filter(f => {
      const stat = fs.statSync(path.join('templates', f));
      return stat.isDirectory();
    });

    if (templateDirs.length > 0) {
      VALIDATION_RESULTS.passed.push(`✅ Found ${templateDirs.length} template directories`);

      // Validate each template has required files
      for (const dir of templateDirs) {
        const templatePath = path.join('templates', dir);
        const hasClaude = fs.existsSync(path.join(templatePath, 'CLAUDE.md'));
        const hasPkg = fs.existsSync(path.join(templatePath, 'package.json'));

        if (hasClaude && hasPkg) {
          VALIDATION_RESULTS.passed.push(`✅ Template ${dir} has CLAUDE.md and package.json`);
        } else {
          VALIDATION_RESULTS.warnings.push(`⚠️  Template ${dir} missing required files`);
        }
      }
    } else {
      VALIDATION_RESULTS.warnings.push('⚠️  No template directories found');
    }
  } else {
    VALIDATION_RESULTS.warnings.push('⚠️  Templates directory does not exist');
  }
} catch (error) {
  VALIDATION_RESULTS.errors.push(`❌ Error checking templates: ${error.message}`);
}

// 4. Check build artifacts
console.log('\n4️⃣  Checking build artifacts...');
try {
  if (fs.existsSync('.claude-flow-novice/dist')) {
    const distFiles = execSync('find .claude-flow-novice/dist -type f | wc -l').toString().trim();
    VALIDATION_RESULTS.passed.push(`✅ Build artifacts exist (${distFiles} files)`);
  } else {
    VALIDATION_RESULTS.errors.push('❌ Build artifacts missing - run npm run build');
  }
} catch (error) {
  VALIDATION_RESULTS.errors.push(`❌ Error checking build artifacts: ${error.message}`);
}

// 5. Dependencies categorization
console.log('\n5️⃣  Checking dependencies categorization...');
try {
  const pkg = require('../package.json');
  const deps = Object.keys(pkg.dependencies || {});
  const devDeps = Object.keys(pkg.devDependencies || {});

  // Check for common dev dependencies in dependencies
  const commonDevDeps = ['@types/', 'eslint', 'prettier', 'jest', '@swc/', 'typescript'];
  const misplacedDeps = deps.filter(dep =>
    commonDevDeps.some(pattern => dep.includes(pattern))
  );

  if (misplacedDeps.length > 0) {
    VALIDATION_RESULTS.warnings.push(`⚠️  Possible dev dependencies in dependencies: ${misplacedDeps.join(', ')}`);
  } else {
    VALIDATION_RESULTS.passed.push('✅ Dependencies correctly categorized');
  }

  console.log(`   Dependencies: ${deps.length}`);
  console.log(`   DevDependencies: ${devDeps.length}`);

} catch (error) {
  VALIDATION_RESULTS.errors.push(`❌ Error checking dependencies: ${error.message}`);
}

// 6. Package size check
console.log('\n6️⃣  Estimating package size...');
try {
  const pkg = require('../package.json');
  const filesToInclude = pkg.files || [];

  let totalSize = 0;
  for (const pattern of filesToInclude) {
    if (fs.existsSync(pattern)) {
      const stat = fs.statSync(pattern);
      if (stat.isFile()) {
        totalSize += stat.size;
      } else if (stat.isDirectory()) {
        const size = execSync(`du -sb "${pattern}" | cut -f1`).toString().trim();
        totalSize += parseInt(size);
      }
    }
  }

  const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
  console.log(`   Estimated size: ${sizeMB} MB`);

  if (totalSize < 100 * 1024 * 1024) { // < 100MB
    VALIDATION_RESULTS.passed.push(`✅ Package size acceptable: ${sizeMB} MB`);
  } else {
    VALIDATION_RESULTS.warnings.push(`⚠️  Package size large: ${sizeMB} MB`);
  }

} catch (error) {
  VALIDATION_RESULTS.warnings.push(`⚠️  Could not estimate package size: ${error.message}`);
}

// 7. Check for secrets in code
console.log('\n7️⃣  Scanning for potential secrets...');
try {
  const secretPatterns = [
    /password\s*=\s*['"]\w+['"]/i,
    /api[_-]?key\s*=\s*['"]\w+['"]/i,
    /secret\s*=\s*['"]\w+['"]/i,
    /token\s*=\s*['"]\w+['"]/i,
    /-----BEGIN (RSA |DSA )?PRIVATE KEY-----/,
  ];

  let foundSecrets = false;
  const checkFile = (file) => {
    const content = fs.readFileSync(file, 'utf-8');
    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        if (!content.includes('process.env') && !content.includes('example')) {
          VALIDATION_RESULTS.warnings.push(`⚠️  Potential secret in ${file}`);
          foundSecrets = true;
        }
      }
    }
  };

  // Sample check in key directories
  const dirsToCheck = ['src/cli', 'src/security', 'scripts'];
  for (const dir of dirsToCheck) {
    if (fs.existsSync(dir)) {
      const files = execSync(`find ${dir} -name "*.js" -o -name "*.ts" 2>/dev/null || true`).toString().split('\n').filter(Boolean);
      files.slice(0, 20).forEach(checkFile); // Sample first 20 files
    }
  }

  if (!foundSecrets) {
    VALIDATION_RESULTS.passed.push('✅ No obvious secrets detected in sample');
  }

} catch (error) {
  VALIDATION_RESULTS.warnings.push(`⚠️  Could not scan for secrets: ${error.message}`);
}

// Generate report
console.log('\n' + '='.repeat(60));
console.log('📊 VALIDATION REPORT\n');

console.log('✅ PASSED:');
VALIDATION_RESULTS.passed.forEach(item => console.log(`   ${item}`));

if (VALIDATION_RESULTS.warnings.length > 0) {
  console.log('\n⚠️  WARNINGS:');
  VALIDATION_RESULTS.warnings.forEach(item => console.log(`   ${item}`));
}

if (VALIDATION_RESULTS.errors.length > 0) {
  console.log('\n❌ ERRORS:');
  VALIDATION_RESULTS.errors.forEach(item => console.log(`   ${item}`));
}

// Calculate confidence score
const totalChecks = VALIDATION_RESULTS.passed.length + VALIDATION_RESULTS.warnings.length + VALIDATION_RESULTS.errors.length;
const passedChecks = VALIDATION_RESULTS.passed.length;
const errorPenalty = VALIDATION_RESULTS.errors.length * 0.15;
const warningPenalty = VALIDATION_RESULTS.warnings.length * 0.05;

VALIDATION_RESULTS.confidence = Math.max(0, Math.min(1, (passedChecks / totalChecks) - errorPenalty - warningPenalty));

console.log('\n' + '='.repeat(60));
console.log(`📈 Confidence Score: ${(VALIDATION_RESULTS.confidence * 100).toFixed(1)}%`);
console.log(`   Target: ≥75% for publication`);

if (VALIDATION_RESULTS.confidence >= 0.75) {
  console.log('\n✅ PACKAGE READY FOR PUBLICATION');
  process.exit(0);
} else if (VALIDATION_RESULTS.errors.length > 0) {
  console.log('\n❌ CRITICAL ERRORS - FIX BEFORE PUBLICATION');
  process.exit(1);
} else {
  console.log('\n⚠️  WARNINGS EXIST - REVIEW BEFORE PUBLICATION');
  process.exit(0);
}
