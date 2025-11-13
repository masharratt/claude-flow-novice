#!/usr/bin/env node

/**
 * Concurrent Docker Agent Test - MVP Validation
 *
 * Tests 6-7 agents running in parallel with real container file operations,
 * result coordination, and automatic cleanup verification.
 *
 * MVP Workflow:
 * 1. Spawn agents in containers
 * 2. Agents perform tasks with real file edits/writes
 * 3. Results returned to coordinator (via shared workspace)
 * 4. Container cleanup verification
 */

import DockerTestUtils from './lib/docker-test-utils.cjs';
import fs from 'fs/promises';
import path from 'path';

class ConcurrentAgentTest {
    constructor() {
        this.testUtils = new DockerTestUtils();
        this.results = {
            testSuite: 'Docker Concurrent Agent MVP Test',
            timestamp: new Date().toISOString(),
            agents: [],
            files: [],
            cleanup: {
                containersCleaned: 0,
                containersOrphaned: 0,
                workspacesCleaned: 0,
                workspacesOrphaned: 0
            },
            summary: {
                totalAgents: 0,
                tasksCompleted: 0,
                filesCreated: 0,
                cleanupSuccess: false,
                testPassed: false
            },
            configuration: {
                agentTypes: [
                    'react-frontend-engineer',
                    'backend-developer',
                    'database-architect',
                    'security-specialist',
                    'tester',
                    'documentation-writer',
                    'code-reviewer'
                ],
                taskComplexity: 'simple',
                expectedFilesPerAgent: 3,
                parallelExecution: true,
                timeoutMs: 300000 // 5 minutes
            }
        };
    }

    /**
     * Main test execution
     */
    async run() {
        console.log('🚀 Starting Concurrent Docker Agent MVP Test');
        console.log('=' .repeat(60));

        const startTime = Date.now();

        try {
            // Initialize test environment
            await this.testUtils.initializeTestEnvironment();
            console.log('✅ Test environment initialized');

            // Define concurrent tasks
            const tasks = this.defineConcurrentTasks();
            console.log(`📋 Defined ${tasks.length} concurrent tasks`);

            // Spawn agents in parallel
            await this.spawnAgentsConcurrently(tasks);

            // Execute tasks concurrently
            await this.executeConcurrentTasks();

            // Collect results from workspaces
            await this.collectResults();

            // Verify cleanup
            await this.verifyCleanup();

            // Calculate summary
            this.calculateSummary();

            // Print results
            this.printResults();

            const duration = Date.now() - startTime;
            console.log(`\n⏱️ Total execution time: ${Math.round(duration / 1000)}s`);

            return this.results.summary.testPassed;

        } catch (error) {
            console.error('❌ Concurrent test execution failed:', error.message);
            this.results.summary.error = error.message;
            return false;
        }
    }

    /**
     * Define concurrent tasks for agents
     */
    defineConcurrentTasks() {
        const tasks = [];
        const baseDir = '/tmp/concurrent-test-workspace';

        this.results.configuration.agentTypes.forEach((agentType, index) => {
            const task = {
                agentType,
                taskId: this.testUtils.generateTestId(`concurrent-${agentType}`),
                workspaceDir: `${baseDir}/${agentType}`,
                instructions: this.getAgentInstructions(agentType),
                expectedFiles: [
                    `${agentType}-task-result.txt`,
                    `${agentType}-workspace-check.txt`,
                    `${agentType}-completion-log.txt`
                ]
            };
            tasks.push(task);
        });

        return tasks;
    }

