/**
 * Security Hooks WASM Benchmarks - ACTUAL RUNTIME VALIDATION
 * Deliverable 1.1.4 - Sprint 1.1
 *
 * CRITICAL: Tests ACTUAL WASM runtime performance (not mocks)
 *
 * Validates real performance improvements:
 * - safety-validator.js: Target 3-5x (realistic WASM speedup)
 * - pre-tool-validation.js: Target 4-6x (realistic WASM speedup)
 * - pre-edit-security.js: Target 5-8x (realistic WASM speedup)
 *
 * Test methodology:
 * - Multiple file sizes (100, 1000, 5000, 10000 lines)
 * - WASM vs JavaScript comparison with ACTUAL runtimes
 * - WASM warm-up phase (compile patterns once)
 * - Realistic test data with vulnerabilities
 * - File size scaling validation
 * - Documents actual vs realistic targets
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { SafetyValidator } from '../../config/hooks/safety-validator.js';
import { EnhancedPreToolValidator } from '../../config/hooks/pre-tool-validation.js';
import PreEditSecurityHook from '../../config/hooks/pre-edit-security.js';
import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Security Hooks WASM Benchmarks - ACTUAL RUNTIME VALIDATION', () => {
  let benchmarkResults;
  let testFilePaths = [];

  beforeAll(async () => {
    benchmarkResults = {
      safetyValidator: {
        target: { speedup: '3-5x', realistic: true },
        actual: {}
      },
      preToolValidation: {
        target: { speedup: '4-6x', realistic: true },
        actual: {}
      },
      preEditSecurity: {
        target: { speedup: '5-8x', realistic: true },
        actual: {}
      },
      summary: {},
      confidence: 0
    };

    console.log('\n🔧 Initializing WASM benchmark tests...');
    console.log('📊 Using realistic performance targets (3-8x speedup range)');
  });

  afterAll(async () => {
    // Cleanup test files
    for (const filePath of testFilePaths) {
      try {
        if (existsSync(filePath)) {
          await fs.unlink(filePath);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    console.log('\n✅ Test cleanup complete');
  });

  /**
   * Generate test file with realistic vulnerabilities
   */
  async function generateVulnerableFile(lines) {
    const vulnerabilities = [
      'eval(userInput);',
      'exec("rm -rf " + path);',
      'SELECT * FROM users WHERE id=' + Math.random(),
      'document.write(userInput);',
      'const password = "hardcoded123";',
      'crypto.createHash("md5");',
      'app.use(cors({origin: "*"}));',
      'innerHTML = untrustedData;',
      'const secret = "api_key_12345";',
      'setTimeout("code" + userInput, 1000);'
    ];

    let content = '// Generated test file with security vulnerabilities\n';
    for (let i = 0; i < lines; i++) {
      if (i % 50 === 0 && i > 0) {
        // Inject vulnerability every 50 lines
        content += vulnerabilities[i % vulnerabilities.length] + '\n';
      } else {
        content += `const x${i} = ${i};\n`;
      }
    }

    const filePath = path.join(__dirname, `test-vuln-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.js`);
    await fs.writeFile(filePath, content);
    testFilePaths.push(filePath);
    return filePath;
  }

  /**
   * Wait for WASM initialization with timeout
   */
  async function waitForWASMInit(validator, timeout = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (validator.wasmInitialized === true) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return false;
  }

  describe('Hook 1: safety-validator.js - 3-5x Speedup Target (ACTUAL RUNTIME)', () => {
    it('should measure ACTUAL WASM vs JavaScript performance on 1000-line file', async () => {
      const testFile = await generateVulnerableFile(1000);
      const iterations = 10;

      // Create validators with explicit WASM control
      const validatorWasm = new SafetyValidator({ wasmEnabled: true });
      const validatorJS = new SafetyValidator({ wasmEnabled: false });

      // CRITICAL: Wait for WASM initialization
      console.log('\n⏳ Waiting for WASM initialization...');
      const wasmReady = await waitForWASMInit(validatorWasm, 15000);

      if (!wasmReady) {
        console.warn('⚠️  WASM initialization timeout - test will use fallback');
      } else {
        console.log('✅ WASM initialized successfully');
      }

      // WASM warm-up phase: compile patterns once
      console.log('🔥 Warming up WASM engine...');
      for (let i = 0; i < 3; i++) {
        await validatorWasm.validate(testFile);
      }
      console.log('✅ WASM engine warmed up');

      // Warmup JavaScript
      await validatorJS.validate(testFile);

      // Benchmark WASM
      const wasmTimes = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await validatorWasm.validate(testFile);
        wasmTimes.push(performance.now() - start);
      }
      const wasmAvg = wasmTimes.reduce((a, b) => a + b) / wasmTimes.length;

      // Benchmark JavaScript
      const jsTimes = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await validatorJS.validate(testFile);
        jsTimes.push(performance.now() - start);
      }
      const jsAvg = jsTimes.reduce((a, b) => a + b) / jsTimes.length;

      const speedup = jsAvg / wasmAvg;

      benchmarkResults.safetyValidator.actual = {
        fileSize: '1000 lines',
        iterations,
        wasmTime: `${wasmAvg.toFixed(2)}ms`,
        jsTime: `${jsAvg.toFixed(2)}ms`,
        speedup: `${speedup.toFixed(1)}x`,
        achievedTarget: speedup >= 3,
        wasmInitialized: wasmReady,
        status: speedup >= 5 ? 'EXCEEDED' : speedup >= 3 ? 'TARGET_MET' : 'BELOW_TARGET'
      };

      console.log('\n📊 SafetyValidator - 1000 Lines (ACTUAL MEASUREMENT):');
      console.log(`  WASM Time: ${wasmAvg.toFixed(2)}ms`);
      console.log(`  JS Time: ${jsAvg.toFixed(2)}ms`);
      console.log(`  Speedup: ${speedup.toFixed(1)}x`);
      console.log(`  Target: 3-5x (realistic WASM speedup)`);
      console.log(`  WASM Ready: ${wasmReady ? '✅' : '⚠️  Fallback'}`);

      // Report if target exceeded
      if (speedup >= 5) {
        console.log(`  ✨ Exceeded target! Achieved ${speedup.toFixed(1)}x speedup`);
      } else if (speedup >= 3) {
        console.log(`  ✅ Target met: ${speedup.toFixed(1)}x speedup (target: 3-5x)`);
      } else {
        console.warn(`  ⚠️  Below target: ${speedup.toFixed(1)}x (expected: 3-5x)`);
      }

      // Realistic assertion: at least 3x speedup required
      expect(speedup).toBeGreaterThanOrEqual(3);
    }, 60000);

    it('should validate WASM provides measurable performance improvement', async () => {
      const testFile = await generateVulnerableFile(500);

      const validatorWasm = new SafetyValidator({ wasmEnabled: true });
      const validatorJS = new SafetyValidator({ wasmEnabled: false });

      const wasmReady = await waitForWASMInit(validatorWasm, 10000);

      // Single run comparison
      const wasmStart = performance.now();
      await validatorWasm.validate(testFile);
      const wasmTime = performance.now() - wasmStart;

      const jsStart = performance.now();
      await validatorJS.validate(testFile);
      const jsTime = performance.now() - jsStart;

      const improvement = jsTime / wasmTime;

      console.log('\n📊 SafetyValidator - Single Run Validation:');
      console.log(`  WASM: ${wasmTime.toFixed(1)}ms`);
      console.log(`  JavaScript: ${jsTime.toFixed(1)}ms`);
      console.log(`  Improvement: ${improvement.toFixed(1)}x`);
      console.log(`  WASM Ready: ${wasmReady ? '✅' : '⚠️  Fallback'}`);

      // At least some improvement expected
      expect(improvement).toBeGreaterThan(1.0);
    }, 30000);

    it('should scale with file size', async () => {
      const fileSizes = [100, 1000, 5000, 10000];
      const speedups = [];

      for (const size of fileSizes) {
        const testFile = await generateVulnerableFile(size);

        const validatorWasm = new SafetyValidator({ wasmEnabled: true });
        const validatorJS = new SafetyValidator({ wasmEnabled: false });

        // Wait for WASM initialization
        await waitForWASMInit(validatorWasm, 10000);

        // Warm up WASM
        await validatorWasm.validate(testFile);

        // Measure WASM
        const wasmStart = performance.now();
        await validatorWasm.validate(testFile);
        const wasmTime = performance.now() - wasmStart;

        // Measure JavaScript
        const jsStart = performance.now();
        await validatorJS.validate(testFile);
        const jsTime = performance.now() - jsStart;

        const speedup = jsTime / wasmTime;
        speedups.push({ size, speedup, wasmTime, jsTime });

        await fs.unlink(testFile);
      }

      console.log('\n📊 Speedup by file size:');
      speedups.forEach(({ size, speedup, wasmTime, jsTime }) => {
        console.log(`  ${size} lines: ${speedup.toFixed(1)}x (WASM: ${wasmTime.toFixed(1)}ms, JS: ${jsTime.toFixed(1)}ms)`);
      });

      // Larger files should show better speedup
      const avgSmall = (speedups[0].speedup + speedups[1].speedup) / 2;
      const avgLarge = (speedups[2].speedup + speedups[3].speedup) / 2;

      console.log(`\n  Average speedup (small files): ${avgSmall.toFixed(1)}x`);
      console.log(`  Average speedup (large files): ${avgLarge.toFixed(1)}x`);

      // Larger files should benefit more from WASM
      expect(avgLarge).toBeGreaterThanOrEqual(avgSmall * 0.8); // Allow some variance
    }, 120000);

    it('should initialize WASM successfully', async () => {
      const validator = new SafetyValidator({ wasmEnabled: true });

      // Wait for WASM to initialize
      console.log('\n⏳ Testing WASM initialization...');
      const wasmReady = await waitForWASMInit(validator, 10000);

      expect(wasmReady).toBe(true);
      expect(validator.wasmInitialized).toBe(true);

      console.log('✅ WASM initialized successfully');
    }, 15000);
  });

  describe('Hook 2: pre-tool-validation.js - 4-6x Speedup Target (ACTUAL RUNTIME)', () => {
    it('should measure ACTUAL WASM vs JavaScript performance on tool validations', async () => {
      const iterations = 50;

      const validatorWasm = new EnhancedPreToolValidator({ wasmEnabled: true });
      const validatorJS = new EnhancedPreToolValidator({ wasmEnabled: false });

      // Wait for WASM initialization
      console.log('\n⏳ Waiting for WASM initialization (PreToolValidator)...');
      const wasmReady = await waitForWASMInit(validatorWasm, 15000);

      if (!wasmReady) {
        console.warn('⚠️  WASM initialization timeout - test will use fallback');
      } else {
        console.log('✅ WASM initialized successfully');
      }

      const testParams = {
        command: 'npm install && npm test && npm run build && git commit',
        file_path: '/mnt/c/project/src/index.js',
        content: 'const x = 1; eval(userInput); SELECT * FROM users;'
      };

      // WASM warm-up phase
      console.log('🔥 Warming up WASM engine...');
      for (let i = 0; i < 3; i++) {
        await validatorWasm.validate('Bash', testParams);
      }
      console.log('✅ WASM engine warmed up');

      // Warmup JavaScript
      await validatorJS.validate('Bash', testParams);

      // Benchmark WASM
      const wasmTimes = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await validatorWasm.validate('Bash', testParams);
        wasmTimes.push(performance.now() - start);
      }
      const wasmAvg = wasmTimes.reduce((a, b) => a + b) / wasmTimes.length;

      // Benchmark JavaScript
      const jsTimes = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await validatorJS.validate('Bash', testParams);
        jsTimes.push(performance.now() - start);
      }
      const jsAvg = jsTimes.reduce((a, b) => a + b) / jsTimes.length;

      const speedup = jsAvg / wasmAvg;

      benchmarkResults.preToolValidation.actual = {
        tool: 'Bash',
        iterations,
        wasmTime: `${wasmAvg.toFixed(2)}ms`,
        jsTime: `${jsAvg.toFixed(2)}ms`,
        speedup: `${speedup.toFixed(1)}x`,
        achievedTarget: speedup >= 4,
        wasmInitialized: wasmReady,
        status: speedup >= 6 ? 'EXCEEDED' : speedup >= 4 ? 'TARGET_MET' : 'BELOW_TARGET'
      };

      console.log('\n📊 PreToolValidation - Bash Command (ACTUAL MEASUREMENT):');
      console.log(`  WASM Time: ${wasmAvg.toFixed(2)}ms`);
      console.log(`  JS Time: ${jsAvg.toFixed(2)}ms`);
      console.log(`  Speedup: ${speedup.toFixed(1)}x`);
      console.log(`  Target: 4-6x (realistic WASM speedup)`);
      console.log(`  WASM Ready: ${wasmReady ? '✅' : '⚠️  Fallback'}`);

      // Report if target exceeded
      if (speedup >= 6) {
        console.log(`  ✨ Exceeded target! Achieved ${speedup.toFixed(1)}x speedup`);
      } else if (speedup >= 4) {
        console.log(`  ✅ Target met: ${speedup.toFixed(1)}x speedup (target: 4-6x)`);
      } else {
        console.warn(`  ⚠️  Below target: ${speedup.toFixed(1)}x (expected: 4-6x)`);
      }

      // Realistic assertion: at least 4x speedup required
      expect(speedup).toBeGreaterThanOrEqual(4);
    }, 60000);
  });

  describe('Hook 3: pre-edit-security.js - 5-8x Speedup Target (ACTUAL RUNTIME)', () => {
    it('should measure ACTUAL WASM vs JavaScript performance on file edits', async () => {
      const testFile = await generateVulnerableFile(1000);
      const iterations = 50;

      const hookWasm = new PreEditSecurityHook();
      hookWasm.wasmEnabled = true;

      const hookJS = new PreEditSecurityHook();
      hookJS.wasmEnabled = false;

      // Wait for WASM initialization
      console.log('\n⏳ Waiting for WASM initialization (PreEditSecurity)...');
      const wasmReady = hookWasm.wasmInitialized || await waitForWASMInit(hookWasm, 15000);

      if (!wasmReady) {
        console.warn('⚠️  WASM initialization timeout - test will use fallback');
      } else {
        console.log('✅ WASM initialized successfully');
      }

      const content = await fs.readFile(testFile, 'utf8');

      // WASM warm-up phase
      console.log('🔥 Warming up WASM engine...');
      for (let i = 0; i < 3; i++) {
        await hookWasm.validate(testFile, content, 'edit');
      }
      console.log('✅ WASM engine warmed up');

      // Warmup JavaScript
      await hookJS.validate(testFile, content, 'edit');

      // Benchmark WASM
      const wasmTimes = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await hookWasm.validate(testFile, content, 'edit');
        wasmTimes.push(performance.now() - start);
      }
      const wasmAvg = wasmTimes.reduce((a, b) => a + b) / wasmTimes.length;

      // Benchmark JavaScript
      const jsTimes = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await hookJS.validate(testFile, content, 'edit');
        jsTimes.push(performance.now() - start);
      }
      const jsAvg = jsTimes.reduce((a, b) => a + b) / jsTimes.length;

      const speedup = jsAvg / wasmAvg;

      benchmarkResults.preEditSecurity.actual = {
        fileSize: '1000 lines',
        iterations,
        wasmTime: `${wasmAvg.toFixed(2)}ms`,
        jsTime: `${jsAvg.toFixed(2)}ms`,
        speedup: `${speedup.toFixed(1)}x`,
        achievedTarget: speedup >= 5,
        wasmInitialized: wasmReady,
        status: speedup >= 8 ? 'EXCEEDED' : speedup >= 5 ? 'TARGET_MET' : 'BELOW_TARGET'
      };

      console.log('\n📊 PreEditSecurity - 1000 Lines (ACTUAL MEASUREMENT):');
      console.log(`  WASM Time: ${wasmAvg.toFixed(2)}ms`);
      console.log(`  JS Time: ${jsAvg.toFixed(2)}ms`);
      console.log(`  Speedup: ${speedup.toFixed(1)}x`);
      console.log(`  Target: 5-8x (realistic WASM speedup)`);
      console.log(`  WASM Ready: ${wasmReady ? '✅' : '⚠️  Fallback'}`);

      // Report if target exceeded
      if (speedup >= 8) {
        console.log(`  ✨ Exceeded target! Achieved ${speedup.toFixed(1)}x speedup`);
      } else if (speedup >= 5) {
        console.log(`  ✅ Target met: ${speedup.toFixed(1)}x speedup (target: 5-8x)`);
      } else {
        console.warn(`  ⚠️  Below target: ${speedup.toFixed(1)}x (expected: 5-8x)`);
      }

      // Realistic assertion: at least 5x speedup required
      expect(speedup).toBeGreaterThanOrEqual(5);
    }, 60000);
  });

  describe('Performance Report Generation', () => {
    it('should generate comprehensive performance report with actual measurements', async () => {
      // Calculate overall metrics
      const safetySpeedup = parseFloat(benchmarkResults.safetyValidator.actual.speedup) || 0;
      const preToolSpeedup = parseFloat(benchmarkResults.preToolValidation.actual.speedup) || 0;
      const preEditSpeedup = parseFloat(benchmarkResults.preEditSecurity.actual.speedup) || 0;

      const avgSpeedup = (safetySpeedup + preToolSpeedup + preEditSpeedup) / 3;

      // Calculate confidence score based on realistic targets
      const safetyPassed = safetySpeedup >= 3;
      const preToolPassed = preToolSpeedup >= 4;
      const preEditPassed = preEditSpeedup >= 5;

      const passedCount = [safetyPassed, preToolPassed, preEditPassed].filter(Boolean).length;
      const confidence = passedCount / 3;

      benchmarkResults.summary = {
        safetyValidator: {
          target: '3-5x (realistic WASM)',
          actual: benchmarkResults.safetyValidator.actual,
          status: safetyPassed ? 'PASS ✅' : 'FAIL ❌',
          meetsTarget: safetySpeedup >= 3,
          exceedsTarget: safetySpeedup >= 5
        },
        preToolValidation: {
          target: '4-6x (realistic WASM)',
          actual: benchmarkResults.preToolValidation.actual,
          status: preToolPassed ? 'PASS ✅' : 'FAIL ❌',
          meetsTarget: preToolSpeedup >= 4,
          exceedsTarget: preToolSpeedup >= 6
        },
        preEditSecurity: {
          target: '5-8x (realistic WASM)',
          actual: benchmarkResults.preEditSecurity.actual,
          status: preEditPassed ? 'PASS ✅' : 'FAIL ❌',
          meetsTarget: preEditSpeedup >= 5,
          exceedsTarget: preEditSpeedup >= 8
        },
        overall: {
          averageSpeedup: `${avgSpeedup.toFixed(1)}x`,
          targetRange: '3-8x (realistic WASM)',
          expectedAverage: '~5x',
          confidence: (confidence * 100).toFixed(1) + '%',
          allPassed: passedCount === 3,
          timestamp: new Date().toISOString()
        }
      };

      benchmarkResults.confidence = confidence;

      console.log('\n' + '='.repeat(80));
      console.log('📋 SECURITY HOOKS WASM PERFORMANCE REPORT - ACTUAL MEASUREMENTS');
      console.log('='.repeat(80));
      console.log('\n🛡️ SafetyValidator:');
      console.log(`  Target: 3-5x speedup (realistic WASM)`);
      console.log(`  Actual: ${benchmarkResults.safetyValidator.actual.speedup}`);
      console.log(`  Status: ${benchmarkResults.summary.safetyValidator.status}`);
      console.log(`  Meets Target: ${benchmarkResults.summary.safetyValidator.meetsTarget ? '✅' : '❌'}`);
      console.log(`  Exceeds Target: ${benchmarkResults.summary.safetyValidator.exceedsTarget ? '✨ YES' : 'NO'}`);
      console.log('\n🔧 PreToolValidation:');
      console.log(`  Target: 4-6x speedup (realistic WASM)`);
      console.log(`  Actual: ${benchmarkResults.preToolValidation.actual.speedup}`);
      console.log(`  Status: ${benchmarkResults.summary.preToolValidation.status}`);
      console.log(`  Meets Target: ${benchmarkResults.summary.preToolValidation.meetsTarget ? '✅' : '❌'}`);
      console.log(`  Exceeds Target: ${benchmarkResults.summary.preToolValidation.exceedsTarget ? '✨ YES' : 'NO'}`);
      console.log('\n✏️ PreEditSecurity:');
      console.log(`  Target: 5-8x speedup (realistic WASM)`);
      console.log(`  Actual: ${benchmarkResults.preEditSecurity.actual.speedup}`);
      console.log(`  Status: ${benchmarkResults.summary.preEditSecurity.status}`);
      console.log(`  Meets Target: ${benchmarkResults.summary.preEditSecurity.meetsTarget ? '✅' : '❌'}`);
      console.log(`  Exceeds Target: ${benchmarkResults.summary.preEditSecurity.exceedsTarget ? '✨ YES' : 'NO'}`);
      console.log('\n📊 Overall Performance:');
      console.log(`  Average Speedup: ${avgSpeedup.toFixed(1)}x`);
      console.log(`  Expected Average: ~5x`);
      console.log(`  Confidence Score: ${(confidence * 100).toFixed(1)}%`);
      console.log(`  Overall Status: ${benchmarkResults.summary.overall.allPassed ? '✅ ALL PASS' : '⚠️ SOME FAILURES'}`);
      console.log('='.repeat(80) + '\n');

      // Write report to file
      const reportPath = path.join(__dirname, 'wasm-performance-report.json');
      await fs.writeFile(reportPath, JSON.stringify(benchmarkResults, null, 2));
      console.log(`📄 Detailed report written to: ${reportPath}\n`);

      // Assertions based on realistic targets
      expect(confidence).toBeGreaterThanOrEqual(0.75); // At least 75% confidence
      expect(avgSpeedup).toBeGreaterThanOrEqual(4); // Minimum 4x overall average
    }, 30000);
  });
});
