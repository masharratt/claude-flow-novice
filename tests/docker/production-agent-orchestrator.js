#!/usr/bin/env node

/**
 * Production CFN Loop Agent Orchestrator for Docker Containers
 *
 * This orchestrator manages full CFN Loop execution in containerized environments,
 * providing production-grade agent coordination, context management, and resource
 * optimization.
 */

import Docker from 'dockerode';
import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

class ProductionAgentOrchestrator {
    constructor(options = {}) {
        this.config = {
            redisUrl: options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
            workspaceBase: options.workspaceBase || '/tmp/agent-workspaces',
            memoryLimit: options.memoryLimit || '1g',
            cpuLimit: options.cpuLimit || '0.5',
            networkName: options.networkName || 'cfn-production',
            maxConcurrentAgents: options.maxConcurrentAgents || 10,
            agentTimeout: options.agentTimeout || 300000, // 5 minutes
            cleanupDelay: options.cleanupDelay || 5000, // 5 seconds
            logLevel: options.logLevel || 'info',
            ...options
        };

        this.docker = new Docker();
        this.redis = new Redis(this.config.redisUrl);
        this.activeAgents = new Map();
        this.agentMetrics = {
            totalSpawned: 0,
            totalCompleted: 0,
            totalFailed: 0,
            averageExecutionTime: 0,
            peakMemoryUsage: 0
        };

        this.contextManager = new ContextManager(this.config);
        this.resourceManager = new ResourceManager(this.docker, this.config);
        this.monitoring = new MonitoringService(this.redis, this.config);
    }

    /**
     * Initialize the orchestrator
     */
    async initialize() {
        this.log('info', 'Initializing Production Agent Orchestrator...');

        try {
            // Create workspace directory
            await fs.mkdir(this.config.workspaceBase, { recursive: true });

            // Test Redis connection
            await this.redis.ping();
            this.log('info', '✓ Redis connection established');

            // Ensure Docker network exists
            await this.ensureDockerNetwork();

            // Start monitoring
            await this.monitoring.start();

            this.log('info', '✓ Orchestrator initialized successfully');
            return true;
        } catch (error) {
            this.log('error', `Failed to initialize orchestrator: ${error.message}`);
            throw error;
        }
    }

    /**
     * Execute CFN Loop with production agents
     */
    async executeCFNLoop(taskDescription, options = {}) {
        const taskId = uuidv4();
        const loopStartTime = Date.now();

        this.log('info', `🚀 Starting CFN Loop: ${taskDescription}`);
        this.log('info', `📋 Task ID: ${taskId}`);

        try {
            // Phase 1: Task Analysis and Planning
            const taskPlan = await this.analyzeTask(taskDescription, options);
            this.log('info', `📝 Task analyzed: ${taskPlan.requiredAgents.length} agents needed`);

            // Phase 2: Context Preparation
            const contextData = await this.contextManager.prepareContext(taskId, taskPlan);
            this.log('info', `📦 Context prepared for ${taskPlan.requiredAgents.length} agents`);

            // Phase 3: Agent Orchestration (Loop 3)
            const agentResults = await this.orchestrateAgents(taskId, taskPlan, contextData);

            // Phase 4: Consensus Validation (Loop 2)
            const consensusResult = await this.validateConsensus(taskId, agentResults);

            // Phase 5: Product Owner Decision (Loop 4)
            const finalDecision = await this.makeProductOwnerDecision(taskId, consensusResult);

            const executionTime = Date.now() - loopStartTime;

            // Phase 6: Results Compilation and Cleanup
            const results = await this.compileResults(taskId, {
                taskDescription,
                executionTime,
                agentResults,
                consensusResult,
                finalDecision,
                taskPlan
            });

            await this.cleanup(taskId);

            this.log('info', `✅ CFN Loop completed in ${executionTime}ms`);
            return results;

        } catch (error) {
            this.log('error', `❌ CFN Loop failed: ${error.message}`);
            await this.cleanup(taskId);
            throw error;
        }
    }

