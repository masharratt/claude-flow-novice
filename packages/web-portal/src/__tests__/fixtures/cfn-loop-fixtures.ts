/**
 * Test Fixtures for CFN Loop View
 * Provides mock phase data, loop metrics, and validator results for CFN Loop visualization
 */

import type { CFNPhase, CFNSprint, CFNLoopMetrics, ValidatorResult } from '../../shared/stores/cfnLoopStore';

/**
 * Mock sprints for phases
 */
export const mockSprintsPhase1: CFNSprint[] = [
  { id: 'sprint-1.1', name: 'Monorepo Setup', completed: true },
  { id: 'sprint-1.2', name: 'Core Infrastructure', completed: true },
];

export const mockSprintsPhase2: CFNSprint[] = [
  { id: 'sprint-2.1', name: 'API Design', completed: true },
  { id: 'sprint-2.2', name: 'Database Layer', completed: true },
];

export const mockSprintsPhase3: CFNSprint[] = [
  { id: 'sprint-3.1', name: 'Portal Framework', completed: true },
  { id: 'sprint-3.2', name: 'Core Views', completed: true },
  { id: 'sprint-3.3', name: 'Advanced Features', completed: false },
];

export const mockSprintsPhase4: CFNSprint[] = [
  { id: 'sprint-4.1', name: 'E2E Tests', completed: false },
  { id: 'sprint-4.2', name: 'Performance', completed: false },
];

/**
 * Mock CFN Phases
 */
export const mockCFNPhasesBasic: CFNPhase[] = [
  {
    id: 'phase-1',
    number: 1,
    name: 'Foundation',
    sprints: mockSprintsPhase1,
    completed: true,
    startedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    completedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'phase-2',
    number: 2,
    name: 'Backend Services',
    sprints: mockSprintsPhase2,
    completed: true,
    startedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    completedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'phase-3',
    number: 3,
    name: 'Web Portal',
    sprints: mockSprintsPhase3,
    completed: false,
    startedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'phase-4',
    number: 4,
    name: 'Integration & Testing',
    sprints: mockSprintsPhase4,
    completed: false,
  },
];

/**
 * Mock CFN Phases - All completed
 */
export const mockCFNPhasesAllCompleted: CFNPhase[] = mockCFNPhasesBasic.map((phase) => ({
  ...phase,
  completed: true,
  completedAt: phase.completedAt || Date.now(),
  sprints: phase.sprints.map((sprint) => ({ ...sprint, completed: true })),
}));

/**
 * Mock CFN Phases - None completed
 */
export const mockCFNPhasesNoneCompleted: CFNPhase[] = mockCFNPhasesBasic.map((phase) => ({
  ...phase,
  completed: false,
  completedAt: undefined,
  sprints: phase.sprints.map((sprint) => ({ ...sprint, completed: false })),
}));

/**
 * Mock CFN Loop Metrics (Standard Mode: Gate ≥0.75, Consensus ≥0.90)
 */
export const mockCFNLoopMetricsStandard: CFNLoopMetrics = {
  gateThreshold: 0.75,
  consensusThreshold: 0.90,
  avgLoop3Confidence: 0.82,
  avgLoop2Consensus: 0.92,
};

/**
 * Mock CFN Loop Metrics (MVP Mode: Gate ≥0.70, Consensus ≥0.80)
 */
export const mockCFNLoopMetricsMVP: CFNLoopMetrics = {
  gateThreshold: 0.70,
  consensusThreshold: 0.80,
  avgLoop3Confidence: 0.75,
  avgLoop2Consensus: 0.85,
};

/**
 * Mock CFN Loop Metrics (Enterprise Mode: Gate ≥0.75, Consensus ≥0.95)
 */
export const mockCFNLoopMetricsEnterprise: CFNLoopMetrics = {
  gateThreshold: 0.75,
  consensusThreshold: 0.95,
  avgLoop3Confidence: 0.88,
  avgLoop2Consensus: 0.96,
};

/**
 * Mock CFN Loop Metrics - Below Thresholds
 */
export const mockCFNLoopMetricsBelowThresholds: CFNLoopMetrics = {
  gateThreshold: 0.75,
  consensusThreshold: 0.90,
  avgLoop3Confidence: 0.68, // Below gate
  avgLoop2Consensus: 0.85, // Below consensus
};

/**
 * Mock Validator Results - All Passed
 */
