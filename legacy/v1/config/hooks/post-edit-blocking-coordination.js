#!/usr/bin/env node

/**
 * Blocking Coordination Validator Hook - Priority 4
 *
 * Validates coordinator-specific blocking coordination patterns with hybrid automation.
 *
 * Features:
 * - 60% automation through pattern detection
 * - 40% agent collaboration for semantic validation
 * - HMAC secret validation
 * - Signal ACK protocol completeness
 * - Timeout value reasonableness checks
 * - State machine complexity detection (requires agent review)
 *
 * Scope: Affects 12 coordinator agents
 * Automation: 60% (patterns) + 15% (agent collaboration via flag)
 * Execution Target: <2s for pattern detection
 *
 * Implementation: AGENT_HOOK_DELEGATION_RECOMMENDATIONS.md Priority 4
 *
 * @module config/hooks/post-edit-blocking-coordination
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ===== CONFIGURATION =====

const CONFIG = {
  // Pattern detection thresholds
  automation: {
    patternDetection: 0.60,      // 60% automatable via regex
    agentCollaboration: 0.15,    // 15% requires semantic understanding
    manualReview: 0.25,          // 25% requires domain knowledge
  },

  // Timeout value boundaries (milliseconds)
  timeouts: {
    minAckTimeout: 5000,         // 5 seconds
    maxAckTimeout: 60000,        // 60 seconds
    minHeartbeat: 10000,         // 10 seconds
    maxHeartbeat: 120000,        // 2 minutes
  },

  // Performance target
  maxExecutionTime: 2000,        // 2 seconds

  // State machine complexity thresholds
  complexity: {
    maxStates: 5,                // More than 5 states = complex
    maxTransitions: 10,          // More than 10 transitions = complex
    maxConditionals: 8,          // More than 8 conditionals = complex
  },
};

// ===== PATTERN DEFINITIONS =====

const PATTERNS = {
  // Required imports (60% automatable)
  requiredImports: {
    signals: /import\s+.*BlockingCoordinationSignals.*\s+from/m,
    timeoutHandler: /import\s+.*CoordinatorTimeoutHandler.*\s+from/m,
  },

  // Signal methods (pattern presence - 60% automatable)
  signalMethods: {
    sendSignal: /signals\.sendSignal\s*\(/m,
    waitForAck: /signals\.waitForAck\s*\(/m,
    receiveSignal: /signals\.receiveSignal\s*\(/m,
    sendAck: /signals\.sendAck\s*\(/m,
  },

  // HMAC secret (security critical - 60% automatable)
  hmacSecret: /process\.env\.BLOCKING_COORDINATION_SECRET/m,

  // Heartbeat patterns (60% automatable)
  heartbeat: {
    start: /timeoutHandler\.start(?:Monitoring)?\s*\(/m,
    record: /(?:timeoutHandler|heartbeat)\.record(?:Activity)?\s*\(/m,
  },

  // Timeout handling (pattern presence - 60% automatable)
  timeoutHandling: {
    check: /checkCoordinatorHealth|checkTimeout/m,
    handle: /handleTimeout|onTimeout|timeoutDetected/m,
    cleanup: /cleanup(?:Timeout)?Coordinator|cleanupDeadCoordinator/m,
  },

  // State machine indicators (complexity detection - requires agent)
  stateMachine: {
    stateEnum: /enum\s+\w*State\s*\{/m,
    stateVariable: /(?:current|coordinator)?State\s*[:=]/m,
    stateTransition: /setState|transition(?:To)?|changeState/m,
    conditionalLogic: /\b(?:if|switch|case)\b.*state/im,
  },

  // Timeout value extraction (for validation)
  timeoutValues: {
    ackTimeout: /(?:ack|ACK)(?:Timeout|TIMEOUT|_timeout)\s*[:\s=]\s*(?:number\s*=\s*)?(\d+)/gm,
    heartbeatInterval: /(?:heartbeat|HEARTBEAT)(?:Interval|INTERVAL|Timeout|TIMEOUT|_interval|_timeout)\s*[:\s=]\s*(?:number\s*=\s*)?(\d+)/gm,
    coordinatorTimeout: /(?:coordinator|COORDINATOR)(?:Timeout|TIMEOUT|_timeout)\s*[:\s=]\s*(?:number\s*=\s*)?(\d+)/gm,
  },
};

// ===== VALIDATION RESULT STRUCTURE =====

class ValidationResult {
  constructor() {
    this.validator = 'blocking-coordination-validator';
    this.file = '';
    this.valid = true;
    this.patterns = {
      requiredImports: false,
      signalMethods: false,
      hmacSecret: false,
      heartbeat: false,
      timeoutHandling: false,
    };
    this.warnings = [];
    this.recommendations = [];
    this.errors = [];
    this.needsAgentReview = false;
    this.agentReviewReasons = [];
    this.executionTime = 0;
    this.complexity = {
      states: 0,
      transitions: 0,
      conditionals: 0,
      score: 0,
    };
  }

  addWarning(type, message, line = null, needsAgentReview = false) {
    this.warnings.push({
      type,
      message,
      line,
      needsAgentReview,
    });

    if (needsAgentReview) {
      this.needsAgentReview = true;
      this.agentReviewReasons.push(message);
    }
  }

  addRecommendation(message, priority = 'medium') {
    this.recommendations.push({ message, priority });
  }

  addError(type, message, line = null) {
    this.errors.push({ type, message, line });
    this.valid = false;
  }

  toJSON() {
    return {
      validator: this.validator,
      file: this.file,
      valid: this.valid,
      patterns: this.patterns,
      warnings: this.warnings,
      errors: this.errors,
      recommendations: this.recommendations,
      needsAgentReview: this.needsAgentReview,
      agentReviewReasons: this.agentReviewReasons,
      complexity: this.complexity,
      executionTime: `${this.executionTime}ms`,
    };
  }
}

// ===== BLOCKING COORDINATION VALIDATOR CLASS =====

class BlockingCoordinationValidator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.json = options.json || false;
    this.spawnReviewer = options.spawnReviewer || false;
  }

  /**
   * Determine if file should be validated
   */
  shouldValidate(file, content) {
    // Check if file imports blocking-coordination-signals
    if (content.includes('BlockingCoordinationSignals')) {
      return true;
    }

    // Check if file is a coordinator (by filename or class name)
    const fileName = path.basename(file).toLowerCase();
    if (fileName.includes('coordinator')) {
      return true;
    }

    // Check if content has coordinator class/interface
    if (/class\s+\w*Coordinator|interface\s+\w*Coordinator/m.test(content)) {
      return true;
    }

    return false;
  }

  /**
   * Main validation entry point
   */
  async validate(file, content) {
    const startTime = Date.now();
    const result = new ValidationResult();
    result.file = file;

    try {
      // Check if this file should be validated
      if (!this.shouldValidate(file, content)) {
        if (this.verbose) {
          console.log(`ℹ️ Skipping ${path.basename(file)} - not a coordinator file`);
        }
        result.executionTime = Date.now() - startTime;
        return result;
      }

      if (this.verbose) {
        console.log(`🔍 Validating blocking coordination patterns in ${path.basename(file)}`);
      }

      // 1. Validate required imports (60% automation)
      this.validateRequiredImports(content, result);

      // 2. Validate signal methods (60% automation)
      this.validateSignalMethods(content, result);

      // 3. Validate HMAC secret (60% automation)
      this.validateHMACSecret(content, result);

      // 4. Validate heartbeat patterns (60% automation)
      this.validateHeartbeat(content, result);

      // 5. Validate timeout handling (60% automation)
      this.validateTimeoutHandling(content, result);

      // 6. Validate timeout values (60% automation)
      this.validateTimeoutValues(content, result);

      // 7. Detect state machine complexity (requires agent - 40%)
      this.detectStateMachineComplexity(content, result);

      // 8. Generate recommendations
      this.generateRecommendations(result);

      result.executionTime = Date.now() - startTime;

      // Check if execution time exceeded target
      if (result.executionTime > CONFIG.maxExecutionTime) {
        result.addWarning(
          'performance',
          `Validation took ${result.executionTime}ms (target: ${CONFIG.maxExecutionTime}ms)`,
          null,
          false
        );
      }

      return result;

    } catch (error) {
      result.addError('validation_error', `Validation failed: ${error.message}`);
      result.executionTime = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Validate required imports (60% automatable)
   */
  validateRequiredImports(content, result) {
    const hasSignalsImport = PATTERNS.requiredImports.signals.test(content);
    const hasTimeoutHandlerImport = PATTERNS.requiredImports.timeoutHandler.test(content);

    result.patterns.requiredImports = hasSignalsImport && hasTimeoutHandlerImport;

    if (!hasSignalsImport) {
      result.addError(
        'missing_import',
        'Missing required import: BlockingCoordinationSignals',
        this.findLineNumber(content, 'import')
      );
    }

    if (!hasTimeoutHandlerImport) {
      result.addWarning(
        'missing_import',
        'Missing recommended import: CoordinatorTimeoutHandler (required for long-running coordinators)',
        this.findLineNumber(content, 'import'),
        false
      );
    }
  }

  /**
   * Validate signal methods (60% automatable)
   */
  validateSignalMethods(content, result) {
    const hasSendSignal = PATTERNS.signalMethods.sendSignal.test(content);
    const hasWaitForAck = PATTERNS.signalMethods.waitForAck.test(content);
    const hasReceiveSignal = PATTERNS.signalMethods.receiveSignal.test(content);
    const hasSendAck = PATTERNS.signalMethods.sendAck.test(content);

    // Signal ACK protocol requires: send + wait + receive + ack
    const isComplete = hasSendSignal && hasWaitForAck && hasReceiveSignal && hasSendAck;
    result.patterns.signalMethods = isComplete;

    if (!isComplete) {
      const missing = [];
      if (!hasSendSignal) missing.push('sendSignal()');
      if (!hasWaitForAck) missing.push('waitForAck()');
      if (!hasReceiveSignal) missing.push('receiveSignal()');
      if (!hasSendAck) missing.push('sendAck()');

      result.addError(
        'incomplete_signal_protocol',
        `Incomplete Signal ACK protocol - missing: ${missing.join(', ')}`,
        this.findLineNumber(content, 'signals')
      );

      result.addRecommendation(
        'Complete Signal ACK protocol requires: sendSignal() + waitForAck() + receiveSignal() + sendAck()',
        'high'
      );
    }
  }

  /**
   * Validate HMAC secret (60% automatable)
   */
  validateHMACSecret(content, result) {
    const hasHMACSecret = PATTERNS.hmacSecret.test(content);
    result.patterns.hmacSecret = hasHMACSecret;

    if (!hasHMACSecret) {
      result.addError(
        'missing_hmac_secret',
        'All coordinator agents MUST use HMAC secret (process.env.BLOCKING_COORDINATION_SECRET)',
        this.findLineNumber(content, 'BlockingCoordinationSignals')
      );

      result.addRecommendation(
        'Add HMAC secret validation: const hmacSecret = process.env.BLOCKING_COORDINATION_SECRET; if (!hmacSecret) throw new Error(...)',
        'critical'
      );
    }
  }

  /**
   * Validate heartbeat patterns (60% automatable)
   */
  validateHeartbeat(content, result) {
    const hasHeartbeatStart = PATTERNS.heartbeat.start.test(content);
    const hasHeartbeatRecord = PATTERNS.heartbeat.record.test(content);

    result.patterns.heartbeat = hasHeartbeatStart || hasHeartbeatRecord;

    if (!hasHeartbeatStart && !hasHeartbeatRecord) {
      result.addWarning(
        'missing_heartbeat',
        'Long-running coordinators should start heartbeat monitoring (timeoutHandler.start())',
        null,
        false
      );

      result.addRecommendation(
        'Add heartbeat monitoring for coordinator health tracking',
        'medium'
      );
    }
  }

  /**
   * Validate timeout handling (60% automatable)
   */
  validateTimeoutHandling(content, result) {
    const hasCheck = PATTERNS.timeoutHandling.check.test(content);
    const hasHandle = PATTERNS.timeoutHandling.handle.test(content);
    const hasCleanup = PATTERNS.timeoutHandling.cleanup.test(content);

    result.patterns.timeoutHandling = hasCheck || hasHandle || hasCleanup;

    if (!hasHandle && (hasCheck || hasCleanup)) {
      result.addWarning(
        'incomplete_timeout_handling',
        'Timeout detection present but missing timeout handler implementation',
        this.findLineNumber(content, 'checkTimeout'),
        true
      );

      result.addRecommendation(
        'Implement handleTimeout() method to process detected timeouts',
        'high'
      );
    }
  }

  /**
   * Validate timeout values (60% automatable)
   */
  validateTimeoutValues(content, result) {
    // Extract all ACK timeout values
    const ackTimeoutMatches = [...content.matchAll(PATTERNS.timeoutValues.ackTimeout)];
    for (const match of ackTimeoutMatches) {
      const ackTimeout = parseInt(match[1], 10);

      if (ackTimeout < CONFIG.timeouts.minAckTimeout) {
        result.addWarning(
          'timeout_too_short',
          `ACK timeout ${ackTimeout}ms is less than recommended minimum ${CONFIG.timeouts.minAckTimeout}ms`,
          this.findLineNumber(content, match[0]),
          false
        );
      }

      if (ackTimeout > CONFIG.timeouts.maxAckTimeout) {
        result.addWarning(
          'timeout_too_long',
          `ACK timeout ${ackTimeout}ms exceeds recommended maximum ${CONFIG.timeouts.maxAckTimeout}ms`,
          this.findLineNumber(content, match[0]),
          false
        );

        result.addRecommendation(
          `Consider reducing ACK timeout to ${CONFIG.timeouts.maxAckTimeout}ms or less for faster failure detection`,
          'low'
        );
      }
    }

    // Extract all heartbeat interval values
    const heartbeatMatches = [...content.matchAll(PATTERNS.timeoutValues.heartbeatInterval)];
    for (const match of heartbeatMatches) {
      const heartbeatInterval = parseInt(match[1], 10);

      if (heartbeatInterval < CONFIG.timeouts.minHeartbeat) {
        result.addWarning(
          'heartbeat_too_frequent',
          `Heartbeat interval ${heartbeatInterval}ms is less than recommended minimum ${CONFIG.timeouts.minHeartbeat}ms (may cause excessive Redis load)`,
          this.findLineNumber(content, match[0]),
          false
        );
      }

      if (heartbeatInterval > CONFIG.timeouts.maxHeartbeat) {
        result.addWarning(
          'heartbeat_too_slow',
          `Heartbeat interval ${heartbeatInterval}ms exceeds recommended maximum ${CONFIG.timeouts.maxHeartbeat}ms (may delay timeout detection)`,
          this.findLineNumber(content, match[0]),
          false
        );
      }
    }
  }

  /**
   * Detect state machine complexity (requires agent review - 40%)
   */
  detectStateMachineComplexity(content, result) {
    const hasStateEnum = PATTERNS.stateMachine.stateEnum.test(content);
    const stateVariables = (content.match(/(?:current|coordinator)?State\s*[:=]/g) || []).length;
    const transitions = (content.match(/setState|transition|changeState/g) || []).length;
    const conditionals = (content.match(/\b(?:if|switch|case)\b.*state/gi) || []).length;

    result.complexity.states = stateVariables;
    result.complexity.transitions = transitions;
    result.complexity.conditionals = conditionals;
    result.complexity.score = (
      (stateVariables * 2) +
      (transitions * 1.5) +
      (conditionals * 1)
    );

    const isComplex = (
      stateVariables > CONFIG.complexity.maxStates ||
      transitions > CONFIG.complexity.maxTransitions ||
      conditionals > CONFIG.complexity.maxConditionals
    );

    if (isComplex) {
      result.addWarning(
        'complex_state_machine',
        `Complex state machine detected (states: ${stateVariables}, transitions: ${transitions}, conditionals: ${conditionals}) - recommend agent review for semantic validation`,
        this.findLineNumber(content, 'State'),
        true
      );

      result.addRecommendation(
        'Consider spawning reviewer agent for state machine validation using --spawn-reviewer flag',
        'high'
      );

      if (this.spawnReviewer) {
        result.addRecommendation(
          'Agent review will be triggered automatically due to --spawn-reviewer flag',
          'critical'
        );
      }
    }

    if (hasStateEnum && stateVariables === 0) {
      result.addWarning(
        'unused_state_enum',
        'State enum defined but no state variables found',
        this.findLineNumber(content, 'enum'),
        false
      );
    }
  }

  /**
   * Generate final recommendations
   */
  generateRecommendations(result) {
    // If all patterns pass, suggest optimization
    if (result.valid && result.warnings.length === 0) {
      result.addRecommendation(
        'All blocking coordination patterns validated successfully',
        'low'
      );
    }

    // If timeout values are missing, suggest adding them
    if (!result.patterns.heartbeat && result.patterns.requiredImports) {
      result.addRecommendation(
        'Consider adding heartbeat monitoring for long-running coordinators',
        'medium'
      );
    }

    // If state machine is complex, emphasize agent review
    if (result.needsAgentReview && !this.spawnReviewer) {
      result.addRecommendation(
        'Run with --spawn-reviewer flag to automatically trigger agent semantic validation',
        'high'
      );
    }

    // Sort recommendations by priority
    result.recommendations.sort((a, b) => {
      const priority = { critical: 0, high: 1, medium: 2, low: 3 };
      return priority[a.priority] - priority[b.priority];
    });
  }

  /**
   * Find line number for a pattern (best effort)
   */
  findLineNumber(content, pattern) {
    const lines = content.split('\n');
    const index = lines.findIndex(line => line.includes(pattern));
    return index >= 0 ? index + 1 : null;
  }

  /**
   * Format validation result for console output
   */
  formatResult(result) {
    const lines = [];

    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(`  Blocking Coordination Validator - ${path.basename(result.file)}`);
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');

    // Overall status
    if (result.valid) {
      lines.push('✅ Status: VALID');
    } else {
      lines.push('❌ Status: FAILED');
    }
    lines.push(`⏱️  Execution Time: ${result.executionTime}ms`);
    lines.push('');

    // Pattern validation results
    lines.push('📋 Pattern Validation:');
    lines.push(`  • Required Imports:     ${result.patterns.requiredImports ? '✅' : '❌'}`);
    lines.push(`  • Signal Methods:       ${result.patterns.signalMethods ? '✅' : '❌'}`);
    lines.push(`  • HMAC Secret:          ${result.patterns.hmacSecret ? '✅' : '❌'}`);
    lines.push(`  • Heartbeat:            ${result.patterns.heartbeat ? '✅' : '⚠️ '}`);
    lines.push(`  • Timeout Handling:     ${result.patterns.timeoutHandling ? '✅' : '⚠️ '}`);
    lines.push('');

    // Complexity metrics
    if (result.complexity.score > 0) {
      lines.push('📊 Complexity Metrics:');
      lines.push(`  • State Variables:      ${result.complexity.states}`);
      lines.push(`  • State Transitions:    ${result.complexity.transitions}`);
      lines.push(`  • Conditionals:         ${result.complexity.conditionals}`);
      lines.push(`  • Complexity Score:     ${result.complexity.score.toFixed(1)}`);
      lines.push('');
    }

    // Errors
    if (result.errors.length > 0) {
      lines.push('❌ Errors:');
      result.errors.forEach(error => {
        const lineInfo = error.line ? ` (line ${error.line})` : '';
        lines.push(`  • [${error.type}]${lineInfo} ${error.message}`);
      });
      lines.push('');
    }

    // Warnings
    if (result.warnings.length > 0) {
      lines.push('⚠️  Warnings:');
      result.warnings.forEach(warning => {
        const lineInfo = warning.line ? ` (line ${warning.line})` : '';
        const reviewFlag = warning.needsAgentReview ? ' 🤖' : '';
        lines.push(`  • [${warning.type}]${lineInfo}${reviewFlag} ${warning.message}`);
      });
      lines.push('');
    }

    // Agent review
    if (result.needsAgentReview) {
      lines.push('🤖 Agent Review Required:');
      result.agentReviewReasons.forEach(reason => {
        lines.push(`  • ${reason}`);
      });
      lines.push('');
      lines.push('  💡 Recommendation: Run with --spawn-reviewer flag to trigger automatic agent validation');
      lines.push('');
    }

    // Recommendations
    if (result.recommendations.length > 0) {
      lines.push('💡 Recommendations:');
      result.recommendations.forEach(rec => {
        const priority = rec.priority.toUpperCase();
        const icon = {
          critical: '🔴',
          high: '🟠',
          medium: '🟡',
          low: '🟢',
        }[rec.priority] || '⚪';
        lines.push(`  ${icon} [${priority}] ${rec.message}`);
      });
      lines.push('');
    }

    // Limitations
    lines.push('📝 Validation Limitations:');
    lines.push('  • Pattern detection:             60% automated');
    lines.push('  • State machine correctness:     Requires semantic understanding (agent review)');
    lines.push('  • Timeout appropriateness:       Requires domain knowledge (manual review)');
    lines.push('  • Protocol implementation:       Requires runtime testing');
    lines.push('');

    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');

    return lines.join('\n');
  }
}

// ===== CLI INTERFACE =====

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const options = {
    verbose: args.includes('--verbose'),
    json: args.includes('--json'),
    spawnReviewer: args.includes('--spawn-reviewer'),
  };

  // Get file path (first non-flag argument)
  const filePath = args.find(arg => !arg.startsWith('--'));

  if (!filePath) {
    console.error('Usage: post-edit-blocking-coordination.js <file> [--json] [--verbose] [--spawn-reviewer]');
    console.error('');
    console.error('Validates blocking coordination patterns in coordinator files');
    console.error('');
    console.error('Options:');
    console.error('  --json             Output results in JSON format');
    console.error('  --verbose          Enable verbose logging');
    console.error('  --spawn-reviewer   Trigger agent review for complex state machines');
    console.error('');
    console.error('Trigger Patterns:');
    console.error('  • Files importing BlockingCoordinationSignals');
    console.error('  • Files with "coordinator" in filename');
    console.error('  • Classes/interfaces named *Coordinator');
    console.error('');
    console.error('Validation Scope:');
    console.error('  • Required imports (BlockingCoordinationSignals, CoordinatorTimeoutHandler)');
    console.error('  • Signal ACK protocol completeness (send + wait + receive + ack)');
    console.error('  • HMAC secret environment variable usage');
    console.error('  • Heartbeat monitoring patterns');
    console.error('  • Timeout handling implementation');
    console.error('  • Timeout value reasonableness (5s-60s for ACK, 10s-120s for heartbeat)');
    console.error('  • State machine complexity (requires agent review if complex)');
    process.exit(1);
  }

  // Validate file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  // Read file content
  const content = fs.readFileSync(filePath, 'utf-8');

  // Create validator and run validation
  const validator = new BlockingCoordinationValidator(options);
  const result = await validator.validate(filePath, content);

  // Output results
  if (options.json) {
    console.log(JSON.stringify(result.toJSON(), null, 2));
  } else {
    console.log(validator.formatResult(result));
  }

  // Exit with appropriate code
  process.exit(result.valid ? 0 : 1);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  });
}

// ===== EXPORTS =====

export {
  BlockingCoordinationValidator,
  ValidationResult,
  PATTERNS,
  CONFIG,
};
