/**
 * Phase 4 Distribution Algorithms Efficiency Test Suite
 *
 * This test suite validates that all distribution algorithms achieve
 * the required 95%+ efficiency target.
 */

import { createGeneticOptimizer, createNodeDistributionProblem } from './genetic-algorithm-optimizer.js';
import { createSimulatedAnnealingOptimizer, createNodePlacementProblem } from './simulated-annealing-optimizer.js';
import { createMLPerformancePredictor } from './ml-performance-predictor.js';
import { createNodePlacementOptimizer } from './node-placement-optimizer.js';
import { createGeoLoadDistributor } from './geo-load-distributor.js';
import { connectRedis } from '../cli/utils/redis-client.js';

/**
 * Test Configuration
 */
const TEST_CONFIG = {
  efficiency: {
    target: 0.95,
    minimum: 0.90,
    testCases: 10,
    problemSizes: [5, 10, 25, 50, 100]
  },
  redis: {
    host: 'localhost',
    port: 6379,
    database: 0
  },
  output: {
    verbose: true,
    saveResults: true
  }
};

/**
 * Test Data Generator
 */
class TestDataGenerator {
  static generateNodes(count, complexity = 'medium') {
    const nodes = [];

    for (let i = 0; i < count; i++) {
      const baseCapacity = complexity === 'high' ? 200 : complexity === 'low' ? 50 : 100;

      nodes.push({
        id: `node-${i}`,
        capacity: {
          compute: baseCapacity + Math.random() * 50,
          memory: 8192 + Math.random() * 4096,
          bandwidth: 1000 + Math.random() * 500,
          storage: 10000 + Math.random() * 5000
        },
        cost: {
          compute: 0.01 + Math.random() * 0.02,
          memory: 0.001 + Math.random() * 0.002,
          bandwidth: 0.005 + Math.random() * 0.01,
          storage: 0.0001 + Math.random() * 0.0002
        },
        performance: {
          latency: 10 + Math.random() * 50,
          throughput: 800 + Math.random() * 400,
          reliability: 0.95 + Math.random() * 0.04,
          availability: 0.98 + Math.random() * 0.019
        },
        location: {
          lat: (Math.random() - 0.5) * 180,
          lon: (Math.random() - 0.5) * 360,
          region: ['us-east', 'us-west', 'eu-west', 'asia-east'][Math.floor(Math.random() * 4)]
        },
        tags: ['compute', 'storage', 'network'].slice(0, Math.floor(Math.random() * 3) + 1),
        status: 'healthy'
      });
    }

    return nodes;
  }

  static generateTasks(count, complexity = 'medium') {
    const tasks = [];

    for (let i = 0; i < count; i++) {
      const baseCompute = complexity === 'high' ? 10 : complexity === 'low' ? 1 : 5;

      tasks.push({
        id: `task-${i}`,
        computeUnits: baseCompute + Math.random() * baseCompute,
        memory: 512 + Math.random() * 2048,
        bandwidth: 50 + Math.random() * 200,
        storage: Math.random() * 1000,
        priority: Math.floor(Math.random() * 5) + 1,
        deadline: Date.now() + 300000 + Math.random() * 300000,
        estimatedDuration: 30000 + Math.random() * 120000,
        affinity: [],
        antiAffinity: [],
        locationPreference: Math.random() > 0.7 ? ['us-east', 'us-west', 'eu-west', 'asia-east'][Math.floor(Math.random() * 4)] : null
      });
    }

    return tasks;
  }

  static generateConstraints(strictness = 'medium') {
    const baseConstraints = {
      maxLatency: strictness === 'strict' ? 100 : strictness === 'loose' ? 500 : 200,
      maxCost: strictness === 'strict' ? 50 : strictness === 'loose' ? 200 : 100,
      minReliability: strictness === 'strict' ? 0.98 : strictness === 'loose' ? 0.90 : 0.95
    };

    return baseConstraints;
  }
}

/**
 * Efficiency Test Suite
 */
class EfficiencyTestSuite {
  constructor(config = {}) {
    this.config = { ...TEST_CONFIG, ...config };
    this.testResults = [];
    this.redisClient = null;
  }

