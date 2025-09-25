/**
 * Phase 2 Quality Gates Manager Tests
 * Analytics integration and user-customizable gate configuration
 *
 * Tests quality gate capabilities:
 * - Configurable quality gates per framework
 * - Integration with existing SQLite analytics pipeline
 * - User-customizable thresholds and criteria
 * - Byzantine consensus for gate configuration changes
 * - Real-time gate execution and monitoring
 * - Team collaboration and shared gate configurations
 *
 * ANALYTICS INTEGRATION:
 * - SQLite analyzer integration from personalization system
 * - Performance metrics collection and optimization
 * - Team synchronization via existing team-sync.js
 * - Dashboard integration and reporting
 */

import { expect } from 'chai';
import { promises as fs } from 'fs';
import path from 'path';
import { ByzantineConsensus } from '../../src/core/byzantine-consensus.js';
import { SqliteMemoryStore } from '../../src/memory/sqlite-store.js';

let QualityGatesManager;

describe('Phase 2: Quality Gates Manager - Analytics Integration', function() {
  this.timeout(30000);

  let gatesManager;
  let byzantineConsensus;
  let sqliteStore;
  let testAnalyticsPath;

  before(async function() {
    byzantineConsensus = new ByzantineConsensus();

    // Initialize SQLite store for analytics integration
    sqliteStore = new SqliteMemoryStore({
      path: ':memory:', // Use in-memory database for tests
      enableAnalytics: true
    });
    await sqliteStore.initialize();

    // Setup test analytics directory
    testAnalyticsPath = path.join(process.cwd(), '.test-analytics');
    await fs.mkdir(testAnalyticsPath, { recursive: true });
  });

  beforeEach(async function() {
    const { QualityGatesManager: QGM } = await import('../../src/configuration/quality-gates-manager.js');
    QualityGatesManager = QGM;

    gatesManager = new QualityGatesManager({
      byzantineConsensus,
      analyticsStore: sqliteStore,
      analyticsPath: testAnalyticsPath,
      enableAnalyticsIntegration: true,
      enableByzantineValidation: true,
      enableRealTimeMonitoring: true
    });

    await gatesManager.initialize();
  });

  afterEach(async function() {
    if (gatesManager) {
      await gatesManager.shutdown();
    }
  });

  after(async function() {
    if (sqliteStore) {
      await sqliteStore.close();
    }
    await fs.rm(testAnalyticsPath, { recursive: true, force: true });
  });

  describe('Quality Gates Configuration with Analytics Integration', function() {

    it('should configure framework-specific quality gates with analytics tracking', async function() {
      const qualityGatesConfig = {
        framework: 'tdd-analytics',
        gates: {
          pre_implementation: [
            {
              id: 'requirements_analysis',
              name: 'Requirements Analysis Gate',
              criteria: {
                requirements_completeness: { min: 0.95, track_metric: true },
                stakeholder_approval: { required: true, track_metric: true },
                acceptance_criteria_defined: { required: true, track_metric: true }
              },
              analytics: {
                track_execution_time: true,
                track_pass_rate: true,
                collect_evidence_quality: true,
                team_performance_tracking: true
              },
              quality_thresholds: {
                max_execution_time: 3600000, // 1 hour
                min_pass_rate: 0.85,
                min_evidence_quality_score: 0.80
              }
            },
            {
              id: 'test_design',
              name: 'Test Design Gate',
              criteria: {
                test_coverage_design: { min: 0.90, track_metric: true },
                edge_cases_identified: { min: 5, track_metric: true },
                test_strategy_approved: { required: true, track_metric: true }
              },
              analytics: {
                track_test_design_quality: true,
                measure_coverage_planning_accuracy: true,
                correlate_with_implementation_success: true
              }
            }
          ],
          during_implementation: [
            {
              id: 'red_green_cycle',
              name: 'Red-Green-Refactor Cycle Gate',
              criteria: {
                failing_test_first: { required: true, track_metric: true },
                minimal_implementation: { required: true, track_metric: true },
                refactor_applied: { required: true, track_metric: true }
              },
              analytics: {
                track_cycle_time: true,
                measure_refactor_frequency: true,
                quality_improvement_metrics: true
              },
              real_time_monitoring: {
                enabled: true,
                alert_on_violations: true,
                dashboard_widgets: ['cycle_time', 'violation_count', 'quality_trend']
              }
            }
          ],
          post_implementation: [
            {
              id: 'comprehensive_validation',
              name: 'Comprehensive Validation Gate',
              criteria: {
                truth_score: { min: 0.90, track_metric: true },
                test_coverage: { min: 0.95, track_metric: true },
                code_quality_score: { min: 85, track_metric: true },
                documentation_completeness: { min: 0.90, track_metric: true }
              },
              analytics: {
                correlate_metrics: ['truth_score', 'test_coverage', 'code_quality_score'],
                predict_maintenance_cost: true,
                team_performance_impact: true
              }
            }
          ]
        },
        analytics_configuration: {
          data_retention_days: 90,
          aggregation_intervals: ['hourly', 'daily', 'weekly'],
          dashboard_refresh_rate: 30000, // 30 seconds
          alert_thresholds: {
            gate_failure_rate: 0.20,
            average_gate_time_increase: 1.5,
            quality_score_decrease: 0.10
          },
          team_collaboration: {
            shared_analytics: true,
            cross_team_benchmarking: true,
            collaborative_threshold_tuning: true
          }
        }
      };

      const result = await gatesManager.configureQualityGates(qualityGatesConfig, {
        validateConfiguration: true,
        enableAnalyticsIntegration: true,
        requireByzantineConsensus: true,
        setupRealTimeMonitoring: true
      });

      expect(result.success).to.be.true;
      expect(result.gatesConfigured).to.be.true;
      expect(result.analyticsIntegrated).to.be.true;
      expect(result.byzantineValidated).to.be.true;
      expect(result.realTimeMonitoringEnabled).to.be.true;
      expect(result.sqliteSchemaCreated).to.be.true;
      expect(result.dashboardConfigured).to.be.true;
    });

    it('should integrate with existing SQLite analytics pipeline', async function() {
      // Configure gates with analytics integration
      const gatesConfig = {
        framework: 'sqlite-integration-test',
        gates: {
          implementation: [
            {
              id: 'analytics_test_gate',
              name: 'Analytics Integration Test Gate',
              criteria: {
                test_metric: { min: 0.80, track_metric: true }
              },
              analytics: { store_in_sqlite: true }
            }
          ]
        }
      };

      await gatesManager.configureQualityGates(gatesConfig, {
        enableAnalyticsIntegration: true
      });

      // Execute a quality gate to generate analytics data
      const gateExecution = {
        gateId: 'analytics_test_gate',
        frameworkId: 'sqlite-integration-test',
        completionId: 'test-completion-123',
        criteria: {
          test_metric: 0.85
        },
        evidence: {
          test_results: { passed: 10, failed: 2 },
          execution_time: 1500
        },
        timestamp: Date.now()
      };

      const executionResult = await gatesManager.executeQualityGate(gateExecution);

      expect(executionResult.success).to.be.true;
      expect(executionResult.analyticsStored).to.be.true;

      // Verify data was stored in SQLite
      const analyticsData = await sqliteStore.query(
        'SELECT * FROM quality_gate_analytics WHERE gate_id = ? AND completion_id = ?',
        ['analytics_test_gate', 'test-completion-123']
      );

      expect(analyticsData).to.have.length(1);
      expect(analyticsData[0].gate_id).to.equal('analytics_test_gate');
      expect(analyticsData[0].framework_id).to.equal('sqlite-integration-test');
      expect(analyticsData[0].completion_id).to.equal('test-completion-123');
      expect(analyticsData[0].criteria_result).to.exist;
      expect(analyticsData[0].execution_time).to.equal(1500);
    });

    it('should support user-customizable quality gate thresholds', async function() {
      const customizableGatesConfig = {
        framework: 'customizable-gates',
        gates: {
          implementation: [
            {
              id: 'customizable_gate',
              name: 'User Customizable Gate',
              criteria: {
                coverage_threshold: {
                  default_value: 0.80,
                  user_customizable: true,
                  allowed_range: { min: 0.70, max: 0.95 },
                  team_override_required: true
                },
                complexity_threshold: {
                  default_value: 10,
                  user_customizable: true,
                  allowed_range: { min: 5, max: 15 },
                  justification_required_for_high_values: true
                }
              },
              customization_rules: {
                require_justification: true,
                team_approval_required: true,
                track_customization_impact: true
              }
            }
          ]
        },
        user_preferences: {
          userId: 'test-user-123',
          customizations: {
            coverage_threshold: {
              value: 0.85,
              justification: 'Higher coverage needed for critical components'
            },
            complexity_threshold: {
              value: 8,
              justification: 'Maintaining lower complexity for better maintainability'
            }
          }
        }
      };

      const result = await gatesManager.setCustomizableThresholds(customizableGatesConfig, {
        validateCustomizations: true,
        requireByzantineApproval: true,
        trackAnalyticsImpact: true
      });

      expect(result.success).to.be.true;
      expect(result.customizationsApplied).to.be.true;
      expect(result.customizationsValid).to.be.true;
      expect(result.byzantineApproved).to.be.true;
      expect(result.analyticsTrackingEnabled).to.be.true;

      // Test that customized thresholds are used in gate execution
      const gateExecution = {
        gateId: 'customizable_gate',
        userId: 'test-user-123',
        criteria: {
          coverage_threshold: 0.84, // Below custom threshold
          complexity_threshold: 7   // Below custom threshold
        }
      };

      const executionResult = await gatesManager.executeQualityGate(gateExecution);

      expect(executionResult.success).to.be.false;
      expect(executionResult.failedCriteria).to.include('coverage_threshold');
      expect(executionResult.customThresholdsUsed).to.be.true;
    });
  });

  describe('Quality Gate Execution and Monitoring', function() {

    it('should execute quality gates with real-time monitoring', async function() {
      // Configure gates with real-time monitoring
      const monitoringConfig = {
        framework: 'real-time-monitoring',
        gates: {
          implementation: [
            {
              id: 'monitored_gate',
              name: 'Real-time Monitored Gate',
              criteria: {
                performance_metric: { min: 0.80, track_metric: true },
                quality_metric: { min: 0.85, track_metric: true }
              },
              real_time_monitoring: {
                enabled: true,
                monitoring_interval: 1000, // 1 second
                alert_thresholds: {
                  failure_rate: 0.30,
                  execution_time: 5000
                }
              }
            }
          ]
        }
      };

      await gatesManager.configureQualityGates(monitoringConfig);

      // Start real-time monitoring
      const monitoring = await gatesManager.startRealTimeMonitoring('monitored_gate', {
        enableAlerts: true,
        collectMetrics: true
      });

      expect(monitoring.started).to.be.true;
      expect(monitoring.monitoringId).to.exist;

      // Execute multiple gates to test monitoring
      const executions = [];
      for (let i = 0; i < 5; i++) {
        const execution = gatesManager.executeQualityGate({
          gateId: 'monitored_gate',
          criteria: {
            performance_metric: 0.75 + Math.random() * 0.20,
            quality_metric: 0.80 + Math.random() * 0.15
          }
        });
        executions.push(execution);
      }

      await Promise.all(executions);

      // Get real-time metrics
      const metrics = await gatesManager.getRealTimeMetrics('monitored_gate');

      expect(metrics.totalExecutions).to.equal(5);
      expect(metrics.passingRate).to.be.a('number');
      expect(metrics.averageExecutionTime).to.be.a('number');
      expect(metrics.currentFailureRate).to.be.a('number');

      // Stop monitoring
      await gatesManager.stopRealTimeMonitoring(monitoring.monitoringId);
    });

    it('should enforce quality gates during completion validation', async function() {
      const gatesConfig = {
        framework: 'enforcement-test',
        gates: {
          pre_implementation: [
            {
              id: 'requirements_gate',
              name: 'Requirements Gate',
              criteria: {
                requirements_complete: { required: true },
                acceptance_criteria_defined: { required: true }
              },
              enforcement_level: 'strict' // Cannot be bypassed
            }
          ],
          post_implementation: [
            {
              id: 'validation_gate',
              name: 'Validation Gate',
              criteria: {
                truth_score: { min: 0.85 },
                test_coverage: { min: 0.90 }
              },
              enforcement_level: 'strict'
            }
          ]
        }
      };

      await gatesManager.configureQualityGates(gatesConfig);

      // Test completion that should pass all gates
      const passingCompletion = {
        id: 'passing-completion',
        framework: 'enforcement-test',
        claim: 'Implemented feature with complete requirements and tests',
        evidence: {
          requirements_complete: true,
          acceptance_criteria_defined: true,
          truth_score: 0.90,
          test_coverage: 0.95
        },
        quality_gates_evidence: {
          pre_implementation: {
            requirements_gate: {
              executed: true,
              passed: true,
              evidence_validated: true
            }
          }
        }
      };

      const passingResult = await gatesManager.validateCompletionWithGates(passingCompletion);

      expect(passingResult.success).to.be.true;
      expect(passingResult.allGatesPassed).to.be.true;
      expect(passingResult.gateResults).to.have.property('requirements_gate');
      expect(passingResult.gateResults).to.have.property('validation_gate');

      // Test completion that should fail gates
      const failingCompletion = {
        id: 'failing-completion',
        framework: 'enforcement-test',
        claim: 'Incomplete implementation',
        evidence: {
          requirements_complete: false, // Fails requirements gate
          acceptance_criteria_defined: true,
          truth_score: 0.75, // Fails validation gate
          test_coverage: 0.85 // Fails validation gate
        }
      };

      const failingResult = await gatesManager.validateCompletionWithGates(failingCompletion);

      expect(failingResult.success).to.be.false;
      expect(failingResult.allGatesPassed).to.be.false;
      expect(failingResult.failedGates).to.include('requirements_gate');
      expect(failingResult.failedGates).to.include('validation_gate');
      expect(failingResult.completionBlocked).to.be.true; // Strict enforcement
    });

    it('should provide comprehensive analytics and reporting', async function() {
      // Setup gates and execute multiple completions to generate analytics data
      const analyticsTestConfig = {
        framework: 'analytics-reporting',
        gates: {
          implementation: [
            {
              id: 'analytics_gate_1',
              name: 'Analytics Gate 1',
              criteria: { metric_1: { min: 0.80 } },
              analytics: { track_performance: true }
            },
            {
              id: 'analytics_gate_2',
              name: 'Analytics Gate 2',
              criteria: { metric_2: { min: 0.85 } },
              analytics: { track_performance: true }
            }
          ]
        }
      };

      await gatesManager.configureQualityGates(analyticsTestConfig);

      // Execute gates multiple times with varying success rates
      const testData = [
        { gateId: 'analytics_gate_1', metric_1: 0.85, success: true },
        { gateId: 'analytics_gate_1', metric_1: 0.75, success: false },
        { gateId: 'analytics_gate_1', metric_1: 0.90, success: true },
        { gateId: 'analytics_gate_2', metric_2: 0.88, success: true },
        { gateId: 'analytics_gate_2', metric_2: 0.82, success: false },
        { gateId: 'analytics_gate_2', metric_2: 0.90, success: true }
      ];

      for (const data of testData) {
        await gatesManager.executeQualityGate({
          gateId: data.gateId,
          criteria: { [data.gateId === 'analytics_gate_1' ? 'metric_1' : 'metric_2']: data.metric_1 || data.metric_2 }
        });
      }

      // Generate analytics report
      const analyticsReport = await gatesManager.generateAnalyticsReport('analytics-reporting', {
        timeframe: '24h',
        includeDetailedMetrics: true,
        includeTrendAnalysis: true
      });

      expect(analyticsReport).to.exist;
      expect(analyticsReport.framework).to.equal('analytics-reporting');
      expect(analyticsReport.summary).to.exist;
      expect(analyticsReport.summary.totalGateExecutions).to.equal(6);
      expect(analyticsReport.summary.overallPassRate).to.be.a('number');

      expect(analyticsReport.gateMetrics).to.have.property('analytics_gate_1');
      expect(analyticsReport.gateMetrics).to.have.property('analytics_gate_2');

      expect(analyticsReport.gateMetrics.analytics_gate_1.executionCount).to.equal(3);
      expect(analyticsReport.gateMetrics.analytics_gate_1.passRate).to.be.approximately(0.67, 0.1);

      expect(analyticsReport.gateMetrics.analytics_gate_2.executionCount).to.equal(3);
      expect(analyticsReport.gateMetrics.analytics_gate_2.passRate).to.be.approximately(0.67, 0.1);

      expect(analyticsReport.trends).to.exist;
      expect(analyticsReport.recommendations).to.be.an('array');
    });
  });

  describe('Team Collaboration and Shared Configuration', function() {

    it('should support team-shared quality gate configurations', async function() {
      const teamConfig = {
        teamId: 'development-team-alpha',
        framework: 'team-shared-gates',
        gates: {
          implementation: [
            {
              id: 'team_code_review',
              name: 'Team Code Review Gate',
              criteria: {
                peer_reviews_required: { min: 2 },
                senior_approval_required: { required: true },
                team_coding_standards: { required: true }
              },
              team_settings: {
                reviewers_pool: ['senior-dev-1', 'senior-dev-2', 'tech-lead'],
                auto_assign_reviewers: true,
                require_unanimous_approval: false
              }
            }
          ]
        },
        team_preferences: {
          shared_configuration: true,
          allow_individual_overrides: false,
          synchronize_with_team_preferences: true
        }
      };

      const result = await gatesManager.configureTeamQualityGates(teamConfig, {
        validateTeamPermissions: true,
        synchronizeWithExistingSystem: true,
        requireByzantineConsensus: true
      });

      expect(result.success).to.be.true;
      expect(result.teamConfigurationCreated).to.be.true;
      expect(result.teamSyncIntegrated).to.be.true;
      expect(result.byzantineApproved).to.be.true;

      // Test that team members can access shared configuration
      const teamMemberAccess = await gatesManager.getTeamConfiguration('development-team-alpha', {
        userId: 'team-member-1'
      });

      expect(teamMemberAccess.hasAccess).to.be.true;
      expect(teamMemberAccess.configuration.framework).to.equal('team-shared-gates');
      expect(teamMemberAccess.configuration.gates.implementation[0].id).to.equal('team_code_review');
    });

    it('should integrate with existing team-sync.js from personalization system', async function() {
      const teamSyncIntegration = await gatesManager.getTeamSyncIntegration();

      expect(teamSyncIntegration.integrated).to.be.true;
      expect(teamSyncIntegration.teamSyncEnabled).to.be.true;
      expect(teamSyncIntegration.collaborativeModeSupported).to.be.true;

      // Test synchronization of quality gate preferences
      const syncData = {
        teamId: 'sync-test-team',
        gatePreferences: {
          default_truth_threshold: 0.85,
          default_coverage_threshold: 0.90,
          team_review_required: true
        },
        syncWithExistingPreferences: true
      };

      const syncResult = await gatesManager.synchronizeTeamPreferences(syncData);

      expect(syncResult.synchronized).to.be.true;
      expect(syncResult.existingPreferencesPreserved).to.be.true;
      expect(syncResult.gatePreferencesAdded).to.be.true;
    });

    it('should enable collaborative threshold tuning with Byzantine validation', async function() {
      const collaborativeConfig = {
        framework: 'collaborative-tuning',
        gates: {
          implementation: [
            {
              id: 'collaborative_gate',
              name: 'Collaboratively Tuned Gate',
              criteria: {
                quality_threshold: {
                  current_value: 0.80,
                  proposed_changes: [
                    { userId: 'user1', proposedValue: 0.85, justification: 'Higher quality needed' },
                    { userId: 'user2', proposedValue: 0.82, justification: 'Gradual improvement' },
                    { userId: 'user3', proposedValue: 0.85, justification: 'Agree with user1' }
                  ],
                  collaborative_tuning: true
                }
              },
              tuning_rules: {
                require_majority_consensus: true,
                byzantine_validation_required: true,
                change_impact_analysis: true
              }
            }
          ]
        }
      };

      const result = await gatesManager.processCollaborativeThresholdTuning(collaborativeConfig, {
        requireByzantineConsensus: true,
        validateChangeImpact: true,
        enableDemocraticVoting: true
      });

      expect(result.consensus_reached).to.be.true;
      expect(result.new_threshold_value).to.equal(0.85); // Majority voted for 0.85
      expect(result.byzantine_validated).to.be.true;
      expect(result.change_impact_assessed).to.be.true;
      expect(result.participants_count).to.equal(3);
      expect(result.consensus_ratio).to.be.approximately(0.67, 0.1); // 2 out of 3 voted for 0.85
    });
  });

  describe('Performance and Optimization', function() {

    it('should optimize quality gate execution performance', async function() {
      // Configure gates with performance optimization
      const performanceConfig = {
        framework: 'performance-optimized',
        gates: {
          implementation: Array.from({ length: 20 }, (_, i) => ({
            id: `perf_gate_${i}`,
            name: `Performance Gate ${i}`,
            criteria: {
              metric: { min: 0.80 }
            },
            performance_optimization: {
              parallel_execution: true,
              caching_enabled: true,
              lazy_evaluation: true
            }
          }))
        },
        optimization_settings: {
          max_parallel_gates: 10,
          cache_duration: 300000, // 5 minutes
          enable_result_caching: true,
          enable_predictive_execution: true
        }
      };

      await gatesManager.configureQualityGates(performanceConfig);

      // Execute all gates and measure performance
      const startTime = performance.now();

      const gateExecutions = performanceConfig.gates.implementation.map(gate =>
        gatesManager.executeQualityGate({
          gateId: gate.id,
          criteria: { metric: 0.85 },
          enableOptimizations: true
        })
      );

      const results = await Promise.all(gateExecutions);
      const executionTime = performance.now() - startTime;

      expect(results).to.have.length(20);
      expect(results.every(r => r.success)).to.be.true;
      expect(executionTime).to.be.below(5000); // Should complete in under 5 seconds with optimizations

      // Verify performance optimizations were used
      const performanceMetrics = await gatesManager.getPerformanceMetrics();
      expect(performanceMetrics.parallelExecutionsUsed).to.be.greaterThan(0);
      expect(performanceMetrics.cacheHitRate).to.be.a('number');
      expect(performanceMetrics.averageGateExecutionTime).to.be.below(100); // Under 100ms per gate
    });

    it('should handle high-throughput gate executions', async function() {
      const throughputConfig = {
        framework: 'high-throughput',
        gates: {
          implementation: [
            {
              id: 'throughput_gate',
              name: 'High Throughput Gate',
              criteria: { metric: { min: 0.80 } },
              throughput_optimization: {
                batch_processing: true,
                queue_management: true,
                load_balancing: true
              }
            }
          ]
        }
      };

      await gatesManager.configureQualityGates(throughputConfig);

      // Generate high-throughput load
      const batchSize = 100;
      const batches = 5;
      const totalExecutions = batchSize * batches;

      const executionPromises = [];
      for (let batch = 0; batch < batches; batch++) {
        const batchPromises = Array.from({ length: batchSize }, (_, i) =>
          gatesManager.executeQualityGate({
            gateId: 'throughput_gate',
            executionId: `batch_${batch}_execution_${i}`,
            criteria: { metric: 0.80 + Math.random() * 0.20 },
            enableThroughputOptimization: true
          })
        );
        executionPromises.push(...batchPromises);
      }

      const startTime = performance.now();
      const results = await Promise.all(executionPromises);
      const totalTime = performance.now() - startTime;

      expect(results).to.have.length(totalExecutions);

      const successCount = results.filter(r => r.success).length;
      const successRate = successCount / totalExecutions;
      expect(successRate).to.be.at.least(0.80); // At least 80% success rate under load

      const throughputRate = totalExecutions / (totalTime / 1000); // executions per second
      expect(throughputRate).to.be.at.least(50); // At least 50 executions per second

      // Verify system remained stable under load
      const systemMetrics = await gatesManager.getSystemMetrics();
      expect(systemMetrics.errorRate).to.be.below(0.05); // Less than 5% error rate
      expect(systemMetrics.resourceUtilization).to.be.below(0.90); // Less than 90% resource utilization
    });
  });
});