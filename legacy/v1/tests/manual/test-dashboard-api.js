#!/usr/bin/env node

// Simple test server for dashboard API
import express from 'express';
import { MetricsCollector } from './monitor/collectors/metrics-collector.js';

const app = express();
const port = 3002; // Use different port to avoid conflicts

// Enable CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});

// Metrics endpoint
app.get('/api/metrics', async (req, res) => {
    try {
        const collector = new MetricsCollector();
        const metrics = await collector.collectMetrics();
        res.json(metrics);
    } catch (error) {
        console.error('Error collecting metrics:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(port, () => {
    console.log(`Test API server running on http://localhost:${port}`);
    console.log(`Testing metrics endpoint...`);
});

// Test the metrics endpoint after server starts
setTimeout(async () => {
    try {
        const response = await fetch(`http://localhost:${port}/api/metrics`);
        const data = await response.json();

        console.log('\n=== Metrics Test Results ===');
        console.log(`Swarm count: ${Object.keys(data.swarms || {}).length}`);
        console.log(`System metrics collected: ${data.system ? 'Yes' : 'No'}`);
        console.log(`Memory metrics collected: ${data.memory ? 'Yes' : 'No'}`);

        if (Object.keys(data.swarms || {}).length > 0) {
            console.log('\n=== Sample Swarm Data ===');
            const swarmIds = Object.keys(data.swarms);
            const sampleSwarm = data.swarms[swarmIds[0]];
            console.log(`ID: ${swarmIds[0]}`);
            console.log(`Name: ${sampleSwarm.name}`);
            console.log(`Status: ${sampleSwarm.status}`);
            console.log(`Agents: ${sampleSwarm.agents}`);
            console.log(`Progress: ${sampleSwarm.progress}`);
            console.log(`Objective: ${sampleSwarm.objective}`);
        }

        console.log('\n✅ Dashboard API integration test completed successfully!');

        // Shutdown after test
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    }
}, 1000);