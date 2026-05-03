import type { WorldState, Action, Goal, Plan, PlannerOptions } from './types.js';
import { applyEffects, hashState, preconditionsMet } from './state.js';

interface HeapNode {
  fScore: number;
  gScore: number;
  state: WorldState;
  stateHash: string;
  actionsTaken: Action[];
}

class MinHeap {
  private data: HeapNode[] = [];

  push(node: HeapNode): void {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapNode | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  get size(): number {
    return this.data.length;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      const pNode = this.data[parent]!;
      const iNode = this.data[i]!;
      if (pNode.fScore <= iNode.fScore) break;
      this.data[parent] = iNode;
      this.data[i] = pNode;
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left]!.fScore < this.data[smallest]!.fScore) {
        smallest = left;
      }
      if (right < n && this.data[right]!.fScore < this.data[smallest]!.fScore) {
        smallest = right;
      }
      if (smallest === i) break;
      const tmp = this.data[smallest]!;
      this.data[smallest] = this.data[i]!;
      this.data[i] = tmp;
      i = smallest;
    }
  }
}

const UNREACHABLE: Plan = { actions: [], totalCost: 0, reachable: false };

export function plan(
  initial: WorldState,
  goal: Goal,
  actions: Action[],
  options: PlannerOptions = {},
): Plan {
  const maxIterations = options.maxIterations ?? 10_000;
  const excluded = new Set(options.excludedActions ?? []);
  const heuristic = goal.heuristic ?? (() => 0);

  const eligible = actions.filter((a) => !excluded.has(a.name));

  if (goal.predicate(initial)) {
    return { actions: [], totalCost: 0, reachable: true };
  }

  const heap = new MinHeap();
  const closed = new Set<string>();

  const initialHash = hashState(initial);
  heap.push({
    fScore: heuristic(initial),
    gScore: 0,
    state: initial,
    stateHash: initialHash,
    actionsTaken: [],
  });

  let iterations = 0;

  while (heap.size > 0 && iterations < maxIterations) {
    iterations++;
    const current = heap.pop()!;

    if (closed.has(current.stateHash)) continue;
    closed.add(current.stateHash);

    for (const action of eligible) {
      if (!preconditionsMet(current.state, action)) continue;

      const nextState = applyEffects(current.state, action);
      const nextHash = hashState(nextState);
      if (closed.has(nextHash)) continue;

      const gScore = current.gScore + action.cost;
      const actionsTaken = [...current.actionsTaken, action];

      if (goal.predicate(nextState)) {
        return { actions: actionsTaken, totalCost: gScore, reachable: true };
      }

      heap.push({
        fScore: gScore + heuristic(nextState),
        gScore,
        state: nextState,
        stateHash: nextHash,
        actionsTaken,
      });
    }
  }

  return UNREACHABLE;
}
