#!/usr/bin/env node

/**
 * Layer 3: Realistic Error Handling & Retry Test with Z.ai
 *
 * Architecture:
 * - 2 error-prone implementer coordinators using SwarmCoordinator
 * - Real Z.ai LLM calls for file generation
 * - Real file generation (70 Hello World files)
 * - 50% error injection AFTER file generation (file corruption)
 * - Fresh agent spawning via SwarmCoordinator for retries
 * - Max 10 retries per file with exponential backoff
 * - Final validation pass to ensure all 70 files are correct
 *
 * Error Injection Strategy:
 * 1. Generate file normally via SwarmCoordinator + Z.ai
 * 2. After generation, inject error if shouldFail(50%)
 * 3. Modify the generated file to inject error
 * 4. Mark for retry
 * 5. Retry with fresh SwarmCoordinator instance
 *
 * Error Types:
 * - SyntaxError (35%): Remove semicolon, add typo in keyword
 * - LogicError (35%): Change output format ("World, Hello" instead)
 * - TranslationError (20%): Replace unicode with \uFFFD
 * - MixedError (10%): Combine multiple issues
 *
 * Success Criteria:
 * - 50% initial error rate (±10% tolerance)
 * - Error distribution matches probabilities (±15% tolerance)
 * - All 70 files pass after retries
 * - Max retries per file ≤10
 * - Avg retries per file ≤4
 * - 100% final success rate
 *
 * Expected Runtime: 10-15 minutes (70 initial + ~35 retries × 4s per Z.ai call)
 */

