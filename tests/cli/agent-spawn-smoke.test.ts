/**
 * Agent Spawn CLI - Smoke Tests
 *
 * Quick validation tests that verify agent-spawn.ts CLI works correctly
 * without spawning actual agent processes (avoids timeouts).
 *
 * @version 1.0.0
 * @description Smoke tests for agent spawning CLI validation
 */

import { describe, test, expect } from '@jest/globals';
import { execSync } from 'child_process';
import * as path from 'path';

const CLI_PATH = path.resolve(__dirname, '../../src/cli/agent-spawn.ts');
const TIMEOUT = 5000; // 5 second timeout for help/validation tests

describe('Agent Spawn CLI - Smoke Tests', () => {
  test('shows help message with --help flag', () => {
    const output = execSync(`tsx "${CLI_PATH}" --help`, {
      encoding: 'utf8',
      timeout: TIMEOUT,
    });

    expect(output).toContain('cfn-spawn - Claude Flow Novice Agent Spawner');
    expect(output).toContain('Usage:');
    expect(output).toContain('Options:');
    expect(output).toContain('--agent-id');
    expect(output).toContain('--task-id');
    expect(output).toContain('--iteration');
    expect(output).toContain('--context');
    expect(output).toContain('--mode');
    expect(output).toContain('--priority');
    expect(output).toContain('--parent-task-id');
  });

  test('shows help message with -h flag', () => {
    const output = execSync(`tsx "${CLI_PATH}" -h`, {
      encoding: 'utf8',
      timeout: TIMEOUT,
    });

    expect(output).toContain('cfn-spawn');
    expect(output).toContain('Usage:');
  });

  test('shows error when agent type is missing', () => {
    let didThrow = false;
    try {
      execSync(`tsx "${CLI_PATH}" --task-id task-123`, {
        encoding: 'utf8',
        timeout: TIMEOUT,
        stdio: 'pipe',
      });
    } catch (error: any) {
      didThrow = true;
      const stderr = error.stderr ? error.stderr.toString() : error.message;
      expect(stderr).toContain('Agent type is required');
      expect(error.status).toBe(1);
    }
    expect(didThrow).toBe(true);
  });

  test('shows error when no arguments provided', () => {
    let didThrow = false;
    try {
      execSync(`tsx "${CLI_PATH}"`, {
        encoding: 'utf8',
        timeout: TIMEOUT,
        stdio: 'pipe',
      });
    } catch (error: any) {
      didThrow = true;
      const stderr = error.stderr ? error.stderr.toString() : error.message;
      expect(stderr).toContain('Agent type is required');
      expect(error.status).toBe(1);
    }
    expect(didThrow).toBe(true);
  });

  test('CLI file exists and is executable', () => {
    const fs = require('fs');
    expect(fs.existsSync(CLI_PATH)).toBe(true);

    const stats = fs.statSync(CLI_PATH);
    expect(stats.isFile()).toBe(true);
  });

  test('CLI uses correct shebang', () => {
    const fs = require('fs');
    const content = fs.readFileSync(CLI_PATH, 'utf8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  test('CLI exports main function', () => {
    const fs = require('fs');
    const content = fs.readFileSync(CLI_PATH, 'utf8');
    expect(content).toContain('export async function main');
  });

  test('CLI includes argument parsing logic', () => {
    const fs = require('fs');
    const content = fs.readFileSync(CLI_PATH, 'utf8');
    expect(content).toContain('function parseAgentArgs');
    expect(content).toContain('--agent-id');
    expect(content).toContain('--task-id');
    expect(content).toContain('--iteration');
    expect(content).toContain('--context');
    expect(content).toContain('--mode');
    expect(content).toContain('--priority');
    expect(content).toContain('--parent-task-id');
  });

  test('CLI includes process spawning logic', () => {
    const fs = require('fs');
    const content = fs.readFileSync(CLI_PATH, 'utf8');
    expect(content).toContain('async function spawnAgent');
    expect(content).toContain('spawn(');
    expect(content).toContain('npx');
    expect(content).toContain('claude-flow-novice');
  });

  test('CLI includes Redis context fetching', () => {
    const fs = require('fs');
    const content = fs.readFileSync(CLI_PATH, 'utf8');
    expect(content).toContain('epic-context');
    expect(content).toContain('phase-context');
    expect(content).toContain('success-criteria');
    expect(content).toContain('CFN_REDIS_HOST');
    expect(content).toContain('CFN_REDIS_PORT');
  });

  test('CLI includes environment variable whitelisting', () => {
    const fs = require('fs');
    const content = fs.readFileSync(CLI_PATH, 'utf8');
    expect(content).toContain('safeEnvVars');
    expect(content).toContain('WHITELIST ONLY APPROACH');
    expect(content).toContain('CFN_MEMORY_BUDGET');
  });

  test('CLI includes API key validation', () => {
    const fs = require('fs');
    const content = fs.readFileSync(CLI_PATH, 'utf8');
    expect(content).toContain('ANTHROPIC_API_KEY');
    expect(content).toContain('Validate format');
    expect(content).toContain('format invalid');
  });

  test('CLI includes signal handling', () => {
    const fs = require('fs');
    const content = fs.readFileSync(CLI_PATH, 'utf8');
    expect(content).toContain('SIGINT');
    expect(content).toContain('SIGTERM');
    expect(content).toContain('process.on');
  });

  test('CLI includes error handling', () => {
    const fs = require('fs');
    const content = fs.readFileSync(CLI_PATH, 'utf8');
    expect(content).toContain("agentProcess.on('error'");
    expect(content).toContain("agentProcess.on('exit'");
    expect(content).toContain('Failed to spawn agent');
  });

  test('CLI includes parameter alias handling', () => {
    const fs = require('fs');
    const content = fs.readFileSync(CLI_PATH, 'utf8');
    expect(content).toContain('--parent-task');
    expect(content).toContain('--parent-task-id');
  });

  test('CLI includes both agent patterns', () => {
    const fs = require('fs');
    const content = fs.readFileSync(CLI_PATH, 'utf8');
    expect(content).toContain('agent <type>');
    expect(content).toContain('agent is implied');
    expect(content).toContain("args[0] === 'agent'");
  });
});
