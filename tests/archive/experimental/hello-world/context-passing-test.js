#!/usr/bin/env node

/**
 * Context Passing Test - Coordinator to Agent Communication
 *
 * Tests different methods of passing context from coordinator to containerized agents:
 * 1. File-based instruction passing (last resort)
 * 2. Environment variable context
 * 3. Volume-mounted configuration files
 * 4. Dynamic task assignment
 *
 * MVP Pattern: Coordinator writes instructions → Agent reads from file → Executes task
 */

import DockerTestUtils from './lib/docker-test-utils.cjs';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

class ContextPassingTest {
    constructor() {
        this.testUtils = new DockerTestUtils();
        this.results = {
            testSuite: 'Docker Context Passing Test',
            timestamp: new Date().toISOString(),
            tests: [],
            agents: [],
            files: [],
            contextMethods: {
                fileBased: { tested: false, passed: false, details: {} },
                environment: { tested: false, passed: false, details: {} },
                volumeMount: { tested: false, passed: false, details: {} },
                dynamicAssignment: { tested: false, passed: false, details: {} }
            },
            summary: {
                totalTests: 0,
                testsPassed: 0,
                contextDeliverySuccess: 0,
                taskExecutionSuccess: 0,
                overallPassed: false
            },
            configuration: {
                contextDir: '/tmp/context-test-workspace',
                testTimeoutMs: 120000, // 2 minutes per test
                agentMemoryLimit: '256m',
                complexTaskContext: {
                    projectName: 'user-authentication-system',
                    deliverables: [
                        'login-component.tsx',
                        'auth-service.js',
                        'user-model.sql',
                        'security-checklist.md'
                    ],
                    constraints: [
                        'Use TypeScript for frontend',
                        'Implement JWT authentication',
                        'Follow OWASP security guidelines',
                        'Include input validation'
                    ],
                    acceptanceCriteria: [
                        'Users can register with email/password',
                        'Login works with valid credentials',
                        'Passwords are properly hashed',
                        'Sessions expire after 1 hour'
                    ]
                }
            }
        };
    }

    /**
     * Main test execution
     */
    async run() {
        console.log('📬 Starting Context Passing Test');
        console.log('=' .repeat(50));

        const startTime = Date.now();

        try {
            // Initialize test environment
            await this.testUtils.initializeTestEnvironment();
            await fs.mkdir(this.results.configuration.contextDir, { recursive: true });
            console.log('✅ Test environment initialized');

            // Test 1: File-based instruction passing (last resort)
            await this.testFileBasedContext();

            // Test 2: Environment variable context
            await this.testEnvironmentVariableContext();

            // Test 3: Volume-mounted configuration files
            await this.testVolumeMountContext();

            // Test 4: Dynamic task assignment
            await this.testDynamicTaskAssignment();

            // Calculate summary
            this.calculateSummary();

            // Print results
            this.printResults();

            // Cleanup
            await this.cleanup();

            const duration = Date.now() - startTime;
            console.log(`\n⏱️ Total execution time: ${Math.round(duration / 1000)}s`);

            return this.results.summary.overallPassed;

        } catch (error) {
            console.error('❌ Context passing test failed:', error.message);
            this.results.summary.error = error.message;
            return false;
        }
    }