import { SwarmCoordinator } from '../../.claude-flow-novice/dist/src/coordination/swarm-coordinator.js';
import { ConfigManager } from '../../.claude-flow-novice/dist/src/config/config-manager.js';
import { Logger } from '../../.claude-flow-novice/dist/src/core/logger.js';
import { createClient } from 'redis';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Load .env
const envPath = path.join(__dirname, '../../.env');
try {
  const envContent = await fs.readFile(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
} catch (error) {
  console.error('Warning: Could not load .env file');
}

if (!process.env.Z_AI_API_KEY) {
  console.error('❌ Z_AI_API_KEY not found in .env');
  process.exit(1);
}

// Test configuration
const LANGUAGES = ['JavaScript', 'Python', 'Ruby', 'Go', 'Rust', 'Java', 'TypeScript'];
const TRANSLATIONS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Chinese', 'Japanese', 'Arabic', 'Hindi'];
const FILE_EXTENSIONS = {
  'JavaScript': 'js',
  'Python': 'py',
  'Ruby': 'rb',
  'Go': 'go',
  'Rust': 'rs',
  'Java': 'java',
  'TypeScript': 'ts'
};
const OUTPUT_DIR = path.join(__dirname, '../../test-results/hello-world');
const FILES_DIR = path.join(OUTPUT_DIR, 'layer3-realistic-files');
const RESULTS_FILE = path.join(OUTPUT_DIR, 'layer3-realistic-results.json');
const ERROR_RATE = 0.5;
const MAX_RETRIES = 10;

// Error type configuration
const ERROR_TYPES = {
  SYNTAX: {
    name: 'SyntaxError',
    probability: 0.35,
    inject: async (filePath, content) => {
      // Remove semicolons or add typos
      let corrupted = content.replace(/;/g, ''); // Remove all semicolons
      corrupted = corrupted.replace(/function/g, 'functon'); // Typo in keyword
      corrupted = corrupted.replace(/const/g, 'cnst'); // Typo in const
      await fs.writeFile(filePath, corrupted);
      return {
        error: 'SyntaxError',
        message: 'Removed semicolons and added keyword typos',
        modifications: ['removed semicolons', 'function->functon', 'const->cnst']
      };
    }
  },
  LOGIC: {
    name: 'LogicError',
    probability: 0.35,
    inject: async (filePath, content) => {
      // Change output format
      let corrupted = content.replace(/Hello.*World/gi, 'World, Hello');
      corrupted = corrupted.replace(/Hello/gi, 'Goodbye');
      await fs.writeFile(filePath, corrupted);
      return {
        error: 'LogicError',
        message: 'Incorrect output format',
        modifications: ['Hello World -> World, Hello', 'Hello -> Goodbye']
      };
    }
  },
  TRANSLATION: {
    name: 'TranslationError',
    probability: 0.20,
    inject: async (filePath, content) => {
      // Replace unicode with replacement character
      let corrupted = content.replace(/[\u0080-\uFFFF]/g, '\uFFFD');
      await fs.writeFile(filePath, corrupted);
      return {
        error: 'TranslationError',
        message: 'Invalid Unicode characters (replacement character \uFFFD)',
        modifications: ['replaced non-ASCII with \uFFFD']
      };
    }
  },
  MIXED: {
    name: 'MixedError',
    probability: 0.10,
    inject: async (filePath, content) => {
      // Combine multiple issues
      let corrupted = content.replace(/;/g, ''); // Syntax
      corrupted = corrupted.replace(/Hello/gi, 'Goodbye'); // Logic
      corrupted = corrupted.replace(/[\u0080-\uFFFF]/g, '\uFFFD'); // Translation
      await fs.writeFile(filePath, corrupted);
      return {
        error: 'MixedError',
        message: 'Multiple issues detected',
        modifications: ['removed semicolons', 'Hello->Goodbye', 'corrupted unicode']
      };
    }
  }
};

// Redis key patterns
const RedisKeys = {
  claim: (combo) => `coordination:claims:claimed:${combo}`,
  timeline: 'coordination:timeline',
  errorsInjected: 'coordination:errors:injected',
  retriesCount: 'coordination:retries:count',
  retriesLog: 'coordination:retries:log',
  validationResults: 'coordination:validation:results'
};

// Create logger
const logger = new Logger(
  { level: 'info', format: 'text', destination: 'console' },
  { component: 'Layer3RealisticTest' }
);

/**
 * Generate all 70 combinations
 */
function generateCombinations() {
  const combos = [];
  for (const lang of LANGUAGES) {
    for (const trans of TRANSLATIONS) {
      combos.push({ language: lang, translation: trans });
    }
  }
  return combos;
}

/**
 * Split combinations between two coordinators
 */
function splitCombinations(combos) {
  const shuffled = [...combos].sort(() => Math.random() - 0.5);
  const mid = Math.ceil(shuffled.length / 2);
  return [shuffled.slice(0, mid), shuffled.slice(mid)];
}

/**
 * Get output file path for combination
 */
function getOutputPath(combo) {
  const ext = FILE_EXTENSIONS[combo.language];
  return path.join(FILES_DIR, `${combo.language.toLowerCase()}-${combo.translation.toLowerCase()}.${ext}`);
}

/**
 * Select error type based on weighted probabilities
 */
function selectErrorType() {
  const rand = Math.random();
  let cumulative = 0;

  for (const [typeName, config] of Object.entries(ERROR_TYPES)) {
    cumulative += config.probability;
    if (rand < cumulative) {
      return config;
    }
  }

  return ERROR_TYPES.SYNTAX;
}

/**
 * Validate file content
 */
async function validateFile(filePath, combo) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Check file exists and has content
    if (!content || content.length < 10) {
      return { valid: false, reason: 'File too short or empty' };
    }

    // Check for Hello World message
    const hasHello = /hello/i.test(content);
    const hasWorld = /world/i.test(content);

    if (!hasHello || !hasWorld) {
      return { valid: false, reason: 'Missing Hello World message' };
    }

    // Check for error markers
    if (content.includes('\uFFFD')) {
      return { valid: false, reason: 'Contains replacement character \uFFFD' };
    }

    if (content.includes('functon') || content.includes('cnst')) {
      return { valid: false, reason: 'Contains syntax typos' };
    }

    if (/goodbye/i.test(content) && !/hello/i.test(content)) {
      return { valid: false, reason: 'Incorrect greeting (Goodbye instead of Hello)' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, reason: `File read error: ${error.message}` };
  }
}

/**
 * Process combinations with error injection
 */
