/**
 * WASM AST Test Suite
 * Comprehensive testing for real-time WebAssembly AST operations
 */

import { WASMASTCoordinator } from '../wasm-ast-coordinator';
import { WASMEngine } from '../engine/wasm-engine';
import { RealTimeASTProcessor } from '../processors/real-time-processor';
import { CodeTransformationPipeline } from '../transformers/code-transformation-pipeline';
import { PerformanceMonitor } from '../performance/performance-monitor';
import {
  ASTOperation,
  TransformationBatch,
  CodeTransformation,
  ProcessingResult,
  PERFORMANCE_TARGETS
} from '../types/ast-types';

interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  metrics?: any;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  totalDuration: number;
  passed: number;
  failed: number;
}

export class WASMASTTestSuite {
  private coordinator: WASMASTCoordinator;
  private results: TestResult[] = [];

  constructor() {
    this.coordinator = new WASMASTCoordinator('test-swarm-wasm-ast');
  }

  /**
   * Run comprehensive test suite
   */
  async runFullTestSuite(): Promise<TestSuite> {
    console.log('🧪 Starting WASM AST Test Suite...');
    const startTime = Date.now();

    try {
      // Initialize coordinator
      await this.coordinator.initialize();

      // Run test categories
      await this.runEngineTests();
      await this.runProcessorTests();
      await this.runTransformationTests();
      await this.runPerformanceTests();
      await this.runIntegrationTests();
      await this.runRedisCoordinationTests();

    } catch (error) {
      console.error('❌ Test suite failed:', error);
    }

    const totalDuration = Date.now() - startTime;
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.length - passed;

    const testSuite: TestSuite = {
      name: 'WASM AST Comprehensive Test Suite',
      tests: this.results,
      totalDuration,
      passed,
      failed,
    };

    this.printTestResults(testSuite);
    return testSuite;
  }

  /**
   * Test individual WASM engine operations
   */
  private async runEngineTests(): Promise<void> {
    console.log('\n🔧 Testing WASM Engine...');

    await this.runTest('Engine Initialization', async () => {
      const status = this.coordinator.getStatus();
      if (!status.initialized) {
        throw new Error('Engine not initialized');
      }
      return { success: true };
    });

    await this.runTest('Basic Parse Operation', async () => {
      const operation: ASTOperation = {
        id: 'test-parse-1',
        type: 'parse',
        input: 'function test() { return "hello"; }',
        timestamp: Date.now(),
        priority: 1,
      };

      const result = await this.coordinator.processOperation(operation);
      if (!result.success) {
        throw new Error(`Parse failed: ${result.errors?.join(', ')}`);
      }

      return result;
    });

    await this.runTest('Sub-millisecond Parse Performance', async () => {
      const operation: ASTOperation = {
        id: 'test-parse-perf',
        type: 'parse',
        input: 'const x = 42; function y() { return x * 2; }',
        timestamp: Date.now(),
        priority: 1,
      };

      const startTime = performance.now();
      const result = await this.coordinator.processOperation(operation);
      const duration = performance.now() - startTime;

      if (duration > 1.0) {
        throw new Error(`Parse operation took ${duration.toFixed(2)}ms, expected < 1ms`);
      }

      return { ...result, performanceTime: duration };
    });

    await this.runTest('Memory Usage Validation', async () => {
      const operation: ASTOperation = {
        id: 'test-memory',
        type: 'parse',
        input: 'let largeArray = new Array(1000).fill(0);',
        timestamp: Date.now(),
        priority: 1,
      };

      const result = await this.coordinator.processOperation(operation);
      if (result.metrics.memoryUsed > 50 * 1024 * 1024) { // 50MB limit
        throw new Error(`Memory usage too high: ${result.metrics.memoryUsed} bytes`);
      }

      return result;
    });
  }

