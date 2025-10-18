#!/usr/bin/env node
/**
 * Byzantine Consensus Validation Runner (ES Module)
 */

import { ByzantineConsensusCoordinator } from '../../src/consensus/byzantine-coordinator.mjs';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

class ByzantineValidationRunner {
    constructor() {
        this.coordinator = new ByzantineConsensusCoordinator({
            nodeId: 'byzantine-validator-primary',
            totalNodes: 7 // f=2 Byzantine fault tolerance
        });

        this.validationResults = {
            phases: {},
            overall: false,
            timestamp: new Date().toISOString(),
            nodeId: this.coordinator.nodeId
        };

        this.reportPath = path.join(process.cwd(), 'docs/validation/byzantine-validation-report.json');
    }

    async executeCompleteValidation() {
        console.log('🛡️  BYZANTINE CONSENSUS COORDINATOR - VALIDATION SUITE');
        console.log('=' .repeat(65));
        console.log(`📍 Node ID: ${this.coordinator.nodeId}`);
        console.log(`🕐 Started: ${new Date().toLocaleString()}`);
        console.log('=' .repeat(65));

        try {
            // Execute hooks
            await this.executeHook('pre-task', 'byzantine-consensus-validation');

            // Phase 1: Resource Management Shutdown
            console.log('\n🔧 PHASE 1: RESOURCE MANAGEMENT SHUTDOWN VALIDATION');
            console.log('-'.repeat(55));
            this.validationResults.phases.resourceShutdown = await this.coordinator.validateResourceShutdown();

            // Phase 2: Agent Lifecycle Persistence
            console.log('\n🔄 PHASE 2: AGENT LIFECYCLE PERSISTENCE VALIDATION');
            console.log('-'.repeat(55));
            this.validationResults.phases.agentLifecycle = await this.coordinator.validateAgentLifecycle();

            // Phase 3: Memory Leak Prevention
            console.log('\n💾 PHASE 3: MEMORY LEAK PREVENTION VALIDATION');
            console.log('-'.repeat(55));
            this.validationResults.phases.memoryLeakPrevention = await this.coordinator.validateMemoryLeakPrevention();

            // Phase 4: Byzantine Agreement Coordination
            console.log('\n⚡ PHASE 4: BYZANTINE AGREEMENT COORDINATION');
            console.log('-'.repeat(55));
            this.validationResults.phases.byzantineAgreement = await this.coordinator.coordinateByzantineAgreement();

            // Calculate overall result
            this.validationResults.overall = this.calculateOverallValidation();

            // Generate comprehensive report
            const report = this.coordinator.generateValidationReport();
            await this.saveValidationReport(report);

            // Print final summary
            this.printValidationSummary();

            // Execute completion hooks
            await this.notifyValidationCompletion();

            return this.validationResults;

        } catch (error) {
            console.error('💥 Validation execution failed:', error);
            this.validationResults.error = error.message;
            await this.executeHook('notify', `"Byzantine validation failed: ${error.message}"`);
            throw error;
        }
    }

    calculateOverallValidation() {
        const phases = Object.values(this.validationResults.phases);
        return phases.every(phase => phase.passed);
    }

    async saveValidationReport(report) {
        try {
            await fs.mkdir(path.dirname(this.reportPath), { recursive: true });

            const enhancedReport = {
                ...report,
                validation_execution: this.validationResults,
                generated_by: 'Byzantine Consensus Coordinator',
                validation_date: new Date().toISOString()
            };

            await fs.writeFile(this.reportPath, JSON.stringify(enhancedReport, null, 2));
            console.log(`\n📄 Validation report saved: ${this.reportPath}`);
        } catch (error) {
            console.warn('⚠️  Could not save validation report:', error.message);
        }
    }

