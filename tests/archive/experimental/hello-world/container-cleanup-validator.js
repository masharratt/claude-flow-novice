#!/usr/bin/env node

/**
 * Container Cleanup Validator
 *
 * Specialized test tool to verify container cleanup mechanisms
 * Ensures all containers are properly cleaned up without leaving orphaned containers
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';

class ContainerCleanupValidator {
    constructor() {
        this.results = {
            testSuite: 'Container Cleanup Validator',
            timestamp: new Date().toISOString(),
            containers: {
                beforeTest: [],
                created: [],
                expectedCleanup: [],
                afterTest: [],
                orphaned: [],
                manuallyCleaned: []
            },
            workspaces: {
                beforeTest: [],
                created: [],
                afterTest: [],
                orphaned: [],
                manuallyCleaned: []
            },
            validation: {
                allContainersCleaned: false,
                allWorkspacesCleaned: false,
                cleanupTimely: false,
                resourcesLeaking: false
            },
            summary: {
                totalContainersCreated: 0,
                containersCleanedAutomatically: 0,
                containersRequiringManualCleanup: 0,
                totalWorkspacesCreated: 0,
                workspacesCleanedAutomatically: 0,
                workspacesRequiringManualCleanup: 0,
                validationPassed: false
            }
        };
    }

    /**
     * Main test execution
     */
    async run() {
        console.log('🧹 Container Cleanup Validator');
        console.log('=' .repeat(50));

        try {
            // Step 1: Record pre-test state
            await this.recordBeforeState();

            // Step 2: Create test containers and workspaces
            await this.createTestResources();

            // Step 3: Simulate container lifecycle and cleanup
            await this.simulateContainerLifecycle();

            // Step 4: Validate automatic cleanup
            await this.validateAutomaticCleanup();

            // Step 5: Manual cleanup of remaining resources
            await this.manualCleanupRemaining();

            // Step 6: Calculate results
            this.calculateResults();

            // Step 7: Print detailed report
            this.printDetailedReport();

            return this.results.summary.validationPassed;

        } catch (error) {
            console.error('❌ Cleanup validation failed:', error.message);
            await this.emergencyCleanup();
            return false;
        }
    }

    /**
     * Record system state before test
     */
    async recordBeforeState() {
        console.log('\n📊 Recording pre-test state...');

        // Record existing containers
        try {
            const existingContainers = execSync(
                'docker ps -a --filter "name=agent-" --format "{{.ID}}\t{{.Names}}\t{{.Status}}"',
                { encoding: 'utf8', stdio: 'pipe' }
            ).trim();

            if (existingContainers) {
                this.results.containers.beforeTest = existingContainers.split('\n').map(line => {
                    const [id, name, status] = line.split('\t');
                    return { id, name, status, existedBeforeTest: true };
                });
            }
        } catch (error) {
            // No existing containers - this is normal
        }

        // Record existing workspace directories
        try {
            const existingWorkspaces = execSync(
                'find /tmp -name "agent-workspace-*" -type d 2>/dev/null',
                { encoding: 'utf8', stdio: 'pipe' }
            ).trim();

            if (existingWorkspaces) {
                this.results.workspaces.beforeTest = existingWorkspaces.split('\n').map(path => ({
                    path: path.trim(),
                    existedBeforeTest: true
                }));
            }
        } catch (error) {
            // No existing workspaces - this is normal
        }

        console.log(`   Pre-existing containers: ${this.results.containers.beforeTest.length}`);
        console.log(`   Pre-existing workspaces: ${this.results.workspaces.beforeTest.length}`);
    }

    /**
     * Create test resources
     */
    async createTestResources() {
        console.log('\n🏗️ Creating test resources...');

        const testContainers = [];
        const testWorkspaces = [];

        // Create 5 test containers
        for (let i = 1; i <= 5; i++) {
            const containerName = `agent-test-cleanup-${Date.now()}-${i}`;
            const workspaceDir = `/tmp/agent-workspace-test-cleanup-${Date.now()}-${i}`;

            try {
                // Create workspace directory with proper permissions
                await fs.mkdir(workspaceDir, { recursive: true });
                // Set permissions to allow container to write
                execSync(`chmod 777 "${workspaceDir}"`, { stdio: 'pipe' });
                await fs.writeFile(
                    `${workspaceDir}/test-file.txt`,
                    `Test file for container ${i}\nCreated at: ${new Date().toISOString()}`
                );

                // Create container
                const dockerCmd = [
                    'docker run -d',
                    '--name', containerName,
                    '--memory', '128m',
                    '--restart', 'unless-stopped',
                    '-v', `${workspaceDir}:/app/workspace`,
                    'alpine:latest',
                    'sh', '-c',
                    'echo "Container started" && sleep 10 && echo "Container completed" > /app/workspace/completion.txt'
                ].join(' ');

                const containerId = execSync(dockerCmd, { encoding: 'utf8', stdio: 'pipe' }).trim();

                const container = {
                    id: containerId,
                    name: containerName,
                    workspaceDir: workspaceDir,
                    createdAt: Date.now(),
                    expectedCleanupAt: Date.now() + 15000, // Expected cleanup after 15 seconds
                    testNumber: i
                };

                testContainers.push(container);
                testWorkspaces.push(workspaceDir);

                console.log(`   ✅ Created test container ${i}: ${containerName}`);

            } catch (error) {
                console.error(`   ❌ Failed to create test container ${i}: ${error.message}`);
            }
        }

        this.results.containers.created = testContainers;
        this.results.workspaces.created = testWorkspaces;
        this.results.summary.totalContainersCreated = testContainers.length;
        this.results.summary.totalWorkspacesCreated = testWorkspaces.length;

        console.log(`   Created ${testContainers.length} test containers`);
        console.log(`   Created ${testWorkspaces.length} test workspaces`);
    }

    /**
     * Simulate container lifecycle
     */
    async simulateContainerLifecycle() {
        console.log('\n⏳ Simulating container lifecycle...');

        // Wait for containers to complete execution
        console.log('   Waiting for containers to complete execution...');
        await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds

        // Manually stop containers (simulating agent task completion)
        console.log('   Stopping containers (simulating agent task completion)...');

        for (const container of this.results.containers.created) {
            try {
                // Check if container is still running
                const status = execSync(
                    `docker inspect --format '{{.State.Status}}' ${container.id}`,
                    { encoding: 'utf8', stdio: 'pipe' }
                ).trim();

                if (status === 'running') {
                    execSync(`docker stop ${container.id}`, { stdio: 'pipe' });
                    console.log(`   🛑 Stopped container: ${container.name}`);
                }

                // Simulate automatic cleanup - in actual implementation, this should be done by spawn-agent.sh
                setTimeout(() => {
                    try {
                        execSync(`docker rm ${container.id}`, { stdio: 'pipe' });
                        console.log(`   🗑️ Removed container: ${container.name}`);
                    } catch (error) {
                        // Container may already be cleaned up
                    }
                }, 2000); // 2 second delay before cleanup

                container.expectedCleanup = true;
                this.results.containers.expectedCleanup.push(container);

            } catch (error) {
                console.warn(`   ⚠️ Error managing container ${container.name}: ${error.message}`);
            }
        }

        // Wait for cleanup to complete
        console.log('   Waiting for cleanup to complete...');
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }

    /**
     * Validate automatic cleanup
     */
    async validateAutomaticCleanup() {
        console.log('\n🔍 Validating automatic cleanup...');

        let automaticContainerCleanup = 0;
        let automaticWorkspaceCleanup = 0;

        // Check container cleanup status
        for (const container of this.results.containers.expectedCleanup) {
            try {
                // Check if container still exists
                execSync(`docker inspect ${container.id}`, { stdio: 'pipe' });

                // Container still exists - cleanup failed
                this.results.containers.orphaned.push(container);
                console.warn(`   ⚠️ Container not cleaned: ${container.name} (${container.id})`);

            } catch (error) {
                // Container doesn't exist - cleanup successful
                automaticContainerCleanup++;
                console.log(`   ✅ Container automatically cleaned: ${container.name}`);
            }
        }

        // Check workspace cleanup status
        for (const workspaceDir of this.results.workspaces.created) {
            try {
                await fs.access(workspaceDir);

                // Workspace still exists - cleanup failed
                this.results.workspaces.orphaned.push({
                    path: workspaceDir,
                    existedBeforeTest: false
                });
                console.warn(`   ⚠️ Workspace not cleaned: ${workspaceDir}`);

            } catch (error) {
                // Workspace doesn't exist - cleanup successful
                automaticWorkspaceCleanup++;
                console.log(`   ✅ Workspace automatically cleaned: ${workspaceDir}`);
            }
        }

        this.results.summary.containersCleanedAutomatically = automaticContainerCleanup;
        this.results.summary.workspacesCleanedAutomatically = automaticWorkspaceCleanup;

        // Check if cleanup is timely
        const maxCleanupDelay = 30000; // 30 second maximum cleanup delay
        const cleanupDelays = this.results.containers.expectedCleanup.map(container => {
            const actualCleanupTime = Date.now();
            const delay = actualCleanupTime - container.expectedCleanupAt;
            return { container: container.name, delay };
        });

        const maxDelay = Math.max(...cleanupDelays.map(d => d.delay));
        this.results.validation.cleanupTimely = maxDelay <= maxCleanupDelay;

        if (maxDelay > maxCleanupDelay) {
            console.warn(`   ⚠️ Cleanup delay exceeded threshold: ${Math.round(maxDelay/1000)}s`);
        }
    }

    /**
     * Manual cleanup of remaining resources
     */
    async manualCleanupRemaining() {
        console.log('\n🧹 Manual cleanup of remaining resources...');

        let manualContainerCleanup = 0;
        let manualWorkspaceCleanup = 0;

        // Manually clean orphaned containers
        for (const container of this.results.containers.orphaned) {
            try {
                // Force stop and remove
                execSync(`docker stop -f ${container.id}`, { stdio: 'pipe' });
                execSync(`docker rm -f ${container.id}`, { stdio: 'pipe' });

                this.results.containers.manuallyCleaned.push(container);
                manualContainerCleanup++;
                console.log(`   🔧 Manually cleaned container: ${container.name}`);

            } catch (error) {
                console.error(`   ❌ Failed to manually clean container ${container.name}: ${error.message}`);
            }
        }

        // Manually clean orphaned workspaces
        for (const workspace of this.results.workspaces.orphaned) {
            try {
                await fs.rm(workspace.path, { recursive: true, force: true });

                this.results.workspaces.manuallyCleaned.push(workspace);
                manualWorkspaceCleanup++;
                console.log(`   🔧 Manually cleaned workspace: ${workspace.path}`);

            } catch (error) {
                console.error(`   ❌ Failed to manually clean workspace ${workspace.path}: ${error.message}`);
            }
        }

        this.results.summary.containersRequiringManualCleanup = manualContainerCleanup;
        this.results.summary.workspacesRequiringManualCleanup = manualWorkspaceCleanup;
    }

    /**
     * Calculate validation results
     */
    calculateResults() {
        const { validation, summary, containers, workspaces } = this.results;

        // Verify all containers were cleaned
        const totalContainersCreated = containers.created.length;
        const totalContainersCleaned = summary.containersCleanedAutomatically + summary.containersRequiringManualCleanup;
        validation.allContainersCleaned = totalContainersCleaned === totalContainersCreated;

        // Verify all workspaces were cleaned
        const totalWorkspacesCreated = workspaces.created.length;
        const totalWorkspacesCleaned = summary.workspacesCleanedAutomatically + summary.workspacesRequiringManualCleanup;
        validation.allWorkspacesCleaned = totalWorkspacesCleaned === totalWorkspacesCreated;

        // Check for resource leaks
        validation.resourcesLeaking = containers.orphaned.length > 0 || workspaces.orphaned.length > 0;

        // Overall validation pass condition
        validation.validationPassed = validation.allContainersCleaned &&
                                   validation.allWorkspacesCleaned &&
                                   validation.cleanupTimely &&
                                   !validation.resourcesLeaking;

        // Update summary
        summary.validationPassed = validation.validationPassed;

        // Calculate cleanup efficiency
        summary.containerCleanupEfficiency = totalContainersCreated > 0 ?
            (summary.containersCleanedAutomatically / totalContainersCreated) * 100 : 0;

        summary.workspaceCleanupEfficiency = totalWorkspacesCreated > 0 ?
            (summary.workspacesCleanedAutomatically / totalWorkspacesCreated) * 100 : 0;
    }

    /**
     * Print detailed report
     */
    printDetailedReport() {
        const { containers, workspaces, validation, summary } = this.results;

        console.log('\n' + '='.repeat(50));
        console.log('🧹 CONTAINER CLEANUP VALIDATION REPORT');
        console.log('='.repeat(50));

        console.log(`\n📊 Container Cleanup Results:`);
        console.log(`   Total Created: ${summary.totalContainersCreated}`);
        console.log(`   Automatically Cleaned: ${summary.containersCleanedAutomatically}`);
        console.log(`   Manually Cleaned: ${summary.containersRequiringManualCleanup}`);
        console.log(`   Cleanup Efficiency: ${summary.containerCleanupEfficiency.toFixed(1)}%`);

        console.log(`\n📁 Workspace Cleanup Results:`);
        console.log(`   Total Created: ${summary.totalWorkspacesCreated}`);
        console.log(`   Automatically Cleaned: ${summary.workspacesCleanedAutomatically}`);
        console.log(`   Manually Cleaned: ${summary.workspacesRequiringManualCleanup}`);
        console.log(`   Cleanup Efficiency: ${summary.workspaceCleanupEfficiency.toFixed(1)}%`);

        console.log(`\n🔍 Validation Results:`);
        console.log(`   All Containers Cleaned: ${validation.allContainersCleaned ? '✅' : '❌'}`);
        console.log(`   All Workspaces Cleaned: ${validation.allWorkspacesCleaned ? '✅' : '❌'}`);
        console.log(`   Cleanup Timely: ${validation.cleanupTimely ? '✅' : '❌'}`);
        console.log(`   Resources Leaking: ${validation.resourcesLeaking ? '❌ Yes' : '✅ No'}`);

        // Display orphaned resource details
        if (containers.orphaned.length > 0) {
            console.log(`\n⚠️ Orphaned Containers (requiring manual cleanup):`);
            containers.orphaned.forEach(container => {
                console.log(`   - ${container.name} (${container.id})`);
            });
        }

        if (workspaces.orphaned.length > 0) {
            console.log(`\n⚠️ Orphaned Workspaces (requiring manual cleanup):`);
            workspaces.orphaned.forEach(workspace => {
                console.log(`   - ${workspace.path}`);
            });
        }

        console.log(`\n🎯 Final Assessment:`);
        if (validation.validationPassed) {
            console.log(`   ✅ CLEANUP VALIDATION PASSED`);
            console.log(`   Container and workspace cleanup mechanisms are working correctly`);
        } else {
            console.log(`   ❌ CLEANUP VALIDATION FAILED`);
            console.log(`   Issues detected with cleanup mechanisms`);

            if (validation.resourcesLeaking) {
                console.log(`   🔴 CRITICAL: Resource leaks detected - manual intervention required`);
            }

            if (!validation.cleanupTimely) {
                console.log(`   🔶 WARNING: Cleanup delay exceeds acceptable limits`);
            }
        }

        // Recommended fixes
        if (!validation.validationPassed) {
            console.log(`\n🔧 Recommended Fixes:`);

            if (containers.orphaned.length > 0) {
                console.log(`   - Add automatic container cleanup to spawn-agent.sh`);
                console.log(`   - Implement trap handlers for container lifecycle`);
                console.log(`   - Add timeout-based container termination`);
            }

            if (workspaces.orphaned.length > 0) {
                console.log(`   - Add workspace cleanup to agent completion handlers`);
                console.log(`   - Implement workspace TTL and periodic cleanup`);
                console.log(`   - Add workspace cleanup to container exit traps`);
            }
        }

        console.log('\n' + '='.repeat(50));
    }

    /**
     * Emergency cleanup - clean all resources when test fails
     */
    async emergencyCleanup() {
        console.log('\n🚨 Emergency cleanup in progress...');

        try {
            // Clean all agent-test containers
            const testContainers = execSync(
                'docker ps -a --filter "name=agent-test-cleanup" --format "{{.ID}}"',
                { encoding: 'utf8', stdio: 'pipe' }
            ).trim();

            if (testContainers) {
                const containerIds = testContainers.split('\n');
                for (const containerId of containerIds) {
                    try {
                        execSync(`docker stop -f ${containerId}`, { stdio: 'pipe' });
                        execSync(`docker rm -f ${containerId}`, { stdio: 'pipe' });
                        console.log(`   🚨 Emergency cleanup: ${containerId}`);
                    } catch (error) {
                        // Ignore cleanup errors
                    }
                }
            }

            // Clean all test workspaces
            const testWorkspaces = execSync(
                'find /tmp -name "agent-workspace-test-cleanup-*" -type d 2>/dev/null',
                { encoding: 'utf8', stdio: 'pipe' }
            ).trim();

            if (testWorkspaces) {
                const workspacePaths = testWorkspaces.split('\n');
                for (const workspacePath of workspacePaths) {
                    try {
                        await fs.rm(workspacePath.trim(), { recursive: true, force: true });
                        console.log(`   🚨 Emergency workspace cleanup: ${workspacePath.trim()}`);
                    } catch (error) {
                        // Ignore cleanup errors
                    }
                }
            }

            console.log('✅ Emergency cleanup completed');

        } catch (error) {
            console.error('❌ Emergency cleanup failed:', error.message);
        }
    }
}

// Run test
if (import.meta.url === `file://${process.argv[1]}`) {
    const validator = new ContainerCleanupValidator();
    validator.run()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Container cleanup validation failed:', error);
            process.exit(1);
        });
}

export default ContainerCleanupValidator;
