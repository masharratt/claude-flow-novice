export type Scalar = boolean | number | string;
export type WorldState = Readonly<Record<string, Scalar>>;

export interface Action {
  name: string;
  preconditions: Record<string, Scalar>;
  effects: Record<string, Scalar>;
  cost: number;
}

export interface Goal {
  predicate: (state: WorldState) => boolean;
  heuristic?: (state: WorldState) => number;
}

export interface Plan {
  actions: Action[];
  totalCost: number;
  reachable: boolean;
}

export interface PlannerOptions {
  maxIterations?: number;
  excludedActions?: string[];
}
