#!/usr/bin/env node

/**
 * Security Audit Script
 * Comprehensive security assessment for Claude Flow Novice
 *
 * Checks:
 * - Secrets management and file permissions
 * - API key validity and rotation status
 * - Redis authentication configuration
 * - Git-secrets installation
 * - Environment configuration
 *
 * Usage: node scripts/security/security-audit.js [--json] [--detailed]
 *
 * @security Phase 0 Debt Resolution
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load SecretsManager
const { getSecretsManager } = require('../../src/security/SecretsManager.cjs');

/**
 * Audit Report Structure
 */
const auditReport = {
  timestamp: new Date().toISOString(),
  overallScore: 0,
  status: 'UNKNOWN',
  categories: {
    secretsManagement: { score: 0, issues: [], recommendations: [] },
    authentication: { score: 0, issues: [], recommendations: [] },
    filePermissions: { score: 0, issues: [], recommendations: [] },
    gitSecurity: { score: 0, issues: [], recommendations: [] },
    apiKeys: { score: 0, issues: [], recommendations: [] },
    redisAuth: { score: 0, issues: [], recommendations: [] }
  },
  summary: {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0
  }
};

/**
 * Add issue to report
 */
function addIssue(category, severity, message, recommendation = null) {
  auditReport.categories[category].issues.push({
    severity,
    message,
    timestamp: new Date().toISOString()
  });

  if (recommendation) {
    auditReport.categories[category].recommendations.push(recommendation);
  }

  // Update summary
  auditReport.summary[severity.toLowerCase()]++;
}

/**
 * Calculate category score (0-100)
 */
function calculateCategoryScore(category) {
  const weights = {
    critical: 40,
    high: 30,
    medium: 20,
    low: 10,
    informational: 0
  };

  let deductions = 0;
  auditReport.categories[category].issues.forEach(issue => {
    deductions += weights[issue.severity.toLowerCase()] || 0;
  });

  const score = Math.max(0, 100 - deductions);
  auditReport.categories[category].score = score;
  return score;
}

/**
 * Check secrets management
 */
async function auditSecretsManagement() {
  console.log('🔍 Auditing secrets management...');

  try {
    const secretsManager = getSecretsManager();
    await secretsManager.initialize();

    // Check required secrets
    const required = secretsManager.config.validation.required;
    const missing = [];

    for (const key of required) {
      if (!secretsManager.getSecret(key)) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      addIssue(
        'secretsManagement',
        'HIGH',
        `Missing required secrets: ${missing.join(', ')}`,
        'Set all required API keys in .env file'
      );
    }

    // Check API key validity
    for (const key of required) {
      const value = secretsManager.getSecret(key);
      if (value && !secretsManager.validateApiKey(key, value)) {
        addIssue(
          'apiKeys',
          'HIGH',
          `Invalid format for ${key}`,
          `Verify ${key} format matches expected pattern`
        );
      }
    }

    // Check rotation status
    const needRotation = await secretsManager.checkRotationRequired();
    if (needRotation.length > 0) {
      addIssue(
        'apiKeys',
        'MEDIUM',
        `Keys need rotation (90+ days): ${needRotation.join(', ')}`,
        'Run: node scripts/security/rotate-api-keys.js'
      );
    }

    console.log('✅ Secrets management audit complete');
  } catch (error) {
    addIssue(
      'secretsManagement',
      'CRITICAL',
      `Secrets manager initialization failed: ${error.message}`,
      'Fix secrets manager configuration'
    );
  }
}

/**
 * Check file permissions
 */
function auditFilePermissions() {
  console.log('🔍 Auditing file permissions...');

  const sensitiveFiles = [
    { path: '.env', expectedMode: '600' },
    { path: '.env.keys', expectedMode: '600' },
    { path: 'memory/security', expectedMode: '700', isDir: true }
  ];

  for (const file of sensitiveFiles) {
    const fullPath = path.join(process.cwd(), file.path);

    if (!fs.existsSync(fullPath)) {
      if (file.path === '.env') {
        addIssue(
          'filePermissions',
          'CRITICAL',
          '.env file not found',
          'Create .env file from .env.secure.template'
        );
      }
      continue;
    }

    const stats = fs.statSync(fullPath);
    const mode = (stats.mode & 0o777).toString(8);

    if (mode !== file.expectedMode) {
      const severity = file.path === '.env' ? 'HIGH' : 'MEDIUM';
      addIssue(
        'filePermissions',
        severity,
        `${file.path} has insecure permissions: ${mode} (expected ${file.expectedMode})`,
        `chmod ${file.expectedMode} ${file.path}`
      );
    }
  }

  console.log('✅ File permissions audit complete');
}