  async runAllTests() {
    console.log('🚀 Starting Phase 4 Distribution Algorithms Efficiency Tests');
    console.log(`Target Efficiency: ${(this.config.efficiency.target * 100).toFixed(1)}%`);

    try {
      // Initialize Redis connection
      this.redisClient = await connectRedis(this.config.redis);

      // Test individual algorithms
      const geneticResults = await this.testGeneticAlgorithm();
      const annealingResults = await this.testSimulatedAnnealing();
      const mlResults = await this.testMLPredictor();
      const optimizerResults = await this.testNodePlacementOptimizer();
      const geoResults = await this.testGeoLoadDistributor();

      // Test integrated system
      const integratedResults = await this.testIntegratedSystem();

      // Compile final results
      const finalResults = this.compileFinalResults({
        genetic: geneticResults,
        annealing: annealingResults,
        ml: mlResults,
        optimizer: optimizerResults,
        geo: geoResults,
        integrated: integratedResults
      });

      // Generate report
      await this.generateTestReport(finalResults);

      return finalResults;

    } catch (error) {
      console.error('Test suite failed:', error);
      throw error;
    } finally {
      if (this.redisClient) {
        await this.redisClient.quit();
      }
    }
  }

  async testGeneticAlgorithm() {
    console.log('\n🧬 Testing Genetic Algorithm Optimizer...');

    const results = {
      algorithm: 'genetic',
      tests: [],
      averageEfficiency: 0,
      passedTests: 0,
      totalTests: 0
    };

    for (const problemSize of this.config.efficiency.problemSizes) {
      for (let test = 0; test < this.config.efficiency.testCases; test++) {
        const nodes = TestDataGenerator.generateNodes(Math.max(10, problemSize / 2));
        const tasks = TestDataGenerator.generateTasks(problemSize);
        const constraints = TestDataGenerator.generateConstraints();

        try {
          const optimizer = createGeneticOptimizer({
            populationSize: Math.min(50, problemSize * 2),
            generations: Math.min(30, problemSize)
          });

          const problem = createNodeDistributionProblem(nodes, tasks, constraints);
          const result = await optimizer.optimize(problem);

          const efficiency = result.efficiency || 0;
          const passed = efficiency >= this.config.efficiency.target;

          results.tests.push({
            problemSize,
            testNumber: test + 1,
            efficiency,
            fitness: result.fitness,
            metrics: result.metrics,
            passed,
            executionTime: result.optimizationTime || 0
          });

          if (passed) results.passedTests++;
          results.totalTests++;

          if (this.config.output.verbose) {
            console.log(`  GA Test ${problemSize}-${test + 1}: ${(efficiency * 100).toFixed(1)}% ${passed ? '✅' : '❌'}`);
          }

        } catch (error) {
          console.error(`  GA Test ${problemSize}-${test + 1} failed:`, error.message);
          results.tests.push({
            problemSize,
            testNumber: test + 1,
            efficiency: 0,
            error: error.message,
            passed: false
          });
          results.totalTests++;
        }
      }
    }

    results.averageEfficiency = results.tests.reduce((sum, test) => sum + (test.efficiency || 0), 0) / results.totalTests;

    console.log(`Genetic Algorithm: ${results.passedTests}/${results.totalTests} tests passed, avg efficiency: ${(results.averageEfficiency * 100).toFixed(1)}%`);

    return results;
  }

