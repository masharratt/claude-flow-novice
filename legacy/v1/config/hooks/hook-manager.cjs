#!/usr/bin/env node

/**
 * Hook Configuration and Management System
 * Central management for all Claude Code hooks with configuration, enabling/disabling, and coordination
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

class HookManager {
    constructor() {
        this.hooksDir = path.join(process.cwd(), 'config', 'hooks');
        this.configFile = path.join(this.hooksDir, 'hook-config.json');
        this.config = this.loadConfig();
        this.availableHooks = this.discoverHooks();
    }

    loadConfig() {
        const defaultConfig = {
            globalSettings: {
                enabled: true,
                concurrent: true,
                timeout: 30000,
                logLevel: 'info',
                preserveExistingHooks: true
            },
            hooks: {
                'pre-edit-security': {
                    enabled: true,
                    priority: 1,
                    trigger: 'pre-edit',
                    timeout: 5000,
                    blockOnFailure: true,
                    description: 'Prevents edits to .env files and validates security'
                },
                'post-edit-pipeline': {
                    enabled: true,
                    priority: 2,
                    trigger: 'post-edit',
                    timeout: 30000,
                    blockOnFailure: false,
                    description: 'Comprehensive validation pipeline with formatting'
                },
                'smart-dependency-analyzer': {
                    enabled: true,
                    priority: 3,
                    trigger: 'post-edit',
                    timeout: 15000,
                    blockOnFailure: false,
                    description: 'Dependency analysis with progressive validation'
                },
                'fast-file-testing': {
                    enabled: true,
                    priority: 4,
                    trigger: 'post-edit',
                    timeout: 5000,
                    blockOnFailure: false,
                    description: 'Rapid file-specific testing for immediate feedback'
                },
                'documentation-auto-update': {
                    enabled: true,
                    priority: 5,
                    trigger: 'post-edit',
                    timeout: 10000,
                    blockOnFailure: false,
                    description: 'Automatic documentation updates'
                },
                'post-edit-agent-template': {
                    enabled: true,
                    priority: 6,
                    trigger: 'post-edit',
                    timeout: 5000,
                    blockOnFailure: false,
                    filePattern: '.claude/agents/**/*.md',
                    description: 'Validates agent templates for SQLite lifecycle, ACL, error handling (95% automation)',
                    automation: '95%',
                    validator: 'agent-template-validator'
                },
                'post-edit-cfn-loop-memory': {
                    enabled: true,
                    priority: 7,
                    trigger: 'post-edit',
                    timeout: 3000,
                    blockOnFailure: false,
                    filePattern: '**/*.{ts,js,cjs,mjs}',
                    description: 'Validates CFN Loop memory ACL levels and retention policies (90% automation)',
                    automation: '90%',
                    validator: 'cfn-loop-memory-validator'
                },
                'post-test-coverage': {
                    enabled: true,
                    priority: 8,
                    trigger: 'post-test',
                    timeout: 5000,
                    blockOnFailure: false,
                    filePattern: '**/*.{ts,js,py,go,rs}',
                    description: 'Validates test coverage thresholds (≥80% line, ≥75% branch) (100% automation)',
                    automation: '100%',
                    validator: 'test-coverage-validator',
                    thresholds: { line: 80, branch: 75, function: 80, statement: 80 }
                },
                'post-edit-blocking-coordination': {
                    enabled: true,
                    priority: 9,
                    trigger: 'post-edit',
                    timeout: 5000,
                    blockOnFailure: false,
                    filePattern: '**/*coordinator*.{ts,js}',
                    description: 'Validates blocking coordination patterns for coordinator agents (60% automation + agent review)',
                    automation: '60%',
                    validator: 'blocking-coordination-validator',
                    requiresAgentReview: true,
                    agentType: 'coordinator'
                }
            },
            languageSettings: {
                javascript: {
                    'fast-file-testing': { timeout: 3000 },
                    'post-edit-pipeline': { enabled: true }
                },
                typescript: {
                    'fast-file-testing': { timeout: 4000 },
                    'post-edit-pipeline': { enabled: true }
                },
                rust: {
                    'fast-file-testing': { timeout: 5000 },
                    'post-edit-pipeline': { enabled: true }
                },
                python: {
                    'fast-file-testing': { timeout: 3000 },
                    'post-edit-pipeline': { enabled: true }
                }
            },
            communication: {
                sqlite: {
                    enabled: true,
                    dbPath: './database/instances/hooks/communication.db',
                    useMemory: false,
                    retentionDays: 7
                },
                agentCoordination: {
                    enabled: true,
                    namespace: 'hooks',
                    broadcastResults: true,
                    shareMemory: true
                }
            }
        };

        try {
            if (fs.existsSync(this.configFile)) {
                const userConfig = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
                return this.mergeConfig(defaultConfig, userConfig);
            }
        } catch (error) {
            console.warn(`Failed to load hook config: ${error.message}`);
        }

        return defaultConfig;
    }

    mergeConfig(defaultConfig, userConfig) {
        // Deep merge configurations, preserving user preferences
        return {
            ...defaultConfig,
            ...userConfig,
            globalSettings: { ...defaultConfig.globalSettings, ...userConfig.globalSettings },
            hooks: { ...defaultConfig.hooks, ...userConfig.hooks },
            languageSettings: { ...defaultConfig.languageSettings, ...userConfig.languageSettings },
            communication: { ...defaultConfig.communication, ...userConfig.communication }
        };
    }

    discoverHooks() {
        const hooks = {};

        try {
            const files = fs.readdirSync(this.hooksDir);

            for (const file of files) {
                if (file.endsWith('.js') && file !== 'hook-manager.js' && file !== 'pipeline-config.json') {
                    const hookName = file.replace('.js', '');
                    const hookPath = path.join(this.hooksDir, file);

                    hooks[hookName] = {
                        name: hookName,
                        path: hookPath,
                        executable: fs.existsSync(hookPath)
                    };
                }
            }
        } catch (error) {
            console.warn(`Failed to discover hooks: ${error.message}`);
        }

        return hooks;
    }

    async executeHook(hookName, triggerType, filePath, ...args) {
        if (!this.config.globalSettings.enabled) {
            return { success: true, skipped: true, reason: 'Hooks globally disabled' };
        }

        const hookConfig = this.config.hooks[hookName];
        if (!hookConfig || !hookConfig.enabled) {
            return { success: true, skipped: true, reason: 'Hook disabled' };
        }

        if (hookConfig.trigger !== triggerType) {
            return { success: true, skipped: true, reason: 'Trigger type mismatch' };
        }

        const hook = this.availableHooks[hookName];
        if (!hook || !hook.executable) {
            return { success: false, error: 'Hook not found or not executable' };
        }

        console.log(`🪝 Executing hook: ${hookName} (${triggerType})`);

        const startTime = Date.now();
        const timeout = hookConfig.timeout || this.config.globalSettings.timeout;

        try {
            const result = await this.runHookProcess(hook.path, [filePath, ...args], timeout);

            const execution = {
                hookName,
                triggerType,
                filePath,
                success: result.exitCode === 0,
                exitCode: result.exitCode,
                output: result.stdout,
                error: result.stderr,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            };

            // Log execution to communication system
            await this.logHookExecution(execution);

            // Check if failure should block further processing
            if (!execution.success && hookConfig.blockOnFailure) {
                console.error(`❌ Hook ${hookName} failed and blocks further processing`);
                return { success: false, blockingFailure: true, execution };
            }

            return { success: true, execution };

        } catch (error) {
            const execution = {
                hookName,
                triggerType,
                filePath,
                success: false,
                error: error.message,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            };

            await this.logHookExecution(execution);

            if (hookConfig.blockOnFailure) {
                return { success: false, blockingFailure: true, execution };
            }

            return { success: false, execution };
        }
    }

    async runHookProcess(hookPath, args, timeout) {
        return new Promise((resolve) => {
            const proc = spawn('node', [hookPath, ...args], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';
            let completed = false;

            const complete = (exitCode) => {
                if (completed) return;
                completed = true;
                resolve({ exitCode, stdout, stderr });
            };

            proc.stdout.on('data', (data) => stdout += data.toString());
            proc.stderr.on('data', (data) => stderr += data.toString());

            proc.on('close', (code) => complete(code || 0));
            proc.on('error', (error) => {
                stderr += error.message;
                complete(1);
            });

            // Timeout handling
            setTimeout(() => {
                if (!completed) {
                    proc.kill('SIGTERM');
                    stderr += `\nHook timeout after ${timeout}ms`;
                    complete(1);
                }
            }, timeout);
        });
    }

    async executeHookSequence(triggerType, filePath, changeType = 'edit') {
        if (!this.config.globalSettings.enabled) {
            return { success: true, message: 'Hooks globally disabled' };
        }

        console.log(`\n🚀 EXECUTING HOOK SEQUENCE: ${triggerType} for ${path.basename(filePath)}`);

        const results = {
            triggerType,
            filePath,
            changeType,
            timestamp: new Date().toISOString(),
            executions: [],
            summary: {
                total: 0,
                successful: 0,
                failed: 0,
                skipped: 0,
                blocked: false
            }
        };

        // Get applicable hooks for this trigger, sorted by priority
        const applicableHooks = Object.entries(this.config.hooks)
            .filter(([name, config]) => config.trigger === triggerType && config.enabled)
            .sort(([, a], [, b]) => a.priority - b.priority);

        results.summary.total = applicableHooks.length;

        // Apply language-specific settings
        const language = this.detectLanguage(filePath);
        const langSettings = this.config.languageSettings[language] || {};

        for (const [hookName, hookConfig] of applicableHooks) {
            // Apply language-specific overrides
            const finalConfig = { ...hookConfig, ...langSettings[hookName] };

            if (!finalConfig.enabled) {
                results.summary.skipped++;
                continue;
            }

            const hookResult = await this.executeHook(hookName, triggerType, filePath, changeType);
            results.executions.push(hookResult);

            if (hookResult.success) {
                if (hookResult.skipped) {
                    results.summary.skipped++;
                } else {
                    results.summary.successful++;
                }
            } else {
                results.summary.failed++;

                if (hookResult.blockingFailure) {
                    results.summary.blocked = true;
                    console.error(`🛑 Hook sequence stopped due to blocking failure in ${hookName}`);
                    break;
                }
            }
        }

        this.printSequenceReport(results);
        return results;
    }

    detectLanguage(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const langMap = {
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.py': 'python',
            '.rs': 'rust'
        };
        return langMap[ext] || 'unknown';
    }

    async logHookExecution(execution) {
        if (!this.config.communication.sqlite.enabled) return;

        try {
            // Log to SQLite for agent communication
            const logData = {
                timestamp: execution.timestamp,
                hook_name: execution.hookName,
                trigger_type: execution.triggerType,
                file_path: execution.filePath,
                success: execution.success,
                duration_ms: execution.duration,
                output: execution.output?.slice(0, 1000), // Truncate for storage
                error: execution.error?.slice(0, 1000)
            };

            // Store in agent communication memory
            await this.storeInAgentMemory('hook_execution', logData);

        } catch (error) {
            console.warn(`Failed to log hook execution: ${error.message}`);
        }
    }

    async storeInAgentMemory(key, data) {
        // This would integrate with the agent communication system
        // For now, just log to console in development
        if (this.config.communication.agentCoordination.enabled) {
            console.log(`📊 Agent Memory: ${key} = ${JSON.stringify(data).slice(0, 100)}...`);
        }
    }

    printSequenceReport(results) {
        console.log('\n' + '='.repeat(60));
        console.log('🪝 HOOK SEQUENCE EXECUTION REPORT');
        console.log('='.repeat(60));

        console.log(`📄 File: ${path.basename(results.filePath)}`);
        console.log(`🔄 Trigger: ${results.triggerType}`);
        console.log(`⏰ Timestamp: ${results.timestamp}`);

        console.log('\n📊 SUMMARY:');
        console.log(`  ✅ Successful: ${results.summary.successful}`);
        console.log(`  ❌ Failed: ${results.summary.failed}`);
        console.log(`  ⏩ Skipped: ${results.summary.skipped}`);
        console.log(`  🛑 Blocked: ${results.summary.blocked ? 'Yes' : 'No'}`);

        if (results.executions.length > 0) {
            console.log('\n🔍 EXECUTION DETAILS:');
            results.executions.forEach(result => {
                if (result.skipped) {
                    console.log(`  ⏩ ${result.execution?.hookName || 'Unknown'}: ${result.reason}`);
                } else if (result.success) {
                    console.log(`  ✅ ${result.execution.hookName}: Success (${result.execution.duration}ms)`);
                } else {
                    console.log(`  ❌ ${result.execution.hookName}: Failed (${result.execution.duration}ms)`);
                    if (result.execution.error) {
                        console.log(`     Error: ${result.execution.error.slice(0, 100)}...`);
                    }
                }
            });
        }

        console.log('='.repeat(60));
    }

    // Management commands
    async enableHook(hookName) {
        if (this.config.hooks[hookName]) {
            this.config.hooks[hookName].enabled = true;
            await this.saveConfig();
            console.log(`✅ Enabled hook: ${hookName}`);
        } else {
            console.error(`❌ Hook not found: ${hookName}`);
        }
    }

    async disableHook(hookName) {
        if (this.config.hooks[hookName]) {
            this.config.hooks[hookName].enabled = false;
            await this.saveConfig();
            console.log(`⏸️  Disabled hook: ${hookName}`);
        } else {
            console.error(`❌ Hook not found: ${hookName}`);
        }
    }

    async listHooks() {
        console.log('\n🪝 AVAILABLE HOOKS:');
        console.log('='.repeat(50));

        Object.entries(this.config.hooks).forEach(([name, config]) => {
            const status = config.enabled ? '✅' : '❌';
            const priority = config.priority;
            const trigger = config.trigger;

            console.log(`${status} ${name} (Priority: ${priority}, Trigger: ${trigger})`);
            console.log(`   ${config.description}`);
            console.log('');
        });
    }

    async saveConfig() {
        try {
            fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
            console.log(`💾 Configuration saved to ${this.configFile}`);
        } catch (error) {
            console.error(`❌ Failed to save configuration: ${error.message}`);
        }
    }

    async getStatus() {
        const totalHooks = Object.keys(this.config.hooks).length;
        const enabledHooks = Object.values(this.config.hooks).filter(h => h.enabled).length;

        return {
            globalEnabled: this.config.globalSettings.enabled,
            totalHooks,
            enabledHooks,
            disabledHooks: totalHooks - enabledHooks,
            availableHooks: Object.keys(this.availableHooks).length
        };
    }
}

