#!/usr/bin/env node

/**
 * Test: Can forked sessions use z.ai provider?
 *
 * This script tests if the Claude Agent SDK can be configured to use
 * z.ai instead of Claude when forking sessions.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔬 Testing z.ai Provider Configuration for Forked Sessions\n');

// Test 1: Check SDK Options Interface
console.log('📋 Test 1: SDK Options Interface');
console.log('   Analyzing query() function signature...\n');

const sdkTypesPath = path.join(__dirname, 'node_modules/@anthropic-ai/claude-agent-sdk/sdkTypes.d.ts');
console.log(`   SDK Types Location: ${sdkTypesPath}\n`);

// Test 2: Environment Variable Configuration
console.log('📋 Test 2: Environment Variable Configuration');
console.log('   Checking for API endpoint configuration...\n');

const envVars = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '✓ Set' : '✗ Not set',
  ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL ? '✓ Set' : '✗ Not set',
  ANTHROPIC_API_URL: process.env.ANTHROPIC_API_URL ? '✓ Set' : '✗ Not set',
};

console.log('   Environment Variables:');
Object.entries(envVars).forEach(([key, value]) => {
  console.log(`   - ${key}: ${value}`);
});
console.log();

// Test 3: SDK Architecture Analysis
console.log('📋 Test 3: SDK Architecture Analysis\n');
console.log('   The Claude Agent SDK spawns a child process:');
console.log('   - Uses `pathToClaudeCodeExecutable` option');
console.log('   - Spawns: node cli.js (from SDK package)');
console.log('   - CLI process handles API communication\n');

console.log('   Key Finding: SDK is a process wrapper, NOT an API client');
console.log('   - It spawns the Claude Code CLI as a subprocess');
console.log('   - The CLI (cli.js) makes API calls internally');
console.log('   - No direct API configuration in SDK query() options\n');

// Test 4: Check if CLI supports custom API endpoints
console.log('📋 Test 4: CLI API Configuration\n');
console.log('   The spawned CLI process may respect:');
console.log('   - Environment variables (ANTHROPIC_BASE_URL)');
console.log('   - Configuration files (~/.claude/config.json)');
console.log('   - CLI flags (if passed through extraArgs)\n');

// Test 5: Fork Session Configuration
console.log('📋 Test 5: Fork Session Options\n');
console.log('   Available fork options in SDK:');
console.log('   - forkSession: boolean (creates new session ID)');
console.log('   - resume: string (session ID to resume)');
console.log('   - resumeSessionAt: string (specific message ID)');
console.log('   - env: Record<string, string> (environment variables)');
console.log('   - extraArgs: Record<string, string> (CLI arguments)\n');

console.log('   ✅ env option allows setting environment variables!');
console.log('   ✅ extraArgs might allow custom API configuration\n');

// Test 6: Practical Test Setup
console.log('📋 Test 6: Proposed z.ai Configuration\n');

const zaiConfig = {
  prompt: 'Test prompt for z.ai',
  options: {
    forkSession: true,
    env: {
      ...process.env,
      ANTHROPIC_BASE_URL: 'https://api.z.ai',  // z.ai API endpoint
      ANTHROPIC_API_KEY: process.env.ZAI_API_KEY || 'zai-key-here',
    },
    // CLI might respect these environment variables
  }
};

console.log('   Configuration:');
console.log(JSON.stringify(zaiConfig, null, 2));
console.log();

// Results Summary
console.log('═══════════════════════════════════════════════════════════\n');
console.log('📊 FINDINGS SUMMARY\n');
console.log('═══════════════════════════════════════════════════════════\n');

const findings = {
  providerConfigAvailable: false,
  configOptions: ['env', 'extraArgs', 'executable', 'pathToClaudeCodeExecutable'],
  zaiCompatible: 'CONDITIONAL',
  reasoning: [
    'SDK spawns Claude Code CLI as subprocess (not direct API client)',
    'No direct baseURL option in SDK query() function',
    'CLI process may respect ANTHROPIC_BASE_URL environment variable',
    'Can pass env variables through options.env parameter',
    'Z.ai compatibility depends on CLI respecting custom API endpoints'
  ],
  testResults: 'NO ACTUAL TEST RUN (requires valid z.ai API key)',
  recommendation: [
    '✅ Pass custom API endpoint via env.ANTHROPIC_BASE_URL',
    '✅ Set z.ai API key in env.ANTHROPIC_API_KEY',
    '⚠️  Verify Claude CLI respects these environment variables',
    '⚠️  z.ai API must be compatible with Anthropic API format',
    '💡 Alternative: Bypass SDK and fork using custom API client'
  ]
};

console.log('🔍 Provider Configuration Available:', findings.providerConfigAvailable);
console.log('   (No direct baseURL option in SDK)\n');

console.log('🔧 Config Options:', findings.configOptions.join(', '));
console.log();

console.log('✅ z.ai Compatible:', findings.zaiCompatible);
console.log();

console.log('📝 Reasoning:');
findings.reasoning.forEach((reason, i) => {
  console.log(`   ${i + 1}. ${reason}`);
});
console.log();

console.log('🧪 Test Results:', findings.testResults);
console.log();

console.log('💡 Recommendation:');
findings.recommendation.forEach((rec, i) => {
  console.log(`   ${i + 1}. ${rec}`);
});
console.log();

console.log('═══════════════════════════════════════════════════════════\n');

console.log('📋 Example Code for z.ai Fork:\n');

const exampleCode = `
import { query } from '@anthropic-ai/claude-agent-sdk';

// Fork session with z.ai provider
const forkedSession = query({
  prompt: 'Analyze this code',
  options: {
    forkSession: true,
    resume: parentSessionId,
    env: {
      ...process.env,
      ANTHROPIC_BASE_URL: 'https://api.z.ai',
      ANTHROPIC_API_KEY: process.env.ZAI_API_KEY,
    },
    // CLI will use these environment variables when making API calls
  }
});

for await (const message of forkedSession) {
  console.log(message);
}
`;

console.log(exampleCode);

console.log('⚠️  IMPORTANT CAVEATS:\n');
console.log('   1. This assumes Claude CLI respects ANTHROPIC_BASE_URL');
console.log('   2. z.ai API must match Anthropic\'s API format');
console.log('   3. Requires testing with actual z.ai credentials');
console.log('   4. May need z.ai-specific headers or authentication\n');

console.log('🎯 CONCLUSION:\n');
console.log('   SESSION FORKING WITH Z.AI: POTENTIALLY POSSIBLE');
console.log('   METHOD: Environment variable injection via options.env');
console.log('   CONFIDENCE: MEDIUM (requires validation with real API)\n');

console.log('   Next steps:');
console.log('   - Obtain z.ai API key and endpoint');
console.log('   - Test if Claude CLI respects ANTHROPIC_BASE_URL');
console.log('   - Verify z.ai API compatibility with Anthropic format');
console.log('   - Implement fallback if SDK doesn\'t support custom endpoints\n');

// Export findings for programmatic use
const resultJson = JSON.stringify(findings, null, 2);
console.log('📄 JSON Results:\n');
console.log(resultJson);
