#!/usr/bin/env node

/**
 * CFN Loop Memory Pattern Validator Hook
 *
 * Validates ACL correctness and memory key format for CFN Loop operations.
 * 90% automation with deterministic matching rules.
 *
 * Usage:
 *   node config/hooks/post-edit-cfn-loop-memory.js <file> [--json] [--verbose]
 *   ./config/hooks/post-edit-cfn-loop-memory.js <file> --json
 */

const fs = require('fs');
const path = require('path');

// ACL Rules with deterministic mapping (90% automation)
const ACL_RULES = {
  // Loop 3: Agent-level private data (30 days retention)
  'cfn/phase-.*/loop3/.*': {
    requiredACL: 1,
    name: 'Private',
    ttl: 2592000, // 30 days in seconds
    description: 'Loop 3 agent implementation data',
    encryption: true // Must be encrypted
  },

  // Loop 2: Swarm-level validation data (90 days retention)
  'cfn/phase-.*/loop2/.*': {
    requiredACL: 3,
    name: 'Swarm',
    ttl: 7776000, // 90 days in seconds
    description: 'Loop 2 validator consensus data',
    encryption: false
  },

  // Loop 4: Project-level decisions (365 days retention - compliance)
  'cfn/phase-.*/loop4/.*': {
    requiredACL: 4,
    name: 'Project',
    ttl: 31536000, // 365 days in seconds
    description: 'Loop 4 Product Owner decisions',
    encryption: false,
    compliance: true // Compliance-critical data
  },

  // Phase-level metadata (180 days retention)
  'cfn/phase-.*/metadata': {
    requiredACL: 4,
    name: 'Project',
    ttl: 15552000, // 180 days
    description: 'Phase metadata and state',
    encryption: false
  },

  // Sprint/Epic level (365 days - long-term retention)
  'cfn/sprint-.*/.*': {
    requiredACL: 5,
    name: 'Team',
    ttl: 31536000, // 365 days
    description: 'Sprint-level coordination',
    encryption: false
  },

  'cfn/epic-.*/.*': {
    requiredACL: 5,
    name: 'Team',
    ttl: 31536000, // 365 days
    description: 'Epic-level orchestration',
    encryption: false
  }
};

