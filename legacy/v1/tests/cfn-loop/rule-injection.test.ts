import { describe, it, expect } from '@jest/globals';
import {
  injectCFNRulesAtTransition,
  enrichInstructionFile,
} from '../../src/cfn-loop/inject-rules-at-transition.js';
import { CFNTransitionPoint } from '../../src/cfn-loop/transition-points.js';
import { writeFile } from 'fs/promises';

describe('CFN Rule Injection', () => {
  describe('injectCFNRulesAtTransition', () => {
    it('should inject CFN rules at Loop 3 relaunch', async () => {
      const context = {
        point: CFNTransitionPoint.LOOP_3_RELAUNCH,
        phaseId: 'phase-auth',
        mode: 'standard' as const,
        iteration: 3,
        maxIterations: 10,
        lastConsensus: 0.82,
        consensusThreshold: 0.9,
        concerns: ['Missing edge case tests', 'Error handling too generic'],
      };

      const result = await injectCFNRulesAtTransition(context);

      expect(result).toContain('CFN LOOP RULES');
      expect(result).toContain('CURRENT CONTEXT');
      expect(result).toContain('Mode: STANDARD');
      expect(result).toContain('Iteration: 3/10');
      expect(result).toContain('Last Consensus: 0.82');
      expect(result).toContain('DECISION FRAMEWORK REMINDER');
      expect(result).toContain('LOOP IMMEDIATELY');
      expect(result).toContain('Missing edge case tests');
    });

    it('should enforce ESCALATE reminder at max iterations', async () => {
      const context = {
        point: CFNTransitionPoint.LOOP_4_DECISION,
        phaseId: 'phase-auth',
        mode: 'mvp' as const,
        iteration: 5,
        maxIterations: 5,
        lastConsensus: 0.75,
        consensusThreshold: 0.85,
      };

      const result = await injectCFNRulesAtTransition(context);

      expect(result).toContain('MAX ITERATIONS REACHED');
      expect(result).toContain('MUST ESCALATE');
    });

    it('should suggest PROCEED when above threshold', async () => {
      const context = {
        point: CFNTransitionPoint.LOOP_2_START,
        phaseId: 'phase-api',
        mode: 'enterprise' as const,
        iteration: 2,
        maxIterations: 15,
        lastConsensus: 0.96,
        consensusThreshold: 0.95,
      };

      const result = await injectCFNRulesAtTransition(context);

      expect(result).toContain('ABOVE THRESHOLD');
      expect(result).toContain('PROCEED TO NEXT PHASE');
    });
  });

  describe('enrichInstructionFile', () => {
    it('should append CFN rules to instruction file', async () => {
      const tempPath = '/tmp/test-instruction-enrichment.md';
      const original = '# Test Instructions\n\nOriginal content.';
      await writeFile(tempPath, original);

      const context = {
        point: CFNTransitionPoint.LOOP_3_RELAUNCH,
        phaseId: 'test-phase',
        mode: 'standard' as const,
        iteration: 1,
        maxIterations: 10,
        consensusThreshold: 0.9,
      };

      const enriched = await enrichInstructionFile(tempPath, context);

      expect(enriched).toContain('Test Instructions');
      expect(enriched).toContain('Original content');
      expect(enriched).toContain('CFN LOOP RULES');
      expect(enriched).toContain('CURRENT CONTEXT');
    });

    it('should handle file read errors gracefully', async () => {
      const nonExistentPath = '/path/to/non/existent/file.md';

      const context = {
        point: CFNTransitionPoint.LOOP_3_RELAUNCH,
        phaseId: 'error-handling-phase',
        mode: 'mvp' as const,
        iteration: 2,
        maxIterations: 5,
        consensusThreshold: 0.85,
      };

      await expect(enrichInstructionFile(nonExistentPath, context)).rejects.toThrow();
    });

    it('should handle empty instruction file', async () => {
      const emptyPath = '/tmp/empty-instruction.md';
      await writeFile(emptyPath, '');

      const context = {
        point: CFNTransitionPoint.LOOP_2_START,
        phaseId: 'empty-phase',
        mode: 'enterprise' as const,
        iteration: 1,
        maxIterations: 15,
        consensusThreshold: 0.95,
      };

      const enriched = await enrichInstructionFile(emptyPath, context);

      expect(enriched).toContain('CFN LOOP RULES');
      expect(enriched).toContain('CURRENT CONTEXT');
      expect(enriched).toContain('EMPTY INSTRUCTION FILE');
    });

    it('should limit instruction file size for very large files', async () => {
      const largePath = '/tmp/large-instruction.md';
      const largeContent = 'x'.repeat(1024 * 1024 * 10); // 10MB file
      await writeFile(largePath, largeContent);

      const context = {
        point: CFNTransitionPoint.LOOP_4_DECISION,
        phaseId: 'large-file-phase',
        mode: 'standard' as const,
        iteration: 4,
        maxIterations: 10,
        consensusThreshold: 0.9,
      };

      await expect(enrichInstructionFile(largePath, context)).rejects.toThrow('File too large');
    });
  });
});
