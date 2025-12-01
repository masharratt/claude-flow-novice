/**
 * RuVector Test Utilities
 *
 * Provides fixture generators, performance measurement helpers, and cleanup utilities
 * for RuVector test suite.
 */

import type { VectorEntry } from '@ruvector/core';
import type {
  DecompositionHistoryEntry,
  CodebaseIndexEntry,
  ErrorLibraryEntry,
  SecurityPatternEntry,
  PerformancePatternEntry
} from '../../src/lib/ruvector-schemas';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generate a random embedding vector
 */
export function generateRandomVector(dimensions: number = 1536): Float32Array {
  const vector = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    vector[i] = Math.random();
  }
  // Normalize to unit length
  const magnitude = Math.sqrt(Array.from(vector).reduce((sum, val) => sum + val * val, 0));
  return vector.map(val => val / magnitude) as Float32Array;
}

/**
 * Generate sample decomposition history entry
 */
export function generateDecompositionEntry(overrides?: Partial<DecompositionHistoryEntry>): {
  text: string;
  metadata: DecompositionHistoryEntry['metadata'];
} {
  const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const originalTask = 'Implement user authentication with JWT tokens';
  const decompositionApproach = 'sequential context passing';

  const defaults: DecompositionHistoryEntry = {
    text: `${originalTask} | Approach: ${decompositionApproach}`,
    metadata: {
      taskId,
      originalTask,
      decompositionApproach,
      microTaskCount: 5,
      executionPhases: 2,
      gateCheckScore: 0.95,
      gateCheckThreshold: 0.90,
      finalDecision: 'PROCEED',
      securityRiskLevel: 'low',
      securityFindings: 0,
      performanceGrade: 'A',
      performanceScore: 95,
      timestamp: Date.now(),
      decompositionTimeMs: 1200,
      executionTimeMs: 45000,
      totalTimeMs: 46200,
      successRate: 0.95,
      timesUsed: 1,
      lastUsed: Date.now(),
      taskCategory: 'api-endpoint',
      complexity: 'moderate',
      technologies: ['TypeScript', 'Express', 'JWT']
    }
  };

  return {
    text: overrides?.text || defaults.text,
    metadata: { ...defaults.metadata, ...(overrides?.metadata || {}) }
  };
}

/**
 * Generate sample codebase index entry
 */
export function generateCodebaseEntry(overrides?: Partial<CodebaseIndexEntry>): {
  text: string;
  metadata: CodebaseIndexEntry['metadata'];
} {
  const filePath = '/src/auth/login.ts';
  const purpose = 'User login endpoint with JWT generation';
  const exports = ['loginUser', 'LoginRequest', 'LoginResponse'];

  const defaults: CodebaseIndexEntry = {
    text: `${purpose} | Purpose: ${purpose} | Exports: ${exports.join(', ')}`,
    metadata: {
      filePath,
      fileName: 'login.ts',
      fileType: 'ts',
      purpose,
      exports,
      dependencies: ['express', 'jsonwebtoken', '../db/user-model'],
      lines: 150,
      complexity: 8,
      coverage: 85,
      createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
      lastModified: Date.now(),
      agentWhoCreated: 'backend-developer',
      relatedMicroTasks: ['task-auth-1', 'task-auth-2'],
      relatedFiles: ['/src/auth/middleware.ts', '/src/db/user-model.ts'],
      technologies: ['TypeScript', 'Express', 'JWT'],
      patterns: ['singleton'],
      tags: ['authentication', 'security']
    }
  };

  return {
    text: overrides?.text || defaults.text,
    metadata: { ...defaults.metadata, ...(overrides?.metadata || {}) }
  };
}

/**
 * Generate sample error library entry
 */
