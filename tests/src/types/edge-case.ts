// Stub: edge case types
// Created to satisfy test imports

export interface EdgeCase {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: {
    file?: string;
    line?: number;
    column?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface EdgeCaseReport {
  totalCases: number;
  bySeverity: Record<string, number>;
  cases: EdgeCase[];
}

export type EdgeCaseSeverity = 'low' | 'medium' | 'high' | 'critical';
