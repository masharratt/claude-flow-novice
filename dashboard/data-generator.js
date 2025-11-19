#!/usr/bin/env node

/**
 * CFN Loop Dashboard Data Generator
 * 
 * This script generates realistic CFN Loop logging data for the dashboard.
 * It connects to the SQLite database and creates sample data that matches
 * the actual CFN Loop orchestration structure.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const DB_PATH = path.join(__dirname, '../.claude/cfn-data/cfn-loop.db');

// Sample data generators
const AGENT_TYPES = [
    'cfn-v3-coordinator', 'backend-developer', 'frontend-developer', 'tester',
    'security-validator', 'code-reviewer', 'documentation-specialist',
    'performance-analyst', 'ux-designer', 'product-owner'
];

const EVENT_TYPES = [
    'agent_spawn', 'agent_complete', 'deliverable_pre_check', 'gate_check',
    'iteration_transition', 'po_decision', 'swarm_init', 'test_event'
];

const LOOPS = ['loop3', 'loop2'];
const LEVELS = ['INFO', 'WARNING', 'ERROR'];
const DECISIONS = ['PROCEED', 'ITERATE', 'ABORT'];

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateTimestamp(daysBack) {
    const now = new Date();
    const timestamp = new Date(now.getTime() - getRandomInt(0, daysBack * 24 * 60 * 60 * 1000));
    return timestamp.toISOString();
}

function generateEventDetails(eventType, iteration) {
    switch (eventType) {
        case 'agent_spawn':
            return {
                agent_type: getRandomChoice(AGENT_TYPES),
                mode: 'standard',
                confidence: 0.0
            };
            
        case 'agent_complete':
            return {
                agent_id: `agent-${getRandomInt(1000, 9999)}`,
                confidence: (getRandomInt(70, 95) / 100).toFixed(2),
                deliverables_created: getRandomInt(1, 5),
                execution_time: getRandomInt(300, 3600)
            };
            
        case 'gate_check':
            const passRate = getRandomInt(60, 100);
            const threshold = 0.95;
            return {
                pass_rate: (passRate / 100).toFixed(2),
                threshold: threshold.toFixed(2),
                passed: passRate >= 95,
                tests_run: getRandomInt(20, 100),
                tests_passed: getRandomInt(15, passRate),
                coverage: getRandomInt(70, 95)
            };
            
        case 'po_decision':
            const decision = getRandomChoice(DECISIONS);
            return {
                decision: decision,
                confidence: (getRandomInt(70, 95) / 100).toFixed(2),
                reasoning: `Task met ${decision === 'ABORT' ? 'critical' : 'success'} criteria`,
                deliverables_validated: getRandomInt(3, 8)
            };
            
        case 'deliverable_pre_check':
            return {
                deliverables_found: getRandomInt(3, 8),
                valid_deliverables: getRandomInt(2, 7),
                missing_deliverables: getRandomInt(0, 2),
                validation_errors: getRandomInt(0, 3)
            };
            
        case 'iteration_transition':
            return {
                from_iteration: iteration,
                to_iteration: iteration + 1,
                transition_reason: getRandomChoice(['gate_failed', 'consensus_low', 'quality_improvement', 'bug_fixes_needed']),
                estimated_duration: getRandomInt(30, 120)
            };
            
        case 'test_event':
            return {
                test_suite: getRandomChoice(['unit', 'integration', 'e2e', 'performance']),
                tests_run: getRandomInt(10, 50),
                pass_rate: (getRandomInt(60, 100) / 100).toFixed(2),
                execution_time: getRandomInt(60, 600)
            };
            
        default:
            return {};
    }
}

function generateTaskData(taskId, totalIterations = getRandomInt(1, 5)) {
    const events = [];
    const baseTime = generateTimestamp(30); // Generate events within last 30 days
    
    // Initialize task
    events.push({
        task_id: taskId,
        timestamp: baseTime,
        event_type: 'swarm_init',
        loop: null,
        agent_id: 'cfn-v3-coordinator',
        iteration: 1,
        details: JSON.stringify({
            mode: 'standard',
            max_iterations: totalIterations,
            success_criteria_enabled: true
        }),
        level: 'INFO'
    });
    
    for (let iteration = 1; iteration <= totalIterations; iteration++) {
        const iterationTime = new Date(baseTime);
        iterationTime.setHours(iterationTime.getHours() + iteration * 6); // 6 hours per iteration
        
        // Loop 3 agents
        const loop3Agents = getRandomInt(3, 6);
        for (let i = 0; i < loop3Agents; i++) {
            const agentId = `agent-${getRandomInt(1000, 9999)}`;
            const agentType = getRandomChoice(AGENT_TYPES.filter(a => a !== 'product-owner'));
            
            // Agent spawn
            events.push({
                task_id: taskId,
                timestamp: generateTimestamp((30 - iteration * 6) / 24),
                event_type: 'agent_spawn',
                loop: 'loop3',
                agent_id: agentId,
                iteration: iteration,
                details: JSON.stringify(generateEventDetails('agent_spawn', iteration)),
                level: 'INFO'
            });
            
            // Agent complete (some may fail)
            const spawnTime = new Date(events[events.length - 1].timestamp);
            const completeTime = new Date(spawnTime.getTime() + getRandomInt(30, 240) * 60 * 1000);
            
            events.push({
                task_id: taskId,
                timestamp: completeTime.toISOString(),
                event_type: 'agent_complete',
                loop: 'loop3',
                agent_id: agentId,
                iteration: iteration,
                details: JSON.stringify(generateEventDetails('agent_complete', iteration)),
                level: Math.random() > 0.1 ? 'INFO' : 'ERROR'
            });
        }
        
        // Deliverable pre-check
        events.push({
            task_id: taskId,
            timestamp: generateTimestamp((30 - iteration * 6 + 2) / 24),
            event_type: 'deliverable_pre_check',
            loop: 'loop3',
            agent_id: 'cfn-v3-coordinator',
            iteration: iteration,
            details: JSON.stringify(generateEventDetails('deliverable_pre_check', iteration)),
            level: 'INFO'
        });
        
        // Gate check
        events.push({
            task_id: taskId,
            timestamp: generateTimestamp((30 - iteration * 6 + 3) / 24),
            event_type: 'gate_check',
            loop: 'loop3',
            agent_id: 'cfn-v3-coordinator',
            iteration: iteration,
            details: JSON.stringify(generateEventDetails('gate_check', iteration)),
            level: 'INFO'
        });
        
        // If this is the final iteration and gate passed, add Loop 2 validators
        if (iteration === totalIterations) {
            const gateDetails = JSON.parse(events[events.length - 1].details);
            if (gateDetails.passed) {
                // Loop 2 validators
                const validatorCount = getRandomInt(3, 5);
                for (let i = 0; i < validatorCount; i++) {
                    const validatorId = `validator-${getRandomInt(1000, 9999)}`;
                    
                    events.push({
                        task_id: taskId,
                        timestamp: generateTimestamp((30 - iteration * 6 + 4) / 24),
                        event_type: 'agent_spawn',
                        loop: 'loop2',
                        agent_id: validatorId,
                        iteration: iteration,
                        details: JSON.stringify({
                            agent_type: 'validator',
                            mode: 'standard',
                            confidence: 0.0
                        }),
                        level: 'INFO'
                    });
                    
                    events.push({
                        task_id: taskId,
                        timestamp: generateTimestamp((30 - iteration * 6 + 5) / 24),
                        event_type: 'agent_complete',
                        loop: 'loop2',
                        agent_id: validatorId,
                        iteration: iteration,
                        details: JSON.stringify({
                            agent_id: validatorId,
                            confidence: (getRandomInt(70, 95) / 100).toFixed(2),
                            consensus_score: (getRandomInt(70, 95) / 100).toFixed(2)
                        }),
                        level: 'INFO'
                    });
                }
                
                // Product Owner decision
                events.push({
                    task_id: taskId,
                    timestamp: generateTimestamp((30 - iteration * 6 + 6) / 24),
                    event_type: 'po_decision',
                    loop: null,
                    agent_id: 'product-owner',
                    iteration: iteration,
                    details: JSON.stringify(generateEventDetails('po_decision', iteration)),
                    level: 'INFO'
                });
            }
        }
        
        // Test events
        for (let t = 0; t < getRandomInt(1, 3); t++) {
            events.push({
                task_id: taskId,
                timestamp: generateTimestamp((30 - iteration * 6 + 1) / 24),
                event_type: 'test_event',
                loop: 'loop3',
                agent_id: `tester-${getRandomInt(1000, 9999)}`,
                iteration: iteration,
                details: JSON.stringify(generateEventDetails('test_event', iteration)),
                level: Math.random() > 0.8 ? 'WARNING' : 'INFO'
            });
        }
    }
    
    return events;
}

async function populateDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                reject(err);
                return;
            }
            console.log('Connected to SQLite database');
        });
        
        // Clear existing data
        db.run('DELETE FROM cfn_loop_logs', (err) => {
            if (err) {
                console.error('Error clearing existing data:', err);
                reject(err);
                return;
            }
            console.log('Cleared existing data');
        });
        
        // Generate sample data for 20 tasks
        const tasks = Array.from({ length: 20 }, (_, i) => `task-${String(i + 1).padStart(3, '0')}`);
        let allEvents = [];
        
        tasks.forEach(taskId => {
            const taskEvents = generateTaskData(taskId);
            allEvents = allEvents.concat(taskEvents);
        });
        
        // Insert events in batches
        const insertStmt = db.prepare(`
            INSERT INTO cfn_loop_logs (task_id, timestamp, event_type, loop, agent_id, iteration, details, level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        let inserted = 0;
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            
            allEvents.forEach(event => {
                insertStmt.run([
                    event.task_id,
                    event.timestamp,
                    event.event_type,
                    event.loop,
                    event.agent_id,
                    event.iteration,
                    event.details,
                    event.level
                ], (err) => {
                    if (err) {
                        console.error('Error inserting event:', err);
                    } else {
                        inserted++;
                    }
                });
            });
            
            db.run('COMMIT', (err) => {
                if (err) {
                    console.error('Error committing transaction:', err);
                    reject(err);
                } else {
                    console.log(`Successfully inserted ${inserted} events`);
                    insertStmt.finalize();
                    db.close((err) => {
                        if (err) {
                            console.error('Error closing database:', err);
                            reject(err);
                        } else {
                            console.log('Database connection closed');
                            resolve(inserted);
                        }
                    });
                }
            });
        });
    });
}

// CLI interface
if (require.main === module) {
    console.log('🚀 Generating CFN Loop dashboard data...');
    
    populateDatabase()
        .then((inserted) => {
            console.log(`✅ Generated ${inserted} sample events`);
            console.log('📊 Dashboard data is ready! Open dashboard/index.html to view.');
        })
        .catch((error) => {
            console.error('❌ Error generating data:', error);
            process.exit(1);
        });
}

module.exports = { generateTaskData, populateDatabase };