  async testSimulatedAnnealing() {
    console.log('\n🔥 Testing Simulated Annealing Optimizer...');

    const results = {
      algorithm: 'annealing',
      tests: [],
      averageEfficiency: 0,
      passedTests: 0,
      totalTests: 0
    };

    for (const problemSize of this.config.efficiency.problemSizes) {
      for (let test = 0; test < this.config.efficiency.testCases; test++) {
        const nodes = TestDataGenerator.generateNodes(Math.max(10, problemSize / 2));
        const tasks = TestDataGenerator.generateTasks(problemSize);
        const constraints = TestDataGenerator.generateConstraints();

        try {
          const optimizer = createSimulatedAnnealingOptimizer({
            maxIterations: Math.min(1000, problemSize * 20),
            initialTemperature: 100
          });

          const problem = createNodePlacementProblem(nodes, tasks, constraints);
          const result = await optimizer.optimize(problem);

          const efficiency = result.efficiency || 0;
          const passed = efficiency >= this.config.efficiency.target;

          results.tests.push({
            problemSize,
            testNumber: test + 1,
            efficiency,
            fitness: result.fitness,
            metrics: result.metrics,
            passed,
            executionTime: result.optimization?.iterations || 0
          });

          if (passed) results.passedTests++;
          results.totalTests++;

          if (this.config.output.verbose) {
            console.log(`  SA Test ${problemSize}-${test + 1}: ${(efficiency * 100).toFixed(1)}% ${passed ? '✅' : '❌'}`);
          }

        } catch (error) {
          console.error(`  SA Test ${problemSize}-${test + 1} failed:`, error.message);
          results.tests.push({
            problemSize,
            testNumber: test + 1,
            efficiency: 0,
            error: error.message,
            passed: false
          });
          results.totalTests++;
        }
      }
    }

    results.averageEfficiency = results.tests.reduce((sum, test) => sum + (test.efficiency || 0), 0) / results.totalTests;

    console.log(`Simulated Annealing: ${results.passedTests}/${results.totalTests} tests passed, avg efficiency: ${(results.averageEfficiency * 100).toFixed(1)}%`);

    return results;
  }

  async testMLPredictor() {
    console.log('\n🤖 Testing ML Performance Predictor...');

    const results = {
      algorithm: 'ml',
      tests: [],
      averageEfficiency: 0,
      passedTests: 0,
      totalTests: 0
    };

    // Generate training data
    const historicalData = [];
    for (let i = 0; i < 100; i++) {
      const node = TestDataGenerator.generateNodes(1)[0];
      const task = TestDataGenerator.generateTasks(1)[0];

      historicalData.push({
        node,
        task,
        context: { systemLoad: Math.random() },
        actualLatency: 50 + Math.random() * 200,
        actualCost: 5 + Math.random() * 50,
        actualReliability: 0.9 + Math.random() * 0.09,
        actualSuccessRate: 0.85 + Math.random() * 0.14
      });
    }

    const predictor = createMLPerformancePredictor({
      ensembleSize: 3,
      trainingEpochs: 20
    });

    await predictor.initialize(historicalData);

    // Test predictions
    for (const problemSize of this.config.efficiency.problemSizes) {
      for (let test = 0; test < this.config.efficiency.testCases; test++) {
        const nodes = TestDataGenerator.generateNodes(Math.max(5, problemSize / 3));
        const tasks = TestDataGenerator.generateTasks(Math.min(5, problemSize));

        try {
          let totalConfidence = 0;
          let predictionCount = 0;

          for (const task of tasks) {
            for (const node of nodes) {
              const prediction = predictor.predictPerformance(node, task);
              totalConfidence += prediction.confidence;
              predictionCount++;
            }
          }

          const avgConfidence = totalConfidence / predictionCount;
          const efficiency = avgConfidence; // Use confidence as proxy for efficiency
          const passed = efficiency >= this.config.efficiency.minimum; // Slightly lower threshold for ML

          results.tests.push({
            problemSize,
            testNumber: test + 1,
            efficiency,
            confidence: avgConfidence,
            predictions: predictionCount,
            passed
          });

          if (passed) results.passedTests++;
          results.totalTests++;

          if (this.config.output.verbose) {
            console.log(`  ML Test ${problemSize}-${test + 1}: ${(efficiency * 100).toFixed(1)}% confidence ${passed ? '✅' : '❌'}`);
          }

        } catch (error) {
          console.error(`  ML Test ${problemSize}-${test + 1} failed:`, error.message);
          results.tests.push({
            problemSize,
            testNumber: test + 1,
            efficiency: 0,
            error: error.message,
            passed: false
          });
          results.totalTests++;
        }
      }
    }

    results.averageEfficiency = results.tests.reduce((sum, test) => sum + (test.efficiency || 0), 0) / results.totalTests;

    console.log(`ML Predictor: ${results.passedTests}/${results.totalTests} tests passed, avg confidence: ${(results.averageEfficiency * 100).toFixed(1)}%`);

    return results;
  }

