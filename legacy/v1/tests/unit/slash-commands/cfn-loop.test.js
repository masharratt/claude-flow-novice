#!/usr/bin/env node

/**
 * CFN Loop Command Unit Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CfnLoopCommand } from '../../../src/slash-commands/cfn-loop.js';

describe('CfnLoopCommand', () => {
  let command;

  beforeEach(() => {
    command = new CfnLoopCommand();
  });

  describe('constructor', () => {
    it('should initialize with correct name and description', () => {
      expect(command.name).toBe('cfn-loop');
      expect(command.description).toContain('3-loop self-correcting');
    });
  });

  describe('parseArgs', () => {
    it('should parse task description without options', () => {
      const args = ['Implement', 'JWT', 'authentication'];
      const result = command.parseArgs(args);

      expect(result.task).toBe('Implement JWT authentication');
      expect(result.phase).toBe('default');
      expect(result.maxLoop2).toBe(5);
      expect(result.maxLoop3).toBe(10);
    });

    it('should parse task with phase option', () => {
      const args = ['Fix', 'security', 'issues', '--phase=security-audit'];
      const result = command.parseArgs(args);

      expect(result.task).toBe('Fix security issues');
      expect(result.phase).toBe('security-audit');
    });

    it('should parse task with max-loop2 option', () => {
      const args = ['Refactor', 'API', '--max-loop2=3'];
      const result = command.parseArgs(args);

      expect(result.task).toBe('Refactor API');
      expect(result.maxLoop2).toBe(3);
    });

    it('should parse task with max-loop3 option', () => {
      const args = ['Add', 'tests', '--max-loop3=15'];
      const result = command.parseArgs(args);

      expect(result.task).toBe('Add tests');
      expect(result.maxLoop3).toBe(15);
    });

    it('should parse all options together', () => {
      const args = [
        'Build',
        'REST',
        'API',
        '--phase=implementation',
        '--max-loop2=7',
        '--max-loop3=20'
      ];
      const result = command.parseArgs(args);

      expect(result.task).toBe('Build REST API');
      expect(result.phase).toBe('implementation');
      expect(result.maxLoop2).toBe(7);
      expect(result.maxLoop3).toBe(20);
    });
  });

  describe('assessComplexity', () => {
    it('should assess simple tasks', () => {
      expect(command.assessComplexity('fix small bug')).toBe('simple');
      expect(command.assessComplexity('update config')).toBe('simple');
      expect(command.assessComplexity('change variable name')).toBe('simple');
    });

    it('should assess medium tasks', () => {
      expect(command.assessComplexity('implement new feature')).toBe('medium');
      expect(command.assessComplexity('add feature for users')).toBe('medium');
      expect(command.assessComplexity('refactor module')).toBe('medium');
      expect(command.assessComplexity('create new component')).toBe('medium');
    });

    it('should assess complex tasks', () => {
      expect(command.assessComplexity('redesign architecture')).toBe('complex');
      expect(command.assessComplexity('security audit system')).toBe('complex');
      expect(command.assessComplexity('performance optimization')).toBe('complex');
    });

    it('should assess enterprise tasks', () => {
      expect(command.assessComplexity('build enterprise platform')).toBe('enterprise');
      expect(command.assessComplexity('create scalable microservices')).toBe('enterprise');
      expect(command.assessComplexity('distributed system migration')).toBe('enterprise');
    });
  });

  describe('getSwarmConfig', () => {
    it('should return config for simple complexity', () => {
      const config = command.getSwarmConfig('simple');
      expect(config.agentCount).toBe(3);
      expect(config.topology).toBe('mesh');
    });

    it('should return config for medium complexity', () => {
      const config = command.getSwarmConfig('medium');
      expect(config.agentCount).toBe(6);
      expect(config.topology).toBe('mesh');
    });

    it('should return config for complex complexity', () => {
      const config = command.getSwarmConfig('complex');
      expect(config.agentCount).toBe(10);
      expect(config.topology).toBe('hierarchical');
    });

    it('should return config for enterprise complexity', () => {
      const config = command.getSwarmConfig('enterprise');
      expect(config.agentCount).toBe(15);
      expect(config.topology).toBe('hierarchical');
    });
  });

  describe('getAgentTypes', () => {
    it('should return correct agent types for simple complexity', () => {
      const types = command.getAgentTypes('simple');
      expect(types).toEqual(['coder', 'tester', 'reviewer']);
    });

    it('should return correct agent types for medium complexity', () => {
      const types = command.getAgentTypes('medium');
      expect(types).toContain('researcher');
      expect(types).toContain('coder');
      expect(types).toContain('tester');
      expect(types).toContain('security-specialist');
    });

    it('should return correct agent types for complex complexity', () => {
      const types = command.getAgentTypes('complex');
      expect(types.length).toBeGreaterThan(6);
      expect(types).toContain('system-architect');
      expect(types).toContain('backend-dev');
      expect(types).toContain('perf-analyzer');
    });

    it('should return correct agent types for enterprise complexity', () => {
      const types = command.getAgentTypes('enterprise');
      expect(types.length).toBeGreaterThan(10);
      expect(types).toContain('devops-engineer');
      expect(types).toContain('cicd-engineer');
      expect(types).toContain('coordinator');
    });
  });

  describe('execute', () => {
    it('should return error when no task provided', async () => {
      const result = await command.execute([]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Task description required');
      expect(result.usage).toBeDefined();
    });

    it('should execute with valid task', async () => {
      const result = await command.execute(['Implement', 'JWT', 'auth']);

      expect(result.success).toBe(true);
      expect(result.task).toBe('Implement JWT auth');
      expect(result.prompt).toBeDefined();
      expect(result.config).toBeDefined();
    });

    it('should include swarm configuration in result', async () => {
      const result = await command.execute(['Build', 'API']);

      expect(result.config.agentCount).toBeDefined();
      expect(result.config.topology).toBeDefined();
      expect(result.config.complexity).toBeDefined();
      expect(result.config.maxLoop2).toBe(5);
      expect(result.config.maxLoop3).toBe(10);
    });

    it('should respect custom loop limits', async () => {
      const result = await command.execute([
        'Test',
        'task',
        '--max-loop2=3',
        '--max-loop3=8'
      ]);

      expect(result.config.maxLoop2).toBe(3);
      expect(result.config.maxLoop3).toBe(8);
    });

    it('should include memory namespace in result', async () => {
      const result = await command.execute(['Task', '--phase=testing']);

      expect(result.memoryNamespace).toContain('cfn-loop/testing');
    });

    it('should generate appropriate prompt with all loop instructions', async () => {
      const result = await command.execute(['Implement', 'feature']);

      expect(result.prompt).toContain('LOOP 3');
      expect(result.prompt).toContain('LOOP 2');
      expect(result.prompt).toContain('LOOP 1');
      expect(result.prompt).toContain('mcp__claude-flow-novice__swarm_init');
      expect(result.prompt).toContain('confidence');
      expect(result.prompt).toContain('consensus');
    });
  });

  describe('getUsage', () => {
    it('should return correct usage string', () => {
      const usage = command.getUsage();
      expect(usage).toContain('/cfn-loop');
      expect(usage).toContain('task description');
      expect(usage).toContain('--phase');
      expect(usage).toContain('--max-loop2');
      expect(usage).toContain('--max-loop3');
    });
  });

  describe('getExamples', () => {
    it('should return array of examples', () => {
      const examples = command.getExamples();
      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBeGreaterThan(0);
      expect(examples[0]).toContain('/cfn-loop');
    });
  });
});