async function processWithErrorInjection(coordinatorId, swarmCoordinator, combinations, redis, errorTracker) {
  logger.info(`[${coordinatorId}] Processing ${combinations.length} combinations with error injection`);

  for (const combo of combinations) {
    const comboKey = `${combo.language}:${combo.translation}`;
    const outputPath = getOutputPath(combo);

    // Claim combination
    const claimed = await redis.set(
      RedisKeys.claim(comboKey),
      JSON.stringify({ coordinatorId, timestamp: Date.now() }),
      { NX: true, EX: 3600 }
    );

    if (claimed !== 'OK') {
      logger.info(`[${coordinatorId}] Failed to claim ${comboKey} (already claimed)`);
      continue;
    }

    // Add task to generate file
    const taskId = `task-${coordinatorId}-${comboKey}`;
    await swarmCoordinator.addTask({
      id: taskId,
      description: `You are generating a Hello World file.

Programming Language: ${combo.language}
Written Language: ${combo.translation}
Output File: ${outputPath}

Create a Hello World program that prints "Hello, World!" in ${combo.translation}.

The file should contain:
1. A comment with coordinator ID: ${coordinatorId}
2. A comment with language: ${combo.language} / ${combo.translation}
3. Code that prints "Hello, World!" in ${combo.translation}

Use the write tool to create the file at: ${outputPath}

After writing, verify the file exists using bash: ls -la ${outputPath}

Report completion when file is created successfully.`,
      priority: 1,
      dependencies: [],
      metadata: {
        coordinatorId,
        language: combo.language,
        translation: combo.translation,
        comboKey
      }
    });
  }

  // Wait for all tasks to complete
  logger.info(`[${coordinatorId}] Waiting for ${combinations.length} tasks to complete...`);
  await waitForCompletion(swarmCoordinator, combinations.length, 20 * 60 * 1000); // 20 minutes timeout

  // Inject errors into 50% of files
  logger.info(`[${coordinatorId}] Injecting errors into ~50% of files...`);

  for (const combo of combinations) {
    const comboKey = `${combo.language}:${combo.translation}`;
    const outputPath = getOutputPath(combo);

    try {
      // Check if file was generated
      await fs.access(outputPath);
      const content = await fs.readFile(outputPath, 'utf-8');

      // 50% chance to inject error
      if (Math.random() < ERROR_RATE) {
        const errorType = selectErrorType();
        const errorDetails = await errorType.inject(outputPath, content);

        // Track error
        errorTracker.errors.push({
          combo: comboKey,
          coordinatorId,
          errorType: errorType.name,
          errorDetails,
          injectedAt: Date.now()
        });

        // Store in Redis
        await redis.hSet(RedisKeys.errorsInjected, comboKey, JSON.stringify({
          combo: comboKey,
          errorType: errorType.name,
          errorDetails,
          injectedAt: Date.now()
        }));

        logger.info(`[${coordinatorId}] ❌ Injected ${errorType.name} into ${comboKey}`);
      } else {
        logger.info(`[${coordinatorId}] ✅ No error injection for ${comboKey}`);
      }
    } catch (error) {
      logger.error(`[${coordinatorId}] Failed to process ${comboKey}: ${error.message}`);
    }
  }
}

/**
 * Retry failed files with fresh SwarmCoordinator
 */