/**
 * Check Git security
 */
function auditGitSecurity() {
  console.log('🔍 Auditing Git security...');

  // Check if git-secrets is installed
  try {
    execSync('git secrets --list', { stdio: 'pipe' });
    console.log('   ✅ git-secrets is installed');
  } catch (error) {
    addIssue(
      'gitSecurity',
      'HIGH',
      'git-secrets is not installed',
      'Run: bash scripts/security/install-git-secrets.sh'
    );
  }

  // Check if pre-commit hook exists
  const preCommitHook = path.join(process.cwd(), '.git', 'hooks', 'pre-commit');
  if (!fs.existsSync(preCommitHook)) {
    addIssue(
      'gitSecurity',
      'MEDIUM',
      'Pre-commit hook not found',
      'Install git-secrets to enable pre-commit hooks'
    );
  } else {
    // Check if hook is executable
    const stats = fs.statSync(preCommitHook);
    if (!(stats.mode & 0o111)) {
      addIssue(
        'gitSecurity',
        'MEDIUM',
        'Pre-commit hook is not executable',
        `chmod +x ${preCommitHook}`
      );
    }
  }

  // Check .gitignore includes .env
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    if (!gitignore.includes('.env')) {
      addIssue(
        'gitSecurity',
        'CRITICAL',
        '.env is not in .gitignore',
        'Add .env to .gitignore immediately'
      );
    }
  }

  console.log('✅ Git security audit complete');
}

/**
 * Check Redis authentication
 */
function auditRedisAuth() {
  console.log('🔍 Auditing Redis authentication...');

  // Check if REDIS_PASSWORD is set
  const redisPassword = process.env.REDIS_PASSWORD;

  if (!redisPassword) {
    addIssue(
      'redisAuth',
      'CRITICAL',
      'REDIS_PASSWORD not configured',
      'Run: bash scripts/security/setup-redis-auth.sh'
    );
    return;
  }

  // Check password strength
  if (redisPassword.length < 32) {
    addIssue(
      'redisAuth',
      'HIGH',
      `Redis password too short: ${redisPassword.length} characters (minimum 32)`,
      'Generate stronger password with rotate-api-keys.js'
    );
  }

  // Test Redis connection (if Redis is available)
  try {
    const redis = require('redis');
    const client = redis.createClient({
      host: 'localhost',
      port: 6379,
      password: redisPassword
    });

    client.on('connect', () => {
      console.log('   ✅ Redis authentication successful');
      client.quit();
    });

    client.on('error', (err) => {
      if (err.message.includes('NOAUTH') || err.message.includes('invalid password')) {
        addIssue(
          'redisAuth',
          'CRITICAL',
          'Redis authentication failed - password mismatch',
          'Verify REDIS_PASSWORD matches redis.conf requirepass'
        );
      }
    });
  } catch (error) {
    addIssue(
      'redisAuth',
      'LOW',
      'Could not test Redis connection (Redis may not be installed)',
      null
    );
  }

  console.log('✅ Redis authentication audit complete');
}

/**
 * Check authentication configuration
 */
function auditAuthentication() {
  console.log('🔍 Auditing authentication configuration...');

  const nodeEnv = process.env.NODE_ENV || 'development';

  if (nodeEnv === 'production') {
    // Check production security settings
    const securitySettings = [
      { key: 'CFN_ENABLE_AGENT_AUTH', expected: 'true' },
      { key: 'CFN_ENABLE_TLS', expected: 'true' },
      { key: 'CFN_ENABLE_RATE_LIMITING', expected: 'true' }
    ];

    for (const setting of securitySettings) {
      if (process.env[setting.key] !== setting.expected) {
        addIssue(
          'authentication',
          'HIGH',
          `${setting.key} should be '${setting.expected}' in production`,
          `Set ${setting.key}=${setting.expected} in .env`
        );
      }
    }
  }

  // Check for default/weak tokens
  const dangerousDefaults = [
    { key: 'CFN_AGENT_AUTH_TOKEN', value: 'your-secret-token-here' },
    { key: 'JWT_SECRET', value: 'secret' },
    { key: 'SESSION_SECRET', value: 'secret' }
  ];

  for (const check of dangerousDefaults) {
    if (process.env[check.key] === check.value) {
      addIssue(
        'authentication',
        'CRITICAL',
        `${check.key} is using default/weak value`,
        `Generate strong secret for ${check.key}`
      );
    }
  }

  console.log('✅ Authentication audit complete');
}