    /**
     * Get task instructions for each agent type
     */
    getAgentInstructions(agentType) {
        const instructions = {
            'react-frontend-engineer': {
                description: 'Create a simple React component file',
                operations: [
                    'Create a React component with TypeScript',
                    'Add basic styling with CSS modules',
                    'Write a brief implementation summary'
                ]
            },
            'backend-developer': {
                description: 'Create a simple API endpoint',
                operations: [
                    'Create an Express.js route file',
                    'Add input validation middleware',
                    'Write API documentation summary'
                ]
            },
            'database-architect': {
                description: 'Design a simple database schema',
                operations: [
                    'Create SQL schema file',
                    'Add index definitions',
                    'Write schema explanation'
                ]
            },
            'security-specialist': {
                description: 'Perform basic security analysis',
                operations: [
                    'Create security checklist file',
                    'List potential vulnerabilities',
                    'Write security recommendations'
                ]
            },
            'tester': {
                description: 'Create test specifications',
                operations: [
                    'Write unit test specifications',
                    'Create integration test plan',
                    'Document test coverage strategy'
                ]
            },
            'documentation-writer': {
                description: 'Create documentation files',
                operations: [
                    'Write API documentation',
                    'Create user guide outline',
                    'Document deployment steps'
                ]
            },
            'code-reviewer': {
                description: 'Perform code review analysis',
                operations: [
                    'Create code review checklist',
                    'Write quality assessment criteria',
                    'Document review findings'
                ]
            }
        };

        return instructions[agentType] || {
            description: 'Perform general development task',
            operations: ['Complete task', 'Document results', 'Verify output']
        };
    }

    /**
     * Spawn agents concurrently
     */
    async spawnAgentsConcurrently(tasks) {
        console.log('\n🐳 Spawning agents concurrently...');

        const spawnPromises = tasks.map(task => this.spawnSingleAgent(task));
        const spawnResults = await Promise.all(spawnPromises);

        // Check spawn results
        const successfulSpawns = spawnResults.filter(result => result.success);
        const failedSpawns = spawnResults.filter(result => !result.success);

        console.log(`✅ ${successfulSpawns.length}/${tasks.length} agents spawned successfully`);

        if (failedSpawns.length > 0) {
            console.warn('⚠️ Failed spawns:');
            failedSpawns.forEach(failure => {
                console.warn(`  - ${failure.task.agentType}: ${failure.error}`);
            });
        }

        if (successfulSpawns.length === 0) {
            throw new Error('No agents spawned successfully');
        }

        this.results.summary.totalAgents = successfulSpawns.length;
    }

    /**
     * Spawn a single agent
     */
    async spawnSingleAgent(task) {
        console.log(`   Spawning ${task.agentType}...`);

        try {
            // Create workspace directory
            await fs.mkdir(task.workspaceDir, { recursive: true });

            // Write task instructions to workspace
            const instructionFile = path.join(task.workspaceDir, 'task-instructions.json');
            await fs.writeFile(instructionFile, JSON.stringify({
                agentType: task.agentType,
                taskId: task.taskId,
                description: task.instructions.description,
                operations: task.instructions.operations,
                expectedFiles: task.expectedFiles,
                workspaceDir: task.workspaceDir
            }, null, 2));

            // Spawn agent container
            const spawnResult = await this.testUtils.spawnDockerAgents(
                task.taskId,
                [task.agentType],
                {
                    memoryLimit: '512m',
                    verbose: false
                }
            );

            if (spawnResult.successRate > 0) {
                const agentId = spawnResult.taskAgents[0].agentId;
                const actualWorkspaceDir = `/tmp/agent-workspace-${agentId}`;

                const agent = {
                    ...task,
                    containerId: spawnResult.taskAgents[0].containerId,
                    agentId: agentId,
                    workspaceDir: actualWorkspaceDir, // Use actual workspace created by spawn script
                    spawned: true,
                    startTime: Date.now(),
                    status: 'running'
                };

                this.results.agents.push(agent);
                console.log(`   ✅ ${task.agentType} spawned (container: ${agent.containerId})`);

                return { success: true, task, agent };
            } else {
                return { success: false, task, error: 'Spawn failed' };
            }

        } catch (error) {
            console.error(`   ❌ Failed to spawn ${task.agentType}: ${error.message}`);
            return { success: false, task, error: error.message };
        }
    }

    /**
     * Execute tasks concurrently
     */
    async executeConcurrentTasks() {
        console.log('\n🔄 Executing tasks concurrently...');

        const runningAgents = this.results.agents.filter(agent => agent.spawned);
        const executionPromises = runningAgents.map(agent => this.executeAgentTask(agent));

        // Wait for all agents to complete with timeout
        const timeout = this.results.configuration.timeoutMs;
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Task execution timeout')), timeout)
        );