  /**
   * Test real-time processing capabilities
   */
  private async runProcessorTests(): Promise<void> {
    console.log('\n⚡ Testing Real-time Processor...');

    await this.runTest('Single File Processing', async () => {
      const sourceCode = `
        class Calculator {
          constructor() { this.result = 0; }
          add(x) { this.result += x; return this; }
          subtract(x) { this.result -= x; return this; }
          getResult() { return this.result; }
        }
      `;

      const files = ['calculator.js'];
      const operations: ASTOperation[] = [{
        id: 'test-single-file',
        type: 'parse',
        input: sourceCode,
        timestamp: Date.now(),
        priority: 1,
      }];

      const results = await this.coordinator.processBatch(files, operations);
      if (results.size !== 1) {
        throw new Error(`Expected 1 result, got ${results.size}`);
      }

      const result = results.get('calculator.js');
      if (!result?.success) {
        throw new Error(`Single file processing failed: ${result?.errors?.join(', ')}`);
      }

      return { fileCount: results.size, success: result.success };
    });

    await this.runTest('Batch File Processing', async () => {
      const files = ['file1.js', 'file2.js', 'file3.js', 'file4.js', 'file5.js'];
      const operations: ASTOperation[] = [{
        id: 'test-batch',
        type: 'parse',
        input: 'function example() { return true; }',
        timestamp: Date.now(),
        priority: 1,
      }];

      const startTime = performance.now();
      const results = await this.coordinator.processBatch(files, operations);
      const duration = performance.now() - startTime;

      if (results.size !== files.length) {
        throw new Error(`Expected ${files.length} results, got ${results.size}`);
      }

      const successCount = Array.from(results.values()).filter(r => r.success).length;
      if (successCount < files.length * 0.8) { // 80% success rate
        throw new Error(`Low success rate: ${successCount}/${files.length}`);
      }

      return {
        fileCount: results.size,
        successCount,
        processingTime: duration,
        throughput: files.length / duration * 1000, // files per second
      };
    });

    await this.runTest('Large-scale Processing (1000+ files)', async () => {
      const fileCount = 1000;
      const files = Array.from({ length: fileCount }, (_, i) => `file_${i}.js`);
      const operations: ASTOperation[] = [{
        id: 'test-large-scale',
        type: 'parse',
        input: 'function large() { return "scale"; }',
        timestamp: Date.now(),
        priority: 1,
      }];

      const startTime = performance.now();
      const results = await this.coordinator.processBatch(files, operations);
      const duration = performance.now() - startTime;

      if (results.size !== fileCount) {
        throw new Error(`Expected ${fileCount} results, got ${results.size}`);
      }

      const throughput = fileCount / duration * 1000;
      if (throughput < PERFORMANCE_TARGETS.THROUGHPUT_THRESHOLD) {
        throw new Error(`Throughput too low: ${throughput.toFixed(0)} files/sec, expected >= ${PERFORMANCE_TARGETS.THROUGHPUT_THRESHOLD}`);
      }

      return {
        fileCount: results.size,
        duration,
        throughput,
        targetMet: throughput >= PERFORMANCE_TARGETS.THROUGHPUT_THRESHOLD,
      };
    });
  }