    /**
     * Analyze task and determine required agents
     */
    async analyzeTask(taskDescription, options) {
        // Enhanced task analysis with complexity assessment
        const taskComplexity = this.assessComplexity(taskDescription);

        // Determine required agents based on task analysis
        const requiredAgents = this.selectAgents(taskDescription, taskComplexity, options);

        return {
            taskId: uuidv4(),
            taskDescription,
            complexity: taskComplexity,
            requiredAgents,
            estimatedDuration: this.estimateDuration(requiredAgents, taskComplexity),
            resourcesRequired: this.calculateResources(requiredAgents),
            mode: options.mode || 'standard', // mvp, standard, enterprise
            maxIterations: options.maxIterations || this.getMaxIterations(options.mode)
        };
    }

    /**
     * Orchestrate agents in containers
     */
    async orchestrateAgents(taskId, taskPlan, contextData) {
        const agentPromises = taskPlan.requiredAgents.map(agentConfig =>
            this.executeAgentInContainer(taskId, agentConfig, contextData)
        );

        // Execute agents concurrently with resource management
        const results = await this.resourceManager.executeWithLimits(
            agentPromises,
            this.config.maxConcurrentAgents
        );

        return results;
    }

    /**
     * Execute a single agent in a Docker container
     */
    async executeAgentInContainer(taskId, agentConfig, contextData) {
        const agentId = uuidv4();
        const workspaceDir = path.join(this.config.workspaceBase, agentId);
        const startTime = Date.now();

        this.log('info', `🐳 Spawning agent: ${agentConfig.type} (${agentId})`);

        try {
            // Create workspace directory
            await fs.mkdir(workspaceDir, { recursive: true });

            // Prepare agent-specific context
            const agentContext = await this.contextManager.prepareAgentContext(
                agentId,
                agentConfig,
                contextData,
                workspaceDir
            );

            // Create container
            const container = await this.docker.createContainer({
                Image: this.getProductionImage(),
                name: `cfn-agent-${agentId}`,
                Env: [
                    `AGENT_ID=${agentId}`,
                    `TASK_ID=${taskId}`,
                    `AGENT_TYPE=${agentConfig.type}`,
                    `REDIS_URL=${this.config.redisUrl}`,
                    `WORKSPACE_DIR=/app/workspace`,
                    `MODE=production`,
                    `CFN_COORDINATION_MODE=redis`,
                    `LOG_LEVEL=${this.config.logLevel}`
                ],
                HostConfig: {
                    Memory: this.parseMemoryLimit(this.config.memoryLimit),
                    NanoCpus: this.parseCpuLimit(this.config.cpuLimit),
                    NetworkMode: this.config.networkName,
                    Binds: [
                        `${workspaceDir}:/app/workspace`,
                        `${process.cwd()}/.claude:/app/.claude:ro`
                    ],
                    AutoRemove: false, // We'll handle cleanup ourselves
                    LogConfig: {
                        Type: 'json-file',
                        Config: {
                            'max-size': '10m',
                            'max-file': '3'
                        }
                    }
                },
                WorkingDir: '/app',
                Cmd: this.getAgentCommand(agentConfig, agentContext)
            });

            // Start container
            await container.start();

            // Track active agent
            const agentInfo = {
                id: agentId,
                type: agentConfig.type,
                containerId: container.id,
                taskId,
                startTime,
                workspaceDir,
                status: 'running'
            };

            this.activeAgents.set(agentId, agentInfo);
            this.agentMetrics.totalSpawned++;

            // Monitor agent execution
            const result = await this.monitorAgentExecution(agentInfo, container);

            // Update metrics
            this.agentMetrics.totalCompleted++;
            const executionTime = Date.now() - startTime;
            this.updateAverageExecutionTime(executionTime);

            this.log('info', `✅ Agent completed: ${agentConfig.type} in ${executionTime}ms`);

            return {
                agentId,
                agentType: agentConfig.type,
                result,
                executionTime,
                status: 'completed'
            };

        } catch (error) {
            this.agentMetrics.totalFailed++;
            this.log('error', `❌ Agent failed: ${agentConfig.type} - ${error.message}`);

            return {
                agentId,
                agentType: agentConfig.type,
                error: error.message,
                status: 'failed'
            };
        }
    }

