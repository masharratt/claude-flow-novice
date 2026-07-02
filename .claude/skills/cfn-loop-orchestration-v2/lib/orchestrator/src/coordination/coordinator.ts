/**
 * Coordinator seam.
 *
 * The live orchestrator historically shelled `redis-cli` inline to (a) wait for
 * workers to signal completion, (b) read each worker's result, and (c) hand
 * feedback to the next iteration. That coupled the loop to a running Redis + a
 * host `redis-cli` binary. This interface extracts those operations so the
 * transport is swappable. The default implementation is file-based (no infra):
 * see FileCoordinator.
 */

/** Result a worker must produce for the gate + consensus stages. */
export interface WorkerResult {
  /** Test tallies self-reported by the worker (gate also re-runs tests itself). */
  testResult: { pass: number; fail: number; skip?: number };
  /** Worker self-confidence, 0.0–1.0. In Loop 2 this is the validator's consensus score. */
  confidence: number;
  /** Repo-relative paths the worker created/modified. */
  deliverables: string[];
}

/** Feedback the orchestrator writes for the next iteration's Loop 3 agents. */
export interface IterationFeedbackData {
  gate_pass_rate: string;
  consensus_average: string;
  reasons: string;
}

export interface Coordinator {
  /** Absolute base directory for a task's coordination artifacts. */
  baseDir(taskId: string): string;

  /** Worker calls this once it has written its result, to signal completion. */
  signalDone(taskId: string, agentId: string): void;

  /**
   * Block until every agentId has signaled done or timeout elapses.
   * Returns the agentIds that completed within the window (subset of input).
   */
  waitForDone(taskId: string, agentIds: string[], timeoutSec: number): Promise<string[]>;

  /** Worker persists its result. */
  setResult(taskId: string, agentId: string, result: WorkerResult): void;

  /** Orchestrator reads a worker's result; null if absent/unparseable. */
  getResult(taskId: string, agentId: string): WorkerResult | null;

  /** Orchestrator stores feedback for the next iteration. */
  writeFeedback(taskId: string, iteration: number, feedback: IterationFeedbackData): void;

  /** Read feedback for an iteration (workers may consume via --context instead). */
  readFeedback(taskId: string, iteration: number): IterationFeedbackData | null;
}