    /**
     * Test 1: File-based instruction passing (last resort method)
     */
    async testFileBasedContext() {
        console.log('\n📄 Test 1: File-based Instruction Passing');

        const testName = 'file-based-context';
        const testStartTime = Date.now();

        try {
            // Create complex context file
            const contextFile = path.join(this.results.configuration.contextDir, 'task-context.json');
            const contextData = {
                taskId: this.testUtils.generateTestId('file-context'),
                agentType: 'backend-developer',
                projectName: this.results.configuration.complexTaskContext.projectName,
                deliverables: this.results.configuration.complexTaskContext.deliverables.slice(0, 2),
                constraints: this.results.configuration.complexTaskContext.constraints,
                acceptanceCriteria: this.results.configuration.complexTaskContext.acceptanceCriteria.slice(0, 2),
                instructionMethod: 'file-based',
                timestamp: new Date().toISOString()
            };

            await fs.writeFile(contextFile, JSON.stringify(contextData, null, 2));
            console.log(`   📝 Context file created: ${contextFile}`);

            // Create workspace for agent
            const workspaceDir = path.join(this.results.configuration.contextDir, 'file-workspace');
            await fs.mkdir(workspaceDir, { recursive: true });

            // Spawn agent with access to context file
            const spawnResult = await this.testUtils.spawnDockerAgents(
                contextData.taskId,
                [contextData.agentType],
                {
                    memoryLimit: this.results.configuration.agentMemoryLimit,
                    verbose: false
                }
            );

            if (spawnResult.successRate === 0) {
                throw new Error('Failed to spawn agent for file-based context test');
            }

            const agent = {
                test: testName,
                agentType: contextData.agentType,
                taskId: contextData.taskId,
                containerId: spawnResult.taskAgents[0].containerId,
                agentId: spawnResult.taskAgents[0].agentId,
                workspaceDir,
                contextFile,
                startTime: Date.now(),
                status: 'running'
            };

            this.results.agents.push(agent);

            // Copy context file to container workspace
            const dockerCopyCmd = `docker cp "${contextFile}" "${agent.containerId}:/app/workspace/task-instructions.json"`;
            execSync(dockerCopyCmd, { stdio: 'pipe' });
            console.log(`   📋 Context copied to container: ${agent.containerId}`);

            // Wait for agent to process context and create output
            const success = await this.waitForAgentOutput(agent, ['context-understood.txt', 'task-executed.txt']);

            // Analyze results
            const testResult = {
                testName,
                method: 'file-based',
                contextDelivery: true, // We copied the file successfully
                taskExecution: success,
                duration: Date.now() - testStartTime,
                details: {
                    contextFile: contextFile,
                    containerId: agent.containerId,
                    outputFiles: agent.outputFiles || []
                }
            };

            this.results.tests.push(testResult);
            this.results.contextMethods.fileBased = {
                tested: true,
                passed: success,
                details: testResult.details
            };

            console.log(`   ${success ? '✅' : '❌'} File-based context ${success ? 'passed' : 'failed'}`);

        } catch (error) {
            console.error(`   ❌ File-based context test failed: ${error.message}`);
            this.results.contextMethods.fileBased = {
                tested: true,
                passed: false,
                error: error.message
            };
        }
    }