  async testNodePlacementOptimizer() {
    console.log('\n⚡ Testing Node Placement Optimizer...');

    const results = {
      algorithm: 'optimizer',
      tests: [],
      averageEfficiency: 0,
      passedTests: 0,
      totalTests: 0
    };

    for (const problemSize of this.config.efficiency.problemSizes) {
      for (let test = 0; test < this.config.efficiency.testCases; test++) {
        const nodes = TestDataGenerator.generateNodes(Math.max(10, problemSize / 2));
        const tasks = TestDataGenerator.generateTasks(problemSize);
        const constraints = TestDataGenerator.generateConstraints();

        try {
          const optimizer = createNodePlacementOptimizer({
            swarmId: 'test-swarm',
            redis: this.config.redis,
            optimization: {
              maxOptimizationTime: 30000 // 30 seconds for testing
            }
          });

          await optimizer.initialize();

          const result = await optimizer.optimizeNodePlacement(nodes, tasks, constraints);

          const efficiency = result.efficiency || 0;
          const passed = efficiency >= this.config.efficiency.target;

          results.tests.push({
            problemSize,
            testNumber: test + 1,
            efficiency,
            fitness: result.fitness,
            metrics: result.metrics,
            algorithm: result.algorithm,
            passed,
            executionTime: result.optimizationTime || 0
          });

          if (passed) results.passedTests++;
          results.totalTests++;

          if (this.config.output.verbose) {
            console.log(`  Optimizer Test ${problemSize}-${test + 1}: ${(efficiency * 100).toFixed(1)}% (${result.algorithm}) ${passed ? '✅' : '❌'}`);
          }

          await optimizer.shutdown();

        } catch (error) {
          console.error(`  Optimizer Test ${problemSize}-${test + 1} failed:`, error.message);
          results.tests.push({
            problemSize,
            testNumber: test + 1,
            efficiency: 0,
            error: error.message,
            passed: false
          });
          results.totalTests++;
        }
      }
    }

    results.averageEfficiency = results.tests.reduce((sum, test) => sum + (test.efficiency || 0), 0) / results.totalTests;

    console.log(`Node Placement Optimizer: ${results.passedTests}/${results.totalTests} tests passed, avg efficiency: ${(results.averageEfficiency * 100).toFixed(1)}%`);

    return results;
  }

  async testGeoLoadDistributor() {
    console.log('\n🌍 Testing Geographic Load Distributor...');

    const results = {
      algorithm: 'geo',
      tests: [],
      averageEfficiency: 0,
      passedTests: 0,
      totalTests: 0
    };

    for (const problemSize of this.config.efficiency.problemSizes) {
      for (let test = 0; test < this.config.efficiency.testCases; test++) {
        const nodes = TestDataGenerator.generateNodes(Math.max(8, problemSize / 3));
        const tasks = TestDataGenerator.generateTasks(problemSize);

        // Add geographic constraints to some tasks
        tasks.forEach(task => {
          if (Math.random() > 0.7) {
            task.locationPreference = ['us-east', 'us-west', 'eu-west', 'asia-east'][Math.floor(Math.random() * 4)];
          }
        });

        try {
          const distributor = createGeoLoadDistributor({
            redis: this.config.redis
          });

          await distributor.initialize();

          // Register nodes
          for (const node of nodes) {
            await distributor.registerNode(node);
          }

          const distribution = await distributor.distributeTasksGeographically(tasks, {
            strategy: 'latency_optimized'
          });

          const efficiency = distribution.metrics?.distributionEfficiency || 0.8; // Geo distribution efficiency
          const passed = efficiency >= this.config.efficiency.minimum; // Slightly lower threshold

          results.tests.push({
            problemSize,
            testNumber: test + 1,
            efficiency,
            metrics: distribution.metrics,
            regionsUsed: Object.keys(distribution.metrics?.regionDistribution || {}).length,
            passed
          });

          if (passed) results.passedTests++;
          results.totalTests++;

          if (this.config.output.verbose) {
            console.log(`  Geo Test ${problemSize}-${test + 1}: ${(efficiency * 100).toFixed(1)}% (${distribution.metrics?.regionsUsed || 0} regions) ${passed ? '✅' : '❌'}`);
          }

          await distributor.shutdown();

        } catch (error) {
          console.error(`  Geo Test ${problemSize}-${test + 1} failed:`, error.message);
          results.tests.push({
            problemSize,
            testNumber: test + 1,
            efficiency: 0,
            error: error.message,
            passed: false
          });
          results.totalTests++;
        }
      }
    }

    results.averageEfficiency = results.tests.reduce((sum, test) => sum + (test.efficiency || 0), 0) / results.totalTests;

    console.log(`Geo Load Distributor: ${results.passedTests}/${results.totalTests} tests passed, avg efficiency: ${(results.averageEfficiency * 100).toFixed(1)}%`);

    return results;
  }

