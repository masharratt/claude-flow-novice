/**
 * Edge Case Tracking Test Suite
 * Tests edge case detection, tracking, and reporting
 *
 * Migration from: docker/tests/test-edge-case-tracking.sh
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

interface EdgeCase {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  timestamp: Date;
  resolved: boolean;
  resolutionNotes?: string;
}

class EdgeCaseTracker {
  private cases: Map<string, EdgeCase> = new Map();
  private watchers: Set<(caseItem: EdgeCase) => void> = new Set();

  /**
   * Record an edge case
   */
  recordCase(
    id: string,
    title: string,
    description: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    category: string = 'general'
  ): EdgeCase {
    const edgeCase: EdgeCase = {
      id,
      title,
      description,
      severity,
      category,
      timestamp: new Date(),
      resolved: false
    };

    this.cases.set(id, edgeCase);
    this.notifyWatchers(edgeCase);

    return edgeCase;
  }

  /**
   * Get case by ID
   */
  getCase(id: string): EdgeCase | undefined {
    return this.cases.get(id);
  }

  /**
   * Mark case as resolved
   */
  resolveCase(id: string, notes: string = ''): boolean {
    const edgeCase = this.cases.get(id);
    if (!edgeCase) return false;

    edgeCase.resolved = true;
    edgeCase.resolutionNotes = notes;
    this.notifyWatchers(edgeCase);

    return true;
  }

  /**
   * Get all unresolved cases
   */
  getUnresolvedCases(): EdgeCase[] {
    return Array.from(this.cases.values()).filter(c => !c.resolved);
  }

  /**
   * Get cases by severity
   */
  getCasesBySeverity(severity: string): EdgeCase[] {
    return Array.from(this.cases.values()).filter(c => c.severity === severity);
  }

  /**
   * Get cases by category
   */
  getCasesByCategory(category: string): EdgeCase[] {
    return Array.from(this.cases.values()).filter(c => c.category === category);
  }

  /**
   * Get critical and unresolved cases
   */
  getCriticalUnresolved(): EdgeCase[] {
    return Array.from(this.cases.values()).filter(
      c => c.severity === 'critical' && !c.resolved
    );
  }

  /**
   * Get case statistics
   */
  getStatistics(): {
    totalCases: number;
    resolvedCases: number;
    unresolvedCases: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  } {
    const all = Array.from(this.cases.values());
    const resolved = all.filter(c => c.resolved).length;
    const unresolved = all.length - resolved;

    const bySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    const byCategory: Record<string, number> = {};

    all.forEach(c => {
      bySeverity[c.severity]++;
      byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    });

    return {
      totalCases: all.length,
      resolvedCases: resolved,
      unresolvedCases: unresolved,
      bySeverity,
      byCategory
    };
  }

  /**
   * Subscribe to case changes
   */
  watch(callback: (caseItem: EdgeCase) => void): () => void {
    this.watchers.add(callback);
    return () => this.watchers.delete(callback);
  }

  /**
   * Notify all watchers
   */
  private notifyWatchers(edgeCase: EdgeCase): void {
    this.watchers.forEach(watcher => watcher(edgeCase));
  }

  /**
   * Get duplicate cases based on similarity
   */
  findSimilarCases(id: string, threshold: number = 0.7): EdgeCase[] {
    const targetCase = this.cases.get(id);
    if (!targetCase) return [];

    return Array.from(this.cases.values()).filter(c => {
      if (c.id === id) return false;

      // Simple similarity check: same category and similar severity
      const categorySame = c.category === targetCase.category;
      const severityClose = Math.abs(
        ['low', 'medium', 'high', 'critical'].indexOf(c.severity) -
        ['low', 'medium', 'high', 'critical'].indexOf(targetCase.severity)
      ) <= 1;

      return categorySame && severityClose;
    });
  }

  /**
   * Get trend analysis
   */
  getTrendData(days: number = 7): Array<{ date: string; count: number }> {
    const now = new Date();
    const trends: Record<string, number> = {};

    Array.from(this.cases.values()).forEach(c => {
      const age = Math.floor((now.getTime() - c.timestamp.getTime()) / (1000 * 60 * 60 * 24));
      if (age <= days) {
        const dateKey = c.timestamp.toISOString().split('T')[0];
        trends[dateKey] = (trends[dateKey] || 0) + 1;
      }
    });

    return Object.entries(trends)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Clear all cases
   */
  clearAll(): void {
    this.cases.clear();
    this.watchers.clear();
  }
}