export function generateErrorEntry(overrides?: Partial<ErrorLibraryEntry>): {
  text: string;
  metadata: ErrorLibraryEntry['metadata'];
} {
  const errorMessage = 'TypeError: Cannot read property \'id\' of undefined';
  const rootCause = 'User object not validated before accessing properties';
  const fix = 'Add null check: if (!user) { throw new Error("User not found"); }';

  const defaults: ErrorLibraryEntry = {
    text: `${errorMessage} | Root Cause: ${rootCause} | Fix: ${fix}`,
    metadata: {
      errorMessage,
      errorType: 'TypeError',
      errorPattern: 'Cannot read property .* of undefined',
      rootCause,
      rootCauseConfidence: 0.90,
      fix,
      fixSuccessRate: 0.95,
      prevention: 'Always validate object existence before property access',
      timesSeen: 5,
      firstSeen: Date.now() - 30 * 24 * 60 * 60 * 1000,
      lastSeen: Date.now() - 2 * 24 * 60 * 60 * 1000,
      component: 'auth-service',
      language: 'TypeScript',
      framework: 'Express',
      severity: 'high',
      environments: ['development', 'staging'],
      causedBy: [],
      causes: ['error-downstream-1'],
      causeConfidence: 0.85
    }
  };

  return {
    text: overrides?.text || defaults.text,
    metadata: { ...defaults.metadata, ...(overrides?.metadata || {}) }
  };
}

/**
 * Generate sample security pattern entry
 */
export function generateSecurityEntry(overrides?: Partial<SecurityPatternEntry>): {
  text: string;
  metadata: SecurityPatternEntry['metadata'];
} {
  const codeSnippet = 'const query = `SELECT * FROM users WHERE id = ${userId}`;';
  const vulnerabilityType = 'injection';
  const findings = ['SQL Injection vulnerability in user query'];

  const defaults: SecurityPatternEntry = {
    text: `${codeSnippet} | Vulnerability: ${vulnerabilityType} | Findings: ${findings.join('; ')}`,
    metadata: {
      patternName: 'SQL Injection in User Query',
      taskCategory: 'database-query',
      vulnerabilityType,
      findings,
      criticalFindingsCount: 1,
      highFindingsCount: 0,
      occurrenceCount: 3,
      vulnerabilityScore: 85,
      commonVulnerabilities: ['SQL Injection'],
      vulnerabilityCooccurrence: { 'XSS': 2 },
      preventionStrategies: ['Use parameterized queries', 'Input validation'],
      bestPractices: ['Never concatenate user input into SQL', 'Use ORM or query builders'],
      firstSeen: Date.now() - 60 * 24 * 60 * 60 * 1000,
      lastSeen: Date.now() - 5 * 24 * 60 * 60 * 1000,
      technologies: ['PostgreSQL', 'Node.js'],
      cwe: ['CWE-89']
    }
  };

  return {
    text: overrides?.text || defaults.text,
    metadata: { ...defaults.metadata, ...(overrides?.metadata || {}) }
  };
}

/**
 * Generate sample performance pattern entry
 */
export function generatePerformanceEntry(overrides?: Partial<PerformancePatternEntry>): {
  text: string;
  metadata: PerformancePatternEntry['metadata'];
} {
  const codeSnippet = 'users.forEach(user => db.query(`SELECT * FROM orders WHERE user_id = ${user.id}`))';
  const issues = ['N+1 query pattern detected', 'Missing database index'];
  const performanceGrade = 'D';

  const defaults: PerformancePatternEntry = {
    text: `${codeSnippet} | Issues: ${issues.join('; ')} | Grade: ${performanceGrade}`,
    metadata: {
      patternName: 'N+1 Queries in User List',
      taskCategory: 'database-query',
      issueType: 'io',
      issues,
      criticalIssuesCount: 1,
      occurrenceCount: 8,
      performanceGrade,
      performanceScore: 35,
      commonIssues: ['N+1 queries', 'Missing index'],
      issueCooccurrence: { 'Missing index': 5, 'Unbounded query': 2 },
      optimizationStrategies: ['Use JOIN instead of multiple queries', 'Add database index'],
      expectedImprovement: { 'latency': '10x faster', 'database_load': '90% reduction' },
      estimatedThroughput: 50,
      estimatedLatency: 200,
      estimatedMemory: 50,
      firstSeen: Date.now() - 45 * 24 * 60 * 60 * 1000,
      lastSeen: Date.now() - 3 * 24 * 60 * 60 * 1000,
      technologies: ['PostgreSQL', 'Node.js'],
      frameworks: ['Express']
    }
  };

  return {
    text: overrides?.text || defaults.text,
    metadata: { ...defaults.metadata, ...(overrides?.metadata || {}) }
  };
}

