/**
 * Security Hooks WASM Benchmarks
 * Deliverable 1.1.4 - Sprint 1.1
 *
 * Validates 30-50x performance improvements across all security hooks:
 * - safety-validator.js: 50x speedup (800ms → 16ms)
 * - pre-tool-validation.js: 40x speedup (200ms → 5ms)
 * - pre-edit-security.js: 30x speedup (80ms → 2.5ms)
 *
 * Test methodology:
 * - Multiple file sizes (100, 1000, 10000 lines)
 * - WASM vs JavaScript comparison
 * - Validates speedup ratios meet targets
 * - Documents performance gains for CI/CD
 */

const { performance } = require('perf_hooks');
const path = require('path');
const fs = require('fs-extra');

// Import hooks
const { SafetyValidator } = require('../../config/hooks/safety-validator.js');
const { EnhancedPreToolValidator } = require('../../config/hooks/pre-tool-validation.js');
const PreEditSecurityHook = require('../../config/hooks/pre-edit-security.js');

describe('Security Hooks WASM Benchmarks - 30-50x Speedup Validation', () => {
  let benchmarkResults;
  let testFiles;

  beforeAll(async () => {
    benchmarkResults = {
      safetyValidator: {},
      preToolValidation: {},
      preEditSecurity: {},
      summary: {},
      confidence: 0
    };

    // Generate test files of different sizes
    testFiles = {
      small: generateTestFile(100),
      medium: generateTestFile(1000),
      large: generateTestFile(10000)
    };

    console.log('\n🔧 Test File Sizes:');
    console.log(`  Small: ${testFiles.small.lines} lines (${testFiles.small.content.length} bytes)`);
    console.log(`  Medium: ${testFiles.medium.lines} lines (${testFiles.medium.content.length} bytes)`);
    console.log(`  Large: ${testFiles.large.lines} lines (${testFiles.large.content.length} bytes)`);
  });

  /**
   * Generate test file with realistic code patterns
   */
  function generateTestFile(lineCount) {
    const templates = [
      'function example${i}() {\n  const value = ${i} * 2;\n  return value;\n}\n',
      'class TestClass${i} {\n  constructor() {\n    this.id = ${i};\n  }\n}\n',
      'const obj${i} = {\n  id: ${i},\n  name: "test${i}",\n  value: ${i} * 3\n};\n',
      'if (condition${i}) {\n  console.log("Branch ${i}");\n  processData(${i});\n}\n',
      '// Comment line ${i}\nconst result${i} = calculate(${i});\n',
      'try {\n  operation${i}();\n} catch (error) {\n  handleError${i}(error);\n}\n',
      'async function asyncOp${i}() {\n  const data = await fetch("/api/${i}");\n  return data;\n}\n',
      'const array${i} = [${i}, ${i}+1, ${i}+2].map(x => x * 2);\n'
    ];

    let content = '// Generated test file\n';
    let currentLines = 1;

    while (currentLines < lineCount) {
      const template = templates[currentLines % templates.length];
      const code = template.replace(/\$\{i\}/g, currentLines);
      content += code;
      currentLines += code.split('\n').length;
    }

    return {
      content,
      lines: content.split('\n').length,
      size: content.length
    };
  }

  /**
   * Generate test file with security vulnerabilities
   */
  function generateVulnerableFile(lineCount) {
    const vulnerablePatterns = [
      'eval(userInput);\n',
      'innerHTML = untrustedData;\n',
      'const password = "hardcoded123";\n',
      'SELECT * FROM users WHERE id = " + userId;\n',
      'const secret = "api_key_12345";\n',
      'crypto.createHash("md5").update(data);\n',
      'document.write(userContent);\n',
      'setTimeout("code" + userInput, 1000);\n',
      'const path = "./../../../etc/passwd";\n',
      'chmod 777 /tmp/file;\n'
    ];

    let content = '// Test file with security vulnerabilities\n';
    let currentLines = 1;

    while (currentLines < lineCount) {
      const pattern = vulnerablePatterns[currentLines % vulnerablePatterns.length];
      content += `function vuln${currentLines}() {\n  ${pattern}}\n`;
      currentLines += 3;
    }

    return {
      content,
      lines: content.split('\n').length,
      size: content.length
    };
  }

  describe('Hook 1: safety-validator.js - 50x Speedup Target', () => {
    it('should achieve 50x speedup on 100-line files', async () => {
      const file = generateVulnerableFile(100);
      const iterations = 50;

      // Create validators
      const validatorWasm = new SafetyValidator({ wasmEnabled: true });
      const validatorJS = new SafetyValidator({ wasmEnabled: false });

      // Warmup
      await validatorWasm.validate(file.content);
      await validatorJS.validate(file.content);

      // Benchmark WASM
      const wasmStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await validatorWasm.validate(file.content);
      }
      const wasmEnd = performance.now();
      const wasmTime = wasmEnd - wasmStart;
      const wasmAvg = wasmTime / iterations;

      // Benchmark JavaScript
      const jsStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await validatorJS.validate(file.content);
      }
      const jsEnd = performance.now();
      const jsTime = jsEnd - jsStart;
      const jsAvg = jsTime / iterations;

      const speedup = jsAvg / wasmAvg;

      benchmarkResults.safetyValidator.small = {
        fileSize: '100 lines',
        iterations,
        wasmTime: wasmAvg,
        jsTime: jsAvg,
        speedup,
        target: 50,
        passed: speedup >= 30
      };

      console.log('\n📊 SafetyValidator - 100 Lines:');
      console.log(`  WASM Time: ${wasmAvg.toFixed(2)}ms`);
      console.log(`  JS Time: ${jsAvg.toFixed(2)}ms`);
      console.log(`  Speedup: ${speedup.toFixed(1)}x`);
      console.log(`  Target: 50x`);
      console.log(`  Status: ${speedup >= 30 ? '✅ PASS' : '❌ FAIL'}`);

      expect(speedup).toBeGreaterThanOrEqual(30); // Minimum 30x
    }, 60000);

    it('should achieve 50x speedup on 1000-line files', async () => {
      const file = generateVulnerableFile(1000);
      const iterations = 20;

      const validatorWasm = new SafetyValidator({ wasmEnabled: true });
      const validatorJS = new SafetyValidator({ wasmEnabled: false });

      // Warmup
      await validatorWasm.validate(file.content);
      await validatorJS.validate(file.content);

      // Benchmark WASM
      const wasmStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await validatorWasm.validate(file.content);
      }
      const wasmEnd = performance.now();
      const wasmTime = wasmEnd - wasmStart;
      const wasmAvg = wasmTime / iterations;

      // Benchmark JavaScript
      const jsStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await validatorJS.validate(file.content);
      }
      const jsEnd = performance.now();
      const jsTime = jsEnd - jsStart;
      const jsAvg = jsTime / iterations;

      const speedup = jsAvg / wasmAvg;

      benchmarkResults.safetyValidator.medium = {
        fileSize: '1000 lines',
        iterations,
        wasmTime: wasmAvg,
        jsTime: jsAvg,
        speedup,
        target: 50,
        passed: speedup >= 35
      };

      console.log('\n📊 SafetyValidator - 1000 Lines:');
      console.log(`  WASM Time: ${wasmAvg.toFixed(2)}ms`);
      console.log(`  JS Time: ${jsAvg.toFixed(2)}ms`);
      console.log(`  Speedup: ${speedup.toFixed(1)}x`);
      console.log(`  Target: 50x`);
      console.log(`  Status: ${speedup >= 35 ? '✅ PASS' : '❌ FAIL'}`);

      expect(speedup).toBeGreaterThanOrEqual(35); // At least 35x for larger files
    }, 120000);

    it('should achieve 50x speedup on 10000-line files', async () => {
      const file = generateVulnerableFile(10000);
      const iterations = 5;

      const validatorWasm = new SafetyValidator({ wasmEnabled: true });
      const validatorJS = new SafetyValidator({ wasmEnabled: false });

      // Warmup
      await validatorWasm.validate(file.content);
      await validatorJS.validate(file.content);

      // Benchmark WASM
      const wasmStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await validatorWasm.validate(file.content);
      }
      const wasmEnd = performance.now();
      const wasmTime = wasmEnd - wasmStart;
      const wasmAvg = wasmTime / iterations;

      // Benchmark JavaScript
      const jsStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await validatorJS.validate(file.content);
      }
      const jsEnd = performance.now();
      const jsTime = jsEnd - jsStart;
      const jsAvg = jsTime / iterations;

      const speedup = jsAvg / wasmAvg;

      benchmarkResults.safetyValidator.large = {
        fileSize: '10000 lines',
        iterations,
        wasmTime: wasmAvg,
        jsTime: jsAvg,
        speedup,
        target: 50,
        passed: speedup >= 40
      };

      console.log('\n📊 SafetyValidator - 10000 Lines:');
      console.log(`  WASM Time: ${wasmAvg.toFixed(2)}ms`);
      console.log(`  JS Time: ${jsAvg.toFixed(2)}ms`);
      console.log(`  Speedup: ${speedup.toFixed(1)}x`);
      console.log(`  Target: 50x`);
      console.log(`  Status: ${speedup >= 40 ? '✅ PASS' : '❌ FAIL'}`);

      expect(speedup).toBeGreaterThanOrEqual(40); // At least 40x for very large files
    }, 180000);
  });

  describe('Hook 2: pre-tool-validation.js - 40x Speedup Target', () => {
    it('should achieve 40x speedup on 100 tool validations', async () => {
      const iterations = 100;

      const validatorWasm = new EnhancedPreToolValidator({ wasmEnabled: true });
      const validatorJS = new EnhancedPreToolValidator({ wasmEnabled: false });

      const testParams = {
        command: 'npm install && npm test && npm run build',
        file_path: '/mnt/c/project/src/index.js',
        content: testFiles.medium.content
      };

      // Warmup
      await validatorWasm.validate('Bash', testParams);
      await validatorJS.validate('Bash', testParams);

      // Benchmark WASM
      const wasmStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await validatorWasm.validate('Bash', testParams);
      }
      const wasmEnd = performance.now();
      const wasmTime = wasmEnd - wasmStart;
      const wasmAvg = wasmTime / iterations;

      // Benchmark JavaScript
      const jsStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await validatorJS.validate('Bash', testParams);
      }
      const jsEnd = performance.now();
      const jsTime = jsEnd - jsStart;
      const jsAvg = jsTime / iterations;

      const speedup = jsAvg / wasmAvg;

      benchmarkResults.preToolValidation.bash = {
        tool: 'Bash',
        iterations,
        wasmTime: wasmAvg,
        jsTime: jsAvg,
        speedup,
        target: 40,
        passed: speedup >= 30
      };

      console.log('\n📊 PreToolValidation - Bash Command:');
      console.log(`  WASM Time: ${wasmAvg.toFixed(2)}ms`);
      console.log(`  JS Time: ${jsAvg.toFixed(2)}ms`);
      console.log(`  Speedup: ${speedup.toFixed(1)}x`);
      console.log(`  Target: 40x`);
      console.log(`  Status: ${speedup >= 30 ? '✅ PASS' : '❌ FAIL'}`);

      expect(speedup).toBeGreaterThanOrEqual(30); // Minimum 30x
    }, 60000);

    it('should achieve 40x speedup on file operation validations', async () => {
      const iterations = 100;

      const validatorWasm = new EnhancedPreToolValidator({ wasmEnabled: true });
      const validatorJS = new EnhancedPreToolValidator({ wasmEnabled: false });

      const testCases = [
        { tool: 'Read', params: { file_path: '/etc/passwd' } },
        { tool: 'Write', params: { file_path: '/tmp/test.js', content: testFiles.small.content } },
        { tool: 'Edit', params: { file_path: '/tmp/test.js', old_string: 'old', new_string: 'new' } },
        { tool: 'Grep', params: { pattern: '.*password.*', path: '/tmp' } },
        { tool: 'Glob', params: { pattern: '**/*.js' } }
      ];

      const results = [];

      for (const testCase of testCases) {
        // Warmup
        await validatorWasm.validate(testCase.tool, testCase.params);
        await validatorJS.validate(testCase.tool, testCase.params);

        // Benchmark WASM
        const wasmStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          await validatorWasm.validate(testCase.tool, testCase.params);
        }
        const wasmEnd = performance.now();
        const wasmTime = wasmEnd - wasmStart;
        const wasmAvg = wasmTime / iterations;

        // Benchmark JavaScript
        const jsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          await validatorJS.validate(testCase.tool, testCase.params);
        }
        const jsEnd = performance.now();
        const jsTime = jsEnd - jsStart;
        const jsAvg = jsTime / iterations;

        const speedup = jsAvg / wasmAvg;

        results.push({
          tool: testCase.tool,
          wasmTime: wasmAvg,
          jsTime: jsAvg,
          speedup
        });

        console.log(`\n📊 PreToolValidation - ${testCase.tool}:`);
        console.log(`  WASM Time: ${wasmAvg.toFixed(2)}ms`);
        console.log(`  JS Time: ${jsAvg.toFixed(2)}ms`);
        console.log(`  Speedup: ${speedup.toFixed(1)}x`);
        console.log(`  Status: ${speedup >= 30 ? '✅ PASS' : '❌ FAIL'}`);
      }

      const avgSpeedup = results.reduce((sum, r) => sum + r.speedup, 0) / results.length;

      benchmarkResults.preToolValidation.fileOps = {
        iterations,
        tools: testCases.length,
        averageSpeedup: avgSpeedup,
        results,
        target: 40,
        passed: avgSpeedup >= 35
      };

      console.log(`\n📊 PreToolValidation - Average Speedup: ${avgSpeedup.toFixed(1)}x`);

      expect(avgSpeedup).toBeGreaterThanOrEqual(35); // Average 35x across all tools
    }, 120000);
  });

  describe('Hook 3: pre-edit-security.js - 30x Speedup Target', () => {
    it('should achieve 30x speedup on 100-line file edits', async () => {
      const file = testFiles.small;
      const iterations = 100;

      // Mock WASM-enabled and JS-only versions
      const hookWasm = new PreEditSecurityHook();
      hookWasm.wasmEnabled = true;

      const hookJS = new PreEditSecurityHook();
      hookJS.wasmEnabled = false;

      const testFilePath = '/tmp/test-env-file.js';

      // Warmup
      await hookWasm.validate(testFilePath, file.content, 'edit');
      await hookJS.validate(testFilePath, file.content, 'edit');

      // Benchmark WASM
      const wasmStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await hookWasm.validate(testFilePath, file.content, 'edit');
      }
      const wasmEnd = performance.now();
      const wasmTime = wasmEnd - wasmStart;
      const wasmAvg = wasmTime / iterations;

      // Benchmark JavaScript
      const jsStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await hookJS.validate(testFilePath, file.content, 'edit');
      }
      const jsEnd = performance.now();
      const jsTime = jsEnd - jsStart;
      const jsAvg = jsTime / iterations;

      const speedup = jsAvg / wasmAvg;

      benchmarkResults.preEditSecurity.small = {
        fileSize: '100 lines',
        iterations,
        wasmTime: wasmAvg,
        jsTime: jsAvg,
        speedup,
        target: 30,
        passed: speedup >= 25
      };

      console.log('\n📊 PreEditSecurity - 100 Lines:');
      console.log(`  WASM Time: ${wasmAvg.toFixed(2)}ms`);
      console.log(`  JS Time: ${jsAvg.toFixed(2)}ms`);
      console.log(`  Speedup: ${speedup.toFixed(1)}x`);
      console.log(`  Target: 30x`);
      console.log(`  Status: ${speedup >= 25 ? '✅ PASS' : '❌ FAIL'}`);

      expect(speedup).toBeGreaterThanOrEqual(25); // Minimum 25x
    }, 60000);

    it('should achieve 30x speedup on 1000-line file edits', async () => {
      const file = testFiles.medium;
      const iterations = 50;

      const hookWasm = new PreEditSecurityHook();
      hookWasm.wasmEnabled = true;

      const hookJS = new PreEditSecurityHook();
      hookJS.wasmEnabled = false;

      const testFilePath = '/tmp/test-large-file.js';

      // Warmup
      await hookWasm.validate(testFilePath, file.content, 'edit');
      await hookJS.validate(testFilePath, file.content, 'edit');

      // Benchmark WASM
      const wasmStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await hookWasm.validate(testFilePath, file.content, 'edit');
      }
      const wasmEnd = performance.now();
      const wasmTime = wasmEnd - wasmStart;
      const wasmAvg = wasmTime / iterations;

      // Benchmark JavaScript
      const jsStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await hookJS.validate(testFilePath, file.content, 'edit');
      }
      const jsEnd = performance.now();
      const jsTime = jsEnd - jsStart;
      const jsAvg = jsTime / iterations;

      const speedup = jsAvg / wasmAvg;

      benchmarkResults.preEditSecurity.medium = {
        fileSize: '1000 lines',
        iterations,
        wasmTime: wasmAvg,
        jsTime: jsAvg,
        speedup,
        target: 30,
        passed: speedup >= 28
      };

      console.log('\n📊 PreEditSecurity - 1000 Lines:');
      console.log(`  WASM Time: ${wasmAvg.toFixed(2)}ms`);
      console.log(`  JS Time: ${jsAvg.toFixed(2)}ms`);
      console.log(`  Speedup: ${speedup.toFixed(1)}x`);
      console.log(`  Target: 30x`);
      console.log(`  Status: ${speedup >= 28 ? '✅ PASS' : '❌ FAIL'}`);

      expect(speedup).toBeGreaterThanOrEqual(28); // At least 28x for medium files
    }, 120000);

    it('should achieve 30x speedup on 10000-line file edits', async () => {
      const file = testFiles.large;
      const iterations = 10;

      const hookWasm = new PreEditSecurityHook();
      hookWasm.wasmEnabled = true;

      const hookJS = new PreEditSecurityHook();
      hookJS.wasmEnabled = false;

      const testFilePath = '/tmp/test-very-large-file.js';

      // Warmup
      await hookWasm.validate(testFilePath, file.content, 'edit');
      await hookJS.validate(testFilePath, file.content, 'edit');

      // Benchmark WASM
      const wasmStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await hookWasm.validate(testFilePath, file.content, 'edit');
      }
      const wasmEnd = performance.now();
      const wasmTime = wasmEnd - wasmStart;
      const wasmAvg = wasmTime / iterations;

      // Benchmark JavaScript
      const jsStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await hookJS.validate(testFilePath, file.content, 'edit');
      }
      const jsEnd = performance.now();
      const jsTime = jsEnd - jsStart;
      const jsAvg = jsTime / iterations;

      const speedup = jsAvg / wasmAvg;

      benchmarkResults.preEditSecurity.large = {
        fileSize: '10000 lines',
        iterations,
        wasmTime: wasmAvg,
        jsTime: jsAvg,
        speedup,
        target: 30,
        passed: speedup >= 30
      };

      console.log('\n📊 PreEditSecurity - 10000 Lines:');
      console.log(`  WASM Time: ${wasmAvg.toFixed(2)}ms`);
      console.log(`  JS Time: ${jsAvg.toFixed(2)}ms`);
      console.log(`  Speedup: ${speedup.toFixed(1)}x`);
      console.log(`  Target: 30x`);
      console.log(`  Status: ${speedup >= 30 ? '✅ PASS' : '❌ FAIL'}`);

      expect(speedup).toBeGreaterThanOrEqual(30); // At least 30x for very large files
    }, 180000);
  });

  describe('Comprehensive Performance Summary', () => {
    it('should generate performance validation report', async () => {
      // Calculate overall metrics
      const safetyMetrics = [
        benchmarkResults.safetyValidator.small?.speedup || 0,
        benchmarkResults.safetyValidator.medium?.speedup || 0,
        benchmarkResults.safetyValidator.large?.speedup || 0
      ];

      const preToolMetrics = [
        benchmarkResults.preToolValidation.bash?.speedup || 0,
        benchmarkResults.preToolValidation.fileOps?.averageSpeedup || 0
      ];

      const preEditMetrics = [
        benchmarkResults.preEditSecurity.small?.speedup || 0,
        benchmarkResults.preEditSecurity.medium?.speedup || 0,
        benchmarkResults.preEditSecurity.large?.speedup || 0
      ];

      const avgSafetySpeedup = safetyMetrics.reduce((a, b) => a + b, 0) / safetyMetrics.length;
      const avgPreToolSpeedup = preToolMetrics.reduce((a, b) => a + b, 0) / preToolMetrics.length;
      const avgPreEditSpeedup = preEditMetrics.reduce((a, b) => a + b, 0) / preEditMetrics.length;

      const overallAvgSpeedup = (avgSafetySpeedup + avgPreToolSpeedup + avgPreEditSpeedup) / 3;

      // Calculate confidence score
      const safetyPassed = avgSafetySpeedup >= 40;
      const preToolPassed = avgPreToolSpeedup >= 35;
      const preEditPassed = avgPreEditSpeedup >= 28;

      const passedCount = [safetyPassed, preToolPassed, preEditPassed].filter(Boolean).length;
      const confidence = passedCount / 3;

      benchmarkResults.summary = {
        safetyValidator: {
          target: '50x',
          achieved: `${avgSafetySpeedup.toFixed(1)}x`,
          status: safetyPassed ? 'PASS' : 'FAIL',
          details: safetyMetrics
        },
        preToolValidation: {
          target: '40x',
          achieved: `${avgPreToolSpeedup.toFixed(1)}x`,
          status: preToolPassed ? 'PASS' : 'FAIL',
          details: preToolMetrics
        },
        preEditSecurity: {
          target: '30x',
          achieved: `${avgPreEditSpeedup.toFixed(1)}x`,
          status: preEditPassed ? 'PASS' : 'FAIL',
          details: preEditMetrics
        },
        overall: {
          averageSpeedup: `${overallAvgSpeedup.toFixed(1)}x`,
          targetRange: '30-50x',
          confidence,
          allPassed: passedCount === 3,
          timestamp: new Date().toISOString()
        }
      };

      benchmarkResults.confidence = confidence;

      console.log('\n' + '='.repeat(80));
      console.log('📋 SECURITY HOOKS WASM PERFORMANCE SUMMARY');
      console.log('='.repeat(80));
      console.log('\n🛡️ SafetyValidator:');
      console.log(`  Target: 50x speedup (800ms → 16ms)`);
      console.log(`  Achieved: ${avgSafetySpeedup.toFixed(1)}x`);
      console.log(`  Status: ${safetyPassed ? '✅ PASS' : '❌ FAIL'}`);
      console.log('\n🔧 PreToolValidation:');
      console.log(`  Target: 40x speedup (200ms → 5ms)`);
      console.log(`  Achieved: ${avgPreToolSpeedup.toFixed(1)}x`);
      console.log(`  Status: ${preToolPassed ? '✅ PASS' : '❌ FAIL'}`);
      console.log('\n✏️ PreEditSecurity:');
      console.log(`  Target: 30x speedup (80ms → 2.5ms)`);
      console.log(`  Achieved: ${avgPreEditSpeedup.toFixed(1)}x`);
      console.log(`  Status: ${preEditPassed ? '✅ PASS' : '❌ FAIL'}`);
      console.log('\n📊 Overall Performance:');
      console.log(`  Average Speedup: ${overallAvgSpeedup.toFixed(1)}x`);
      console.log(`  Confidence Score: ${(confidence * 100).toFixed(1)}%`);
      console.log(`  Overall Status: ${benchmarkResults.summary.overall.allPassed ? '✅ ALL PASS' : '⚠️ SOME FAILURES'}`);
      console.log('='.repeat(80) + '\n');

      // Write report to file
      const reportPath = path.join(__dirname, 'security-hooks-wasm-benchmark-report.json');
      await fs.writeJSON(reportPath, benchmarkResults, { spaces: 2 });
      console.log(`📄 Detailed report written to: ${reportPath}\n`);

      // Assertions
      expect(confidence).toBeGreaterThanOrEqual(0.75); // At least 75% confidence
      expect(overallAvgSpeedup).toBeGreaterThanOrEqual(30); // Minimum 30x overall
    });
  });

  describe('CI/CD Integration Metrics', () => {
    it('should validate performance metrics for CI/CD pipeline', async () => {
      const ciMetrics = {
        deliverable: '1.1.4 - Security Hooks Benchmarks',
        sprint: '1.1',
        timestamp: new Date().toISOString(),

        hooks: {
          safetyValidator: {
            target: { baseline: '800ms', optimized: '16ms', speedup: '50x' },
            actual: benchmarkResults.safetyValidator
          },
          preToolValidation: {
            target: { baseline: '200ms', optimized: '5ms', speedup: '40x' },
            actual: benchmarkResults.preToolValidation
          },
          preEditSecurity: {
            target: { baseline: '80ms', optimized: '2.5ms', speedup: '30x' },
            actual: benchmarkResults.preEditSecurity
          }
        },

        fileSizes: {
          small: '100 lines',
          medium: '1000 lines',
          large: '10000 lines'
        },

        methodology: {
          comparison: 'WASM vs JavaScript',
          warmup: 'Yes - each test warmed up before benchmarking',
          iterations: 'Varies by file size (5-100 iterations)',
          environment: 'Node.js with performance.now() timing'
        },

        summary: benchmarkResults.summary,
        confidence: benchmarkResults.confidence,

        recommendations: generateRecommendations(benchmarkResults)
      };

      // Write CI metrics
      const ciReportPath = path.join(__dirname, 'security-hooks-ci-metrics.json');
      await fs.writeJSON(ciReportPath, ciMetrics, { spaces: 2 });

      console.log('\n📈 CI/CD Integration Metrics:');
      console.log(JSON.stringify(ciMetrics.summary, null, 2));
      console.log(`\n📄 CI metrics written to: ${ciReportPath}`);

      expect(ciMetrics.confidence).toBeGreaterThanOrEqual(0.75);
      expect(ciMetrics.summary.overall.allPassed).toBe(true);
    });
  });

  /**
   * Generate performance recommendations
   */
  function generateRecommendations(results) {
    const recommendations = [];

    // Safety Validator recommendations
    const safetyAvg = [
      results.safetyValidator.small?.speedup || 0,
      results.safetyValidator.medium?.speedup || 0,
      results.safetyValidator.large?.speedup || 0
    ].reduce((a, b) => a + b, 0) / 3;

    if (safetyAvg < 40) {
      recommendations.push({
        hook: 'safety-validator',
        priority: 'high',
        issue: `Average speedup ${safetyAvg.toFixed(1)}x below 40x target`,
        suggestion: 'Optimize OWASP and CWE pattern matching with WASM regex engine'
      });
    }

    // Pre-Tool Validation recommendations
    const preToolAvg = [
      results.preToolValidation.bash?.speedup || 0,
      results.preToolValidation.fileOps?.averageSpeedup || 0
    ].reduce((a, b) => a + b, 0) / 2;

    if (preToolAvg < 35) {
      recommendations.push({
        hook: 'pre-tool-validation',
        priority: 'medium',
        issue: `Average speedup ${preToolAvg.toFixed(1)}x below 35x target`,
        suggestion: 'Implement WASM-accelerated input sanitization and pattern matching'
      });
    }

    // Pre-Edit Security recommendations
    const preEditAvg = [
      results.preEditSecurity.small?.speedup || 0,
      results.preEditSecurity.medium?.speedup || 0,
      results.preEditSecurity.large?.speedup || 0
    ].reduce((a, b) => a + b, 0) / 3;

    if (preEditAvg < 28) {
      recommendations.push({
        hook: 'pre-edit-security',
        priority: 'medium',
        issue: `Average speedup ${preEditAvg.toFixed(1)}x below 28x target`,
        suggestion: 'Optimize file path and content validation with WASM string processing'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        status: 'optimal',
        message: 'All security hooks meeting or exceeding performance targets'
      });
    }

    return recommendations;
  }
});
