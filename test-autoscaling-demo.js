/**
 * Auto-Scaling Engine Demo and Test
 * Demonstrates the Phase 2 Auto-Scaling Engine capabilities
 */

import AutoScalingEngine from './src/autoscaling/index.js';
import Redis from 'ioredis';

class AutoScalingDemo {
  constructor() {
    this.redis = new Redis();
    this.engine = null;
    this.demoMetrics = {
      startTime: Date.now(),
      tasksSubmitted: 0,
      scaleEvents: 0,
      efficiencyMeasurements: []
    };
  }

  async runDemo() {
    console.log('🚀 Phase 2 Auto-Scaling Engine Demo');
    console.log('=====================================');

    try {
      // Initialize and start the engine
      await this.initializeEngine();

      // Run demonstration scenarios
      await this.demonstrateBasicScaling();
      await this.demonstratePredictiveScaling();
      await this.demonstrateResourceOptimization();
      await this.demonstratePerformanceBenchmarking();

      // Generate final report
      await this.generateDemoReport();

    } catch (error) {
      console.error('Demo failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  async initializeEngine() {
    console.log('\n📋 Initializing Auto-Scaling Engine...');

    this.engine = AutoScalingEngine.createDevelopment(); // Use development config

    // Set up event listeners
    this.engine.on('started', () => {
      console.log('✅ Engine started successfully');
    });

    this.engine.on('taskAssigned', (data) => {
      console.log(`📝 Task assigned: ${data.task.id} → Agent ${data.agent.id}`);
    });

    this.engine.on('scaleUp', (data) => {
      console.log(`⬆️  Scale up: +${data.agentsAdded} agents (Pool: ${data.newPoolSize})`);
      this.demoMetrics.scaleEvents++;
    });

    this.engine.on('scaleDown', (data) => {
      console.log(`⬇️  Scale down: -${data.agentsRemoved} agents (Pool: ${data.newPoolSize})`);
      this.demoMetrics.scaleEvents++;
    });

    this.engine.on('benchmarkUpdate', (data) => {
      const efficiency = (data.results.efficiency * 100).toFixed(1);
      const utilization = (data.results.utilization * 100).toFixed(1);
      console.log(`📊 Performance: Efficiency ${efficiency}%, Utilization ${utilization}%`);
      this.demoMetrics.efficiencyMeasurements.push({
        timestamp: Date.now(),
        efficiency: data.results.efficiency,
        utilization: data.results.utilization
      });
    });

    await this.engine.start();
    console.log('✅ Engine initialized and started');
  }

  async demonstrateBasicScaling() {
    console.log('\n🔧 Demonstrating Basic Reactive Scaling...');
    console.log('-------------------------------------------');

    // Submit a burst of tasks to trigger scale-up
    const taskBurst = 8;
    console.log(`Submitting ${taskBurst} tasks to trigger scale-up...`);

    for (let i = 0; i < taskBurst; i++) {
      const task = {
        id: `basic_task_${i}`,
        type: 'computation',
        priority: 'normal',
        resources: {
          cpu: 15,
          memory: 50,
          duration: 30000
        }
      };

      try {
        await this.engine.submitTask(task);
        this.demoMetrics.tasksSubmitted++;
        await this.sleep(500); // Small delay between submissions
      } catch (error) {
        console.error(`Task ${i} failed:`, error.message);
      }
    }

    console.log('Waiting for scaling decisions...');
    await this.sleep(10000); // Wait for scaling to occur
  }

  async demonstratePredictiveScaling() {
    console.log('\n🔮 Demonstrating Predictive Scaling...');
    console.log('-----------------------------------');

    // Submit tasks with varying patterns to test prediction
    const patterns = [
      { count: 3, interval: 1000, priority: 'high' },    // High frequency burst
      { count: 2, interval: 2000, priority: 'normal' },  // Medium frequency
      { count: 4, interval: 500, priority: 'low' }       // Low priority burst
    ];

    for (const pattern of patterns) {
      console.log(`Submitting ${pattern.count} ${pattern.priority} priority tasks...`);

      for (let i = 0; i < pattern.count; i++) {
        const task = {
          id: `predictive_task_${Date.now()}_${i}`,
          type: 'analysis',
          priority: pattern.priority,
          resources: {
            cpu: pattern.priority === 'high' ? 25 : 10,
            memory: pattern.priority === 'high' ? 100 : 40,
            duration: pattern.priority === 'high' ? 20000 : 45000
          }
        };

        try {
          await this.engine.submitTask(task);
          this.demoMetrics.tasksSubmitted++;
          await this.sleep(pattern.interval);
        } catch (error) {
          console.error(`Predictive task failed:`, error.message);
        }
      }

      await this.sleep(5000); // Wait for prediction analysis
    }
  }

  async demonstrateResourceOptimization() {
    console.log('\n⚡ Demonstrating Resource Optimization...');
    console.log('---------------------------------------');

    // Submit tasks with different resource requirements
    const resourceIntensiveTasks = [
      {
        id: 'cpu_intensive_1',
        type: 'cpu_intensive',
        priority: 'high',
        resources: { cpu: 40, memory: 30, duration: 25000 }
      },
      {
        id: 'memory_intensive_1',
        type: 'memory_intensive',
        priority: 'normal',
        resources: { cpu: 10, memory: 150, duration: 35000 }
      },
      {
        id: 'balanced_task_1',
        type: 'balanced',
        priority: 'normal',
        resources: { cpu: 20, memory: 60, duration: 20000 }
      }
    ];

    console.log('Submitting tasks with varying resource requirements...');

    for (const task of resourceIntensiveTasks) {
      try {
        const result = await this.engine.submitTask(task);
        console.log(`✅ Optimized assignment: ${task.id} → ${result.agentId}`);
        this.demoMetrics.tasksSubmitted++;
      } catch (error) {
        console.error(`Resource optimization failed for ${task.id}:`, error.message);
      }
    }

    // Wait for optimization to complete
    await this.sleep(8000);
  }

  async demonstratePerformanceBenchmarking() {
    console.log('\n📈 Demonstrating Performance Benchmarking...');
    console.log('------------------------------------------');

    // Get current performance metrics
    const status = await this.engine.getStatus();

    console.log('Current Performance Metrics:');
    console.log(`  • Pool Size: ${status.components.poolManager?.poolSize || 'N/A'}`);
    console.log(`  • Active Agents: ${status.components.poolManager?.activeAgents || 'N/A'}`);
    console.log(`  • Efficiency: ${((status.components.performanceBenchmark?.efficiency || 0) * 100).toFixed(1)}%`);
    console.log(`  • Utilization: ${((status.components.performanceBenchmark?.utilization || 0) * 100).toFixed(1)}%`);
    console.log(`  • Response Time Score: ${((status.components.performanceBenchmark?.responseTime || 0) * 100).toFixed(1)}%`);
    console.log(`  • Scaling Performance: ${((status.components.performanceBenchmark?.scalingPerformance || 0) * 100).toFixed(1)}%`);

    // Test performance targets
    const targets = {
      efficiency: 0.40,    // 40% target
      utilization: 0.85,   // 85% target
      responseTime: 0.80   // 80% score target
    };

    console.log('\nTarget Achievement Analysis:');
    for (const [metric, target] of Object.entries(targets)) {
      const current = status.components.performanceBenchmark?.[metric] || 0;
      const achieved = current >= target;
      const percentage = (current * 100).toFixed(1);
      const targetPercentage = (target * 100).toFixed(1);

      console.log(`  • ${metric}: ${percentage}% (Target: ${targetPercentage}%) ${achieved ? '✅' : '❌'}`);
    }

    await this.sleep(5000);
  }

  async generateDemoReport() {
    console.log('\n📊 Demo Performance Report');
    console.log('===========================');

    const runtime = Date.now() - this.demoMetrics.startTime;
    const minutes = Math.floor(runtime / 60000);
    const seconds = Math.floor((runtime % 60000) / 1000);

    console.log(`Runtime: ${minutes}m ${seconds}s`);
    console.log(`Tasks Submitted: ${this.demoMetrics.tasksSubmitted}`);
    console.log(`Scale Events: ${this.demoMetrics.scaleEvents}`);

    if (this.demoMetrics.efficiencyMeasurements.length > 0) {
      const avgEfficiency = this.demoMetrics.efficiencyMeasurements
        .reduce((sum, m) => sum + m.efficiency, 0) / this.demoMetrics.efficiencyMeasurements.length;
      const avgUtilization = this.demoMetrics.efficiencyMeasurements
        .reduce((sum, m) => sum + m.utilization, 0) / this.demoMetrics.efficiencyMeasurements.length;

      console.log(`Average Efficiency: ${(avgEfficiency * 100).toFixed(1)}%`);
      console.log(`Average Utilization: ${(avgUtilization * 100).toFixed(1)}%`);

      // Check if targets were met
      const efficiencyTargetMet = avgEfficiency >= 0.40;
      const utilizationTargetMet = avgUtilization >= 0.85;

      console.log('\nTarget Achievement:');
      console.log(`  • 40%+ Efficiency: ${efficiencyTargetMet ? '✅ ACHIEVED' : '❌ NOT ACHIEVED'}`);
      console.log(`  • 85%+ Utilization: ${utilizationTargetMet ? '✅ ACHIEVED' : '❌ NOT ACHIEVED'}`);
    }

    // Get final engine status
    const finalStatus = await this.engine.getStatus();
    console.log('\nFinal System State:');
    console.log(`  • Pool Size: ${finalStatus.components.poolManager?.poolSize || 'N/A'}`);
    console.log(`  • Total Tasks Processed: ${finalStatus.metrics.totalTasksProcessed}`);
    console.log(`  • Total Scale Events: ${finalStatus.metrics.totalScaleEvents}`);

    console.log('\n✅ Demo completed successfully!');
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');

    if (this.engine) {
      await this.engine.stop();
    }

    if (this.redis) {
      await this.redis.quit();
    }

    console.log('✅ Cleanup completed');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the demo
async function main() {
  const demo = new AutoScalingDemo();
  await demo.runDemo();
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export default AutoScalingDemo;