    /**
     * Test 2: Environment variable context passing
     */
    async testEnvironmentVariableContext() {
        console.log('\n🌍 Test 2: Environment Variable Context');

        const testName = 'env-context';
        const testStartTime = Date.now();

        try {
            const contextData = {
                taskId: this.testUtils.generateTestId('env-context'),
                agentType: 'react-frontend-engineer',
                projectName: this.results.configuration.complexTaskContext.projectName,
                deliverables: [this.results.configuration.complexTaskContext.deliverables[0]],
                constraints: this.results.configuration.complexTaskContext.constraints.slice(0, 2),
                instructionMethod: 'environment-variables'
            };

            // Debug: ensure deliverables is an array
            if (!Array.isArray(contextData.deliverables)) {
                console.error('❌ Deliverables is not an array:', typeof contextData.deliverables, contextData.deliverables);
                contextData.deliverables = ['auth-service.ts']; // fallback
            }

            // Create workspace
            const workspaceDir = path.join(this.results.configuration.contextDir, 'env-workspace');
            await fs.mkdir(workspaceDir, { recursive: true });

            // Prepare environment variables
            const envVars = [
                `TASK_CONTEXT=${JSON.stringify(contextData)}`,
                `PROJECT_NAME=${contextData.projectName}`,
                `DELIVERABLES=${contextData.deliverables.join(',')}`,
                `INSTRUCTION_METHOD=${contextData.instructionMethod}`
            ];

            // Spawn agent with environment variables
            // Note: This would require modifying spawn-agent.sh to accept custom env vars
            // For now, we'll simulate by creating an env file
            const envFile = path.join(workspaceDir, '.env');
            await fs.writeFile(envFile, envVars.join('\n'));

            const spawnResult = await this.testUtils.spawnDockerAgents(
                contextData.taskId,
                [contextData.agentType],
                {
                    memoryLimit: this.results.configuration.agentMemoryLimit,
                    verbose: false
                }
            );

            if (spawnResult.successRate === 0) {
                throw new Error('Failed to spawn agent for environment context test');
            }

            const agent = {
                test: testName,
                agentType: contextData.agentType,
                taskId: contextData.taskId,
                containerId: spawnResult.taskAgents[0].containerId,
                agentId: spawnResult.taskAgents[0].agentId,
                workspaceDir,
                envFile,
                startTime: Date.now(),
                status: 'running'
            };

            this.results.agents.push(agent);

            // Copy env file to container
            const dockerEnvCmd = `docker cp "${envFile}" "${agent.containerId}:/app/workspace/.env"`;
            execSync(dockerEnvCmd, { stdio: 'pipe' });

            // Create instruction file telling agent to read environment
            const instructionFile = path.join(workspaceDir, 'read-env-instructions.txt');
            await fs.writeFile(instructionFile, `
CONTEXT INSTRUCTIONS:
Read environment variables from /app/workspace/.env
Extract task context and execute accordingly
Create output files: env-context-understood.txt, env-task-executed.txt
`);

            const dockerInstructionCmd = `docker cp "${instructionFile}" "${agent.containerId}:/app/workspace/instructions.txt"`;
            execSync(dockerInstructionCmd, { stdio: 'pipe' });

            const success = await this.waitForAgentOutput(agent, ['env-context-understood.txt', 'env-task-executed.txt']);

            const testResult = {
                testName,
                method: 'environment-variables',
                contextDelivery: true,
                taskExecution: success,
                duration: Date.now() - testStartTime,
                details: {
                    envFile,
                    containerId: agent.containerId,
                    outputFiles: agent.outputFiles || []
                }
            };

            this.results.tests.push(testResult);
            this.results.contextMethods.environment = {
                tested: true,
                passed: success,
                details: testResult.details
            };

            console.log(`   ${success ? '✅' : '❌'} Environment variable context ${success ? 'passed' : 'failed'}`);

        } catch (error) {
            console.error(`   ❌ Environment variable context test failed: ${error.message}`);
            this.results.contextMethods.environment = {
                tested: true,
                passed: false,
                error: error.message
            };
        }
    }

    /**
     * Test 3: Volume-mounted configuration files
     */
    async testVolumeMountContext() {
        console.log('\n📂 Test 3: Volume-mounted Configuration Files');

        const testName = 'volume-mount-context';
        const testStartTime = Date.now();

        try {
            const contextData = {
                taskId: this.testUtils.generateTestId('volume-context'),
                agentType: 'database-architect',
                projectName: this.results.configuration.complexTaskContext.projectName,
                deliverables: [this.results.configuration.complexTaskContext.deliverables[2]],
                constraints: this.results.configuration.complexTaskContext.constraints.slice(1, 3),
                instructionMethod: 'volume-mount'
            };

            // Debug: ensure deliverables is an array
            if (!Array.isArray(contextData.deliverables)) {
                console.error('❌ Volume mount deliverables is not an array:', typeof contextData.deliverables, contextData.deliverables);
                contextData.deliverables = ['tests/']; // fallback
            }

            // Create configuration directory
            const configDir = path.join(this.results.configuration.contextDir, 'config');
            await fs.mkdir(configDir, { recursive: true });

            // Create multiple config files
            const configFile = path.join(configDir, 'task-config.json');
            await fs.writeFile(configFile, JSON.stringify(contextData, null, 2));

            const constraintsFile = path.join(configDir, 'constraints.txt');
            await fs.writeFile(constraintsFile, contextData.constraints.join('\n'));

            const deliverablesFile = path.join(configDir, 'deliverables.txt');
            await fs.writeFile(deliverablesFile, contextData.deliverables.join('\n'));

            // Create workspace
            const workspaceDir = path.join(this.results.configuration.contextDir, 'volume-workspace');
            await fs.mkdir(workspaceDir, { recursive: true });

            const spawnResult = await this.testUtils.spawnDockerAgents(
                contextData.taskId,
                [contextData.agentType],
                {
                    memoryLimit: this.results.configuration.agentMemoryLimit,
                    verbose: false
                }
            );

            if (spawnResult.successRate === 0) {
                throw new Error('Failed to spawn agent for volume mount context test');
            }

            const agent = {
                test: testName,
                agentType: contextData.agentType,
                taskId: contextData.taskId,
                containerId: spawnResult.taskAgents[0].containerId,
                agentId: spawnResult.taskAgents[0].agentId,
                workspaceDir,
                configDir,
                startTime: Date.now(),
                status: 'running'
            };

            this.results.agents.push(agent);

            // Mount config directory in container (simulate by copying files)
            const dockerConfigCmd = `docker cp "${configDir}/." "${agent.containerId}:/app/workspace/config/"`;
            execSync(dockerConfigCmd, { stdio: 'pipe' });

            // Create instruction file
            const instructionFile = path.join(workspaceDir, 'read-config-instructions.txt');
            await fs.writeFile(instructionFile, `
CONTEXT INSTRUCTIONS:
Read configuration from /app/workspace/config/ directory:
- task-config.json: Main task context
- constraints.txt: Project constraints
- deliverables.txt: Expected deliverables

Create output files: config-context-understood.txt, config-task-executed.txt
`);

            const dockerInstructionCmd = `docker cp "${instructionFile}" "${agent.containerId}:/app/workspace/instructions.txt"`;
            execSync(dockerInstructionCmd, { stdio: 'pipe' });

            const success = await this.waitForAgentOutput(agent, ['config-context-understood.txt', 'config-task-executed.txt']);

            const testResult = {
                testName,
                method: 'volume-mount',
                contextDelivery: true,
                taskExecution: success,
                duration: Date.now() - testStartTime,
                details: {
                    configDir,
                    configFile,
                    containerId: agent.containerId,
                    outputFiles: agent.outputFiles || []
                }
            };

            this.results.tests.push(testResult);
            this.results.contextMethods.volumeMount = {
                tested: true,
                passed: success,
                details: testResult.details
            };

            console.log(`   ${success ? '✅' : '❌'} Volume mount context ${success ? 'passed' : 'failed'}`);

        } catch (error) {
            console.error(`   ❌ Volume mount context test failed: ${error.message}`);
            this.results.contextMethods.volumeMount = {
                tested: true,
                passed: false,
                error: error.message
            };
        }
    }

