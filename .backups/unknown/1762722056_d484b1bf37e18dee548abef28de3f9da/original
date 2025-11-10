#!/usr/bin/env node

/**
 * Container Cleanup Validator
 *
 * 专门验证容器清理机制的测试工具
 * 确保所有容器都能正确清理，不留下孤儿容器
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
     * 主要测试执行
     */
    async run() {
        console.log('🧹 Container Cleanup Validator');
        console.log('=' .repeat(50));

        try {
            // 步骤1: 记录测试前的状态
            await this.recordBeforeState();

            // 步骤2: 创建测试容器和workspace
            await this.createTestResources();

            // 步骤3: 模拟容器生命周期和清理
            await this.simulateContainerLifecycle();

            // 步骤4: 验证自动清理
            await this.validateAutomaticCleanup();

            // 步骤5: 手动清理剩余资源
            await this.manualCleanupRemaining();

            // 步骤6: 计算结果
            this.calculateResults();

            // 步骤7: 打印详细报告
            this.printDetailedReport();

            return this.results.summary.validationPassed;

        } catch (error) {
            console.error('❌ Cleanup validation failed:', error.message);
            await this.emergencyCleanup();
            return false;
        }
    }

    /**
     * 记录测试前的系统状态
     */
    async recordBeforeState() {
        console.log('\n📊 Recording pre-test state...');

        // 记录现有容器
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
            // 没有现有容器，这是正常的
        }

        // 记录现有workspace目录
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
            // 没有现有workspace，这是正常的
        }

        console.log(`   Pre-existing containers: ${this.results.containers.beforeTest.length}`);
        console.log(`   Pre-existing workspaces: ${this.results.workspaces.beforeTest.length}`);
    }

    /**
     * 创建测试资源
     */
    async createTestResources() {
        console.log('\n🏗️ Creating test resources...');

        const testContainers = [];
        const testWorkspaces = [];

        // 创建5个测试容器
        for (let i = 1; i <= 5; i++) {
            const containerName = `agent-test-cleanup-${Date.now()}-${i}`;
            const workspaceDir = `/tmp/agent-workspace-test-cleanup-${Date.now()}-${i}`;

            try {
                // 创建workspace目录 with proper permissions
                await fs.mkdir(workspaceDir, { recursive: true });
                // Set permissions to allow container to write
                execSync(`chmod 777 "${workspaceDir}"`, { stdio: 'pipe' });
                await fs.writeFile(
                    `${workspaceDir}/test-file.txt`,
                    `Test file for container ${i}\nCreated at: ${new Date().toISOString()}`
                );

                // 创建容器
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
                    expectedCleanupAt: Date.now() + 15000, // 15秒后期望清理
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
     * 模拟容器生命周期
     */
    async simulateContainerLifecycle() {
        console.log('\n⏳ Simulating container lifecycle...');

        // 等待容器完成执行
        console.log('   Waiting for containers to complete execution...');
        await new Promise(resolve => setTimeout(resolve, 15000)); // 等待15秒

        // 手动停止容器（模拟agent完成任务）
        console.log('   Stopping containers (simulating agent task completion)...');

        for (const container of this.results.containers.created) {
            try {
                // 检查容器是否还在运行
                const status = execSync(
                    `docker inspect --format '{{.State.Status}}' ${container.id}`,
                    { encoding: 'utf8', stdio: 'pipe' }
                ).trim();

                if (status === 'running') {
                    execSync(`docker stop ${container.id}`, { stdio: 'pipe' });
                    console.log(`   🛑 Stopped container: ${container.name}`);
                }

                // 模拟自动清理 - 在实际实现中，这应该由spawn-agent.sh完成
                setTimeout(() => {
                    try {
                        execSync(`docker rm ${container.id}`, { stdio: 'pipe' });
                        console.log(`   🗑️ Removed container: ${container.name}`);
                    } catch (error) {
                        // 容器可能已经被清理
                    }
                }, 2000); // 2秒延迟后清理

                container.expectedCleanup = true;
                this.results.containers.expectedCleanup.push(container);

            } catch (error) {
                console.warn(`   ⚠️ Error managing container ${container.name}: ${error.message}`);
            }
        }

        // 等待清理完成
        console.log('   Waiting for cleanup to complete...');
        await new Promise(resolve => setTimeout(resolve, 5000)); // 等待5秒
    }

    /**
     * 验证自动清理
     */
    async validateAutomaticCleanup() {
        console.log('\n🔍 Validating automatic cleanup...');

        let automaticContainerCleanup = 0;
        let automaticWorkspaceCleanup = 0;

        // 检查容器清理状态
        for (const container of this.results.containers.expectedCleanup) {
            try {
                // 检查容器是否还存在
                execSync(`docker inspect ${container.id}`, { stdio: 'pipe' });

                // 容器还存在 - 清理失败
                this.results.containers.orphaned.push(container);
                console.warn(`   ⚠️ Container not cleaned: ${container.name} (${container.id})`);

            } catch (error) {
                // 容器不存在 - 清理成功
                automaticContainerCleanup++;
                console.log(`   ✅ Container automatically cleaned: ${container.name}`);
            }
        }

        // 检查workspace清理状态
        for (const workspaceDir of this.results.workspaces.created) {
            try {
                await fs.access(workspaceDir);

                // workspace还存在 - 清理失败
                this.results.workspaces.orphaned.push({
                    path: workspaceDir,
                    existedBeforeTest: false
                });
                console.warn(`   ⚠️ Workspace not cleaned: ${workspaceDir}`);

            } catch (error) {
                // workspace不存在 - 清理成功
                automaticWorkspaceCleanup++;
                console.log(`   ✅ Workspace automatically cleaned: ${workspaceDir}`);
            }
        }

        this.results.summary.containersCleanedAutomatically = automaticContainerCleanup;
        this.results.summary.workspacesCleanedAutomatically = automaticWorkspaceCleanup;

        // 检查清理是否及时
        const maxCleanupDelay = 30000; // 30秒最大清理延迟
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
     * 手动清理剩余资源
     */
    async manualCleanupRemaining() {
        console.log('\n🧹 Manual cleanup of remaining resources...');

        let manualContainerCleanup = 0;
        let manualWorkspaceCleanup = 0;

        // 手动清理孤儿容器
        for (const container of this.results.containers.orphaned) {
            try {
                // 强制停止和删除
                execSync(`docker stop -f ${container.id}`, { stdio: 'pipe' });
                execSync(`docker rm -f ${container.id}`, { stdio: 'pipe' });

                this.results.containers.manuallyCleaned.push(container);
                manualContainerCleanup++;
                console.log(`   🔧 Manually cleaned container: ${container.name}`);

            } catch (error) {
                console.error(`   ❌ Failed to manually clean container ${container.name}: ${error.message}`);
            }
        }

        // 手动清理孤儿workspace
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
     * 计算验证结果
     */
    calculateResults() {
        const { validation, summary, containers, workspaces } = this.results;

        // 验证所有容器都被清理
        const totalContainersCreated = containers.created.length;
        const totalContainersCleaned = summary.containersCleanedAutomatically + summary.containersRequiringManualCleanup;
        validation.allContainersCleaned = totalContainersCleaned === totalContainersCreated;

        // 验证所有workspace都被清理
        const totalWorkspacesCreated = workspaces.created.length;
        const totalWorkspacesCleaned = summary.workspacesCleanedAutomatically + summary.workspacesRequiringManualCleanup;
        validation.allWorkspacesCleaned = totalWorkspacesCleaned === totalWorkspacesCreated;

        // 检查是否有资源泄漏
        validation.resourcesLeaking = containers.orphaned.length > 0 || workspaces.orphaned.length > 0;

        // 总体验证通过条件
        validation.validationPassed = validation.allContainersCleaned &&
                                   validation.allWorkspacesCleaned &&
                                   validation.cleanupTimely &&
                                   !validation.resourcesLeaking;

        // 更新总结
        summary.validationPassed = validation.validationPassed;

        // 计算清理效率
        summary.containerCleanupEfficiency = totalContainersCreated > 0 ?
            (summary.containersCleanedAutomatically / totalContainersCreated) * 100 : 0;

        summary.workspaceCleanupEfficiency = totalWorkspacesCreated > 0 ?
            (summary.workspacesCleanedAutomatically / totalWorkspacesCreated) * 100 : 0;
    }

    /**
     * 打印详细报告
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

        // 显示孤儿资源详情
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

        // 推荐修复措施
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
     * 紧急清理 - 测试失败时清理所有资源
     */
    async emergencyCleanup() {
        console.log('\n🚨 Emergency cleanup in progress...');

        try {
            // 清理所有agent-test容器
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
                        // 忽略清理错误
                    }
                }
            }

            // 清理所有测试workspace
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
                        // 忽略清理错误
                    }
                }
            }

            console.log('✅ Emergency cleanup completed');

        } catch (error) {
            console.error('❌ Emergency cleanup failed:', error.message);
        }
    }
}

// 运行测试
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