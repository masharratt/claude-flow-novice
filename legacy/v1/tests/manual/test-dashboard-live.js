#!/usr/bin/env node

// Test live dashboard updates with multiple swarms
import { spawn } from 'child_process';

console.log('🚀 Starting live dashboard test...\n');

// Function to run a swarm test
async function runSwarmTest(name, agents) {
    return new Promise((resolve) => {
        console.log(`Starting ${name} with ${agents} agents...`);

        const child = spawn('node', [
            'test-swarm-direct.js',
            `Live test: ${name}`,
            '--executor',
            '--max-agents',
            agents.toString()
        ], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let output = '';
        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.on('close', (code) => {
            console.log(`✅ ${name} completed (code: ${code})`);
            resolve();
        });

        // Timeout after 30 seconds
        setTimeout(() => {
            child.kill();
            resolve();
        }, 30000);
    });
}

// Run multiple concurrent swarms
async function runMultipleSwarms() {
    const swarms = [
        { name: 'Dashboard Test Alpha', agents: 3 },
        { name: 'Dashboard Test Beta', agents: 4 },
        { name: 'Dashboard Test Gamma', agents: 5 }
    ];

    console.log('Starting concurrent swarm tests...');
    console.log('Dashboard URL: http://localhost:3003\n');

    // Run swarms concurrently
    const promises = swarms.map((swarm, index) =>
        runSwarmTest(swarm.name, swarm.agents)
    );

    await Promise.all(promises);

    console.log('\n✅ All swarm tests completed!');
    console.log('Check the dashboard at http://localhost:3003 for real-time swarm activity.\n');

    // Keep the test running for 10 more seconds to see updates
    console.log('Keeping dashboard running for 10 seconds to observe updates...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('\n🎉 Live dashboard test completed!');
}

runMultipleSwarms().catch(console.error);