// Pattern detection for memory operations
const PATTERNS = {
  // Match: sqlite.memoryAdapter.set('key', value, { aclLevel: N, ttl: X })
  memorySet: /(?:sqlite\.memoryAdapter|memory)\.set\(\s*['"`]([^'"]+)['"`][^)]*(?:aclLevel|acl)[:\s]+(\d+)[^)]*(?:ttl)[:\s]+(\d+)/gs,

  // Match: memory.set with encryption flag
  memorySetEncryption: /(?:sqlite\.memoryAdapter|memory)\.set\(\s*['"`]([^'"]+)['"`][^)]*encrypt(?:ed)?[:\s]+(true|false)/gs,

  // Alternative pattern: { key: 'cfn/...', aclLevel: N, ttl: X }
  objectPattern: /\{\s*key[:\s]+['"`](cfn\/[^'"]+)['"`][^}]*(?:aclLevel|acl)[:\s]+(\d+)[^}]*(?:ttl)[:\s]+(\d+)/gs,

  // Match: cfn/phase-X/loopN/ memory keys
  cfnKeyFormat: /cfn\/(?:phase|sprint|epic)-[^\/]+\/(?:loop\d+|metadata)/g
};

class CFNLoopMemoryValidator {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.options = options;
    this.violations = [];
    this.warnings = [];
    this.validations = [];
    this.executionStart = Date.now();
  }

  /**
   * Main validation entry point
   */
  async validate() {
    try {
      // Check if file exists and is readable
      if (!fs.existsSync(this.filePath)) {
        return this.createResult(true, 'File not found - skipping validation');
      }

      const content = fs.readFileSync(this.filePath, 'utf8');

      // Quick check: Skip if no CFN memory patterns found
      if (!this.shouldValidate(content)) {
        return this.createResult(true, 'No CFN Loop memory patterns detected');
      }

      // Extract and validate all memory operations
      this.extractMemoryOperations(content);

      // Validate each operation
      this.validations.forEach(validation => {
        this.validateACL(validation);
        this.validateTTL(validation);
        this.validateEncryption(validation);
        this.validateKeyFormat(validation);
      });

      const valid = this.violations.length === 0;
      return this.createResult(valid);

    } catch (error) {
      return this.createResult(false, `Validation error: ${error.message}`);
    }
  }

  /**
   * Check if file should be validated
   */
  shouldValidate(content) {
    // Check for CFN Loop patterns
    return (
      content.includes('memory.set') ||
      content.includes('memoryAdapter.set') ||
      PATTERNS.cfnKeyFormat.test(content) ||
      /cfn\/(?:phase|sprint|epic)/.test(content)
    );
  }

  /**
   * Extract all memory operations from content
   */
  extractMemoryOperations(content) {
    const lines = content.split('\n');

    // Extract using memorySet pattern
    let match;
    PATTERNS.memorySet.lastIndex = 0;

    while ((match = PATTERNS.memorySet.exec(content)) !== null) {
      const [fullMatch, key, aclLevel, ttl] = match;
      const lineNumber = this.getLineNumber(content, match.index);

      this.validations.push({
        key,
        aclLevel: parseInt(aclLevel, 10),
        ttl: parseInt(ttl, 10),
        line: lineNumber,
        context: this.getLineContext(lines, lineNumber),
        encrypted: this.checkEncryption(content, key)
      });
    }

    // Extract using object pattern
    PATTERNS.objectPattern.lastIndex = 0;

    while ((match = PATTERNS.objectPattern.exec(content)) !== null) {
      const [fullMatch, key, aclLevel, ttl] = match;
      const lineNumber = this.getLineNumber(content, match.index);

      // Avoid duplicates
      const exists = this.validations.some(v => v.key === key && v.line === lineNumber);
      if (!exists) {
        this.validations.push({
          key,
          aclLevel: parseInt(aclLevel, 10),
          ttl: parseInt(ttl, 10),
          line: lineNumber,
          context: this.getLineContext(lines, lineNumber),
          encrypted: this.checkEncryption(content, key)
        });
      }
    }
  }

  /**
   * Check if memory key has encryption flag
   */
  checkEncryption(content, key) {
    const encryptPattern = new RegExp(
      `['"\`]${this.escapeRegex(key)}['"\`][^}]*encrypt(?:ed)?[:\\s]+(true|false)`,
      'i'
    );
    const match = content.match(encryptPattern);
    return match ? match[1] === 'true' : null;
  }

  /**
   * Validate ACL level against rules
   */
  validateACL(validation) {
    const rule = this.matchRule(validation.key);

    if (!rule) {
      this.warnings.push({
        type: 'unknown_pattern',
        severity: 'warning',
        line: validation.line,
        key: validation.key,
        message: `Memory key does not match known CFN Loop patterns`,
        recommendation: 'Verify key format: cfn/phase-{id}/loop{N}/...'
      });
      return;
    }

    if (validation.aclLevel !== rule.requiredACL) {
      this.violations.push({
        type: 'acl_mismatch',
        severity: 'error',
        line: validation.line,
        key: validation.key,
        expected: {
          acl: rule.requiredACL,
          name: rule.name
        },
        actual: {
          acl: validation.aclLevel
        },
        recommendation: `${rule.description} must use ACL Level ${rule.requiredACL} (${rule.name})`
      });
    }
  }

  /**
   * Validate TTL against retention policy
   */
  validateTTL(validation) {
    const rule = this.matchRule(validation.key);

    if (!rule) return;

    // Allow some flexibility (±10% tolerance for millisecond conversions)
    const tolerance = rule.ttl * 0.1;
    const minTTL = rule.ttl - tolerance;
    const maxTTL = rule.ttl + tolerance;

    if (validation.ttl < minTTL || validation.ttl > maxTTL) {
      const severity = rule.compliance ? 'error' : 'warning';

      this.violations.push({
        type: 'ttl_mismatch',
        severity,
        line: validation.line,
        key: validation.key,
        expected: {
          ttl: rule.ttl,
          days: Math.floor(rule.ttl / 86400)
        },
        actual: {
          ttl: validation.ttl,
          days: Math.floor(validation.ttl / 86400)
        },
        recommendation: rule.compliance
          ? `${rule.description} requires ${Math.floor(rule.ttl / 86400)}-day retention (compliance requirement)`
          : `Recommended TTL: ${rule.ttl}s (${Math.floor(rule.ttl / 86400)} days) for ${rule.description}`
      });
    }
  }

  /**
   * Validate encryption for sensitive data
   */
  validateEncryption(validation) {
    const rule = this.matchRule(validation.key);

    if (!rule || !rule.encryption) return;

    if (validation.encrypted === false) {
      this.violations.push({
        type: 'encryption_missing',
        severity: 'error',
        line: validation.line,
        key: validation.key,
        recommendation: `${rule.description} (ACL Level ${rule.requiredACL}) must be encrypted`
      });
    } else if (validation.encrypted === null) {
      this.warnings.push({
        type: 'encryption_unknown',
        severity: 'warning',
        line: validation.line,
        key: validation.key,
        message: 'Cannot determine encryption status',
        recommendation: `Verify encryption flag for ${rule.description}`
      });
    }
  }

  /**
   * Validate memory key format
   */
  validateKeyFormat(validation) {
    // Valid formats:
    // - cfn/phase-{id}/loop{N}/{data}
    // - cfn/phase-{id}/metadata
    // - cfn/sprint-{id}/{data}
    // - cfn/epic-{id}/{data}

    const validFormats = [
      /^cfn\/phase-[a-z0-9-]+\/loop[1-4]\/[\w-]+$/,
      /^cfn\/phase-[a-z0-9-]+\/metadata$/,
      /^cfn\/sprint-[a-z0-9-]+\/[\w-/]+$/,
      /^cfn\/epic-[a-z0-9-]+\/[\w-/]+$/
    ];

    const isValid = validFormats.some(pattern => pattern.test(validation.key));

    if (!isValid) {
      this.violations.push({
        type: 'invalid_key_format',
        severity: 'error',
        line: validation.line,
        key: validation.key,
        recommendation: 'Memory key must follow CFN Loop format: cfn/{type}-{id}/loop{N}/{data} or cfn/{type}-{id}/metadata'
      });
    }
  }

  /**
   * Match memory key against ACL rules
   */
  matchRule(key) {
    for (const [pattern, rule] of Object.entries(ACL_RULES)) {
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(key)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Get line number from character index
   */
  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Get context around line number
   */
  getLineContext(lines, lineNumber) {
    const start = Math.max(0, lineNumber - 2);
    const end = Math.min(lines.length, lineNumber + 1);
    return lines.slice(start, end).join('\n');
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Create validation result
   */
  createResult(valid, skipReason = null) {
    const executionTime = Date.now() - this.executionStart;

    const result = {
      validator: 'cfn-loop-memory-validator',
      file: this.filePath,
      valid,
      executionTime: `${executionTime}ms`
    };

    if (skipReason) {
      result.skipped = true;
      result.reason = skipReason;
    } else {
      result.violations = this.violations;
      result.warnings = this.warnings;
      result.validationCount = this.validations.length;

      if (this.options.verbose) {
        result.validations = this.validations;
        result.rules = ACL_RULES;
      }
    }

    return result;
  }
}

/**
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
CFN Loop Memory Pattern Validator

Usage:
  node config/hooks/post-edit-cfn-loop-memory.js <file> [options]

Options:
  --json        Output JSON format
  --verbose     Include detailed validation data
  --help        Show this help message

Examples:
  node config/hooks/post-edit-cfn-loop-memory.js src/cfn-loop/coordinator.ts
  node config/hooks/post-edit-cfn-loop-memory.js src/cfn-loop/coordinator.ts --json
  node config/hooks/post-edit-cfn-loop-memory.js src/cfn-loop/coordinator.ts --verbose --json

ACL Rules:
  Loop 3 (Private):  ACL 1, 30-day retention, encrypted
  Loop 2 (Swarm):    ACL 3, 90-day retention
  Loop 4 (Project):  ACL 4, 365-day retention (compliance)
    `);
    process.exit(0);
  }

  const filePath = args.find(arg => !arg.startsWith('--'));
  const options = {
    json: args.includes('--json'),
    verbose: args.includes('--verbose')
  };

  if (!filePath) {
    console.error('Error: File path required');
    process.exit(1);
  }

  const validator = new CFNLoopMemoryValidator(filePath, options);
  const result = await validator.validate();

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Human-readable output
    console.log(`\n${'='.repeat(60)}`);
    console.log(`CFN Loop Memory Validator - ${path.basename(filePath)}`);
    console.log('='.repeat(60));

    if (result.skipped) {
      console.log(`\n✓ ${result.reason}`);
    } else {
      console.log(`\nValidations: ${result.validationCount}`);
      console.log(`Status: ${result.valid ? '✓ PASS' : '✗ FAIL'}`);

      if (result.violations.length > 0) {
        console.log(`\nViolations (${result.violations.length}):`);
        result.violations.forEach((v, i) => {
          console.log(`\n${i + 1}. [${v.severity.toUpperCase()}] ${v.type} (line ${v.line})`);
          console.log(`   Key: ${v.key}`);
          if (v.expected) {
            console.log(`   Expected: ${JSON.stringify(v.expected)}`);
          }
          if (v.actual) {
            console.log(`   Actual: ${JSON.stringify(v.actual)}`);
          }
          console.log(`   → ${v.recommendation}`);
        });
      }

      if (result.warnings.length > 0) {
        console.log(`\nWarnings (${result.warnings.length}):`);
        result.warnings.forEach((w, i) => {
          console.log(`\n${i + 1}. [WARNING] ${w.type} (line ${w.line})`);
          console.log(`   Key: ${w.key}`);
          console.log(`   → ${w.recommendation || w.message}`);
        });
      }
    }

    console.log(`\nExecution time: ${result.executionTime}`);
    console.log('='.repeat(60));
  }

  // Exit with error code if validation failed
  process.exit(result.valid ? 0 : 1);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { CFNLoopMemoryValidator, ACL_RULES };