// CLI Commands
async function main() {
    const command = process.argv[2];
    const manager = new HookManager();

    switch (command) {
        case 'execute':
            const triggerType = process.argv[3];
            const filePath = process.argv[4];
            const changeType = process.argv[5] || 'edit';

            if (!triggerType || !filePath) {
                console.error('Usage: hook-manager.js execute <trigger-type> <file-path> [change-type]');
                process.exit(1);
            }

            const results = await manager.executeHookSequence(triggerType, filePath, changeType);
            process.exit(results.summary.blocked ? 1 : 0);
            break;

        case 'enable':
            const hookToEnable = process.argv[3];
            if (!hookToEnable) {
                console.error('Usage: hook-manager.js enable <hook-name>');
                process.exit(1);
            }
            await manager.enableHook(hookToEnable);
            break;

        case 'disable':
            const hookToDisable = process.argv[3];
            if (!hookToDisable) {
                console.error('Usage: hook-manager.js disable <hook-name>');
                process.exit(1);
            }
            await manager.disableHook(hookToDisable);
            break;

        case 'list':
            await manager.listHooks();
            break;

        case 'status':
            const status = await manager.getStatus();
            console.log('\n📊 HOOK SYSTEM STATUS:');
            console.log(`Global Enabled: ${status.globalEnabled ? '✅' : '❌'}`);
            console.log(`Total Hooks: ${status.totalHooks}`);
            console.log(`Enabled: ${status.enabledHooks}`);
            console.log(`Disabled: ${status.disabledHooks}`);
            console.log(`Available Files: ${status.availableHooks}`);
            break;

        case 'config':
            const configCommand = process.argv[3];
            if (configCommand === 'reset') {
                manager.config = manager.loadConfig();
                await manager.saveConfig();
                console.log('🔄 Configuration reset to defaults');
            } else {
                console.log('Configuration path:', manager.configFile);
                console.log('Edit this file to customize hook settings');
            }
            break;

        default:
            console.log('Hook Manager - Central management for Claude Code hooks');
            console.log('');
            console.log('Commands:');
            console.log('  execute <trigger> <file> [type]  - Execute hook sequence');
            console.log('  enable <hook-name>               - Enable a specific hook');
            console.log('  disable <hook-name>              - Disable a specific hook');
            console.log('  list                             - List all available hooks');
            console.log('  status                           - Show hook system status');
            console.log('  config [reset]                   - Show or reset configuration');
            console.log('');
            console.log('Triggers: pre-edit, post-edit');
            console.log('Change types: edit, add, delete, major_edit, fix');
            break;
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Hook manager error:', error);
        process.exit(1);
    });
}

module.exports = HookManager;