describe('Edge Case Tracking', () => {
  let tracker: EdgeCaseTracker;

  beforeEach(() => {
    tracker = new EdgeCaseTracker();
  });

  describe('Case Recording', () => {
    it('should record an edge case', () => {
      const edgeCase = tracker.recordCase('case-1', 'Test case', 'Description');

      expect(edgeCase.id).toBe('case-1');
      expect(edgeCase.title).toBe('Test case');
      expect(edgeCase.resolved).toBe(false);
    });

    it('should set severity level', () => {
      const edgeCase = tracker.recordCase('case-1', 'Critical issue', 'Description', 'critical');

      expect(edgeCase.severity).toBe('critical');
    });

    it('should set category', () => {
      const edgeCase = tracker.recordCase('case-1', 'Issue', 'Description', 'medium', 'performance');

      expect(edgeCase.category).toBe('performance');
    });

    it('should timestamp recorded case', () => {
      const before = new Date();
      const edgeCase = tracker.recordCase('case-1', 'Issue', 'Description');
      const after = new Date();

      expect(edgeCase.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(edgeCase.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Case Retrieval', () => {
    it('should get case by ID', () => {
      tracker.recordCase('case-1', 'Test case', 'Description');
      const retrieved = tracker.getCase('case-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('case-1');
    });

    it('should return undefined for non-existent case', () => {
      const retrieved = tracker.getCase('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should get unresolved cases', () => {
      tracker.recordCase('case-1', 'Unresolved 1', 'Description');
      tracker.recordCase('case-2', 'Unresolved 2', 'Description');
      const resolved = tracker.recordCase('case-3', 'Resolved', 'Description');
      tracker.resolveCase('case-3');

      const unresolved = tracker.getUnresolvedCases();
      expect(unresolved).toHaveLength(2);
      expect(unresolved.map(c => c.id)).not.toContain('case-3');
    });

    it('should get cases by severity', () => {
      tracker.recordCase('case-1', 'Critical', 'Description', 'critical');
      tracker.recordCase('case-2', 'High', 'Description', 'high');
      tracker.recordCase('case-3', 'Medium', 'Description', 'medium');

      const critical = tracker.getCasesBySeverity('critical');
      expect(critical).toHaveLength(1);
      expect(critical[0].id).toBe('case-1');
    });

    it('should get cases by category', () => {
      tracker.recordCase('case-1', 'Perf issue', 'Description', 'medium', 'performance');
      tracker.recordCase('case-2', 'Security issue', 'Description', 'high', 'security');
      tracker.recordCase('case-3', 'Perf issue 2', 'Description', 'low', 'performance');

      const perf = tracker.getCasesByCategory('performance');
      expect(perf).toHaveLength(2);
    });

    it('should get critical unresolved cases', () => {
      tracker.recordCase('case-1', 'Critical unresolved', 'Description', 'critical');
      tracker.recordCase('case-2', 'Critical resolved', 'Description', 'critical');
      tracker.resolveCase('case-2');
      tracker.recordCase('case-3', 'High unresolved', 'Description', 'high');

      const critical = tracker.getCriticalUnresolved();
      expect(critical).toHaveLength(1);
      expect(critical[0].id).toBe('case-1');
    });
  });

  describe('Case Resolution', () => {
    it('should mark case as resolved', () => {
      tracker.recordCase('case-1', 'Issue', 'Description');
      const result = tracker.resolveCase('case-1', 'Fixed with patch');

      expect(result).toBe(true);

      const resolved = tracker.getCase('case-1');
      expect(resolved?.resolved).toBe(true);
      expect(resolved?.resolutionNotes).toBe('Fixed with patch');
    });

    it('should return false when resolving non-existent case', () => {
      const result = tracker.resolveCase('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      tracker.recordCase('case-1', 'Critical', 'Description', 'critical', 'security');
      tracker.recordCase('case-2', 'High', 'Description', 'high', 'performance');
      tracker.recordCase('case-3', 'Medium', 'Description', 'medium', 'security');
      tracker.resolveCase('case-2');
    });

    it('should calculate statistics', () => {
      const stats = tracker.getStatistics();

      expect(stats.totalCases).toBe(3);
      expect(stats.resolvedCases).toBe(1);
      expect(stats.unresolvedCases).toBe(2);
    });

    it('should count cases by severity', () => {
      const stats = tracker.getStatistics();

      expect(stats.bySeverity.critical).toBe(1);
      expect(stats.bySeverity.high).toBe(1);
      expect(stats.bySeverity.medium).toBe(1);
      expect(stats.bySeverity.low).toBe(0);
    });

    it('should count cases by category', () => {
      const stats = tracker.getStatistics();

      expect(stats.byCategory.security).toBe(2);
      expect(stats.byCategory.performance).toBe(1);
    });
  });

  describe('Watchers', () => {
    it('should notify watchers of new cases', () => {
      const mockWatcher = jest.fn();
      tracker.watch(mockWatcher);

      tracker.recordCase('case-1', 'Test', 'Description');
      expect(mockWatcher).toHaveBeenCalledTimes(1);
    });

    it('should notify watchers of resolved cases', () => {
      const mockWatcher = jest.fn();
      tracker.watch(mockWatcher);

      tracker.recordCase('case-1', 'Test', 'Description');
      tracker.resolveCase('case-1');

      expect(mockWatcher).toHaveBeenCalledTimes(2);
    });

    it('should allow unsubscribing from watchers', () => {
      const mockWatcher = jest.fn();
      const unsubscribe = tracker.watch(mockWatcher);

      tracker.recordCase('case-1', 'Test', 'Description');
      unsubscribe();
      tracker.recordCase('case-2', 'Test 2', 'Description');

      expect(mockWatcher).toHaveBeenCalledTimes(1);
    });
  });

  describe('Similar Cases', () => {
    it('should find similar cases', () => {
      tracker.recordCase('case-1', 'Perf issue', 'Description', 'high', 'performance');
      tracker.recordCase('case-2', 'Another perf issue', 'Description', 'medium', 'performance');
      tracker.recordCase('case-3', 'Security issue', 'Description', 'high', 'security');

      const similar = tracker.findSimilarCases('case-1');
      expect(similar).toHaveLength(1);
      expect(similar[0].id).toBe('case-2');
    });

    it('should not include original case in similar results', () => {
      tracker.recordCase('case-1', 'Perf issue', 'Description', 'high', 'performance');

      const similar = tracker.findSimilarCases('case-1');
      expect(similar.map(c => c.id)).not.toContain('case-1');
    });
  });

  describe('Trend Analysis', () => {
    it('should get trend data', () => {
      tracker.recordCase('case-1', 'Issue', 'Description');
      tracker.recordCase('case-2', 'Issue', 'Description');

      const trends = tracker.getTrendData(7);
      expect(trends).toHaveLength(1);
      expect(trends[0].count).toBe(2);
    });

    it('should filter by days', () => {
      tracker.recordCase('case-1', 'Issue', 'Description');

      const trends = tracker.getTrendData(0); // 0 days means only today
      const now = new Date().toISOString().split('T')[0];

      const todayData = trends.find(t => t.date === now);
      expect(todayData).toBeDefined();
    });
  });

  describe('State Management', () => {
    it('should clear all cases', () => {
      tracker.recordCase('case-1', 'Issue', 'Description');
      tracker.recordCase('case-2', 'Issue', 'Description');

      tracker.clearAll();

      expect(tracker.getStatistics().totalCases).toBe(0);
      expect(tracker.getUnresolvedCases()).toHaveLength(0);
    });
  });
});