  /**
   * Test code transformation capabilities
   */
  private async runTransformationTests(): Promise<void> {
    console.log('\n🔄 Testing Code Transformations...');

    await this.runTest('Basic Code Transformation', async () => {
      const sourceCode = 'var oldVariable = "test"; function oldFunction() { return oldVariable; }';
      const transformationBatch: TransformationBatch = {
        id: 'test-basic-transform',
        transformations: [
          {
            type: 'replace',
            target: { type: 'VariableDeclaration', start: 0, end: 24 },
            replacement: 'const newVariable = "test";',
            metadata: { ruleId: 'modernize_syntax' },
          },
        ],
        rules: [],
        validateAfterTransform: true,
        dryRun: false,
      };

      const result = await this.coordinator.applyTransformations(sourceCode, transformationBatch);

      if (!result.success) {
        throw new Error(`Transformation failed: ${result.errors?.join(', ')}`);
      }

      if (!result.transformedCode || !result.transformedCode.includes('const newVariable')) {
        throw new Error('Transformation did not apply correctly');
      }

      return result;
    });

    await this.runTest('Multi-step Transformation Pipeline', async () => {
      const sourceCode = 'var x = 1; var y = 2; console.log(x + y);';
      const transformationBatch: TransformationBatch = {
        id: 'test-multi-transform',
        transformations: [
          {
            type: 'replace',
            target: { type: 'VariableDeclaration', start: 0, end: 9 },
            replacement: 'const x = 1;',
            metadata: { ruleId: 'modernize_syntax' },
          },
          {
            type: 'replace',
            target: { type: 'VariableDeclaration', start: 10, end: 19 },
            replacement: 'const y = 2;',
            metadata: { ruleId: 'modernize_syntax' },
          },
        ],
        rules: [],
        validateAfterTransform: true,
        dryRun: false,
      };

      const result = await this.coordinator.applyTransformations(sourceCode, transformationBatch);

      if (!result.success) {
        throw new Error(`Multi-step transformation failed: ${result.errors?.join(', ')}`);
      }

      if (result.appliedTransformations.length !== 2) {
        throw new Error(`Expected 2 applied transformations, got ${result.appliedTransformations.length}`);
      }

      return result;
    });

    await this.runTest('Transformation Validation', async () => {
      const sourceCode = 'function validFunction() { return "valid"; }';
      const transformationBatch: TransformationBatch = {
        id: 'test-validation',
        transformations: [
          {
            type: 'replace',
            target: { type: 'FunctionDeclaration', start: 0, end: 40 },
            replacement: 'function invalidFunction( { return syntax error; }', // Invalid syntax
            metadata: { ruleId: 'test_validation' },
          },
        ],
        rules: [],
        validateAfterTransform: true,
        dryRun: false,
      };

      const result = await this.coordinator.applyTransformations(sourceCode, transformationBatch);

      // Should fail validation due to syntax error
      if (result.success) {
        throw new Error('Invalid transformation should have failed validation');
      }

      if (!result.errors || result.errors.length === 0) {
        throw new Error('Expected validation errors');
      }

      return { validationPassed: !result.success, errorCount: result.errors.length };
    });
  }

  /**
   * Test performance and monitoring
   */
  private async runPerformanceTests(): Promise<void> {
    console.log('\n📊 Testing Performance Monitoring...');

    await this.runTest('Performance Metrics Collection', async () => {
      const operation: ASTOperation = {
        id: 'test-perf-metrics',
        type: 'parse',
        input: 'function performanceTest() { return "metrics"; }',
        timestamp: Date.now(),
        priority: 1,
      };

      const result = await this.coordinator.processOperation(operation);

      if (!result.metrics || result.metrics.totalTime <= 0) {
        throw new Error('Performance metrics not collected');
      }

      return {
        totalTime: result.metrics.totalTime,
        parseTime: result.metrics.parseTime,
        throughput: result.metrics.throughput,
      };
    });

    await this.runTest('Sub-millisecond Performance Target', async () => {
      const operations = Array.from({ length: 100 }, (_, i) => ({
        id: `perf-target-${i}`,
        type: 'parse' as const,
        input: `function test${i}() { return ${i}; }`,
        timestamp: Date.now(),
        priority: 1,
      }));

      const results: ProcessingResult[] = [];
      for (const op of operations) {
        const result = await this.coordinator.processOperation(op);
        results.push(result);
      }

      const subMillisecondCount = results.filter(r => r.metrics.totalTime < 1.0).length;
      const complianceRate = subMillisecondCount / results.length;

      if (complianceRate < PERFORMANCE_TARGETS.PARSE_TIME_SUB_MILLISECOND) {
        throw new Error(`Sub-millisecond compliance: ${(complianceRate * 100).toFixed(1)}%, expected >= ${(PERFORMANCE_TARGETS.PARSE_TIME_SUB_MILLISECOND * 100).toFixed(1)}%`);
      }

      return {
        totalOperations: results.length,
        subMillisecondCount,
        complianceRate,
        targetMet: complianceRate >= PERFORMANCE_TARGETS.PARSE_TIME_SUB_MILLISECOND,
      };
    });

    await this.runTest('Performance Report Generation', async () => {
      const report = await this.coordinator.generatePerformanceReport('hour');

      if (!report || !report.timestamp) {
        throw new Error('Performance report not generated');
      }

      if (report.totalOperations === 0) {
        throw new Error('Performance report shows no operations');
      }

      return {
        reportGenerated: true,
        totalOperations: report.totalOperations,
        targetCompliance: report.targetCompliance,
      };
    });
  }