async function retryFailedFiles(redis, configManager, providerConfig, retryQueue) {
  logger.info(`Starting retry process for ${retryQueue.length} failed files...`);

  const retryStats = {
    totalRetries: 0,
    maxRetriesPerFile: 0,
    retriesPerFile: new Map()
  };

  for (const item of retryQueue) {
    const { combo, errorType } = item;
    let attempt = 1;
    let success = false;

    while (attempt <= MAX_RETRIES && !success) {
      logger.info(`Retry attempt ${attempt}/${MAX_RETRIES} for ${combo.language}:${combo.translation}`);

      // Create fresh SwarmCoordinator for retry
      const retryCoordinator = new SwarmCoordinator({
        id: `Retry-${combo.language}-${combo.translation}-${attempt}`,
        objective: `Retry failed file: ${combo.language}/${combo.translation} (attempt ${attempt})`,
        topology: 'mesh',
        providerConfig: providerConfig,
        configManager: configManager,
        redisUrl: 'redis://localhost:6379',
        enableMonitoring: false,
        enableSQLiteMemory: false
      }, logger);

      await retryCoordinator.start();
      await retryCoordinator.registerAgent(`Retry-Agent-${attempt}`, 'coder', ['file-operations', 'code-generation']);

      const outputPath = getOutputPath(combo);

      // Add retry task
      await retryCoordinator.addTask({
        id: `retry-${combo.language}-${combo.translation}-${attempt}`,
        description: `FIX ERRORS in Hello World file.

Programming Language: ${combo.language}
Written Language: ${combo.translation}
Output File: ${outputPath}

Previous error: ${errorType || 'unknown'}

The file may have:
- Syntax errors (typos, missing semicolons)
- Logic errors (wrong output format)
- Translation errors (corrupted unicode)

Your task:
1. Create a CORRECT Hello World program that prints "Hello, World!" in ${combo.translation}
2. Ensure proper syntax for ${combo.language}
3. Use correct unicode characters for ${combo.translation}
4. Save to: ${outputPath}

Use the write tool to create the file.
After writing, verify: ls -la ${outputPath}

Report completion when file is correct.`,
        priority: 1,
        metadata: {
          isRetry: true,
          attempt,
          originalError: errorType,
          language: combo.language,
          translation: combo.translation
        }
      });

      // Wait for retry task to complete
      await waitForCompletion(retryCoordinator, 1, 5 * 60 * 1000); // 5 minutes per retry

      await retryCoordinator.stop();

      // Validate retry
      const validation = await validateFile(outputPath, combo);

      if (validation.valid) {
        success = true;
        logger.info(`✅ Retry ${attempt} succeeded for ${combo.language}:${combo.translation}`);
      } else {
        logger.warn(`⚠️  Retry ${attempt} failed for ${combo.language}:${combo.translation}: ${validation.reason}`);
        attempt++;

        // Exponential backoff
        const backoff = Math.min(100 * Math.pow(2, attempt - 1), 2000);
        await sleep(backoff);
      }

      // Track retry stats
      retryStats.totalRetries++;
      const comboKey = `${combo.language}:${combo.translation}`;
      retryStats.retriesPerFile.set(comboKey, attempt);
      retryStats.maxRetriesPerFile = Math.max(retryStats.maxRetriesPerFile, attempt);

      // Log retry to Redis
      await redis.hIncrBy(RedisKeys.retriesCount, comboKey, 1);
      await redis.rPush(RedisKeys.retriesLog, JSON.stringify({
        combo: comboKey,
        attempt,
        errorType,
        success,
        timestamp: Date.now()
      }));
    }

    if (!success) {
      logger.error(`❌ Max retries exceeded for ${combo.language}:${combo.translation}`);
    }
  }

  return retryStats;
}

/**
 * Final validation pass
 */
async function finalValidation(redis) {
  logger.info('Running final validation on all 70 files...');

  const allCombos = generateCombinations();
  const results = {
    passed: 0,
    failed: 0,
    failures: []
  };

  for (const combo of allCombos) {
    const outputPath = getOutputPath(combo);
    const validation = await validateFile(outputPath, combo);

    if (validation.valid) {
      results.passed++;
      await redis.hSet(RedisKeys.validationResults, `${combo.language}:${combo.translation}`, JSON.stringify({
        valid: true,
        timestamp: Date.now()
      }));
    } else {
      results.failed++;
      results.failures.push({
        combo: `${combo.language}:${combo.translation}`,
        reason: validation.reason
      });
      await redis.hSet(RedisKeys.validationResults, `${combo.language}:${combo.translation}`, JSON.stringify({
        valid: false,
        reason: validation.reason,
        timestamp: Date.now()
      }));
    }
  }

  logger.info(`Final validation: ${results.passed}/70 passed, ${results.failed}/70 failed`);

  return results;
}

/**
 * Validate Layer 3 criteria
 */