    /**
     * Monitor agent execution in container
     */
    async monitorAgentExecution(agentInfo, container) {
        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Agent ${agentInfo.id} timed out`));
            }, this.config.agentTimeout);

            try {
                // Monitor Redis for completion signal
                const completionKey = `swarm:${agentInfo.taskId}:${agentInfo.id}:done`;
                const confidenceKey = `swarm:${agentInfo.taskId}:${agentInfo.id}:confidence`;

                // Wait for completion signal
                const waitForCompletion = async () => {
                    try {
                        const completion = await this.redis.hget(completionKey, 'data');
                        const confidence = await this.redis.hget(confidenceKey, 'data');

                        if (completion && confidence) {
                            clearTimeout(timeout);

                            const result = {
                                completionData: JSON.parse(completion),
                                confidenceData: JSON.parse(confidence),
                                containerLogs: await this.getContainerLogs(container)
                            };

                            resolve(result);
                        } else {
                            // Check container status
                            const containerData = await container.inspect();
                            if (containerData.State.Status === 'exited') {
                                clearTimeout(timeout);
                                if (containerData.State.ExitCode !== 0) {
                                    reject(new Error(`Container exited with code ${containerData.State.ExitCode}`));
                                } else {
                                    resolve({
                                        completionData: { status: 'completed', deliverables: [] },
                                        confidenceData: { confidence: 0.5 },
                                        containerLogs: await this.getContainerLogs(container)
                                    });
                                }
                            } else {
                                // Continue waiting
                                setTimeout(waitForCompletion, 1000);
                            }
                        }
                    } catch (error) {
                        clearTimeout(timeout);
                        reject(error);
                    }
                };

                // Start waiting
                setTimeout(waitForCompletion, 1000);

            } catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        });
    }

    /**
     * Validate consensus from agent results
     */
    async validateConsensus(taskId, agentResults) {
        this.log('info', `🔍 Validating consensus from ${agentResults.length} agents`);

        const successfulResults = agentResults.filter(r => r.status === 'completed');
        const confidences = successfulResults.map(r => r.result.confidenceData.confidence);

        if (confidences.length === 0) {
            throw new Error('No successful agent results for consensus validation');
        }

        const averageConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        const minConfidence = Math.min(...confidences);
        const maxConfidence = Math.max(...confidences);

        const consensusResult = {
            taskId,
            totalAgents: agentResults.length,
            successfulAgents: successfulResults.length,
            averageConfidence,
            minConfidence,
            maxConfidence,
            consensusReached: averageConfidence >= 0.75 && minConfidence >= 0.6,
            deliverables: successfulResults.flatMap(r => r.result.completionData.deliverables || [])
        };

        // Store consensus result in Redis
        await this.redis.set(
            `swarm:${taskId}:consensus`,
            JSON.stringify(consensusResult),
            'EX',
            3600
        );

        this.log('info', `📊 Consensus: ${consensusResult.consensusReached ? 'REACHED' : 'NOT REACHED'} (${averageConfidence.toFixed(2)} avg)`);

        return consensusResult;
    }

    /**
     * Make product owner decision
     */
    async makeProductOwnerDecision(taskId, consensusResult) {
        this.log('info', `👔 Making product owner decision...`);

        // Simple decision logic - in production this would be more sophisticated
        let decision;
        if (consensusResult.consensusReached && consensusResult.averageConfidence >= 0.8) {
            decision = 'PROCEED';
        } else if (consensusResult.averageConfidence >= 0.6) {
            decision = 'ITERATE';
        } else {
            decision = 'ABORT';
        }

        const decisionResult = {
            taskId,
            decision,
            rationale: `Average confidence: ${consensusResult.averageConfidence.toFixed(2)}, Consensus: ${consensusResult.consensusReached}`,
            timestamp: Date.now(),
            nextSteps: decision === 'PROCEED' ? 'Deploy to production' :
                       decision === 'ITERATE' ? 'Refine and retry' : 'Review requirements'
        };

        // Store decision in Redis
        await this.redis.set(
            `swarm:${taskId}:decision`,
            JSON.stringify(decisionResult),
            'EX',
            3600
        );

        this.log('info', `🎯 Product Owner Decision: ${decision}`);

        return decisionResult;
    }

    /**
     * Compile final results
     */
    async compileResults(taskId, executionData) {
        const results = {
            taskId,
            taskDescription: executionData.taskDescription,
            executionTime: executionData.executionTime,
            agentResults: executionData.agentResults,
            consensusResult: executionData.consensusResult,
            productOwnerDecision: executionData.finalDecision,
            taskPlan: executionData.taskPlan,
            metrics: {
                ...this.agentMetrics,
                successRate: this.agentMetrics.totalCompleted / this.agentMetrics.totalSpawned,
                averageMemoryUsage: await this.monitoring.getAverageMemoryUsage(),
                peakConcurrency: executionData.taskPlan.requiredAgents.length
            },
            timestamp: Date.now()
        };

        // Store results
        const resultsPath = path.join(this.config.workspaceBase, `${taskId}-results.json`);
        await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));

        return results;
    }

    /**
     * Cleanup resources
     */
    async cleanup(taskId) {
        this.log('info', `🧹 Cleaning up task: ${taskId}`);

        // Cleanup active agents
        for (const [agentId, agentInfo] of this.activeAgents) {
            if (agentInfo.taskId === taskId) {
                try {
                    const container = await this.docker.getContainer(agentInfo.containerId);
                    await container.remove({ force: true, v: true });

                    // Cleanup workspace
                    await fs.rm(agentInfo.workspaceDir, { recursive: true, force: true });

                    this.activeAgents.delete(agentId);
                } catch (error) {
                    this.log('warn', `Failed to cleanup agent ${agentId}: ${error.message}`);
                }
            }
        }

        // Cleanup Redis keys
        const keys = await this.redis.keys(`swarm:${taskId}:*`);
        if (keys.length > 0) {
            await this.redis.del(...keys);
        }

        this.log('info', `✅ Cleanup completed for task: ${taskId}`);
    }

    /**
     * Helper methods
     */
    assessComplexity(taskDescription) {
        // Simple complexity assessment - enhance with NLP in production
        const indicators = {
            complex: ['architecture', 'system', 'integration', 'multiple', 'enterprise'],
            medium: ['feature', 'component', 'service', 'api'],
            simple: ['fix', 'update', 'documentation', 'test']
        };

        const text = taskDescription.toLowerCase();

        if (indicators.complex.some(word => text.includes(word))) return 'complex';
        if (indicators.medium.some(word => text.includes(word))) return 'medium';
        return 'simple';
    }

    selectAgents(taskDescription, complexity, options) {
        // Agent selection logic based on task analysis
        const text = taskDescription.toLowerCase();
        const agents = [];

        // Always include a developer
        if (text.includes('frontend') || text.includes('ui') || text.includes('react')) {
            agents.push({ type: 'react-frontend-engineer', priority: 1 });
        } else if (text.includes('backend') || text.includes('api') || text.includes('service')) {
            agents.push({ type: 'backend-developer', priority: 1 });
        } else {
            agents.push({ type: 'backend-developer', priority: 1 });
        }

        // Add specialists based on task content
        if (text.includes('security') || text.includes('auth')) {
            agents.push({ type: 'security-specialist', priority: 2 });
        }

        if (text.includes('test') || text.includes('quality')) {
            agents.push({ type: 'tester', priority: 2 });
        }

        if (text.includes('database') || text.includes('data')) {
            agents.push({ type: 'database-architect', priority: 2 });
        }

        if (text.includes('deploy') || text.includes('infrastructure')) {
            agents.push({ type: 'devops-engineer', priority: 2 });
        }

        // Add reviewers based on complexity
        if (complexity === 'complex' || complexity === 'medium') {
            agents.push({ type: 'code-reviewer', priority: 3 });
        }

        // Add documentation for enterprise tasks
        if (complexity === 'enterprise') {
            agents.push({ type: 'documentation-writer', priority: 3 });
        }

        return agents;
    }

    getProductionImage() {
        return 'claude-flow-novice:production';
    }

    getAgentCommand(agentConfig, agentContext) {
        return [
            'sh', '-c',
            `
                cd /app/workspace &&
                npx claude-flow-novice agent-spawn \
                    --type ${agentConfig.type} \
                    --task-id $TASK_ID \
                    --agent-id $AGENT_ID \
                    --redis-url $REDIS_URL \
                    --context-file /app/workspace/context.json
            `
        ];
    }

    parseMemoryLimit(limit) {
        // Convert memory limit string to bytes
        const units = { b: 1, k: 1024, m: 1024 * 1024, g: 1024 * 1024 * 1024 };
        const match = limit.toString().toLowerCase().match(/^(\d+)([bkmg]?)$/);
        if (!match) throw new Error(`Invalid memory limit: ${limit}`);
        return parseInt(match[1]) * (units[match[2]] || 1);
    }

    parseCpuLimit(limit) {
        // Convert CPU limit to nanoseconds
        const cpuValue = parseFloat(limit);
        return Math.floor(cpuValue * 1e9);
    }

    async ensureDockerNetwork() {
        try {
            const networks = await this.docker.listNetworks();
            const exists = networks.some(n => n.Name === this.config.networkName);

            if (!exists) {
                await this.docker.createNetwork({
                    Name: this.config.networkName,
                    Driver: 'bridge',
                    Labels: {
                        'cfn.managed': 'true',
                        'cfn.purpose': 'agent-coordination'
                    }
                });
                this.log('info', `✓ Created Docker network: ${this.config.networkName}`);
            }
        } catch (error) {
            this.log('warn', `Failed to ensure Docker network: ${error.message}`);
        }
    }

    async getContainerLogs(container) {
        try {
            const logs = await container.logs({
                stdout: true,
                stderr: true,
                timestamps: false,
                tail: 100
            });
            return logs.toString();
        } catch (error) {
            return `Failed to get logs: ${error.message}`;
        }
    }

    updateAverageExecutionTime(newTime) {
        const total = this.agentMetrics.totalCompleted;
        const current = this.agentMetrics.averageExecutionTime;
        this.agentMetrics.averageExecutionTime = ((current * (total - 1)) + newTime) / total;
    }

    getMaxIterations(mode) {
        const iterations = { mvp: 5, standard: 10, enterprise: 15 };
        return iterations[mode] || 10;
    }

    estimateDuration(agents, complexity) {
        const baseTime = 30000; // 30 seconds base
        const agentMultiplier = agents.length * 10000; // 10s per agent
        const complexityMultiplier = { simple: 1, medium: 1.5, complex: 2 }[complexity] || 1.5;
        return baseTime + (agentMultiplier * complexityMultiplier);
    }

    calculateResources(agents) {
        return {
            memory: agents.length * this.parseMemoryLimit(this.config.memoryLimit),
            cpu: agents.length * this.parseCpuLimit(this.config.cpuLimit),
            networkBandwidth: 'estimated'
        };
    }

    log(level, message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }

    /**
     * Shutdown orchestrator
     */
    async shutdown() {
        this.log('info', '🛑 Shutting down orchestrator...');

        // Cleanup all active agents
        for (const [agentId, agentInfo] of this.activeAgents) {
            try {
                const container = await this.docker.getContainer(agentInfo.containerId);
                await container.remove({ force: true });
            } catch (error) {
                this.log('warn', `Failed to cleanup agent ${agentId}: ${error.message}`);
            }
        }

        // Stop monitoring
        await this.monitoring.stop();

        // Close Redis connection
        await this.redis.quit();

        this.log('info', '✅ Orchestrator shutdown complete');
    }
}

/**
 * Context Manager for agent coordination
 */
class ContextManager {
    constructor(config) {
        this.config = config;
    }

    async prepareContext(taskId, taskPlan) {
        const contextData = {
            taskId,
            taskDescription: taskPlan.taskDescription,
            complexity: taskPlan.complexity,
            mode: taskPlan.mode,
            globalInstructions: {
                coordinationProtocol: 'redis',
                workspaceManagement: 'auto',
                loggingLevel: this.config.logLevel,
                timeoutMs: this.config.agentTimeout
            },
            agentInstructions: {}
        };

        // Prepare agent-specific instructions
        for (const agent of taskPlan.requiredAgents) {
            contextData.agentInstructions[agent.type] = {
                priority: agent.priority,
                contextScope: this.getContextScope(agent.type, taskPlan),
                deliverables: this.getExpectedDeliverables(agent.type, taskPlan),
                dependencies: this.getAgentDependencies(agent.type, taskPlan.requiredAgents)
            };
        }

        return contextData;
    }

    async prepareAgentContext(agentId, agentConfig, globalContext, workspaceDir) {
        const agentContext = {
            ...globalContext,
            agentId,
            agentType: agentConfig.type,
            workspaceDirectory: workspaceDir,
            specificInstructions: globalContext.agentInstructions[agentConfig.type] || {}
        };

        // Write context file to workspace
        const contextPath = path.join(workspaceDir, 'context.json');
        await fs.writeFile(contextPath, JSON.stringify(agentContext, null, 2));

        return agentContext;
    }

    getContextScope(agentType, taskPlan) {
        const scopes = {
            'react-frontend-engineer': ['ui-components', 'frontend-architecture'],
            'backend-developer': ['api-endpoints', 'business-logic'],
            'security-specialist': ['security-analysis', 'vulnerability-assessment'],
            'tester': ['test-strategy', 'quality-assurance'],
            'database-architect': ['database-design', 'data-modeling'],
            'code-reviewer': ['code-quality', 'best-practices'],
            'documentation-writer': ['documentation', 'user-guides']
        };
        return scopes[agentType] || ['general-development'];
    }

    getExpectedDeliverables(agentType, taskPlan) {
        const baseDeliverables = ['code-implementation', 'documentation'];
        const specificDeliverables = {
            'react-frontend-engineer': ['components', 'styles', 'tests'],
            'backend-developer': ['api-code', 'validation', 'error-handling'],
            'security-specialist': ['security-report', 'recommendations'],
            'tester': ['test-cases', 'test-results', 'coverage-report'],
            'database-architect': ['schema', 'migrations', 'indexes'],
            'code-reviewer': ['review-comments', 'quality-metrics'],
            'documentation-writer': ['user-guide', 'api-docs', 'deployment-guide']
        };
        return [...baseDeliverables, ...(specificDeliverables[agentType] || [])];
    }

    getAgentDependencies(agentType, allAgents) {
        // Define agent dependencies for coordination
        const dependencies = {
            'code-reviewer': allAgents.filter(a => a.type !== 'code-reviewer').map(a => a.type),
            'tester': allAgents.filter(a => a.type === 'backend-developer' || a.type === 'react-frontend-engineer').map(a => a.type),
            'documentation-writer': allAgents.filter(a => a.type !== 'documentation-writer').map(a => a.type)
        };
        return dependencies[agentType] || [];
    }
}

/**
 * Resource Manager for Docker container orchestration
 */
class ResourceManager {
    constructor(docker, config) {
        this.docker = docker;
        this.config = config;
        this.runningContainers = new Set();
    }

    async executeWithLimits(promises, maxConcurrent) {
        const results = [];
        const executing = new Set();

        for (const promise of promises) {
            if (executing.size >= maxConcurrent) {
                await Promise.race(executing);
            }

            const p = promise.then(result => {
                executing.delete(p);
                return result;
            }).catch(error => {
                executing.delete(p);
                throw error;
            });

            executing.add(p);
            results.push(p);
        }

        return Promise.allSettled(results);
    }
}

/**
 * Monitoring Service for agent performance
 */
class MonitoringService {
    constructor(redis, config) {
        this.redis = redis;
        this.config = config;
        this.isRunning = false;
        this.metricsInterval = null;
    }

    async start() {
        this.isRunning = true;
        this.metricsInterval = setInterval(() => {
            this.collectMetrics();
        }, 30000); // Collect metrics every 30 seconds
    }

    async stop() {
        this.isRunning = false;
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
    }

    async collectMetrics() {
        if (!this.isRunning) return;

        try {
            const metrics = {
                timestamp: Date.now(),
                activeAgents: 0,
                memoryUsage: 0,
                cpuUsage: 0
            };

            await this.redis.set('metrics:system', JSON.stringify(metrics), 'EX', 300);
        } catch (error) {
            console.warn('Failed to collect metrics:', error.message);
        }
    }

    async getAverageMemoryUsage() {
        try {
            const metrics = await this.redis.get('metrics:system');
            return metrics ? JSON.parse(metrics).memoryUsage : 0;
        } catch (error) {
            return 0;
        }
    }
}

export default ProductionAgentOrchestrator;

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const orchestrator = new ProductionAgentOrchestrator();

    orchestrator.initialize()
        .then(() => {
            const taskDescription = process.argv[2] || 'Build a simple web application with React frontend and Node.js backend';
            return orchestrator.executeCFNLoop(taskDescription);
        })
        .then(results => {
            console.log('\n🎉 CFN Loop Results:');
            console.log(JSON.stringify(results, null, 2));
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Execution failed:', error.message);
            process.exit(1);
        });
}