        try {
            await Promise.race([
                Promise.all(executionPromises),
                timeoutPromise
            ]);
            console.log('✅ All agents completed their tasks');
        } catch (error) {
            if (error.message === 'Task execution timeout') {
                console.warn('⚠️ Task execution timeout - checking completed work...');
            } else {
                throw error;
            }
        }
    }

    /**
     * Execute individual agent task
     */
    async executeAgentTask(agent) {
        try {
            // Monitor agent progress by checking workspace
            const maxWait = 60000; // 60 seconds per agent
            const startTime = Date.now();

            while (Date.now() - startTime < maxWait) {
                // Check if expected files exist
                const existingFiles = [];
                for (const expectedFile of agent.expectedFiles) {
                    const filePath = path.join(agent.workspaceDir, expectedFile);
                    try {
                        await fs.access(filePath);
                        existingFiles.push(expectedFile);
                    } catch {
                        // File doesn't exist yet
                    }
                }

                if (existingFiles.length === agent.expectedFiles.length) {
                    console.log(`   ✅ ${agent.agentType} completed (${existingFiles.length} files)`);
                    agent.status = 'completed';
                    agent.filesCreated = existingFiles;
                    return existingFiles;
                }

                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Timeout reached
            console.warn(`   ⚠️ ${agent.agentType} incomplete - checking partial work...`);
            const partialFiles = [];
            for (const expectedFile of agent.expectedFiles) {
                const filePath = path.join(agent.workspaceDir, expectedFile);
                try {
                    await fs.access(filePath);
                    partialFiles.push(expectedFile);
                } catch {
                    // File doesn't exist
                }
            }

            agent.status = partialFiles.length > 0 ? 'partial' : 'failed';
            agent.filesCreated = partialFiles;
            return partialFiles;

        } catch (error) {
            console.error(`   ❌ ${agent.agentType} execution error: ${error.message}`);
            agent.status = 'error';
            agent.error = error.message;
            return [];
        }
    }

    /**
     * Collect results from workspaces
     */
    async collectResults() {
        console.log('\n📁 Collecting results from workspaces...');

        const allFiles = [];

        for (const agent of this.results.agents) {
            if (!agent.filesCreated || agent.filesCreated.length === 0) {
                continue;
            }

            for (const fileName of agent.filesCreated) {
                try {
                    const filePath = path.join(agent.workspaceDir, fileName);
                    const content = await fs.readFile(filePath, 'utf8');
                    const stats = await fs.stat(filePath);

                    const fileRecord = {
                        fileName,
                        filePath,
                        content: content.substring(0, 200), // Truncate for logging
                        createdBy: agent.agentType,
                        createdAt: stats.mtime.toISOString(),
                        size: stats.size,
                        agentId: agent.agentId,
                        taskId: agent.taskId
                    };

                    allFiles.push(fileRecord);
                    console.log(`   📄 ${fileName} (${agent.agentType})`);

                } catch (error) {
                    console.warn(`   ⚠️ Could not read ${fileName} from ${agent.agentType}: ${error.message}`);
                }
            }
        }

        this.results.files = allFiles;
        this.results.summary.filesCreated = allFiles.length;
        console.log(`✅ Collected ${allFiles.length} files from workspaces`);
    }

    /**
     * Verify container and workspace cleanup (enhanced validation)
     */
    async verifyCleanup() {
        console.log('\n🧹 Verifying cleanup...');

        // 等待清理机制完成（给自动清理时间）
        console.log('   Waiting for automatic cleanup mechanisms...');
        await new Promise(resolve => setTimeout(resolve, 10000)); // 等待10秒

        // 详细验证容器清理
        let containersRequiringForcedCleanup = 0;
        let workspacesRequiringForcedCleanup = 0;

        for (const agent of this.results.agents) {
            if (!agent.containerId) continue;

            // 检查容器状态 - 运行状态
            let containerRunning = false;
            let containerExists = false;

            try {
                const { execSync } = require('child_process');

                // 检查是否在运行
                const runningCheck = execSync(
                    `docker ps -q -f id=${agent.containerId}`,
                    { encoding: 'utf8', stdio: 'pipe' }
                ).trim();

                if (runningCheck) {
                    containerRunning = true;
                    containerExists = true;
                    console.warn(`   🔴 CONTAINER STILL RUNNING: ${agent.containerId} (${agent.agentType})`);

                    // 获取容器详细信息
                    try {
                        const containerInfo = execSync(
                            `docker inspect --format '{{.State.Status}} {{.Created}} {{.StartedAt}}' ${agent.containerId}`,
                            { encoding: 'utf8', stdio: 'pipe' }
                        ).trim();
                        console.warn(`      Status: ${containerInfo}`);
                    } catch (infoError) {
                        // 忽略信息获取错误
                    }
                } else {
                    // 检查是否存在但已停止
                    const existsCheck = execSync(
                        `docker ps -a -q -f id=${agent.containerId}`,
                        { encoding: 'utf8', stdio: 'pipe' }
                    ).trim();

                    if (existsCheck) {
                        containerExists = true;
                        console.warn(`   🟡 CONTAINER EXISTS BUT STOPPED: ${agent.containerId} (${agent.agentType})`);
                    }
                }
            } catch (error) {
                // 容器不存在 - 这是期望的结果
                console.log(`   ✅ Container properly cleaned: ${agent.agentType} (${agent.containerId})`);
                this.results.cleanup.containersCleaned++;
            }

            // 如果容器还存在，进行强制清理
            if (containerExists) {
                containersRequiringForcedCleanup++;
                this.results.cleanup.containersOrphaned++;

                console.log(`   🔧 Force cleaning container: ${agent.containerId}`);

                try {
                    const { execSync } = require('child_process');

                    // 尝试优雅停止
                    if (containerRunning) {
                        execSync(`docker stop ${agent.containerId}`, { stdio: 'pipe' });
                        console.log(`      Stopped running container`);
                    }

                    // 删除容器
                    execSync(`docker rm ${agent.containerId}`, { stdio: 'pipe' });
                    console.log(`      Removed container`);

                    this.results.cleanup.containersCleaned++;
                    console.log(`   ✅ Force cleanup successful: ${agent.containerId}`);

                } catch (cleanupError) {
                    console.error(`   ❌ Force cleanup failed: ${agent.containerId} - ${cleanupError.message}`);

                    // 最后尝试强制删除
                    try {
                        const { execSync } = require('child_process');
                        execSync(`docker rm -f ${agent.containerId}`, { stdio: 'pipe' });
                        console.log(`   🚨 Force removed container: ${agent.containerId}`);
                        this.results.cleanup.containersCleaned++;
                    } catch (forceError) {
                        console.error(`   🚨 CRITICAL: Could not remove container ${agent.containerId}: ${forceError.message}`);
                    }
                }
            }
        }

        // 详细验证workspace清理
        for (const agent of this.results.agents) {
            let workspaceExists = false;
            let workspaceSize = 0;

            try {
                await fs.access(agent.workspaceDir);
                workspaceExists = true;

                // 获取workspace大小
                try {
                    const { execSync } = require('child_process');
                    const sizeOutput = execSync(
                        `du -sb "${agent.workspaceDir}" 2>/dev/null | cut -f1`,
                        { encoding: 'utf8', stdio: 'pipe' }
                    ).trim();
                    workspaceSize = parseInt(sizeOutput) || 0;
                } catch (sizeError) {
                    // 忽略大小获取错误
                }

                console.warn(`   🟡 WORKSPACE STILL EXISTS: ${agent.workspaceDir} (${agent.agentType}) - ${(workspaceSize/1024).toFixed(1)}KB`);

                // 列出workspace内容（限制输出）
                try {
                    const { execSync } = require('child_process');
                    const contentList = execSync(
                        `ls -la "${agent.workspaceDir}" 2>/dev/null | head -5`,
                        { encoding: 'utf8', stdio: 'pipe' }
                    ).trim();
                    if (contentList) {
                        console.warn(`      Contents (sample):\n${contentList.replace(/^/m, '        ')}`);
                    }
                } catch (listError) {
                    // 忽略列表获取错误
                }

                workspacesRequiringForcedCleanup++;
                this.results.cleanup.workspacesOrphaned++;

            } catch (error) {
                // Workspace不存在 - 这是期望的结果
                console.log(`   ✅ Workspace properly cleaned: ${agent.agentType} (${agent.workspaceDir})`);
                this.results.cleanup.workspacesCleaned++;
            }

            // 如果workspace还存在，进行强制清理
            if (workspaceExists) {
                console.log(`   🔧 Force cleaning workspace: ${agent.workspaceDir}`);

                try {
                    await fs.rm(agent.workspaceDir, { recursive: true, force: true });
                    console.log(`      Removed workspace (${(workspaceSize/1024).toFixed(1)}KB)`);
                    this.results.cleanup.workspacesCleaned++;
                    console.log(`   ✅ Force workspace cleanup successful: ${agent.workspaceDir}`);

                } catch (cleanupError) {
                    console.error(`   ❌ Force workspace cleanup failed: ${agent.workspaceDir} - ${cleanupError.message}`);

                    // 最后尝试使用系统命令
                    try {
                        const { execSync } = require('child_process');
                        execSync(`rm -rf "${agent.workspaceDir}"`, { stdio: 'pipe' });
                        console.log(`   🚨 Force removed workspace: ${agent.workspaceDir}`);
                        this.results.cleanup.workspacesCleaned++;
                    } catch (forceError) {
                        console.error(`   🚨 CRITICAL: Could not remove workspace ${agent.workspaceDir}: ${forceError.message}`);
                    }
                }
            }
        }

        // 计算清理统计
        const totalItems = this.results.agents.length * 2; // containers + workspaces
        const cleanedItems = this.results.cleanup.containersCleaned + this.results.cleanup.workspacesCleaned;
        const cleanupSuccess = cleanedItems === totalItems;

        // 更新清理统计
        this.results.summary.containersRequiringForcedCleanup = containersRequiringForcedCleanup;
        this.results.summary.workspacesRequiringForcedCleanup = workspacesRequiringForcedCleanup;
        this.results.summary.cleanupSuccess = cleanupSuccess;

        // 计算清理效率
        const totalContainers = this.results.agents.length;
        const totalWorkspaces = this.results.agents.length;
        const automaticContainerCleanup = totalContainers - containersRequiringForcedCleanup;
        const automaticWorkspaceCleanup = totalWorkspaces - workspacesRequiringForcedCleanup;

        this.results.summary.containerCleanupEfficiency = totalContainers > 0 ?
            (automaticContainerCleanup / totalContainers) * 100 : 0;
        this.results.summary.workspaceCleanupEfficiency = totalWorkspaces > 0 ?
            (automaticWorkspaceCleanup / totalWorkspaces) * 100 : 0;

        // 详细清理报告
        console.log(`\n📊 Cleanup Verification Results:`);
        console.log(`   Total items: ${totalItems} (${totalContainers} containers + ${totalWorkspaces} workspaces)`);
        console.log(`   Automatically cleaned: ${(automaticContainerCleanup + automaticWorkspaceCleanup)} items`);
        console.log(`   Force cleaned: ${(containersRequiringForcedCleanup + workspacesRequiringForcedCleanup)} items`);
        console.log(`   Container cleanup efficiency: ${this.results.summary.containerCleanupEfficiency.toFixed(1)}%`);
        console.log(`   Workspace cleanup efficiency: ${this.results.summary.workspaceCleanupEfficiency.toFixed(1)}%`);
        console.log(`   Overall cleanup success: ${cleanupSuccess ? '✅' : '❌'}`);

        // 警告清理问题
        if (containersRequiringForcedCleanup > 0) {
            console.warn(`\n⚠️ WARNING: ${containersRequiringForcedCleanup} containers required manual cleanup`);
            console.warn(`   This indicates a problem with automatic container cleanup mechanisms`);
        }

        if (workspacesRequiringForcedCleanup > 0) {
            console.warn(`\n⚠️ WARNING: ${workspacesRequiringForcedCleanup} workspaces required manual cleanup`);
            console.warn(`   This indicates a problem with automatic workspace cleanup mechanisms`);
        }

        if (!cleanupSuccess) {
            console.error(`\n🚨 CRITICAL: Cleanup verification failed!`);
            console.error(`   Resource leaks detected - container cleanup mechanisms need fixing`);
        }
    }

    /**
     * Calculate test summary
     */
    calculateSummary() {
        const { agents, files, cleanup, summary, configuration } = this.results;

        // Agent performance metrics
        const completedAgents = agents.filter(a => a.status === 'completed').length;
        const partialAgents = agents.filter(a => a.status === 'partial').length;
        const failedAgents = agents.filter(a => a.status === 'failed' || a.status === 'error').length;

        summary.tasksCompleted = completedAgents;
        summary.agentsCompleted = completedAgents;
        summary.agentsPartial = partialAgents;
        summary.agentsFailed = failedAgents;

        // Success criteria
        const taskSuccessRate = completedAgents / agents.length;
        const fileSuccessRate = files.length / (agents.length * configuration.expectedFilesPerAgent);
        const cleanupSuccess = summary.cleanupSuccess;

        summary.taskSuccessRate = taskSuccessRate;
        summary.fileSuccessRate = fileSuccessRate;

        // Determine if test passed
        // Pass criteria: >80% agents complete, >60% files created, cleanup successful
        summary.testPassed = taskSuccessRate >= 0.8 && fileSuccessRate >= 0.6 && cleanupSuccess;

        summary.criteria = {
            sufficientAgentCompletion: taskSuccessRate >= 0.8,
            sufficientFileCreation: fileSuccessRate >= 0.6,
            cleanupSuccessful: cleanupSuccess,
            parallelExecutionSucceeded: agents.length > 1
        };
    }

    /**
     * Print test results
     */
    printResults() {
        const { agents, files, cleanup, summary, configuration } = this.results;

        console.log('\n' + '='.repeat(60));
        console.log('🚀 CONCURRENT DOCKER AGENT MVP TEST RESULTS');
        console.log('='.repeat(60));

        console.log(`\n👥 Agent Performance:`);
        console.log(`   Total Agents: ${summary.totalAgents}`);
        console.log(`   Completed: ${summary.agentsCompleted} (${(summary.taskSuccessRate * 100).toFixed(1)}%)`);
        console.log(`   Partial: ${summary.agentsPartial}`);
        console.log(`   Failed: ${summary.agentsFailed}`);

        console.log(`\n📁 File Creation:`);
        console.log(`   Files Created: ${summary.filesCreated}`);
        console.log(`   Expected Files: ${summary.totalAgents * configuration.expectedFilesPerAgent}`);
        console.log(`   Success Rate: ${(summary.fileSuccessRate * 100).toFixed(1)}%)`);

        console.log(`\n🧹 Enhanced Cleanup Results:`);
        console.log(`   Containers Cleaned: ${cleanup.containersCleaned}/${summary.totalAgents}`);
        console.log(`   Workspaces Cleaned: ${cleanup.workspacesCleaned}/${summary.totalAgents}`);
        console.log(`   Container Cleanup Efficiency: ${summary.containerCleanupEfficiency?.toFixed(1) || 'N/A'}%`);
        console.log(`   Workspace Cleanup Efficiency: ${summary.workspaceCleanupEfficiency?.toFixed(1) || 'N/A'}%`);
        console.log(`   Required Manual Cleanup: ${summary.containersRequiringManualCleanup || 0} containers, ${summary.workspacesRequiringManualCleanup || 0} workspaces`);
        console.log(`   Cleanup Success: ${summary.cleanupSuccess ? '✅' : '❌'}`);

        console.log(`\n✅ Success Criteria:`);
        Object.entries(summary.criteria).forEach(([criterion, passed]) => {
            console.log(`   ${passed ? '✅' : '❌'} ${criterion}: ${passed ? 'PASSED' : 'FAILED'}`);
        });

        console.log(`\n🎯 Test Result:`);
        console.log(`   Status: ${summary.testPassed ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`   Overall: ${summary.testPassed ? 'Concurrent agent execution successful' : 'Test failed - check criteria above'}`);

        // Show agent details
        if (agents.length > 0) {
            console.log(`\n📊 Agent Details:`);
            agents.forEach(agent => {
                const duration = agent.startTime ? Math.round((Date.now() - agent.startTime) / 1000) : 0;
                const status = agent.status === 'completed' ? '✅' :
                               agent.status === 'partial' ? '🔶' :
                               agent.status === 'running' ? '🔄' : '❌';
                console.log(`   ${status} ${agent.agentType}: ${agent.filesCreated?.length || 0} files, ${duration}s`);
            });
        }

        // Show file samples
        if (files.length > 0) {
            console.log(`\n📄 Sample Files:`);
            files.slice(0, 3).forEach(file => {
                console.log(`   - ${file.fileName}: Created by ${file.createdBy} (${file.size} bytes)`);
            });
            if (files.length > 3) {
                console.log(`   ... and ${files.length - 3} more files`);
            }
        }

        console.log('\n' + '='.repeat(60));
    }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const test = new ConcurrentAgentTest();
    test.run()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
}

export default ConcurrentAgentTest;