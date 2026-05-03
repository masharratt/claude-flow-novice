export interface SchedulingContext {
  tasks: string[];
  dependencies: Record<string, string[]>;
  completedTasks: string[];
  failedTasks: string[];
}

export interface SchedulePlan {
  nextBatch: string[];
  blocked: string[];
  remaining: string[];
  complete: boolean;
}
