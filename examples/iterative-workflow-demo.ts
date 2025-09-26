#!/usr/bin/env tsx

/**
 * Comprehensive Iterative Development Workflow Demo
 *
 * This example demonstrates a full-stack development workflow with:
 * - Feature lifecycle management
 * - Continuous testing integration
 * - Automated code review and quality gates
 * - Progressive feature rollout
 * - Real-time monitoring and feedback loops
 * - Chrome MCP browser testing integration
 * - Frontend-backend coordination
 * - Rollback and recovery mechanisms
 */

import { IterativeDevelopmentOrchestrator } from '../src/workflows/iterative-development-orchestrator';
import { promises as fs } from 'fs';
import path from 'path';

interface DemoConfig {
  feature: {
    name: string;
    description: string;
    requirements: any;
    teamConfig?: any;
  };
  simulation: {
    realTime: boolean;
    accelerated: boolean;
    failureSimulation: boolean;
    duration: number; // in minutes
  };
}

class IterativeWorkflowDemo {
  private orchestrator: IterativeDevelopmentOrchestrator;
  private config: DemoConfig;
  private demoStartTime: Date = new Date();
  private eventLog: any[] = [];

  constructor(config: Partial<DemoConfig> = {}) {
    this.config = {
      feature: {
        name: 'User Dashboard Enhancement',
        description: 'Add real-time analytics and customizable widgets to user dashboard',
        requirements: {
          frontend: ['react', 'shadcn', 'charts', 'websockets'],
          backend: ['express', 'typescript', 'websockets', 'redis'],
          database: ['postgresql', 'time-series'],
          testing: ['unit', 'integration', 'e2e', 'performance'],
          dependencies: []
        }
      },
      simulation: {
        realTime: false,
        accelerated: true,
        failureSimulation: true,
        duration: 30 // 30 minutes demo
      },
      ...config
    };

    // Initialize orchestrator with demo configuration
    this.orchestrator = new IterativeDevelopmentOrchestrator({
      lifecycle: {
        maxConcurrentFeatures: 3,
        autoProgressionEnabled: true,
        qualityGateThresholds: {
          testCoverage: 80,
          codeQuality: 8.0,
          performanceScore: 85,
          securityScore: 90
        },
        rollbackThresholds: {
          errorRate: 2.0,
          responseTime: 1000,
          userSatisfaction: 7.0
        }
      },
      testing: {
        parallelExecution: true,
        crossBrowserTesting: true,
        performanceTesting: true,
        continuousIntegration: true
      },
      rollout: {
        defaultStrategy: 'canary',
        autoRollbackEnabled: true,
        monitoringWindow: 15, // Reduced for demo
        progressiveStages: true
      },
      monitoring: {
        realTimeAlerts: true,
        performanceTracking: true,
        userFeedbackIntegration: true,
        businessMetrics: true
      },
      coordination: {
        swarmTopology: 'hierarchical',
        agentCommunication: 'event-driven',
        conflictResolution: 'priority-based'
      },
      recovery: {
        automaticCheckpoints: true,
        recoveryPointRetention: 7, // 7 days for demo
        autoRecoveryEnabled: true,
        verificationRequired: true
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Feature lifecycle events
    this.orchestrator.on('feature:development-started', (event) => {
      this.logEvent('🚀 Feature Development Started', event, 'success');
    });

    this.orchestrator.on('orchestrator:phase-changed', (event) => {
      this.logEvent('📋 Phase Transition', {
        feature: event.feature.name,
        from: event.previousPhase,
        to: event.newPhase
      }, 'info');
    });

    // Workflow execution events
    this.orchestrator.on('workflow:phase-started', (event) => {
      this.logEvent('⚡ Workflow Phase Started', {
        workflowId: event.workflowId,
        phase: event.phase.name,
        type: event.phase.type
      }, 'info');
    });

    this.orchestrator.on('workflow:phase-completed', (event) => {
      this.logEvent('✅ Workflow Phase Completed', {
        workflowId: event.workflowId,
        phase: event.phase.name,
        duration: `${(event.duration / 1000).toFixed(1)}s`
      }, 'success');
    });

    this.orchestrator.on('workflow:phase-failed', (event) => {
      this.logEvent('❌ Workflow Phase Failed', {
        workflowId: event.workflowId,
        phase: event.phase.name,
        error: event.error.message
      }, 'error');
    });

    // Agent coordination events
    this.orchestrator.on('workflow:agent-started', (event) => {
      this.logEvent('🤖 Agent Started', {
        workflowId: event.workflowId,
        phase: event.phase,
        agentId: event.agentId
      }, 'info');
    });

    this.orchestrator.on('workflow:agent-completed', (event) => {
      this.logEvent('✅ Agent Completed', {
        workflowId: event.workflowId,
        phase: event.phase,
        agentId: event.agentId
      }, 'success');
    });

    // Testing events
    this.orchestrator.on('orchestrator:test-completed', (event) => {
      this.logEvent('🧪 Test Completed', {
        browser: event.execution.browser,
        status: event.execution.status,
        duration: event.execution.performance?.loadTime
      }, event.execution.status === 'passed' ? 'success' : 'error');
    });

    this.orchestrator.on('orchestrator:coverage-threshold-failed', (event) => {
      this.logEvent('📊 Coverage Threshold Failed', {
        suite: event.suite.name,
        coverage: event.result.coverage
      }, 'warning');
    });

    // Quality gate events
    this.orchestrator.on('orchestrator:review-completed', (event) => {
      this.logEvent('🔍 Code Review Completed', {
        reviewId: event.review.id,
        passed: event.review.passed,
        issues: event.review.issues.length
      }, event.review.passed ? 'success' : 'warning');
    });

    this.orchestrator.on('orchestrator:quality-gate-failed', (event) => {
      this.logEvent('🚫 Quality Gate Failed', {
        feature: event.feature.name,
        failedGates: event.failedGates.length
      }, 'error');
    });

    // Deployment and rollout events
    this.orchestrator.on('orchestrator:rollout-completed', (event) => {
      this.logEvent('🚀 Rollout Completed', {
        rolloutId: event.rolloutId,
        strategy: event.execution.strategy
      }, 'success');
    });

    this.orchestrator.on('orchestrator:rollout-rolled-back', (event) => {
      this.logEvent('⏪ Rollout Rolled Back', {
        rolloutId: event.rolloutId,
        reason: event.reason
      }, 'error');
    });

    // Monitoring and alerts
    this.orchestrator.on('orchestrator:alert-triggered', (alert) => {
      this.logEvent('🚨 Alert Triggered', {
        metric: alert.metric,
        level: alert.level,
        message: alert.message,
        value: alert.value
      }, alert.level === 'critical' ? 'error' : 'warning');
    });

    this.orchestrator.on('orchestrator:system-health-degraded', (event) => {
      this.logEvent('⚠️ System Health Degraded', {
        score: event.score
      }, 'warning');
    });

    // Recovery events
    this.orchestrator.on('orchestrator:recovery-point-created', (recoveryPoint) => {
      this.logEvent('💾 Recovery Point Created', {
        id: recoveryPoint.id,
        type: recoveryPoint.type,
        trigger: recoveryPoint.trigger,
        verificationPassed: recoveryPoint.verification.passed
      }, 'info');
    });

    this.orchestrator.on('orchestrator:emergency-recovery-triggered', (event) => {
      this.logEvent('🆘 Emergency Recovery Triggered', {
        alertLevel: event.alert.level,
        metric: event.alert.metric
      }, 'error');
    });

    // Coordination events
    this.orchestrator.on('orchestrator:coordination-conflict', (event) => {
      this.logEvent('⚡ Coordination Conflict', {
        teamId: event.teamId,
        conflictType: event.conflict.type,
        severity: event.conflict.severity
      }, 'warning');
    });

    // Workflow completion
    this.orchestrator.on('workflow:completed', (event) => {
      this.logEvent('🎉 Workflow Completed', {
        workflowId: event.workflowId,
        metrics: {
          cycleTime: `${(event.metrics.cycleTime / 1000 / 60).toFixed(1)}m`,
          qualityScore: event.metrics.qualityScore.toFixed(1),
          failureRate: `${(event.metrics.failureRate * 100).toFixed(1)}%`
        }
      }, 'success');

      this.displayCompletionSummary(event);
    });

    // Recovery and rollback
    this.orchestrator.on('workflow:recovery-initiated', (event) => {
      this.logEvent('🔄 Workflow Recovery Initiated', {
        workflowId: event.workflowId,
        rollbackId: event.rollbackId
      }, 'info');
    });
  }

  public async runDemo(): Promise<void> {
    console.log('🌟 Starting Comprehensive Iterative Development Workflow Demo');
    console.log('=' .repeat(80));
    console.log(`📊 Feature: ${this.config.feature.name}`);
    console.log(`📝 Description: ${this.config.feature.description}`);
    console.log(`⏱️ Duration: ${this.config.simulation.duration} minutes`);
    console.log(`🚀 Mode: ${this.config.simulation.accelerated ? 'Accelerated' : 'Real-time'}`);
    console.log('=' .repeat(80));
    console.log();

    try {
      // Phase 1: Initialize and start feature development
      console.log('📋 Phase 1: Starting Feature Development...');
      const workflowId = await this.orchestrator.startFeatureDevelopment(
        this.config.feature.name,
        this.config.feature.requirements,
        this.config.feature.teamConfig
      );

      console.log(`✅ Workflow initialized: ${workflowId}`);
      console.log();

      // Phase 2: Monitor workflow execution
      console.log('📊 Phase 2: Monitoring Workflow Execution...');
      await this.monitorWorkflowExecution(workflowId);

      // Phase 3: Simulate failure scenarios if enabled
      if (this.config.simulation.failureSimulation) {
        console.log('⚠️ Phase 3: Simulating Failure Scenarios...');
        await this.simulateFailureScenarios(workflowId);
      }

      // Phase 4: Display final results
      console.log('📈 Phase 4: Generating Final Report...');
      await this.generateFinalReport(workflowId);

    } catch (error) {
      this.logEvent('💥 Demo Failed', {
        error: error instanceof Error ? error.message : String(error)
      }, 'error');
      console.error('Demo execution failed:', error);
    } finally {
      // Cleanup
      await this.cleanup();
    }
  }

  private async monitorWorkflowExecution(workflowId: string): Promise<void> {
    const startTime = Date.now();
    const maxDuration = this.config.simulation.duration * 60 * 1000; // Convert to milliseconds
    const checkInterval = this.config.simulation.accelerated ? 2000 : 10000; // 2s or 10s

    return new Promise((resolve) => {
      const monitor = setInterval(() => {
        const workflow = this.orchestrator.getWorkflow(workflowId);
        const elapsed = Date.now() - startTime;

        if (!workflow) {
          clearInterval(monitor);
          resolve();
          return;
        }

        // Display progress
        this.displayWorkflowProgress(workflow);

        // Check for completion or timeout
        if (workflow.status === 'completed' || workflow.status === 'failed' || elapsed > maxDuration) {
          clearInterval(monitor);
          resolve();
        }
      }, checkInterval);
    });
  }

  private displayWorkflowProgress(workflow: any): void {
    const completedPhases = workflow.phases.filter((p: any) => p.status === 'completed').length;
    const totalPhases = workflow.phases.length;
    const progress = (completedPhases / totalPhases * 100).toFixed(1);

    console.log(`📊 Progress: ${progress}% (${completedPhases}/${totalPhases} phases completed)`);
    console.log(`📈 Status: ${workflow.status}`);
    console.log(`⚡ Current Phase: ${workflow.currentPhase.name}`);

    // Show active agents
    const currentPhaseExecution = workflow.phases.find((p: any) => p.status === 'running');
    if (currentPhaseExecution) {
      const activeAgents = currentPhaseExecution.agents.filter((a: any) => a.status === 'working');
      if (activeAgents.length > 0) {
        console.log(`🤖 Active Agents: ${activeAgents.map((a: any) => a.agentType).join(', ')}`);
      }
    }

    console.log('---');
  }

  private async simulateFailureScenarios(workflowId: string): Promise<void> {
    const scenarios = [
      {
        name: 'Test Failure',
        probability: 0.3,
        action: async () => {
          this.logEvent('🧪 Simulating Test Failure', {}, 'warning');
          // This would trigger test failure handling in real implementation
        }
      },
      {
        name: 'Performance Degradation',
        probability: 0.2,
        action: async () => {
          this.logEvent('📉 Simulating Performance Degradation', {}, 'warning');
          // This would trigger performance alerts
        }
      },
      {
        name: 'Error Rate Spike',
        probability: 0.1,
        action: async () => {
          this.logEvent('📈 Simulating Error Rate Spike', {}, 'error');
          // This would trigger emergency recovery
        }
      }
    ];

    for (const scenario of scenarios) {
      if (Math.random() < scenario.probability) {
        await scenario.action();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      }
    }
  }

  private async generateFinalReport(workflowId: string): Promise<void> {
    const workflow = this.orchestrator.getWorkflow(workflowId);
    const systemMetrics = this.orchestrator.getSystemMetrics();

    console.log();
    console.log('📊 FINAL REPORT');
    console.log('=' .repeat(60));

    if (workflow) {
      console.log('🔄 Workflow Summary:');
      console.log(`   Status: ${workflow.status}`);
      console.log(`   Duration: ${((Date.now() - workflow.startTime.getTime()) / 1000 / 60).toFixed(1)} minutes`);
      console.log(`   Phases Completed: ${workflow.phases.filter((p: any) => p.status === 'completed').length}/${workflow.phases.length}`);

      if (workflow.metrics) {
        console.log(`   Quality Score: ${workflow.metrics.qualityScore?.toFixed(1) || 'N/A'}`);
        console.log(`   Failure Rate: ${(workflow.metrics.failureRate * 100).toFixed(1)}%`);
      }
    }

    console.log();
    console.log('📈 System Metrics:');
    console.log(`   Active Workflows: ${systemMetrics.activeWorkflows}`);
    console.log(`   Active Features: ${systemMetrics.activeFeatures}`);
    console.log(`   System Health: ${systemMetrics.systemHealth.overall}`);

    console.log();
    console.log('📝 Event Summary:');
    const eventsByType = this.eventLog.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {});

    Object.entries(eventsByType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    // Save detailed report to file
    await this.saveDetailedReport(workflowId, systemMetrics);
  }

  private async saveDetailedReport(workflowId: string, systemMetrics: any): Promise<void> {
    const reportData = {
      demo: {
        config: this.config,
        startTime: this.demoStartTime,
        endTime: new Date(),
        duration: Date.now() - this.demoStartTime.getTime()
      },
      workflow: this.orchestrator.getWorkflow(workflowId),
      systemMetrics,
      eventLog: this.eventLog,
      summary: {
        totalEvents: this.eventLog.length,
        successEvents: this.eventLog.filter(e => e.level === 'success').length,
        errorEvents: this.eventLog.filter(e => e.level === 'error').length,
        warningEvents: this.eventLog.filter(e => e.level === 'warning').length
      }
    };

    const reportPath = path.join(process.cwd(), 'logs', 'demo-report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));

    console.log(`📄 Detailed report saved to: ${reportPath}`);
  }

  private displayCompletionSummary(event: any): void {
    console.log();
    console.log('🎉 WORKFLOW COMPLETED SUCCESSFULLY!');
    console.log('-'.repeat(40));
    console.log(`✅ Cycle Time: ${event.metrics.cycleTime}`);
    console.log(`📊 Quality Score: ${event.metrics.qualityScore}`);
    console.log(`📈 Failure Rate: ${event.metrics.failureRate}`);
    console.log();
  }

  private logEvent(title: string, data: any = {}, level: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const event = {
      timestamp,
      title,
      data,
      level,
      type: level
    };

    this.eventLog.push(event);

    // Color coding for console output
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m',   // Red
      reset: '\x1b[0m'     // Reset
    };

    const color = colors[level] || colors.info;
    const reset = colors.reset;

    console.log(`${color}[${timestamp.substring(11, 19)}] ${title}${reset}`);

    if (Object.keys(data).length > 0) {
      Object.entries(data).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
    }
    console.log();
  }

  private async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up resources...');
    this.orchestrator.cleanup();
    console.log('✅ Cleanup completed');
  }
}

// Demo execution
async function main() {
  const demo = new IterativeWorkflowDemo({
    feature: {
      name: 'Real-time Analytics Dashboard',
      description: 'Implement a comprehensive analytics dashboard with real-time data visualization, customizable widgets, and user preferences',
      requirements: {
        frontend: ['react', 'shadcn', 'd3', 'websockets', 'zustand'],
        backend: ['express', 'typescript', 'websockets', 'redis', 'postgresql'],
        database: ['postgresql', 'redis', 'timeseries'],
        testing: ['unit', 'integration', 'e2e', 'performance', 'accessibility'],
        dependencies: ['user-service', 'data-pipeline']
      },
      teamConfig: {
        coordination: {
          communicationPattern: 'event-driven',
          conflictResolution: 'priority-based'
        }
      }
    },
    simulation: {
      realTime: false,
      accelerated: true,
      failureSimulation: true,
      duration: 15 // 15-minute demo
    }
  });

  try {
    await demo.runDemo();
    console.log('🎯 Demo completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('💥 Demo failed:', error);
    process.exit(1);
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { IterativeWorkflowDemo };