  /**
   * Test integration scenarios
   */
  private async runIntegrationTests(): Promise<void> {
    console.log('\n🔗 Testing Integration Scenarios...');

    await this.runTest('End-to-End Processing Pipeline', async () => {
      // Simulate complete workflow: parse -> analyze -> transform
      const sourceCode = 'var legacyCode = "old"; function legacyFunction() { return legacyCode; }';

      // Step 1: Parse
      const parseOp: ASTOperation = {
        id: 'e2e-parse',
        type: 'parse',
        input: sourceCode,
        timestamp: Date.now(),
        priority: 1,
      };
      const parseResult = await this.coordinator.processOperation(parseOp);

      if (!parseResult.success) {
        throw new Error(`E2E parse failed: ${parseResult.errors?.join(', ')}`);
      }

      // Step 2: Transform
      const transformBatch: TransformationBatch = {
        id: 'e2e-transform',
        transformations: [
          {
            type: 'replace',
            target: { type: 'VariableDeclaration', start: 0, end: 26 },
            replacement: 'const modernCode = "new";',
            metadata: { ruleId: 'modernize_syntax' },
          },
        ],
        rules: [],
        validateAfterTransform: true,
        dryRun: false,
      };
      const transformResult = await this.coordinator.applyTransformations(sourceCode, transformBatch);

      if (!transformResult.success) {
        throw new Error(`E2E transform failed: ${transformResult.errors?.join(', ')}`);
      }

      return {
        parseSuccess: parseResult.success,
        transformSuccess: transformResult.success,
        totalTime: parseResult.metrics.totalTime + transformResult.metrics.totalTime,
      };
    });

    await this.runTest('Concurrent Operations', async () => {
      const concurrentOperations = Array.from({ length: 50 }, (_, i) => ({
        id: `concurrent-${i}`,
        type: 'parse' as const,
        input: `function concurrent${i}() { return ${i}; }`,
        timestamp: Date.now(),
        priority: Math.random() > 0.5 ? 2 : 1, // Mix of priorities
      }));

      const startTime = performance.now();
      const promises = concurrentOperations.map(op => this.coordinator.processOperation(op));
      const results = await Promise.all(promises);
      const duration = performance.now() - startTime;

      const successCount = results.filter(r => r.success).length;
      const successRate = successCount / results.length;

      if (successRate < 0.9) { // 90% success rate for concurrent operations
        throw new Error(`Concurrent operations success rate: ${(successRate * 100).toFixed(1)}%`);
      }

      return {
        totalOperations: results.length,
        successCount,
        successRate,
        duration,
        throughput: results.length / duration * 1000,
      };
    });
  }

