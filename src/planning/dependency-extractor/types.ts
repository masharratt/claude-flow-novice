export interface EpicPhase {
  id: string;
  name: string;
  dependencies: string[];
}

export interface EpicDoc {
  title: string;
  phases: EpicPhase[];
}

export interface DAG {
  nodes: string[];
  edges: Map<string, string[]>;
}

export interface ExtractorOutput {
  dependencies: Record<string, string[]>;
  execution_order: string[][];
  critical_path: string[];
  parallel_opportunities: Array<{ sprint: string; can_run_parallel_with: string }>;
}