/**
 * Generate audit report
 */
function generateReport(args) {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('           SECURITY AUDIT REPORT');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Generated: ${auditReport.timestamp}`);
  console.log('');

  // Calculate scores
  const categories = Object.keys(auditReport.categories);
  const scores = categories.map(cat => calculateCategoryScore(cat));
  auditReport.overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // Determine status
  if (auditReport.summary.critical > 0) {
    auditReport.status = 'CRITICAL';
  } else if (auditReport.summary.high > 0) {
    auditReport.status = 'WARNING';
  } else if (auditReport.summary.medium > 0) {
    auditReport.status = 'ATTENTION';
  } else {
    auditReport.status = 'GOOD';
  }

  // Overall status
  const statusColors = {
    CRITICAL: '\x1b[31m', // Red
    WARNING: '\x1b[33m',  // Yellow
    ATTENTION: '\x1b[36m', // Cyan
    GOOD: '\x1b[32m'      // Green
  };

  const statusColor = statusColors[auditReport.status] || '\x1b[37m';
  console.log(`Status: ${statusColor}${auditReport.status}\x1b[0m`);
  console.log(`Overall Score: ${auditReport.overallScore}/100`);
  console.log('');

  // Issue summary
  console.log('ISSUE SUMMARY:');
  console.log(`  Critical: ${auditReport.summary.critical}`);
  console.log(`  High:     ${auditReport.summary.high}`);
  console.log(`  Medium:   ${auditReport.summary.medium}`);
  console.log(`  Low:      ${auditReport.summary.low}`);
  console.log('');

  // Category scores
  if (args.detailed) {
    console.log('CATEGORY SCORES:');
    for (const category of categories) {
      const score = auditReport.categories[category].score;
      const scoreColor = score >= 80 ? '\x1b[32m' : score >= 60 ? '\x1b[33m' : '\x1b[31m';
      console.log(`  ${category.padEnd(20)}: ${scoreColor}${score}/100\x1b[0m`);
    }
    console.log('');
  }

  // Issues by category
  for (const category of categories) {
    const cat = auditReport.categories[category];
    if (cat.issues.length === 0) continue;

    console.log(`\n${category.toUpperCase()}:`);
    cat.issues.forEach((issue, i) => {
      const severityColor = issue.severity === 'CRITICAL' ? '\x1b[31m' :
                           issue.severity === 'HIGH' ? '\x1b[33m' :
                           issue.severity === 'MEDIUM' ? '\x1b[36m' : '\x1b[37m';

      console.log(`  ${i + 1}. [${severityColor}${issue.severity}\x1b[0m] ${issue.message}`);
    });
  }

  // Recommendations
  console.log('\n');
  console.log('RECOMMENDATIONS:');

  let recNum = 1;
  for (const category of categories) {
    const cat = auditReport.categories[category];
    if (cat.recommendations.length === 0) continue;

    cat.recommendations.forEach(rec => {
      console.log(`  ${recNum}. ${rec}`);
      recNum++;
    });
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');

  // Save report to file
  const reportPath = path.join(process.cwd(), 'memory', 'security', 'audit-report.json');
  const reportDir = path.dirname(reportPath);

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true, mode: 0o700 });
  }

  fs.writeFileSync(reportPath, JSON.stringify(auditReport, null, 2), { mode: 0o600 });
  console.log(`📄 Report saved to: ${reportPath}`);

  // Return exit code based on status
  if (auditReport.summary.critical > 0) {
    return 2;
  } else if (auditReport.summary.high > 0) {
    return 1;
  }
  return 0;
}

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = {
    json: false,
    detailed: false
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--json') args.json = true;
    if (arg === '--detailed') args.detailed = true;
  }

  return args;
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          Claude Flow Novice - Security Audit                ║');
  console.log('║                Phase 0 Debt Resolution                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    // Run all audit checks
    await auditSecretsManagement();
    auditFilePermissions();
    auditGitSecurity();
    auditRedisAuth();
    auditAuthentication();

    // Generate and display report
    const exitCode = generateReport(args);

    // JSON output
    if (args.json) {
      console.log('\nJSON OUTPUT:');
      console.log(JSON.stringify(auditReport, null, 2));
    }

    process.exit(exitCode);
  } catch (error) {
    console.error('\n❌ Audit failed:', error.message);
    console.error(error.stack);
    process.exit(3);
  }
}

// Run main function
main();
