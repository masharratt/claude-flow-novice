#!/usr/bin/env node

/**
 * CFN Loop Command Integration Tests
 * Tests registration and execution through the slash command registry
 */

import { describe, it, expect } from '@jest/globals';
import { globalRegistry } from '../../../src/slash-commands/register-all-commands.js';

describe('CFN Loop Integration', () => {
  describe('Command Registration', () => {
    it('should register cfn-loop command', () => {
      const commands = globalRegistry.listCommands();
      const cfnCommand = commands.find(cmd => cmd.name === 'cfn-loop');

      expect(cfnCommand).toBeDefined();
      expect(cfnCommand.description).toContain('3-loop');
      expect(cfnCommand.usage).toContain('/cfn-loop');
    });

    it('should register cfn alias', () => {
      const help = globalRegistry.getHelp('cfn');
      expect(help.success).toBe(true);
      expect(help.help.name).toBe('cfn-loop');
    });

    it('should register loop alias', () => {
      const help = globalRegistry.getHelp('loop');
      expect(help.success).toBe(true);
      expect(help.help.name).toBe('cfn-loop');
    });
  });

  describe('Command Execution', () => {
    it('should execute cfn-loop command through registry', async () => {
      const result = await globalRegistry.execute('/cfn-loop Implement JWT auth');

      expect(result.success).toBe(true);
      expect(result.command).toBe('cfn-loop');
      expect(result.result.task).toBe('Implement JWT auth');
      expect(result.result.prompt).toBeDefined();
    });

    it('should execute via cfn alias', async () => {
      const result = await globalRegistry.execute('/cfn Build API');

      expect(result.success).toBe(true);
      expect(result.command).toBe('cfn-loop');
      expect(result.result.task).toBe('Build API');
    });

    it('should execute via loop alias', async () => {
      const result = await globalRegistry.execute('/loop Fix bug');

      expect(result.success).toBe(true);
      expect(result.command).toBe('cfn-loop');
      expect(result.result.task).toBe('Fix bug');
    });

    it('should handle command with options', async () => {
      const result = await globalRegistry.execute(
        '/cfn-loop Refactor code --phase=refactoring --max-loop2=3'
      );

      expect(result.success).toBe(true);
      expect(result.result.phase).toBe('refactoring');
      expect(result.result.config.maxLoop2).toBe(3);
    });

    it('should return error when no task provided', async () => {
      const result = await globalRegistry.execute('/cfn-loop');

      expect(result.success).toBe(true); // Command executes but returns error result
      expect(result.result.success).toBe(false);
      expect(result.result.error).toContain('Task description required');
    });
  });

  describe('Help System', () => {
    it('should provide help for cfn-loop command', () => {
      const help = globalRegistry.getHelp('cfn-loop');

      expect(help.success).toBe(true);
      expect(help.help.name).toBe('cfn-loop');
      expect(help.help.usage).toBeDefined();
      expect(help.help.examples).toBeDefined();
      expect(Array.isArray(help.help.examples)).toBe(true);
    });

    it('should include cfn-loop in global help text', () => {
      const helpText = globalRegistry.generateHelpText();

      expect(helpText).toContain('cfn-loop');
      expect(helpText).toContain('3-loop');
      expect(helpText).toContain('/cfn');
      expect(helpText).toContain('/loop');
    });
  });

  describe('Prompt Generation', () => {
    it('should generate comprehensive prompt with all loops', async () => {
      const result = await globalRegistry.execute('/cfn-loop Test task');
      const prompt = result.result.prompt;

      // Check Loop 3 content
      expect(prompt).toContain('LOOP 3');
      expect(prompt).toContain('Primary Swarm');
      expect(prompt).toContain('mcp__claude-flow-novice__swarm_init');
      expect(prompt).toContain('confidence');

      // Check Loop 2 content
      expect(prompt).toContain('LOOP 2');
      expect(prompt).toContain('Consensus');
      expect(prompt).toContain('Byzantine');
      expect(prompt).toContain('validator');

      // Check Loop 1 content
      expect(prompt).toContain('LOOP 1');
      expect(prompt).toContain('Phase Completion');
      expect(prompt).toContain('Next Steps');

      // Check execution checklist
      expect(prompt).toContain('EXECUTION CHECKLIST');
      expect(prompt).toContain('Enhanced post-edit hooks');
    });

    it('should include proper memory namespace', async () => {
      const result = await globalRegistry.execute('/cfn-loop Task --phase=testing');

      expect(result.result.memoryNamespace).toBe('cfn-loop/testing/iteration-0');
      expect(result.result.prompt).toContain('cfn-loop/testing');
    });

    it('should adjust agent count based on complexity', async () => {
      const simpleResult = await globalRegistry.execute('/cfn-loop Fix bug');
      expect(simpleResult.result.config.agentCount).toBe(3);

      const complexResult = await globalRegistry.execute('/cfn-loop Security audit');
      expect(complexResult.result.config.agentCount).toBe(10);

      const enterpriseResult = await globalRegistry.execute('/cfn-loop Enterprise platform');
      expect(enterpriseResult.result.config.agentCount).toBe(15);
    });

    it('should use appropriate topology for agent count', async () => {
      const meshResult = await globalRegistry.execute('/cfn-loop Implement feature');
      expect(meshResult.result.config.topology).toBe('mesh');

      const hierarchicalResult = await globalRegistry.execute('/cfn-loop Architecture redesign');
      expect(hierarchicalResult.result.config.topology).toBe('hierarchical');
    });
  });
});