async function validateLayer3Criteria(redis, retryStats, finalValidation) {
  logger.info('Validating Layer 3 success criteria...');

  const checks = {};

  // Check error injection rate
  const errorsObj = await redis.hGetAll(RedisKeys.errorsInjected);
  const errorCount = Object.keys(errorsObj).length;
  const errorRate = errorCount / 70;

  checks.errorRate = {
    passed: errorRate >= 0.40 && errorRate <= 0.60,
    actual: errorRate,
    expected: '0.40-0.60 (50% ±10%)',
    count: errorCount
  };

  // Check error distribution
  const errorsByType = {};
  for (const errorStr of Object.values(errorsObj)) {
    const error = JSON.parse(errorStr);
    errorsByType[error.errorType] = (errorsByType[error.errorType] || 0) + 1;
  }

  const syntaxPct = (errorsByType['SyntaxError'] || 0) / errorCount;
  const logicPct = (errorsByType['LogicError'] || 0) / errorCount;
  const translationPct = (errorsByType['TranslationError'] || 0) / errorCount;
  const mixedPct = (errorsByType['MixedError'] || 0) / errorCount;

  checks.errorDistribution = {
    passed: (
      syntaxPct >= 0.20 && syntaxPct <= 0.50 &&
      logicPct >= 0.20 && logicPct <= 0.50 &&
      translationPct >= 0.05 && translationPct <= 0.35 &&
      mixedPct >= 0.00 && mixedPct <= 0.25
    ),
    actual: {
      SyntaxError: `${(syntaxPct * 100).toFixed(1)}%`,
      LogicError: `${(logicPct * 100).toFixed(1)}%`,
      TranslationError: `${(translationPct * 100).toFixed(1)}%`,
      MixedError: `${(mixedPct * 100).toFixed(1)}%`
    },
    expected: 'Syntax: 35%±15%, Logic: 35%±15%, Translation: 20%±15%, Mixed: 10%±15%'
  };

  // Check retry statistics
  const avgRetries = retryStats.retriesPerFile.size > 0
    ? Array.from(retryStats.retriesPerFile.values()).reduce((a, b) => a + b, 0) / retryStats.retriesPerFile.size
    : 0;

  checks.maxRetries = {
    passed: retryStats.maxRetriesPerFile <= MAX_RETRIES,
    actual: retryStats.maxRetriesPerFile,
    expected: `≤${MAX_RETRIES}`
  };

  checks.avgRetries = {
    passed: avgRetries <= 4,
    actual: avgRetries.toFixed(2),
    expected: '≤4'
  };

  // Check final success rate
  checks.finalSuccess = {
    passed: finalValidation.passed === 70,
    actual: finalValidation.passed,
    expected: 70
  };

  const allPassed = Object.values(checks).every(c => c.passed);

  return {
    passed: allPassed,
    checks
  };
}

/**
 * Main test execution
 */
