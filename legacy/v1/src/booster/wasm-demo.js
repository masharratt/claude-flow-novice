#!/usr/bin/env node

/**
 * Real WASM Agent-Booster Demo
 *
 * Demonstrates the actual 52x performance implementation with:
 * - Real WebAssembly runtime
 * - Sub-millisecond AST operations
 * - Large-scale file processing
 * - Performance benchmarking
 */

import { performance } from 'perf_hooks';
import { connectRedis } from '../cli/utils/redis-client.js';
import WASMInstanceManager from './WASMInstanceManager.js';
import PerformanceBenchmark from './performance-benchmark.js';

async function runWASMDemo() {
  console.log('🚀 Real WASM Agent-Booster Demo - 52x Performance Implementation');
  console.log('=' .repeat(70));

  const startTime = performance.now();

  try {
    // Initialize Redis for coordination
    console.log('📡 Connecting to Redis for coordination...');
    const redisClient = await connectRedis({
      host: 'localhost',
      port: 6379,
      database: 0
    });

    // Initialize WASM Instance Manager
    console.log('⚡ Initializing Real WASM Instance Manager...');
    const wasmManager = new WASMInstanceManager({
      poolSize: 4,
      memoryLimit: 256, // MB
      taskTimeout: 60000, // 60 seconds
      redisKey: 'swarm:wasm-performance'
    });

    await wasmManager.initialize();

    // Demo 1: Code Optimization with Real Performance
    console.log('\n🔥 Demo 1: Real Code Optimization with 52x Performance');
    console.log('-'.repeat(50));

    const optimizationTask = {
      taskId: 'demo-optimization-1',
      taskType: 'code-optimization',
      priority: 'high'
    };

    const testCode = `
      function fibonacci(n) {
        if (n <= 1) return n;
        return fibonacci(n - 1) + fibonacci(n - 2);
      }

      function processArray(data) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
          if (i % 2 === 0) {
            result.push(data[i] * 2);
          } else {
            result.push(data[i] + 1);
          }
        }
        return result;
      }

      const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const processed = processArray(numbers);
      console.log('Processed:', processed);
    `;

    const instance1 = await wasmManager.acquireInstance(optimizationTask);
    const optimizationResult = await instance1.execute({
      code: testCode
    });

    console.log(`✅ Code optimization completed in ${optimizationResult.executionTime.toFixed(2)}ms`);
    console.log(`🚀 Performance multiplier: ${optimizationResult.performanceMultiplier}x`);
    console.log(`💾 Memory used: ${(optimizationResult.memoryUsed / (1024 * 1024)).toFixed(2)} MB`);

    await wasmManager.releaseInstance(instance1.instanceId);

    // Demo 2: AST Analysis with Sub-millisecond Performance
    console.log('\n🌳 Demo 2: Sub-millisecond AST Analysis');
    console.log('-'.repeat(50));

    const astTask = {
      taskId: 'demo-ast-1',
      taskType: 'ast-analysis',
      priority: 'high'
    };

    const instance2 = await wasmManager.acquireInstance(astTask);
    const astResult = await instance2.execute({
      code: testCode
    });

    console.log(`✅ AST analysis completed in ${astResult.executionTime.toFixed(2)}ms`);
    console.log(`📊 Functions found: ${astResult.result.ast.functions.length}`);
    console.log(`📊 Complexity score: ${astResult.result.analysis.complexity}`);
    console.log(`📊 Maintainability: ${astResult.result.analysis.maintainability}%`);

    await wasmManager.releaseInstance(instance2.instanceId);

    // Demo 3: Batch File Processing
    console.log('\n📁 Demo 3: Large-Scale File Processing');
    console.log('-'.repeat(50));

    const fileTask = {
      taskId: 'demo-files-1',
      taskType: 'file-processing',
      priority: 'normal'
    };

    // Create test files
    const testFiles = [
      {
        name: 'test1.js',
        content: `
          class Calculator {
            add(a, b) { return a + b; }
            multiply(a, b) { return a * b; }
          }
          const calc = new Calculator();
          console.log(calc.add(5, 3));
        `
      },
      {
        name: 'test2.js',
        content: `
          import { utils } from './utils';
          export function processData(data) {
            return data.map(item => ({
              ...item,
              processed: true,
              timestamp: Date.now()
            }));
          }
        `
      },
      {
        name: 'test3.js',
        content: `
          async function fetchData(url) {
            try {
              const response = await fetch(url);
              const data = await response.json();
              return data;
            } catch (error) {
              console.error('Fetch error:', error);
              return null;
            }
          }
        `
      }
    ];

    const instance3 = await wasmManager.acquireInstance(fileTask);
    const fileResult = await instance3.execute({
      files: testFiles
    });

    console.log(`✅ File processing completed in ${fileResult.executionTime.toFixed(2)}ms`);
    console.log(`📁 Files processed: ${fileResult.result.files.filter(f => f.success).length}/${testFiles.length}`);
    console.log(`💾 Total memory used: ${(fileResult.memoryUsed / (1024 * 1024)).toFixed(2)} MB`);

    await wasmManager.releaseInstance(instance3.instanceId);

    // Demo 4: Performance Benchmarking
    console.log('\n📊 Demo 4: Performance Benchmarking');
    console.log('-'.repeat(50));

    // Import benchmark components
    const { WASMRuntime } = await import('./wasm-runtime.js');
    const { ASTOperationsEngine } = await import('./ast-operations-engine.js');
    const { LargeScaleFileProcessor } = await import('./large-scale-file-processor.js');

    // Initialize components for benchmarking
    const wasmRuntime = new WASMRuntime();
    const astEngine = new ASTOperationsEngine();
    const fileProcessor = new LargeScaleFileProcessor({ maxConcurrency: 2 });

    await wasmRuntime.initialize();

    const benchmark = new PerformanceBenchmark({
      benchmarkIterations: 100,
      warmupIterations: 10,
      targetPerformanceMultiplier: 52
    });

    console.log('🔥 Running performance benchmark...');
    const benchmarkResults = await benchmark.runBenchmark(wasmRuntime, astEngine, fileProcessor);

    console.log(`✅ Benchmark completed with score: ${benchmarkResults.overallScore.toFixed(2)}%`);
    console.log(`🎯 Target achieved: ${benchmarkResults.targetAchieved ? 'YES' : 'NO'}`);
    console.log(`⚡ WASM performance: ${benchmarkResults.metrics.wasm.performanceMultiplier.toFixed(2)}x`);
    console.log(`🌳 AST sub-ms operations: ${benchmarkResults.metrics.ast.subMillisecondOperations}`);
    console.log(`📁 File throughput: ${benchmarkResults.metrics.fileProcessing.throughputMBps.toFixed(2)} MB/s`);

    // Publish results to Redis
    console.log('\n📡 Publishing results to Redis...');
    await redisClient.publish('swarm:wasm-performance', JSON.stringify({
      type: 'demo-completed',
      timestamp: Date.now(),
      results: {
        optimization: {
          executionTime: optimizationResult.executionTime,
          performanceMultiplier: optimizationResult.performanceMultiplier
        },
        ast: {
          executionTime: astResult.executionTime,
          complexity: astResult.result.analysis.complexity
        },
        fileProcessing: {
          executionTime: fileResult.executionTime,
          filesProcessed: fileResult.result.files.filter(f => f.success).length
        },
        benchmark: {
          overallScore: benchmarkResults.overallScore,
          targetAchieved: benchmarkResults.targetAchieved,
          wasmPerformance: benchmarkResults.metrics.wasm.performanceMultiplier
        }
      }
    }));

    // Show final status
    const totalDemoTime = performance.now() - startTime;
    console.log('\n' + '='.repeat(70));
    console.log('🎉 Real WASM Agent-Booster Demo Completed Successfully!');
    console.log(`⏱️  Total demo time: ${totalDemoTime.toFixed(2)}ms`);
    console.log(`🚀 Real 52x performance achieved: ${benchmarkResults.targetAchieved ? 'YES' : 'NO'}`);
    console.log(`📊 Overall performance score: ${benchmarkResults.overallScore.toFixed(2)}%`);
    console.log('='.repeat(70));

    // Get final manager status
    const finalStatus = wasmManager.getStatus();
    console.log('\n📊 Final WASM Manager Status:');
    console.log(`   Instances available: ${finalStatus.instances.available}/${finalStatus.instances.total}`);
    console.log(`   Total tasks completed: ${finalStatus.metrics.completedTasks}`);
    console.log(`   Average execution time: ${finalStatus.metrics.averageExecutionTime.toFixed(2)}ms`);
    console.log(`   Error rate: ${finalStatus.metrics.errorRate.toFixed(2)}%`);

    // Cleanup
    console.log('\n🧹 Cleaning up resources...');
    await wasmManager.shutdown();
    await redisClient.quit();

    console.log('✅ Demo completed successfully!');

    return {
      success: true,
      totalDemoTime,
      benchmarkResults,
      performanceAchieved: benchmarkResults.targetAchieved
    };

  } catch (error) {
    console.error('❌ Demo failed:', error);
    return {
      success: false,
      error: error.message,
      totalDemoTime: performance.now() - startTime
    };
  }
}

// Run demo if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runWASMDemo()
    .then(result => {
      console.log('\n🏁 Demo finished with result:', result.success ? 'SUCCESS' : 'FAILED');
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}

export default runWASMDemo;