    printValidationSummary() {
        console.log('\n' + '='.repeat(65));
        console.log('🎯 BYZANTINE CONSENSUS VALIDATION SUMMARY');
        console.log('='.repeat(65));

        const phases = this.validationResults.phases;
        let totalTests = 0;
        let totalPassed = 0;

        // Phase-by-phase results
        Object.entries(phases).forEach(([phaseName, phaseResult]) => {
            const status = phaseResult.passed ? '✅ PASSED' : '❌ FAILED';
            const phaseTitle = phaseName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            const testInfo = `(${phaseResult.tests_passed}/${phaseResult.tests_total} tests)`;

            console.log(`${status} ${phaseTitle.padEnd(35)} ${testInfo}`);

            totalTests += phaseResult.tests_total || 0;
            totalPassed += phaseResult.tests_passed || 0;
        });

        console.log('\n' + '-'.repeat(65));

        // Overall statistics
        const successRate = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : '0.0';
        console.log(`📊 Test Results: ${totalPassed}/${totalTests} (${successRate}%)`);

        // Overall validation result
        const overallStatus = this.validationResults.overall ?
            '🟢 IMPLEMENTATION CLAIMS VALIDATED' : '🔴 VALIDATION FAILED';
        console.log(`🎯 Overall Result: ${overallStatus}`);

        // Byzantine fault tolerance status
        const byzantineStatus = this.validationResults.overall ?
            '🛡️  BYZANTINE FAULT TOLERANCE VERIFIED' : '⚠️  BYZANTINE FAULT TOLERANCE ISSUES DETECTED';
        console.log(`🛡️  Byzantine Status: ${byzantineStatus}`);

        console.log('='.repeat(65));

        // Implementation claims verification
        console.log('\n🔍 IMPLEMENTATION CLAIMS VERIFICATION:');
        const claims = [
            { claim: 'Resource management shutdown processes work as designed',
              verified: phases.resourceShutdown?.passed },
            { claim: 'Agent lifecycle persistence and cleanup mechanisms function correctly',
              verified: phases.agentLifecycle?.passed },
            { claim: 'Memory leak prevention and resource monitoring are effective',
              verified: phases.memoryLeakPrevention?.passed },
            { claim: 'Byzantine consensus coordination operates fault-tolerantly',
              verified: phases.byzantineAgreement?.passed }
        ];

        claims.forEach((claim, index) => {
            const status = claim.verified ? '✅ VERIFIED' : '❌ NOT VERIFIED';
            console.log(`${index + 1}. ${claim.claim}`);
            console.log(`   ${status}`);
        });

        // Recommendations
        const report = this.coordinator.generateValidationReport();
        if (report.recommendations.length > 0) {
            console.log('\n💡 RECOMMENDATIONS:');
            report.recommendations.forEach((rec, index) => {
                console.log(`${index + 1}. ${rec}`);
            });
        }

        console.log('\n' + '='.repeat(65));
    }

    async executeHook(hookType, parameter) {
        try {
            const commands = {
                'pre-task': `npx claude-flow@alpha hooks pre-task --description "${parameter}"`,
                'notify': `npx claude-flow@alpha hooks notify --message ${parameter}`,
                'post-task': `npx claude-flow@alpha hooks post-task --task-id ${parameter}`
            };

            const command = commands[hookType];
            if (!command) return;

            console.log(`🔗 Executing ${hookType} hook...`);
            const { stdout } = await execAsync(command);
            if (stdout) console.log(`   ${stdout.trim()}`);

        } catch (error) {
            console.warn(`⚠️  Hook ${hookType} warning:`, error.message);
        }
    }

    async notifyValidationCompletion() {
        const phases = this.validationResults.phases;

        const notifications = [
            `"Resource Shutdown: ${phases.resourceShutdown?.passed ? 'VALIDATED ✅' : 'FAILED ❌'}"`,
            `"Agent Lifecycle: ${phases.agentLifecycle?.passed ? 'VALIDATED ✅' : 'FAILED ❌'}"`,
            `"Memory Leak Prevention: ${phases.memoryLeakPrevention?.passed ? 'VALIDATED ✅' : 'FAILED ❌'}"`,
            `"Byzantine Agreement: ${phases.byzantineAgreement?.passed ? 'VALIDATED ✅' : 'FAILED ❌'}"`,
            `"Overall Implementation Claims: ${this.validationResults.overall ? 'ALL VERIFIED ✅' : 'VALIDATION ISSUES ❌'}"`
        ];

        for (const notification of notifications) {
            await this.executeHook('notify', notification);
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Final post-task hook
        await this.executeHook('post-task', 'byzantine-consensus-validation-complete');
    }
}

// Execute validation if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const runner = new ByzantineValidationRunner();

    runner.executeCompleteValidation()
        .then(results => {
            const exitCode = results.overall ? 0 : 1;
            console.log(`\n🏁 Byzantine Consensus Validation Complete (Exit Code: ${exitCode})`);
            process.exit(exitCode);
        })
        .catch(error => {
            console.error('\n💥 CRITICAL: Byzantine Consensus Validation Failed:', error);
            process.exit(1);
        });
}

export { ByzantineValidationRunner };