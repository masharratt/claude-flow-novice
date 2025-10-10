/**
 * Swarm-Based Test-to-CI/CD Pipeline Configuration
 * Comprehensive automation strategy for dynamic test generation and integration
 */
export interface SwarmTestPipelineConfig {
    swarm: {
        topology: 'hierarchical' | 'mesh' | 'ring' | 'star';
        maxAgents: number;
        coordinationStrategy: 'adaptive' | 'balanced' | 'specialized';
        sessionPersistence: boolean;
    };
    e2eGeneration: {
        mcpIntegration: {
            playwrightMcp: boolean;
            chromeMcp: boolean;
            autoScreenshots: boolean;
            networkMonitoring: boolean;
        };
        testTypes: {
            userFlows: boolean;
            regressionSuite: boolean;
            performanceTests: boolean;
            accessibilityTests: boolean;
            visualRegression: boolean;
        };
        dynamicGeneration: {
            featureBasedTests: boolean;
            swarmCoordinated: boolean;
            aiAssisted: boolean;
            contextAware: boolean;
        };
    };
    cicdIntegration: {
        githubActions: {
            enabled: boolean;
            workflows: string[];
            triggers: string[];
            environments: string[];
        };
        testExecution: {
            parallel: boolean;
            matrix: boolean;
            failFast: boolean;
            retries: number;
        };
        deployment: {
            automated: boolean;
            environments: string[];
            gates: string[];
        };
    };
    regressionTesting: {
        swarmCoordination: {
            enabled: boolean;
            agentSpecialization: boolean;
            loadBalancing: boolean;
            failureIsolation: boolean;
        };
        testSelection: {
            impactAnalysis: boolean;
            riskBasedTesting: boolean;
            changeDetection: boolean;
            smartRetries: boolean;
        };
        reporting: {
            realTime: boolean;
            aggregated: boolean;
            trendAnalysis: boolean;
            notifications: boolean;
        };
    };
    performance: {
        monitoring: {
            realTime: boolean;
            metrics: string[];
            thresholds: Record<string, number>;
            alerting: boolean;
        };
        optimization: {
            resourceAllocation: boolean;
            testParallelization: boolean;
            cacheOptimization: boolean;
            networkOptimization: boolean;
        };
        benchmarking: {
            baseline: boolean;
            comparison: boolean;
            regression: boolean;
            reporting: boolean;
        };
    };
    dataManagement: {
        fixtures: {
            dynamic: boolean;
            shared: boolean;
            cleanup: boolean;
            versioning: boolean;
        };
        environments: {
            isolation: boolean;
            reset: boolean;
            seeding: boolean;
            backup: boolean;
        };
        cleanup: {
            automated: boolean;
            scheduled: boolean;
            conditional: boolean;
            verification: boolean;
        };
    };
}
export declare const defaultSwarmTestPipelineConfig: SwarmTestPipelineConfig;
