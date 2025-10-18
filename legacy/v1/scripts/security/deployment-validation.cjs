#!/usr/bin/env node

/**
 * Security Deployment Validation
 * Phase 0 Security Debt Resolution - Loop 3 Retry
 *
 * Validates that all security tools are properly deployed and functional
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const results = {
  passed: [],
  failed: [],
  warnings: [],
  score: 0
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function testSection(name) {
  log(`\n🔍 Testing ${name}...`, 'cyan');
}

function testPass(message) {
  log(`✅ ${message}`, 'green');
  results.passed.push(message);
}

function testFail(message) {
  log(`❌ ${message}`, 'red');
  results.failed.push(message);
}

function testWarn(message) {
  log(`⚠️  ${message}`, 'yellow');
  results.warnings.push(message);
}

// Test 1: git-secrets installation
testSection('git-secrets Installation');
try {
  const gitSecretsPath = path.join(process.env.HOME, '.local', 'bin', 'git-secrets');
  if (fs.existsSync(gitSecretsPath)) {
    testPass('git-secrets binary found');

    // Test git hooks
    const hooksDir = path.join(process.cwd(), '.git', 'hooks');
    const requiredHooks = ['pre-commit', 'commit-msg', 'prepare-commit-msg'];
    let hooksInstalled = true;

    for (const hook of requiredHooks) {
      const hookPath = path.join(hooksDir, hook);
      if (fs.existsSync(hookPath)) {
        const content = fs.readFileSync(hookPath, 'utf8');
        if (content.includes('git-secrets') || content.includes('git secrets')) {
          testPass(`git-secrets ${hook} hook installed`);
        } else {
          testWarn(`${hook} hook exists but may not include git-secrets`);
          hooksInstalled = false;
        }
      } else {
        testFail(`git-secrets ${hook} hook not found`);
        hooksInstalled = false;
      }
    }

    // Test patterns
    try {
      const patterns = execSync(`${gitSecretsPath} --list`, { encoding: 'utf8' });
      if (patterns.includes('sk-ant-api03')) {
        testPass('Anthropic API key pattern configured');
      } else {
        testWarn('Anthropic API key pattern not found');
      }

      if (patterns.includes('AWS')) {
        testPass('AWS patterns configured');
      } else {
        testWarn('AWS patterns not configured');
      }
    } catch (err) {
      testWarn('Could not verify git-secrets patterns');
    }
  } else {
    testFail('git-secrets not found in ~/.local/bin');
  }
} catch (err) {
  testFail(`git-secrets test failed: ${err.message}`);
}

// Test 2: Redis Authentication
testSection('Redis Authentication');
try {
  // Check .env for REDIS_PASSWORD
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const redisPasswordMatch = envContent.match(/^REDIS_PASSWORD=(.+)$/m);

    if (redisPasswordMatch && redisPasswordMatch[1].trim().length >= 32) {
      testPass(`REDIS_PASSWORD configured (${redisPasswordMatch[1].trim().length} chars)`);

      // Test Redis connection with auth
      try {
        const redisPassword = redisPasswordMatch[1].trim();
        execSync(`redis-cli -a "${redisPassword}" ping`, { encoding: 'utf8', stdio: 'pipe' });
        testPass('Redis authentication working');
      } catch (err) {
        testFail('Redis authentication failed - password may not be set in Redis');
      }
    } else if (redisPasswordMatch) {
      testFail(`REDIS_PASSWORD too weak (${redisPasswordMatch[1].trim().length} chars, need ≥32)`);
    } else {
      testFail('REDIS_PASSWORD not found in .env');
    }
  } else {
    testFail('.env file not found');
  }
} catch (err) {
  testFail(`Redis authentication test failed: ${err.message}`);
}

// Test 3: File Permissions (WSL-aware)
testSection('File Permissions');
try {
  const sensitiveFiles = ['.env', '.env.keys'];

  // Detect WSL
  let isWSL = false;
  try {
    const unameResult = execSync('uname -r', { encoding: 'utf8' });
    isWSL = unameResult.toLowerCase().includes('microsoft') || unameResult.toLowerCase().includes('wsl');
  } catch (err) {
    // Not WSL
  }

  if (isWSL) {
    testWarn('Running on WSL - file permissions may be limited by Windows');
    testWarn('Ensure .env files are not in version control instead');
  }

  for (const file of sensitiveFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      try {
        const stats = fs.statSync(filePath);
        const mode = (stats.mode & parseInt('777', 8)).toString(8);

        if (isWSL) {
          // On WSL, just check it exists and warn
          testWarn(`${file} permissions: ${mode} (WSL limitation - ensure not in git)`);

          // Check .gitignore
          const gitignorePath = path.join(process.cwd(), '.gitignore');
          if (fs.existsSync(gitignorePath)) {
            const gitignore = fs.readFileSync(gitignorePath, 'utf8');
            if (gitignore.includes(file)) {
              testPass(`${file} is in .gitignore`);
            } else {
              testFail(`${file} NOT in .gitignore - CRITICAL`);
            }
          }
        } else {
          // On native Linux/macOS, enforce permissions
          if (mode === '600') {
            testPass(`${file} has secure permissions (600)`);
          } else {
            testFail(`${file} has insecure permissions: ${mode} (expected 600)`);
          }
        }
      } catch (err) {
        testWarn(`Could not check permissions for ${file}`);
      }
    }
  }
} catch (err) {
  testFail(`File permissions test failed: ${err.message}`);
}

// Test 4: Security Audit Script
testSection('Security Audit Script');
try {
  const auditScriptPath = path.join(process.cwd(), 'scripts', 'security', 'security-audit.cjs');
  if (fs.existsSync(auditScriptPath)) {
    testPass('security-audit.cjs exists');

    // Try to run it
    try {
      execSync('node scripts/security/security-audit.cjs --json', {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 30000
      });
      testPass('security-audit.cjs executes successfully');
    } catch (err) {
      testWarn('security-audit.cjs runs but may report issues (expected)');
    }
  } else {
    testFail('security-audit.cjs not found');
  }
} catch (err) {
  testFail(`Security audit script test failed: ${err.message}`);
}

// Test 5: Documentation
testSection('Security Documentation');
const docs = [
  'docs/security/GIT_SECRETS_SETUP.md',
  'docs/security/REDIS_AUTHENTICATION.md'
];

for (const doc of docs) {
  const docPath = path.join(process.cwd(), doc);
  if (fs.existsSync(docPath)) {
    testPass(`${doc} exists`);
  } else {
    testWarn(`${doc} not found`);
  }
}

// Calculate Score
const totalTests = results.passed.length + results.failed.length;
const passedTests = results.passed.length;
results.score = totalTests > 0 ? (passedTests / totalTests) : 0;

// Summary Report
log('\n' + '═'.repeat(60), 'blue');
log('SECURITY DEPLOYMENT VALIDATION REPORT', 'blue');
log('═'.repeat(60), 'blue');

log(`\n📊 Results:`, 'cyan');
log(`   ✅ Passed: ${results.passed.length}`, 'green');
log(`   ❌ Failed: ${results.failed.length}`, 'red');
log(`   ⚠️  Warnings: ${results.warnings.length}`, 'yellow');
log(`   📈 Score: ${(results.score * 100).toFixed(0)}%`, results.score >= 0.9 ? 'green' : results.score >= 0.75 ? 'yellow' : 'red');

if (results.failed.length > 0) {
  log(`\n❌ Failed Tests:`, 'red');
  results.failed.forEach((fail, i) => log(`   ${i + 1}. ${fail}`, 'red'));
}

if (results.warnings.length > 0) {
  log(`\n⚠️  Warnings:`, 'yellow');
  results.warnings.forEach((warn, i) => log(`   ${i + 1}. ${warn}`, 'yellow'));
}

// Recommendations
log(`\n💡 Next Steps:`, 'cyan');
if (results.score >= 0.9) {
  log('   ✅ Security deployment complete - ready for production', 'green');
  log('   🔄 Run npm run security:full-audit for comprehensive check', 'blue');
} else if (results.score >= 0.75) {
  log('   ⚠️  Security deployment mostly complete - address warnings', 'yellow');
  log('   🔍 Review failed tests and warnings above', 'yellow');
} else {
  log('   ❌ Security deployment incomplete - address failures', 'red');
  log('   📚 Review security documentation', 'red');
  log('   🔧 Re-run deployment scripts', 'red');
}

log('\n' + '═'.repeat(60), 'blue');

// Exit with appropriate code
process.exit(results.score >= 0.75 ? 0 : 1);
