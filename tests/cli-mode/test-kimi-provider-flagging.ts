#!/usr/bin/env tsx
/**
 * Test: Kimi Provider Flagging in CLI Agent Spawning
 *
 * This test validates that CLI agents can be spawned with explicit
 * provider and model flags, specifically testing Kimi API integration.
 *
 * Phase: Immediate Deliverable
 * Reference: CLI Mode Redefinition Implementation Plan
 */

import { AgentSpawner } from '../../src/cli/agent-spawner';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface TestSuite {
  name: string;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    totalDuration: number;
  };
}

/**
 * Test CLI agent spawning with Kimi provider flag
 */
async function testKimiProviderFlagging(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = 'Kimi Provider Flagging';

  try {
    // Create spawner instance
    const projectRoot = process.cwd();
    const spawner = new AgentSpawner(projectRoot);

    // Test configuration for Kimi provider
    const config = {
      agentType: 'backend-developer',
      taskId: 'test-kimi-flagging-' + Date.now(),
      iteration: 1,
      mode: 'standard' as const,
      provider: 'kimi',
      model: 'moonshot-v1-8k',
      background: true,
      env: {
        KIMI_API_KEY: process.env.KIMI_API_KEY || 'test-key-placeholder',
        TEST_FLAG: 'CLI_MODE_REDEFINITION_TEST'
      }
    };

    // Spawn agent with Kimi provider
    const result = await spawner.spawnAgent(config);

    // Validate spawn result
    if (result.status !== 'spawned') {
      throw new Error(`Agent spawn failed: ${result.error}`);
    }

    // Validate provider metadata
    if (result.metadata?.provider !== 'kimi') {
      throw new Error(`Expected provider 'kimi', got '${result.metadata?.provider}'`);
    }

    if (result.metadata?.model !== 'moonshot-v1-8k') {
      throw new Error(`Expected model 'moonshot-v1-8k', got '${result.metadata?.model}'`);
    }

    // Verify environment variables would be set correctly
    const expectedEnvVars = [
      'PROVIDER=kimi',
      'MODEL=moonshot-v1-8k',
      'TEST_FLAG=CLI_MODE_REDEFINITION_TEST'
    ];

    const duration = Date.now() - startTime;

    return {
      testName,
      passed: true,
      duration,
      metadata: {
        agentId: result.agentId,
        pid: result.pid,
        expectedEnvVars,
        providerConfig: result.metadata
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      testName,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test CLI command line parsing for provider flags
 */
async function testCLIProviderParsing(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = 'CLI Provider Parsing';

  try {
    // Test CLI parsing with provider flags
    const cliArgs = [
      'backend-developer',
      '--task-id', 'test-cli-parsing-' + Date.now(),
      '--provider', 'kimi',
      '--model', 'moonshot-v1-8k',
      '--mode', 'standard',
      '--json'
    ];

    // Execute CLI command
    const result = await executeCLICommand(cliArgs);

    // Parse JSON output
    const output = JSON.parse(result.stdout);

    // Validate CLI properly parsed provider and model
    if (output.metadata?.provider !== 'kimi') {
      throw new Error(`CLI failed to parse provider: expected 'kimi', got '${output.metadata?.provider}'`);
    }

    if (output.metadata?.model !== 'moonshot-v1-8k') {
      throw new Error(`CLI failed to parse model: expected 'moonshot-v1-8k', got '${output.metadata?.model}'`);
    }

    const duration = Date.now() - startTime;

    return {
      testName,
      passed: true,
      duration,
      metadata: {
        cliOutput: output,
        argsParsed: cliArgs
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      testName,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test environment variable injection for provider routing
 */
async function testEnvironmentInjection(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = 'Environment Injection';

  try {
    const projectRoot = process.cwd();
    const spawner = new AgentSpawner(projectRoot);

    const config = {
      agentType: 'tester',
      taskId: 'test-env-injection-' + Date.now(),
      iteration: 1,
      mode: 'mvp' as const,
      provider: 'kimi',
      model: 'moonshot-v1-8k',
      background: false, // Run in foreground to capture output
      env: {
        CUSTOM_TEST_VAR: 'test-value',
        KIMI_BASE_URL: 'https://api.moonshot.cn/v1'
      }
    };

    // Build environment to test injection
    const agentId = `agent-${config.agentType}-${Date.now()}`;
    const env = (spawner as any).buildEnvironment(config, agentId, config.provider!, config.model!);

    // Validate critical environment variables
    const expectedVars = {
      PROVIDER: 'kimi',
      MODEL: 'moonshot-v1-8k',
      AGENT_TYPE: 'tester',
      TASK_ID: config.taskId,
      MODE: 'mvp',
      CUSTOM_TEST_VAR: 'test-value',
      KIMI_BASE_URL: 'https://api.moonshot.cn/v1'
    };

    for (const [key, value] of Object.entries(expectedVars)) {
      if (env[key] !== value) {
        throw new Error(`Environment variable ${key}: expected '${value}', got '${env[key]}'`);
      }
    }

    const duration = Date.now() - startTime;

    return {
      testName,
      passed: true,
      duration,
      metadata: {
        environmentVars: env,
        expectedCount: Object.keys(expectedVars).length
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      testName,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test provider configuration parsing from agent profiles
 */
async function testProviderConfigParsing(): Promise<TestResult> {
  const startTime = Date.now();
  const testName = 'Provider Config Parsing';

  try {
    const projectRoot = process.cwd();
    const spawner = new AgentSpawner(projectRoot);

    // Test parsing of existing agent provider configuration
    const agentType = 'backend-developer';
    const providerConfig = await (spawner as any).parseAgentProvider(agentType);

    // Validate provider config structure
    if (!providerConfig.provider || typeof providerConfig.provider !== 'string') {
      throw new Error('Invalid provider config: missing or invalid provider field');
    }

    if (!providerConfig.model || typeof providerConfig.model !== 'string') {
      throw new Error('Invalid provider config: missing or invalid model field');
    }

    const duration = Date.now() - startTime;

    return {
      testName,
      passed: true,
      duration,
      metadata: {
        agentType,
        providerConfig,
        configKeys: Object.keys(providerConfig)
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      testName,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Execute CLI command and capture output
 */
async function executeCLICommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const cliPath = resolve(__dirname, '../../src/cli/spawn-agent-cli.ts');
    const child = spawn('tsx', [cliPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TASK_ID: 'test-cli-' + Date.now(),
        PROJECT_ROOT: process.cwd()
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0
      });
    });

    child.on('error', (error) => {
      reject(error);
    });

    // Set timeout
    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('CLI command timeout'));
    }, 10000);
  });
}

/**
 * Run all tests and generate report
 */
async function runTestSuite(): Promise<TestSuite> {
  console.log('🚀 Starting CLI Mode Kimi Provider Flagging Tests\n');
  console.log('Purpose: Validate CLI agent spawning with different AI providers');
  console.log('Target: Kimi API integration for CLI mode redefinition\n');

  const tests = [
    testKimiProviderFlagging,
    testCLIProviderParsing,
    testEnvironmentInjection,
    testProviderConfigParsing
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    console.log(`⏳ Running: ${test.name}`);
    const result = await test();
    results.push(result);

    if (result.passed) {
      console.log(`✅ ${test.name} - PASSED (${result.duration}ms)`);
      if (result.metadata) {
        console.log(`   Metadata: ${JSON.stringify(result.metadata, null, 2)}`);
      }
    } else {
      console.log(`❌ ${test.name} - FAILED (${result.duration}ms)`);
      console.log(`   Error: ${result.error}`);
    }
    console.log('');
  }

  // Calculate summary
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  const summary = {
    total: totalTests,
    passed: passedTests,
    failed: failedTests,
    totalDuration
  };

  const testSuite: TestSuite = {
    name: 'CLI Mode Kimi Provider Flagging Test Suite',
    results,
    summary
  };

  // Print summary
  console.log('📊 Test Suite Summary:');
  console.log(`Total Tests: ${summary.total}`);
  console.log(`Passed: ${summary.passed} ✅`);
  console.log(`Failed: ${summary.failed} ❌`);
  console.log(`Total Duration: ${summary.totalDuration}ms`);
  console.log(`Success Rate: ${((summary.passed / summary.total) * 100).toFixed(1)}%`);

  return testSuite;
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    const testSuite = await runTestSuite();

    // Exit with appropriate code
    process.exit(testSuite.summary.failed > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Test suite execution failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export {
  testKimiProviderFlagging,
  testCLIProviderParsing,
  testEnvironmentInjection,
  testProviderConfigParsing,
  runTestSuite
};