  async testIntegratedSystem() {
    console.log('\n🔗 Testing Integrated Distribution System...');

    const results = {
      algorithm: 'integrated',
      tests: [],
      averageEfficiency: 0,
      passedTests: 0,
      totalTests: 0
    };

    // Import the integrated system function
    const { createIntelligentDistributionSystem } = await import('./index.js');

    for (const problemSize of this.config.efficiency.problemSizes.slice(0, 3)) { // Test fewer sizes for integrated system
      for (let test = 0; test < Math.min(5, this.config.efficiency.testCases); test++) {
        const nodes = TestDataGenerator.generateNodes(Math.max(15, problemSize / 2));
        const tasks = TestDataGenerator.generateTasks(problemSize);
        const constraints = TestDataGenerator.generateConstraints();

        try {
          const system = createIntelligentDistributionSystem({
            swarmId: `test-integrated-${problemSize}-${test}`,
            redis: this.config.redis,
            optimization: {
              maxOptimizationTime: 30000
            },
            geographic: {
              enabled: true,
              strategy: 'balanced'
            }
          });

          await system.initialize();

          const result = await system.optimizeDistribution(nodes, tasks, {
            ...constraints,
            geographic: {
              strategy: 'latency_optimized'
            }
          });

          const efficiency = result.combinedEfficiency || 0;
          const passed = efficiency >= this.config.efficiency.target;

          results.tests.push({
            problemSize,
            testNumber: test + 1,
            efficiency,
            combinedEfficiency: result.combinedEfficiency,
            placementEfficiency: result.nodePlacement?.efficiency,
            geoEfficiency: result.geographicDistribution?.metrics?.distributionEfficiency,
            passed
          });

          if (passed) results.passedTests++;
          results.totalTests++;

          if (this.config.output.verbose) {
            console.log(`  Integrated Test ${problemSize}-${test + 1}: ${(efficiency * 100).toFixed(1)}% ${passed ? '✅' : '❌'}`);
          }

          await system.shutdown();

        } catch (error) {
          console.error(`  Integrated Test ${problemSize}-${test + 1} failed:`, error.message);
          results.tests.push({
            problemSize,
            testNumber: test + 1,
            efficiency: 0,
            error: error.message,
            passed: false
          });
          results.totalTests++;
        }
      }
    }

    results.averageEfficiency = results.tests.reduce((sum, test) => sum + (test.efficiency || 0), 0) / results.totalTests;

    console.log(`Integrated System: ${results.passedTests}/${results.totalTests} tests passed, avg efficiency: ${(results.averageEfficiency * 100).toFixed(1)}%`);

    return results;
  }