export const mockValidatorResultsPassed: ValidatorResult[] = [
  {
    id: 'validator-1',
    name: 'Code Reviewer',
    status: 'passed',
    confidence: 0.92,
    issues: [],
  },
  {
    id: 'validator-2',
    name: 'Security Specialist',
    status: 'passed',
    confidence: 0.88,
    issues: [],
  },
  {
    id: 'validator-3',
    name: 'Test Engineer',
    status: 'passed',
    confidence: 0.91,
    issues: [],
  },
  {
    id: 'validator-4',
    name: 'Performance Analyst',
    status: 'passed',
    confidence: 0.89,
    issues: [],
  },
];

/**
 * Mock Validator Results - Mixed Status
 */
export const mockValidatorResultsMixed: ValidatorResult[] = [
  {
    id: 'validator-1',
    name: 'Code Reviewer',
    status: 'passed',
    confidence: 0.92,
    issues: [],
  },
  {
    id: 'validator-2',
    name: 'Security Specialist',
    status: 'failed',
    confidence: 0.65,
    issues: ['SQL injection vulnerability in auth endpoint', 'Missing rate limiting on API'],
  },
  {
    id: 'validator-3',
    name: 'Test Engineer',
    status: 'passed',
    confidence: 0.88,
    issues: [],
  },
  {
    id: 'validator-4',
    name: 'Performance Analyst',
    status: 'pending',
    confidence: 0,
    issues: [],
  },
];

/**
 * Mock Validator Results - All Failed
 */
export const mockValidatorResultsFailed: ValidatorResult[] = [
  {
    id: 'validator-1',
    name: 'Code Reviewer',
    status: 'failed',
    confidence: 0.62,
    issues: ['Code quality below standards', 'Missing documentation'],
  },
  {
    id: 'validator-2',
    name: 'Security Specialist',
    status: 'failed',
    confidence: 0.58,
    issues: ['Critical security vulnerabilities found'],
  },
  {
    id: 'validator-3',
    name: 'Test Engineer',
    status: 'failed',
    confidence: 0.64,
    issues: ['Test coverage below 80%', 'Integration tests failing'],
  },
  {
    id: 'validator-4',
    name: 'Performance Analyst',
    status: 'failed',
    confidence: 0.61,
    issues: ['Performance benchmarks not met'],
  },
];

/**
 * Mock Loop Progress Values
 */
export const mockLoop3ProgressAboveGate = 0.85; // Above 0.75 gate
export const mockLoop3ProgressBelowGate = 0.68; // Below 0.75 gate
export const mockLoop3ProgressAtGate = 0.75; // Exactly at gate

export const mockLoop2ProgressAboveConsensus = 0.92; // Above 0.90 consensus
export const mockLoop2ProgressBelowConsensus = 0.85; // Below 0.90 consensus
export const mockLoop2ProgressAtConsensus = 0.90; // Exactly at consensus

/**
 * WebSocket update payloads for real-time tests
 */
export const mockWebSocketCFNLoopUpdate = {
  metrics: {
    avgLoop3Confidence: 0.87,
    avgLoop2Consensus: 0.93,
  },
  loop3Progress: 0.87,
  loop2Progress: 0.93,
};

export const mockWebSocketPhaseComplete = {
  phaseId: 'phase-3',
  completed: true,
  completedAt: Date.now(),
  nextPhase: 'phase-4',
};

export const mockWebSocketValidatorUpdate = {
  validatorId: 'validator-2',
  status: 'passed',
  confidence: 0.91,
  issues: [],
};

/**
 * Helper to create custom phase
 */
export const createMockPhase = (overrides: Partial<CFNPhase> = {}): CFNPhase => ({
  id: `phase-${Date.now()}`,
  number: 1,
  name: 'Mock Phase',
  sprints: [
    { id: 'sprint-1', name: 'Sprint 1', completed: false },
  ],
  completed: false,
  ...overrides,
});

/**
 * Helper to create custom validator result
 */
export const createMockValidatorResult = (overrides: Partial<ValidatorResult> = {}): ValidatorResult => ({
  id: `validator-${Date.now()}`,
  name: 'Mock Validator',
  status: 'pending',
  confidence: 0,
  issues: [],
  ...overrides,
});

/**
 * Helper to create custom loop metrics
 */
export const createMockLoopMetrics = (overrides: Partial<CFNLoopMetrics> = {}): CFNLoopMetrics => ({
  gateThreshold: 0.75,
  consensusThreshold: 0.90,
  avgLoop3Confidence: 0.80,
  avgLoop2Consensus: 0.88,
  ...overrides,
});
