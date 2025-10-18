#!/usr/bin/env node

// Test script to verify swarm metrics collection
import { MetricsCollector } from './monitor/collectors/metrics-collector.js';

async function testSwarmMetrics() {
    console.log('Testing swarm metrics collection...\n');

    const collector = new MetricsCollector();

    try {
        // Test detectSwarmInstances
        console.log('1. Testing detectSwarmInstances...');
        const instances = await collector.detectSwarmInstances();
        console.log(`   Found ${instances.size} swarm instances`);

        for (const [id, instance] of instances) {
            console.log(`   - ${id}: ${instance.name} (${instance.status}) - ${instance.agents} agents`);
        }

        // Test getSwarmMetrics
        console.log('\n2. Testing getSwarmMetrics...');
        const swarmMetrics = await collector.getSwarmMetrics();
        console.log(`   Swarm metrics object keys: ${Object.keys(swarmMetrics).length}`);

        // Test full metrics collection
        console.log('\n3. Testing full metrics collection...');
        const fullMetrics = await collector.collectMetrics();
        console.log(`   Swarms in full metrics: ${Object.keys(fullMetrics.swarms).length}`);

        // Display sample swarm data
        if (Object.keys(fullMetrics.swarms).length > 0) {
            console.log('\n4. Sample swarm data:');
            const firstSwarmId = Object.keys(fullMetrics.swarms)[0];
            const swarm = fullMetrics.swarms[firstSwarmId];
            console.log(`   ID: ${firstSwarmId}`);
            console.log(`   Name: ${swarm.name}`);
            console.log(`   Status: ${swarm.status}`);
            console.log(`   Agents: ${swarm.agents}`);
            console.log(`   Progress: ${swarm.progress}`);
            console.log(`   Confidence: ${swarm.confidence}`);
            console.log(`   Objective: ${swarm.objective}`);
        }

        console.log('\n✅ Swarm metrics collection test completed successfully!');

    } catch (error) {
        console.error('\n❌ Error during testing:', error);
        process.exit(1);
    }
}

testSwarmMetrics();