    /**
     * Test 4: Dynamic task assignment
     */
    async testDynamicTaskAssignment() {
        console.log('\n🔄 Test 4: Dynamic Task Assignment');

        const testName = 'dynamic-assignment';
        const testStartTime = Date.now();

        try {
            const contextData = {
                taskId: this.testUtils.generateTestId('dynamic-context'),
                agentType: 'security-specialist',
                projectName: this.results.configuration.complexTaskContext.projectName,
                deliverables: this.results.configuration.complexTaskContext.deliverables[3],
                constraints: this.results.configuration.complexTaskContext.constraints.slice(2),
                acceptanceCriteria: this.results.configuration.complexTaskContext.acceptanceCriteria.slice(2, 4),
                instructionMethod: 'dynamic-assignment',
                priority: 'high',
                dependencies: ['backend-developer', 'database-architect']
            };

            // Create workspace
            const workspaceDir = path.join(this.results.configuration.contextDir, 'dynamic-workspace');
            await fs.mkdir(workspaceDir, { recursive: true });

            // Create dynamic assignment file
            const assignmentFile = path.join(workspaceDir, 'dynamic-assignment.json');
            await fs.writeFile(assignmentFile, JSON.stringify({
                ...contextData,
                assignedAt: new Date().toISOString(),
                estimatedDuration: '15 minutes',
                reviewRequired: true
            }, null, 2));

            // Create status tracking file
            const statusFile = path.join(workspaceDir, 'assignment-status.json');
            await fs.writeFile(statusFile, JSON.stringify({
                taskId: contextData.taskId,
                status: 'assigned',
                agentType: contextData.agentType,
                assignedAt: new Date().toISOString()
            }, null, 2));

            const spawnResult = await this.testUtils.spawnDockerAgents(
                contextData.taskId,
                [contextData.agentType],
                {
                    memoryLimit: this.results.configuration.agentMemoryLimit,
                    verbose: false
                }
            );

            if (spawnResult.successRate === 0) {
                throw new Error('Failed to spawn agent for dynamic assignment test');
            }

            const agent = {
                test: testName,
                agentType: contextData.agentType,
                taskId: contextData.taskId,
                containerId: spawnResult.taskAgents[0].containerId,
                agentId: spawnResult.taskAgents[0].agentId,
                workspaceDir,
                assignmentFile,
                statusFile,
                startTime: Date.now(),
                status: 'running'
            };

            this.results.agents.push(agent);

            // Copy assignment files to container
            const dockerAssignmentCmd = `docker cp "${assignmentFile}" "${agent.containerId}:/app/workspace/dynamic-assignment.json"`;
            execSync(dockerAssignmentCmd, { stdio: 'pipe' });

            const dockerStatusCmd = `docker cp "${statusFile}" "${agent.containerId}:/app/workspace/assignment-status.json"`;
            execSync(dockerStatusCmd, { stdio: 'pipe' });

            // Create instruction file
            const instructionFile = path.join(workspaceDir, 'dynamic-instructions.txt');
            await fs.writeFile(instructionFile, `
DYNAMIC ASSIGNMENT INSTRUCTIONS:
You have been dynamically assigned a task via /app/workspace/dynamic-assignment.json

Requirements:
1. Read the assignment details
2. Update status in /app/workspace/assignment-status.json to 'in-progress'
3. Execute the security analysis task
4. Update status to 'completed'
5. Create outputs: dynamic-context-understood.txt, dynamic-task-executed.txt

Priority: ${contextData.priority}
Dependencies: ${contextData.dependencies.join(', ')}
`);

            const dockerInstructionCmd = `docker cp "${instructionFile}" "${agent.containerId}:/app/workspace/instructions.txt"`;
            execSync(dockerInstructionCmd, { stdio: 'pipe' });

            const success = await this.waitForAgentOutput(agent, ['dynamic-context-understood.txt', 'dynamic-task-executed.txt']);

            // Check if agent updated status file
            let statusUpdated = false;
            try {
                const updatedStatusContent = execSync(
                    `docker exec ${agent.containerId} cat /app/workspace/assignment-status.json`,
                    { encoding: 'utf8', stdio: 'pipe' }
                );
                const statusData = JSON.parse(updatedStatusContent);
                statusUpdated = statusData.status === 'completed' || statusData.status === 'in-progress';
            } catch {
                // Status file not updated
            }

            const testResult = {
                testName,
                method: 'dynamic-assignment',
                contextDelivery: true,
                taskExecution: success,
                statusTracking: statusUpdated,
                duration: Date.now() - testStartTime,
                details: {
                    assignmentFile,
                    statusFile,
                    containerId: agent.containerId,
                    outputFiles: agent.outputFiles || []
                }
            };

            this.results.tests.push(testResult);
            this.results.contextMethods.dynamicAssignment = {
                tested: true,
                passed: success && statusUpdated,
                details: testResult.details
            };

            console.log(`   ${success && statusUpdated ? '✅' : '❌'} Dynamic assignment ${success && statusUpdated ? 'passed' : 'failed'}`);
            if (!statusUpdated) {
                console.log(`   ⚠️ Status tracking not working`);
            }

        } catch (error) {
            console.error(`   ❌ Dynamic assignment test failed: ${error.message}`);
            this.results.contextMethods.dynamicAssignment = {
                tested: true,
                passed: false,
                error: error.message
            };
        }
    }

