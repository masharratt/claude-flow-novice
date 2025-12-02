/**
 * Pattern Manager Test Suite
 * Phase 1 Sprint 3: Pattern Schema & Knowledge Store
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { PatternManager } from '../pattern-manager';
import {
  Pattern,
  PatternEvidence,
  PatternLifecycle,
  isDiscoveryPattern,
  isValidationPattern,
  isPromotedPattern,
  isArchivedPattern,
} from '../../types';

describe('PatternManager', () => {
  let patternManager: PatternManager;
  const testKnowledgeStorePath = path.join(__dirname, '../../knowledge-store');

  beforeEach(() => {
    patternManager = new PatternManager({
      knowledgeStorePath: testKnowledgeStorePath,
      verbose: false,
      autoSave: false,
      validateOnLoad: true,
    });
  });

  describe('Pattern Loading', () => {
    it('should load patterns from seed files', async () => {
      const count = await patternManager.loadPatterns();

      expect(count).toBeGreaterThan(0);
      expect(patternManager.getPatternCount()).toBe(count);
    });

    it('should load content patterns from seed file', async () => {
      const seedPath = path.join(
        testKnowledgeStorePath,
        'seeds',
        'content-patterns-seeds.yaml'
      );

      const count = await patternManager.loadPatterns([seedPath]);

      expect(count).toBeGreaterThan(0);

      const contentPatterns = patternManager.queryPatterns({ type: 'content' });
      expect(contentPatterns.length).toBeGreaterThan(0);
    });

    it('should load technical patterns from seed file', async () => {
      const seedPath = path.join(
        testKnowledgeStorePath,
        'seeds',
        'technical-patterns-seeds.yaml'
      );

      const count = await patternManager.loadPatterns([seedPath]);

      expect(count).toBeGreaterThan(0);

      const technicalPatterns = patternManager.queryPatterns({ type: 'technical' });
      expect(technicalPatterns.length).toBeGreaterThan(0);
    });

    it('should load algorithm patterns from seed file', async () => {
      const seedPath = path.join(
        testKnowledgeStorePath,
        'seeds',
        'algorithm-intelligence-seeds.yaml'
      );

      const count = await patternManager.loadPatterns([seedPath]);

      expect(count).toBeGreaterThan(0);

      const algorithmPatterns = patternManager.queryPatterns({ type: 'algorithm' });
      expect(algorithmPatterns.length).toBeGreaterThan(0);
    });

    it('should parse Date fields correctly', async () => {
      await patternManager.loadPatterns();

      const patterns = patternManager.getAllPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      const pattern = patterns[0];
      expect(pattern.createdAt).toBeInstanceOf(Date);
      expect(pattern.updatedAt).toBeInstanceOf(Date);
      expect(pattern.evidence[0].capturedAt).toBeInstanceOf(Date);
    });
  });

  describe('Pattern Validation', () => {
    beforeEach(async () => {
      await patternManager.loadPatterns();
    });

    it('should validate promoted patterns have confidence >= 0.80', () => {
      const promotedPatterns = patternManager.getPatternsByLifecycle('promoted');

      for (const pattern of promotedPatterns) {
        expect(pattern.confidence).toBeGreaterThanOrEqual(0.80);
      }
    });

    it('should validate all patterns have required fields', () => {
      const allPatterns = patternManager.getAllPatterns();

      for (const pattern of allPatterns) {
        expect(pattern.id).toBeTruthy();
        expect(pattern.type).toBeTruthy();
        expect(pattern.category).toBeTruthy();
        expect(pattern.name).toBeTruthy();
        expect(pattern.description).toBeTruthy();
        expect(pattern.confidence).toBeGreaterThanOrEqual(0);
        expect(pattern.confidence).toBeLessThanOrEqual(1);
        expect(pattern.lifecycle).toBeTruthy();
        expect(pattern.evidence).toBeInstanceOf(Array);
        expect(pattern.evidence.length).toBeGreaterThan(0);
      }
    });

    it('should validate archived patterns have archival metadata', () => {
      const archivedPatterns = patternManager.getPatternsByLifecycle('archived');

      for (const pattern of archivedPatterns) {
        // Note: Current seeds may not have archived patterns
        if (archivedPatterns.length > 0) {
          expect(pattern.archivedReason).toBeTruthy();
          expect(pattern.archivedAt).toBeInstanceOf(Date);
        }
      }
    });

    it('should detect validation errors for invalid patterns', () => {
      const invalidPattern: Pattern = {
        id: 'test-invalid',
        type: 'content',
        category: 'test',
        name: 'Invalid Pattern',
        description: 'Test pattern',
        confidence: 1.5, // Invalid: > 1.0
        lifecycle: 'promoted',
        evidence: [], // Invalid: promoted pattern needs evidence
        metadata: {
          applicability: {
            contentTypes: [],
            industries: [],
          },
          performance: {
            successRate: 0,
            totalApplications: 0,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
      };

      const validation = patternManager.validatePattern(invalidPattern);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Pattern Querying', () => {
    beforeEach(async () => {
      await patternManager.loadPatterns();
    });

    it('should query patterns by type', () => {
      const contentPatterns = patternManager.queryPatterns({ type: 'content' });
      const technicalPatterns = patternManager.queryPatterns({ type: 'technical' });
      const algorithmPatterns = patternManager.queryPatterns({ type: 'algorithm' });

      expect(contentPatterns.length).toBeGreaterThan(0);
      expect(technicalPatterns.length).toBeGreaterThan(0);
      expect(algorithmPatterns.length).toBeGreaterThan(0);

      // Verify all returned patterns match the type
      contentPatterns.forEach((p) => expect(p.type).toBe('content'));
      technicalPatterns.forEach((p) => expect(p.type).toBe('technical'));
      algorithmPatterns.forEach((p) => expect(p.type).toBe('algorithm'));
    });

    it('should query patterns by category', () => {
      const titleTagPatterns = patternManager.queryPatterns({ category: 'title-tags' });
      const schemaPatterns = patternManager.queryPatterns({ category: 'schema-markup' });

      expect(titleTagPatterns.length).toBeGreaterThan(0);
      expect(schemaPatterns.length).toBeGreaterThan(0);

      titleTagPatterns.forEach((p) => expect(p.category).toBe('title-tags'));
      schemaPatterns.forEach((p) => expect(p.category).toBe('schema-markup'));
    });

    it('should query patterns by minimum confidence', () => {
      const highConfidencePatterns = patternManager.queryPatterns({ minConfidence: 0.80 });

      expect(highConfidencePatterns.length).toBeGreaterThan(0);
      highConfidencePatterns.forEach((p) => {
        expect(p.confidence).toBeGreaterThanOrEqual(0.80);
      });
    });

    it('should query patterns by lifecycle state', () => {
      const discoveryPatterns = patternManager.queryPatterns({ lifecycle: 'discovery' });
      const validationPatterns = patternManager.queryPatterns({ lifecycle: 'validation' });
      const promotedPatterns = patternManager.queryPatterns({ lifecycle: 'promoted' });

      // Verify lifecycle states
      discoveryPatterns.forEach((p) => expect(p.lifecycle).toBe('discovery'));
      validationPatterns.forEach((p) => expect(p.lifecycle).toBe('validation'));
      promotedPatterns.forEach((p) => expect(p.lifecycle).toBe('promoted'));
    });

    it('should query patterns by keywords', () => {
      const patterns = patternManager.queryPatterns({ keywords: ['faq', 'schema'] });

      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should limit query results', () => {
      const limitedPatterns = patternManager.queryPatterns({ limit: 3 });

      expect(limitedPatterns.length).toBeLessThanOrEqual(3);
    });

    it('should sort patterns by confidence descending', () => {
      const patterns = patternManager.queryPatterns({});

      for (let i = 1; i < patterns.length; i++) {
        expect(patterns[i - 1].confidence).toBeGreaterThanOrEqual(patterns[i].confidence);
      }
    });
  });

  describe('Pattern Confidence Updates', () => {
    beforeEach(async () => {
      await patternManager.loadPatterns();
    });

    it('should update pattern confidence with new evidence', () => {
      const discoveryPatterns = patternManager.getPatternsByLifecycle('discovery');
      if (discoveryPatterns.length === 0) {
        // Skip if no discovery patterns available
        return;
      }

      const pattern = discoveryPatterns[0];
      const previousConfidence = pattern.confidence;

      const newEvidence: PatternEvidence = {
        source: 'test-article-123',
        outcome: 'success',
        capturedAt: new Date(),
        metrics: { ctr: 0.25, position: 3.5 },
        notes: 'Test evidence',
      };

      const result = patternManager.updateConfidence(pattern.id, newEvidence);

      expect(result.patternId).toBe(pattern.id);
      expect(result.previousConfidence).toBe(previousConfidence);
      expect(result.newEvidence).toEqual(newEvidence);

      // Get updated pattern
      const updatedPattern = patternManager.getPattern(pattern.id);
      expect(updatedPattern?.evidence).toContainEqual(newEvidence);
    });

    it('should transition from discovery to validation at confidence >= 0.50', () => {
      const discoveryPatterns = patternManager.getPatternsByLifecycle('discovery');
      if (discoveryPatterns.length === 0) {
        return;
      }

      const pattern = discoveryPatterns[0];

      // Add enough successful evidence to reach validation threshold
      for (let i = 0; i < 5; i++) {
        const evidence: PatternEvidence = {
          source: `test-success-${i}`,
          outcome: 'success',
          capturedAt: new Date(),
        };

        const result = patternManager.updateConfidence(pattern.id, evidence);

        if (result.newConfidence >= 0.50 && result.lifecycleChanged) {
          expect(result.newLifecycle).toBe('validation');
          break;
        }
      }
    });

    it('should archive patterns with confidence < 0.30', () => {
      const validationPatterns = patternManager.getPatternsByLifecycle('validation');
      if (validationPatterns.length === 0) {
        return;
      }

      // Find a pattern with moderate confidence
      const pattern = validationPatterns.find((p) => p.confidence < 0.70);
      if (!pattern) {
        return;
      }

      // Add failure evidence to drop confidence
      for (let i = 0; i < 10; i++) {
        const evidence: PatternEvidence = {
          source: `test-failure-${i}`,
          outcome: 'failure',
          capturedAt: new Date(),
        };

        const result = patternManager.updateConfidence(pattern.id, evidence);

        if (result.newConfidence < 0.30 && result.lifecycleChanged) {
          expect(result.newLifecycle).toBe('archived');
          break;
        }
      }
    });
  });

  describe('Pattern Promotion', () => {
    beforeEach(async () => {
      await patternManager.loadPatterns();
    });

    it('should promote discovery pattern to validation', () => {
      const discoveryPatterns = patternManager.getPatternsByLifecycle('discovery');
      if (discoveryPatterns.length === 0) {
        return;
      }

      const pattern = discoveryPatterns.find((p) => p.confidence >= 0.50);
      if (!pattern) {
        return;
      }

      const result = patternManager.promotePattern(pattern.id);

      expect(result.success).toBe(true);
      expect(result.previousLifecycle).toBe('discovery');
      expect(result.newLifecycle).toBe('validation');
      expect(result.pattern?.lifecycle).toBe('validation');
    });

    it('should promote validation pattern to promoted', () => {
      const validationPatterns = patternManager.getPatternsByLifecycle('validation');
      if (validationPatterns.length === 0) {
        return;
      }

      const pattern = validationPatterns.find((p) => p.confidence >= 0.80);
      if (!pattern) {
        return;
      }

      const result = patternManager.promotePattern(pattern.id);

      expect(result.success).toBe(true);
      expect(result.previousLifecycle).toBe('validation');
      expect(result.newLifecycle).toBe('promoted');
      expect(result.pattern?.lifecycle).toBe('promoted');
    });

    it('should reject promotion without sufficient confidence', () => {
      const discoveryPatterns = patternManager.getPatternsByLifecycle('discovery');
      if (discoveryPatterns.length === 0) {
        return;
      }

      const pattern = discoveryPatterns.find((p) => p.confidence < 0.50);
      if (!pattern) {
        return;
      }

      const result = patternManager.promotePattern(pattern.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain('confidence');
    });

    it('should allow forced promotion', () => {
      const discoveryPatterns = patternManager.getPatternsByLifecycle('discovery');
      if (discoveryPatterns.length === 0) {
        return;
      }

      const pattern = discoveryPatterns.find((p) => p.confidence < 0.50);
      if (!pattern) {
        return;
      }

      const result = patternManager.promotePattern(pattern.id, true);

      expect(result.success).toBe(true);
      expect(result.newLifecycle).toBe('validation');
    });
  });

  describe('Pattern Archiving', () => {
    beforeEach(async () => {
      await patternManager.loadPatterns();
    });

    it('should archive pattern with reason', () => {
      const validationPatterns = patternManager.getPatternsByLifecycle('validation');
      if (validationPatterns.length === 0) {
        return;
      }

      const pattern = validationPatterns[0];
      const reason = 'Test archival - pattern no longer relevant';

      const success = patternManager.archivePattern(pattern.id, reason);

      expect(success).toBe(true);

      const archivedPattern = patternManager.getPattern(pattern.id);
      expect(archivedPattern?.lifecycle).toBe('archived');
      expect(archivedPattern?.archivedReason).toBe(reason);
      expect(archivedPattern?.archivedAt).toBeInstanceOf(Date);
    });
  });

  describe('Type Guards', () => {
    beforeEach(async () => {
      await patternManager.loadPatterns();
    });

    it('should correctly identify pattern lifecycle states', () => {
      const allPatterns = patternManager.getAllPatterns();

      for (const pattern of allPatterns) {
        const isDiscovery = isDiscoveryPattern(pattern);
        const isValidation = isValidationPattern(pattern);
        const isPromoted = isPromotedPattern(pattern);
        const isArchived = isArchivedPattern(pattern);

        // Exactly one should be true
        const count = [isDiscovery, isValidation, isPromoted, isArchived].filter(
          (v) => v
        ).length;
        expect(count).toBe(1);

        // Verify matches actual lifecycle
        if (pattern.lifecycle === 'discovery') expect(isDiscovery).toBe(true);
        if (pattern.lifecycle === 'validation') expect(isValidation).toBe(true);
        if (pattern.lifecycle === 'promoted') expect(isPromoted).toBe(true);
        if (pattern.lifecycle === 'archived') expect(isArchived).toBe(true);
      }
    });
  });
});