async function runLayer3RealisticTest() {
  logger.info('🚀 Starting Layer 3: Realistic Error Handling & Retry Test with Z.ai');
  logger.info('');
  logger.info('Test Configuration:');
  logger.info('  - Implementer coordinators: 2 (using SwarmCoordinator + Z.ai)');
  logger.info('  - Real Z.ai LLM calls: YES');
  logger.info('  - Real file generation: 70 Hello World files');
  logger.info('  - Error injection: 50% (AFTER file generation)');
  logger.info('  - Error types: Syntax (35%), Logic (35%), Translation (20%), Mixed (10%)');
  logger.info('  - Retry mechanism: Fresh SwarmCoordinator instances');
  logger.info('  - Max retries per file: 10');
  logger.info('  - Expected runtime: 10-15 minutes');
  logger.info('');

  // Create output directories
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(FILES_DIR, { recursive: true });
  logger.info(`📁 Created output directories`);

  // Connect to Redis
  const redis = createClient({ url: 'redis://localhost:6379' });
  await redis.connect();
  logger.info('✅ Connected to Redis');

  // Clear old test data
  const oldKeys = await redis.keys('coordination:*');
  if (oldKeys.length > 0) {
    await Promise.all(oldKeys.map(key => redis.del(key)));
    logger.info(`🧹 Cleared ${oldKeys.length} old coordination keys`);
  }

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 1: INITIALIZE SWARM COORDINATORS');
  logger.info('━'.repeat(60));
  logger.info('');

  // Initialize ConfigManager ONCE at the start
  logger.info('📦 Initializing ConfigManager...');
  const configManager = ConfigManager.getInstance();
  await configManager.init();
  logger.info('✅ ConfigManager initialized');
  logger.info('');

  // Create provider config in correct format matching Layer 1
  const providerConfig = {
    providers: {
      zai: {
        apiKey: process.env.Z_AI_API_KEY,
        model: 'glm-4.6',
        maxTokens: 8192,
        temperature: 0.7,
        enableCaching: false,
      },
    },
    defaultProvider: 'zai',
    tieredRouting: {
      enabled: false,
    },
    monitoring: {
      enabled: false,
    },
  };

  logger.info('📦 Provider config created');
  logger.info(`   - Provider: zai (glm-4.6)`);
  logger.info(`   - API Key: ${process.env.Z_AI_API_KEY ? '✅ Present' : '❌ Missing'}`);
  logger.info('');

  // Split combinations
  const allCombos = generateCombinations();
  const [combosA, combosB] = splitCombinations(allCombos);

  logger.info(`Coordinator-A: ${combosA.length} combinations`);
  logger.info(`Coordinator-B: ${combosB.length} combinations`);
  logger.info('');

  // Create SwarmCoordinators with explicit provider configuration
  logger.info('🔧 Creating Coordinator-A...');
  const swarmA = new SwarmCoordinator({
    id: 'Coordinator-A',
    objective: 'Generate Hello World files (first half)',
    topology: 'mesh',
    providerConfig: providerConfig,
    configManager: configManager,
    redisUrl: 'redis://localhost:6379',
    enableMonitoring: false,
    enableSQLiteMemory: false
  }, logger);

  logger.info('🔧 Creating Coordinator-B...');
  const swarmB = new SwarmCoordinator({
    id: 'Coordinator-B',
    objective: 'Generate Hello World files (second half)',
    topology: 'mesh',
    providerConfig: providerConfig,
    configManager: configManager,
    redisUrl: 'redis://localhost:6379',
    enableMonitoring: false,
    enableSQLiteMemory: false
  }, logger);

  logger.info('🚀 Starting Coordinator-A...');
  await swarmA.start();
  logger.info('✅ Coordinator-A started');

  logger.info('🚀 Starting Coordinator-B...');
  await swarmB.start();
  logger.info('✅ Coordinator-B started');
  logger.info('');

  logger.info('📋 Registering agents for task execution...');
  await swarmA.registerAgent('Agent-A', 'coder', ['file-operations', 'code-generation']);
  logger.info('✅ Registered Agent-A');

  await swarmB.registerAgent('Agent-B', 'coder', ['file-operations', 'code-generation']);
  logger.info('✅ Registered Agent-B');

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 2: GENERATE FILES & INJECT ERRORS');
  logger.info('━'.repeat(60));
  logger.info('');

  const errorTracker = { errors: [] };

  // Process with error injection
  await Promise.all([
    processWithErrorInjection('Coordinator-A', swarmA, combosA, redis, errorTracker),
    processWithErrorInjection('Coordinator-B', swarmB, combosB, redis, errorTracker)
  ]);

  logger.info('');
  logger.info(`✅ File generation complete`);
  logger.info(`❌ Errors injected: ${errorTracker.errors.length}`);

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 3: DETECT ERRORS & PREPARE RETRIES');
  logger.info('━'.repeat(60));
  logger.info('');

  // Detect which files need retry
  const retryQueue = [];

  for (const combo of allCombos) {
    const outputPath = getOutputPath(combo);
    const validation = await validateFile(outputPath, combo);

    if (!validation.valid) {
      const comboKey = `${combo.language}:${combo.translation}`;
      const errorInfo = await redis.hGet(RedisKeys.errorsInjected, comboKey);
      const errorType = errorInfo ? JSON.parse(errorInfo).errorType : 'unknown';

      retryQueue.push({ combo, errorType });
      logger.info(`🔍 Detected error in ${comboKey}: ${validation.reason}`);
    }
  }

  logger.info(`📋 Retry queue: ${retryQueue.length} files need fixing`);

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 4: RETRY WITH FRESH SWARM COORDINATORS');
  logger.info('━'.repeat(60));
  logger.info('');

  const retryStats = await retryFailedFiles(redis, configManager, providerConfig, retryQueue);

  logger.info('');
  logger.info(`✅ Retry process complete`);
  logger.info(`   Total retries: ${retryStats.totalRetries}`);
  logger.info(`   Max retries per file: ${retryStats.maxRetriesPerFile}`);
  logger.info(`   Files with retries: ${retryStats.retriesPerFile.size}`);

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 5: FINAL VALIDATION');
  logger.info('━'.repeat(60));
  logger.info('');

  const finalValidationResults = await finalValidation(redis);

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('PHASE 6: VALIDATE SUCCESS CRITERIA');
  logger.info('━'.repeat(60));
  logger.info('');

  const validation = await validateLayer3Criteria(redis, retryStats, finalValidationResults);

  // Print results
  logger.info('');
  logger.info('Validation Results:');
  logger.info('─'.repeat(60));

  for (const [name, check] of Object.entries(validation.checks)) {
    const status = check.passed ? '✅' : '❌';
    logger.info(`${status} ${name}:`, JSON.stringify(check, null, 2));
  }

  logger.info('─'.repeat(60));
  logger.info(`\nOverall: ${validation.passed ? '✅ PASSED' : '❌ FAILED'}`);

  // Save results
  const results = {
    test: 'Layer 3: Realistic Error Handling & Retry Test with Z.ai',
    timestamp: new Date().toISOString(),
    config: {
      errorRate: ERROR_RATE,
      maxRetries: MAX_RETRIES,
      errorTypes: Object.keys(ERROR_TYPES)
    },
    errorInjection: {
      total: errorTracker.errors.length,
      byType: errorTracker.errors.reduce((acc, err) => {
        acc[err.errorType] = (acc[err.errorType] || 0) + 1;
        return acc;
      }, {})
    },
    retryStats: {
      totalRetries: retryStats.totalRetries,
      maxRetriesPerFile: retryStats.maxRetriesPerFile,
      avgRetriesPerFile: retryStats.retriesPerFile.size > 0
        ? Array.from(retryStats.retriesPerFile.values()).reduce((a, b) => a + b, 0) / retryStats.retriesPerFile.size
        : 0
    },
    finalValidation: finalValidationResults,
    validation
  };

  await fs.writeFile(RESULTS_FILE, JSON.stringify(results, null, 2));
  logger.info(`\n📄 Results saved to ${RESULTS_FILE}`);

  // Cleanup
  logger.info('');
  logger.info('🧹 Cleaning up...');
  await swarmA.stop();
  await swarmB.stop();
  await redis.quit();
  logger.info('✅ Cleanup complete');

  logger.info('');
  logger.info('━'.repeat(60));
  logger.info('TEST SUMMARY');
  logger.info('━'.repeat(60));
  logger.info('');
  logger.info(`✅ Files generated: 70`);
  logger.info(`❌ Errors injected: ${errorTracker.errors.length}`);
  logger.info(`🔄 Total retries: ${retryStats.totalRetries}`);
  logger.info(`📊 Final success: ${finalValidationResults.passed}/70`);
  logger.info('');

  if (validation.passed) {
    logger.info('🎉 LAYER 3 REALISTIC TEST PASSED!');
    logger.info('');
    logger.info('💡 Key Success Metrics:');
    logger.info(`   - Real Z.ai LLM calls for file generation`);
    logger.info(`   - Real file corruption for error injection`);
    logger.info(`   - Fresh SwarmCoordinator instances for retries`);
    logger.info(`   - ${errorTracker.errors.length} errors injected (${(errorTracker.errors.length / 70 * 100).toFixed(1)}% rate)`);
    logger.info(`   - ${retryStats.totalRetries} retry attempts`);
    logger.info(`   - Max ${retryStats.maxRetriesPerFile} retries per file`);
    logger.info(`   - 100% final success rate achieved`);
    logger.info('');
    logger.info('💰 Check Z.ai billing for ~105+ API calls (70 initial + ~35 retries)');
  } else {
    logger.error('❌ LAYER 3 REALISTIC TEST FAILED');
    if (finalValidationResults.failures.length > 0) {
      logger.error('\nFailed files:');
      finalValidationResults.failures.forEach(f => {
        logger.error(`   - ${f.combo}: ${f.reason}`);
      });
    }
  }

  logger.info('');

  process.exit(validation.passed ? 0 : 1);
}

/**
 * Helper: sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for SwarmCoordinator to complete all tasks
 */
async function waitForCompletion(coordinator, expectedTasks, timeoutMs = 600000) {
  const startTime = Date.now();
  let lastCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    const status = coordinator.getStatus();

    if (status.completedTasks !== lastCount) {
      logger.info(`Progress: ${status.completedTasks}/${expectedTasks} tasks completed`);
      lastCount = status.completedTasks;
    }

    if (status.completedTasks >= expectedTasks) {
      logger.info(`✅ All ${expectedTasks} tasks completed!`);
      return true;
    }

    await sleep(2000); // Check every 2 seconds
  }

  throw new Error(`Timeout: Only ${lastCount}/${expectedTasks} tasks completed after ${timeoutMs}ms`);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n\n🛑 Test interrupted by user');
  process.exit(1);
});

// Run test
runLayer3RealisticTest().catch((error) => {
  console.error('❌ Test failed with error:', error);
  console.error(error.stack);
  process.exit(1);
});