    /**
     * Wait for agent to create expected output files
     */
    async waitForAgentOutput(agent, expectedFiles, timeoutMs = 60000) {
        const startTime = Date.now();
        agent.outputFiles = [];

        while (Date.now() - startTime < timeoutMs) {
            const foundFiles = [];

            for (const expectedFile of expectedFiles) {
                try {
                    // Check if file exists in container
                    const fileContent = execSync(
                        `docker exec ${agent.containerId} cat /app/workspace/${expectedFile}`,
                        { encoding: 'utf8', stdio: 'pipe' }
                    );

                    foundFiles.push(expectedFile);

                    // Store file content for analysis
                    this.results.files.push({
                        fileName: expectedFile,
                        content: fileContent.substring(0, 200), // Truncate for storage
                        agentId: agent.agentId,
                        test: agent.test,
                        containerId: agent.containerId,
                        retrievedAt: new Date().toISOString()
                    });

                } catch {
                    // File doesn't exist yet
                }
            }

            agent.outputFiles = foundFiles;

            if (foundFiles.length === expectedFiles.length) {
                agent.status = 'completed';
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        agent.status = 'timeout';
        return false;
    }

    /**
     * Calculate test summary
     */
    calculateSummary() {
        const { tests, contextMethods, summary } = this.results;

        summary.totalTests = tests.length;
        summary.testsPassed = tests.filter(t => t.taskExecution).length;

        // Context delivery success (we delivered context in all tests)
        summary.contextDeliverySuccess = contextMethods.fileBased.tested &&
                                       contextMethods.environment.tested &&
                                       contextMethods.volumeMount.tested &&
                                       contextMethods.dynamicAssignment.tested;

        // Task execution success
        summary.taskExecutionSuccess = Object.values(contextMethods)
            .filter(method => method.tested)
            .filter(method => method.passed).length;

        // Overall passed if at least 3 of 4 methods work
        const workingMethods = Object.values(contextMethods)
            .filter(method => method.tested && method.passed).length;

        summary.overallPassed = workingMethods >= 3 && summary.totalTests >= 3;

        summary.methodResults = {
            fileBased: contextMethods.fileBased.passed,
            environment: contextMethods.environment.passed,
            volumeMount: contextMethods.volumeMount.passed,
            dynamicAssignment: contextMethods.dynamicAssignment.passed
        };
    }

    /**
     * Print test results
     */
    printResults() {
        const { tests, contextMethods, summary, agents, files } = this.results;

        console.log('\n' + '='.repeat(50));
        console.log('📬 CONTEXT PASSING TEST RESULTS');
        console.log('='.repeat(50));

        console.log(`\n📊 Test Summary:`);
        console.log(`   Total Tests: ${summary.totalTests}`);
        console.log(`   Tests Passed: ${summary.testsPassed}`);
        console.log(`   Context Delivery: ${summary.contextDeliverySuccess ? '✅' : '❌'}`);
        console.log(`   Task Execution Success: ${summary.taskExecutionSuccess}/${summary.totalTests}`);

        console.log(`\n🔧 Method Results:`);
        Object.entries(summary.methodResults).forEach(([method, passed]) => {
            const methodData = contextMethods[method];
            const status = passed ? '✅' : '❌';
            const duration = methodData.details?.duration || 0;
            console.log(`   ${status} ${method}: ${passed ? 'PASSED' : 'FAILED'} (${Math.round(duration/1000)}s)`);
        });

        console.log(`\n👥 Agent Performance:`);
        agents.forEach(agent => {
            const duration = agent.startTime ? Math.round((Date.now() - agent.startTime) / 1000) : 0;
            const status = agent.status === 'completed' ? '✅' :
                           agent.status === 'timeout' ? '⏰' : '❌';
            console.log(`   ${status} ${agent.agentType}: ${agent.outputFiles?.length || 0} files, ${duration}s`);
        });

        console.log(`\n📁 Files Created:`);
        files.forEach(file => {
            console.log(`   📄 ${file.fileName} (${file.test})`);
        });

        console.log(`\n🎯 Overall Result:`);
        console.log(`   Status: ${summary.overallPassed ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`   ${summary.overallPassed ? 'Context passing mechanisms working' : 'Some context methods failed'}`);

        console.log('\n' + '='.repeat(50));
    }

    /**
     * Cleanup test resources
     */
    async cleanup() {
        console.log('\n🧹 Cleaning up test resources...');

        // Clean up containers
        for (const agent of this.results.agents) {
            if (agent.containerId) {
                try {
                    execSync(`docker stop ${agent.containerId}`, { stdio: 'pipe' });
                    execSync(`docker rm ${agent.containerId}`, { stdio: 'pipe' });
                    console.log(`   🗑️ Cleaned container: ${agent.containerId}`);
                } catch (error) {
                    console.warn(`   ⚠️ Could not clean container ${agent.containerId}: ${error.message}`);
                }
            }
        }

        // Clean up workspace directories
        try {
            await fs.rm(this.results.configuration.contextDir, { recursive: true, force: true });
            console.log(`   🗑️ Cleaned workspace: ${this.results.configuration.contextDir}`);
        } catch (error) {
            console.warn(`   ⚠️ Could not clean workspace: ${error.message}`);
        }
    }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const test = new ContextPassingTest();
    test.run()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
}

export default ContextPassingTest;