/**
 * Generate a batch of decomposition entries
 */
export function generateDecompositionBatch(count: number): Array<{
  text: string;
  metadata: DecompositionHistoryEntry['metadata'];
}> {
  const categories = ['api-endpoint', 'database-migration', 'ui-component', 'testing', 'refactoring'];
  const complexities: Array<'simple' | 'moderate' | 'complex'> = ['simple', 'moderate', 'complex'];
  const decisions: Array<'PROCEED' | 'ITERATE' | 'ABORT'> = ['PROCEED', 'ITERATE', 'ABORT'];

  return Array.from({ length: count }, (_, i) => {
    return generateDecompositionEntry({
      metadata: {
        taskId: `batch-task-${i}`,
        originalTask: `Task ${i}: ${categories[i % categories.length]}`,
        taskCategory: categories[i % categories.length],
        complexity: complexities[i % complexities.length],
        finalDecision: decisions[i % decisions.length],
        gateCheckScore: 0.70 + Math.random() * 0.28, // 0.70-0.98
        timestamp: Date.now() - i * 60000 // Stagger timestamps
      } as any
    });
  });
}

/**
 * Performance measurement helper
 */
export class PerformanceTimer {
  private startTime: number = 0;
  private endTime: number = 0;

  start(): void {
    this.startTime = performance.now();
  }

  stop(): number {
    this.endTime = performance.now();
    return this.duration();
  }

  duration(): number {
    return this.endTime - this.startTime;
  }

  reset(): void {
    this.startTime = 0;
    this.endTime = 0;
  }
}

/**
 * Measure operation throughput
 */
export async function measureThroughput<T>(
  operation: () => Promise<T>,
  iterations: number
): Promise<{
  totalTimeMs: number;
  avgTimeMs: number;
  opsPerSecond: number;
  results: T[];
}> {
  const timer = new PerformanceTimer();
  const results: T[] = [];

  timer.start();
  for (let i = 0; i < iterations; i++) {
    results.push(await operation());
  }
  const totalTimeMs = timer.stop();

  return {
    totalTimeMs,
    avgTimeMs: totalTimeMs / iterations,
    opsPerSecond: (iterations / totalTimeMs) * 1000,
    results
  };
}

/**
 * Cleanup test database files
 */
export function cleanupTestDatabases(testDir: string): void {
  if (fs.existsSync(testDir)) {
    const files = fs.readdirSync(testDir);
    for (const file of files) {
      if (file.endsWith('.db')) {
        const filePath = path.join(testDir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.warn(`Failed to delete ${filePath}:`, error);
        }
      }
    }

    try {
      fs.rmdirSync(testDir);
    } catch (error) {
      // Directory may not be empty, that's ok
    }
  }
}

/**
 * Create test data directory
 */
export function createTestDataDir(testDir: string): void {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
}

/**
 * Assert vector similarity within threshold
 */
export function assertVectorSimilarity(
  vector1: Float32Array | number[],
  vector2: Float32Array | number[],
  threshold: number = 0.9
): boolean {
  const v1 = Array.from(vector1);
  const v2 = Array.from(vector2);

  if (v1.length !== v2.length) {
    throw new Error(`Vector dimension mismatch: ${v1.length} vs ${v2.length}`);
  }

  // Cosine similarity
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    mag1 += v1[i] * v1[i];
    mag2 += v2[i] * v2[i];
  }

  const similarity = dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
  return similarity >= threshold;
}

/**
 * Mock data factory for different collection types
 */
export const MockDataFactory = {
  decomposition: generateDecompositionEntry,
  codebase: generateCodebaseEntry,
  error: generateErrorEntry,
  security: generateSecurityEntry,
  performance: generatePerformanceEntry,
  decompositionBatch: generateDecompositionBatch
};
