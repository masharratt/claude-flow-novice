// Stub: edge case tracker service
// Created to satisfy test imports

export interface TrackedEdgeCase {
  id: string;
  status: 'open' | 'resolved' | 'ignored';
  description: string;
  createdAt: Date;
  resolvedAt?: Date;
}

export class EdgeCaseTracker {
  private cases: Map<string, TrackedEdgeCase> = new Map();

  async track(edgeCase: Omit<TrackedEdgeCase, 'id' | 'createdAt'>): Promise<TrackedEdgeCase> {
    const tracked: TrackedEdgeCase = {
      ...edgeCase,
      id: `case-${Date.now()}`,
      createdAt: new Date(),
    };
    this.cases.set(tracked.id, tracked);
    return tracked;
  }

  async resolve(caseId: string): Promise<void> {
    const edgeCase = this.cases.get(caseId);
    if (edgeCase) {
      edgeCase.status = 'resolved';
      edgeCase.resolvedAt = new Date();
    }
  }

  async list(): Promise<TrackedEdgeCase[]> {
    return Array.from(this.cases.values());
  }
}