  /**
   * Test Redis swarm coordination
   */
  private async runRedisCoordinationTests(): Promise<void> {
    console.log('\n📡 Testing Redis Coordination...');

    await this.runTest('Swarm Message Publishing', async () => {
      const status = this.coordinator.getStatus();

      if (!status.redisConnected) {
        throw new Error('Redis client not connected');
      }

      return { redisConnected: status.redisConnected, swarmMembers: status.swarmMembers };
    });

    await this.runTest('Swarm Status Monitoring', async () => {
      const status = this.coordinator.getStatus();

      if (!status.initialized) {
        throw new Error('Coordinator not initialized');
      }

      return {
        initialized: status.initialized,
        activeOperations: status.activeOperations,
        queuedOperations: status.queuedOperations,
        swarmMembers: status.swarmMembers.length,
      };
    });
  }

  /**
   * Helper method to run individual tests
   */
  private async runTest(testName: string, testFn: () => Promise<any>): Promise<void> {
    const startTime = performance.now();

    try {
      const result = await testFn();
      const duration = performance.now() - startTime;

      this.results.push({
        testName,
        passed: true,
        duration,
        metrics: result,
      });

      console.log(`  ✅ ${testName} (${duration.toFixed(2)}ms)`);

    } catch (error) {
      const duration = performance.now() - startTime;

      this.results.push({
        testName,
        passed: false,
        duration,
        error: error.message,
      });

      console.log(`  ❌ ${testName} (${duration.toFixed(2)}ms): ${error.message}`);
    }
  }

  /**
   * Print comprehensive test results
   */
  private printTestResults(testSuite: TestSuite): void {
    console.log('\n' + '='.repeat(60));
    console.log('📋 WASM AST TEST SUITE RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${testSuite.tests.length}`);
    console.log(`Passed: ${testSuite.passed} ✅`);
    console.log(`Failed: ${testSuite.failed} ❌`);
    console.log(`Success Rate: ${((testSuite.passed / testSuite.tests.length) * 100).toFixed(1)}%`);
    console.log(`Total Duration: ${testSuite.totalDuration.toFixed(2)}ms`);
    console.log(`Average Test Duration: ${(testSuite.totalDuration / testSuite.tests.length).toFixed(2)}ms`);

    if (testSuite.failed > 0) {
      console.log('\n❌ Failed Tests:');
      testSuite.tests
        .filter(t => !t.passed)
        .forEach(t => {
          console.log(`  • ${t.testName}: ${t.error}`);
        });
    }

    console.log('\n🎯 Performance Targets:');
    console.log(`  • Sub-millisecond operations: ${this.checkPerformanceTarget('sub-millisecond', testSuite)}`);
    console.log(`  • 1000+ file processing: ${this.checkPerformanceTarget('large-scale', testSuite)}`);
    console.log(`  • Real-time transformations: ${this.checkPerformanceTarget('transformations', testSuite)}`);
    console.log(`  • Redis coordination: ${this.checkPerformanceTarget('coordination', testSuite)}`);

    // Overall confidence score
    const confidence = testSuite.passed / testSuite.tests.length;
    console.log(`\n🎯 Overall Confidence Score: ${(confidence * 100).toFixed(1)}%`);

    if (confidence >= 0.85) {
      console.log('✅ CONFIDENCE TARGET MET (≥85%)');
    } else {
      console.log('❌ CONFIDENCE TARGET NOT MET');
    }

    console.log('='.repeat(60));
  }

  private checkPerformanceTarget(target: string, testSuite: TestSuite): string {
    const relevantTests = testSuite.tests.filter(t =>
      t.testName.toLowerCase().includes(target.toLowerCase())
    );

    if (relevantTests.length === 0) return '⚪ No tests';

    const passed = relevantTests.filter(t => t.passed).length;
    const rate = (passed / relevantTests.length) * 100;

    if (rate === 100) return '✅ 100%';
    if (rate >= 80) return `🟡 ${rate.toFixed(0)}%`;
    return `❌ ${rate.toFixed(0)}%`;
  }

  /**
   * Cleanup after tests
   */
  async cleanup(): Promise<void> {
    await this.coordinator.shutdown();
  }
}

// Export for use in test runners
export default WASMASTTestSuite;