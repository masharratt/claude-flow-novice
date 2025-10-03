/**
 * Epic Parser Type Definitions
 *
 * Defines TypeScript interfaces for epic configuration structure
 */

export interface Sprint {
  sprintId: string;
  name: string;
  status: 'not_started' | 'in_progress' | 'completed';
  duration: string;
  dependencies: string[];
  crossPhaseDependencies?: string[];
  acceptanceCriteria: string[];
  tasks?: string[];
  deliverables?: string[];
}

export interface Phase {
  phaseId: string;
  name: string;
  description: string;
  file: string;
  status: 'not_started' | 'in_progress' | 'completed';
  dependencies: string[];
  estimatedDuration: string;
  sprints: Sprint[];
}

export interface CrossPhaseDependency {
  from: string;
  to: string;
  description: string;
}

export interface RiskAssessment {
  highRisk: string[];
  mitigation: string[];
}

export interface EpicConfig {
  epicId: string;
  name: string;
  description: string;
  status: 'not_started' | 'in_progress' | 'completed';
  owner: string;
  estimatedDuration: string;
  overviewFile: string;
  phases: Phase[];
  epicAcceptanceCriteria: string[];
  crossPhaseDependencies: CrossPhaseDependency[];
  riskAssessment?: RiskAssessment;
}

export interface ParsedMarkdownSection {
  heading: string;
  level: number;
  content: string;
  subsections: ParsedMarkdownSection[];
}

export interface EpicParserOptions {
  epicDirectory: string;
  overviewFile?: string;
  outputFile?: string;
  validateSchema?: boolean;
}

export interface PhaseParserResult {
  phaseId: string;
  name: string;
  description: string;
  status: 'not_started' | 'in_progress' | 'completed';
  dependencies: string[];
  estimatedDuration: string;
  sprints: Sprint[];
}
