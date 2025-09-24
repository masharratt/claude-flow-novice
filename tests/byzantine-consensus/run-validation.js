#!/usr/bin/env node
/**
 * Byzantine Consensus Validation Runner
 * Entry point for executing the complete validation suite
 */

const { ValidationSuite } = require('./validation-suite');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

class ValidationRunner {
    constructor() {
        this.suite = new ValidationSuite();
        this.hooks = {
            preTask: "npx claude-flow@alpha hooks pre-task --description",
            postTask: "npx claude-flow@alpha hooks post-task --task-id",
            notify: "npx claude-flow@alpha hooks notify --message"
        };
    }

    async executeWithHooks() {
        console.log('🎯 Initializing Byzantine Consensus Validation with Hooks...\n');

        try {
            // Pre-task hook
            await this.executeHook('preTask', '"byzantine-consensus-validation-suite"');

            // Execute validation suite
            const results = await this.suite.runCompleteValidation();

            // Post-task notifications
            await this.notifyValidationPhases(results);

            // Final post-task hook
            await this.executeHook('postTask', 'task-byzantine-validation');

            return results;

        } catch (error) {
            console.error('❌ Validation execution failed:', error);
            await this.executeHook('notify', `"Validation failed: ${error.message}"`);
            throw error;
        }
    }

    async executeHook(hookType, parameter) {
        try {
            const command = `${this.hooks[hookType]} ${parameter}`;
            console.log(`🔗 Executing hook: ${command}`);

            const { stdout, stderr } = await execAsync(command);
            if (stdout) console.log(`Hook output: ${stdout.trim()}`);
            if (stderr) console.warn(`Hook warning: ${stderr.trim()}`);

        } catch (error) {
            console.warn(`⚠️ Hook execution warning (${hookType}):`, error.message);
            // Continue execution even if hooks fail
        }
    }

    async notifyValidationPhases(results) {
        const notifications = [
            `"Phase 1 (Resource Shutdown): ${results.phases.resourceShutdown?.passed ? 'PASSED' : 'FAILED'}"`,
            `"Phase 2 (Agent Lifecycle): ${results.phases.agentLifecycle?.passed ? 'PASSED' : 'FAILED'}"`,
            `"Phase 3 (Memory Leak Prevention): ${results.phases.memoryLeakPrevention?.passed ? 'PASSED' : 'FAILED'}"`,
            `"Phase 4 (Byzantine Agreement): ${results.phases.byzantineAgreement?.passed ? 'PASSED' : 'FAILED'}"`,
            `"Overall Validation: ${results.overall ? 'PASSED ✅' : 'FAILED ❌'}"`
        ];

        for (const notification of notifications) {
            await this.executeHook('notify', notification);
            await new Promise(resolve => setTimeout(resolve, 100)); // Brief pause between notifications
        }
    }

    generateSummaryReport(results) {
        const report = {
            summary: {
                timestamp: new Date().toISOString(),
                overall_status: results.overall ? 'PASSED' : 'FAILED',
                phases_completed: Object.keys(results.phases).length,
                phases_passed: Object.values(results.phases).filter(p => p.passed).length
            },
            phase_details: results.phases,
            recommendations: this.generateRecommendations(results),
            next_steps: this.generateNextSteps(results)
        };

        return report;
    }

    generateRecommendations(results) {
        const recommendations = [];

        Object.entries(results.phases).forEach(([phase, result]) => {
            if (!result.passed) {
                switch (phase) {
                    case 'resourceShutdown':
                        recommendations.push('Implement more robust resource cleanup mechanisms');
                        break;
                    case 'agentLifecycle':
                        recommendations.push('Enhance agent state persistence and recovery protocols');
                        break;
                    case 'memoryLeakPrevention':
                        recommendations.push('Strengthen memory management and garbage collection');
                        break;
                    case 'byzantineAgreement':
                        recommendations.push('Improve Byzantine fault tolerance and consensus protocols');
                        break;
                }
            }
        });

        return recommendations;
    }

    generateNextSteps(results) {
        const nextSteps = [];

        if (results.overall) {
            nextSteps.push('Deploy to production with confidence');
            nextSteps.push('Monitor Byzantine consensus metrics in production');
            nextSteps.push('Schedule regular validation runs');
        } else {
            nextSteps.push('Address failed validation phases');
            nextSteps.push('Re-run validation after fixes');
            nextSteps.push('Consider additional Byzantine fault tolerance measures');
        }

        return nextSteps;
    }
}

// Run validation if called directly
if (require.main === module) {
    const runner = new ValidationRunner();

    runner.executeWithHooks()
        .then(results => {
            console.log('\n🎉 Byzantine Consensus Validation Complete!');
            process.exit(results.overall ? 0 : 1);
        })
        .catch(error => {
            console.error('\n💥 Byzantine Consensus Validation Failed:', error);
            process.exit(1);
        });
}

module.exports = { ValidationRunner };