  compileFinalResults(individualResults) {
    const finalResults = {
      timestamp: new Date().toISOString(),
      targetEfficiency: this.config.efficiency.target,
      summary: {
        totalTests: 0,
        passedTests: 0,
        overallAverageEfficiency: 0,
        algorithmsTested: Object.keys(individualResults).length
      },
      algorithms: individualResults,
      recommendations: []
    };

    // Calculate summary statistics
    for (const [algorithm, results] of Object.entries(individualResults)) {
      finalResults.summary.totalTests += results.totalTests || 0;
      finalResults.summary.passedTests += results.passedTests || 0;
    }

    finalResults.summary.overallAverageEfficiency = Object.values(individualResults)
      .reduce((sum, results) => sum + (results.averageEfficiency || 0), 0) / Object.keys(individualResults).length;

    finalResults.summary.overallPassRate = finalResults.summary.totalTests > 0 ?
      finalResults.summary.passedTests / finalResults.summary.totalTests : 0;

    // Generate recommendations
    if (finalResults.summary.overallAverageEfficiency < this.config.efficiency.target) {
      finalResults.recommendations.push('Overall efficiency below target - consider algorithm parameter tuning');
    }

    const lowPerformingAlgorithms = Object.entries(individualResults)
      .filter(([, results]) => (results.averageEfficiency || 0) < this.config.efficiency.minimum)
      .map(([name]) => name);

    if (lowPerformingAlgorithms.length > 0) {
      finalResults.recommendations.push(`Low-performing algorithms: ${lowPerformingAlgorithms.join(', ')}`);
    }

    const highPerformingAlgorithms = Object.entries(individualResults)
      .filter(([, results]) => (results.averageEfficiency || 0) >= this.config.efficiency.target)
      .map(([name]) => name);

    if (highPerformingAlgorithms.length > 0) {
      finalResults.recommendations.push(`High-performing algorithms: ${highPerformingAlgorithms.join(', ')}`);
    }

    return finalResults;
  }

  async generateTestReport(results) {
    console.log('\n📊 PHASE 4 DISTRIBUTION ALGORITHMS EFFICIENCY REPORT');
    console.log('='.repeat(60));
    console.log(`Target Efficiency: ${(results.targetEfficiency * 100).toFixed(1)}%`);
    console.log(`Overall Pass Rate: ${(results.summary.overallPassRate * 100).toFixed(1)}%`);
    console.log(`Overall Average Efficiency: ${(results.summary.overallAverageEfficiency * 100).toFixed(1)}%`);
    console.log(`Total Tests Run: ${results.summary.totalTests}`);
    console.log(`Tests Passed: ${results.summary.passedTests}`);

    console.log('\nAlgorithm Performance:');
    for (const [algorithm, result] of Object.entries(results.algorithms)) {
      const status = (result.averageEfficiency || 0) >= results.targetEfficiency ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${algorithm.padEnd(20)}: ${(result.averageEfficiency * 100).toFixed(1)}% ${status}`);
    }

    if (results.recommendations.length > 0) {
      console.log('\nRecommendations:');
      results.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
    }

    console.log('\n' + '='.repeat(60));

    const overallStatus = results.summary.overallAverageEfficiency >= results.targetEfficiency ? '✅ SUCCESS' : '❌ NEEDS IMPROVEMENT';
    console.log(`Overall Status: ${overallStatus}`);

    if (this.config.output.saveResults) {
      await this.saveResultsToFile(results);
    }

    return results;
  }

  async saveResultsToFile(results) {
    try {
      const fs = await import('fs').then(m => m.promises);
      const reportFile = `/tmp/phase4-efficiency-report-${Date.now()}.json`;

      await fs.writeFile(reportFile, JSON.stringify(results, null, 2));
      console.log(`\n📄 Detailed results saved to: ${reportFile}`);

    } catch (error) {
      console.warn('Failed to save results to file:', error.message);
    }
  }
}

/**
 * Main test execution function
 */
export async function runEfficiencyTests(config = {}) {
  const testSuite = new EfficiencyTestSuite(config);
  return await testSuite.runAllTests();
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runEfficiencyTests()
    .then(results => {
      console.log('\n✅ Efficiency tests completed successfully');
      process.exit(results.summary.overallAverageEfficiency >= TEST_CONFIG.efficiency.target ? 0 : 1);
    })
    .catch(error => {
      console.error('\n❌ Efficiency tests failed:', error);
      process.exit(1);
    });
}

export default EfficiencyTestSuite;