/**
 * File-based Coordinator implementation.
 *
 * Replaces the historical inline `redis-cli` shelling with plain filesystem
 * operations: no Redis, no external deps beyond Node's `fs`/`path`. Each task
 * gets its own directory under CFN_RUN_DIR (or PROJECT_ROOT/.artifacts/cfn-loop)
 * holding `done/`, `results/`, and `feedback/` subdirectories.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { Coordinator, WorkerResult, IterationFeedbackData } from './coordinator';

/**
 * Sanitize a taskId/agentId for safe use as a path segment.
 *
 * Strips path separators, parent-directory traversal (`..`), leading dots,
 * and control characters; collapses any remaining disallowed character to
 * `_`. Guarantees the returned string cannot escape the directory it is
 * joined into.
 */
function safe(name: string): string {
  // Strip control characters (including NUL).
  // eslint-disable-next-line no-control-regex
  let result = name.replace(/[\x00-\x1f\x7f]/g, '');

  // Replace path separators and any remaining disallowed characters with `_`.
  // Allow only alphanumerics, dash, underscore, and dot (dots handled below).
  result = result.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Neutralize `..` traversal segments and strip leading dots so the result
  // can never resolve to a parent directory or hidden/relative path.
  result = result.replace(/\.\./g, '_').replace(/^\.+/, '_');

  if (result.length === 0) {
    result = '_';
  }

  return result;
}

/** Async delay helper (real timer, not a busy-wait). */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Validate the shape of a parsed WorkerResult. */
function isValidWorkerResult(value: unknown): value is WorkerResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  const testResult = candidate.testResult;
  if (typeof testResult !== 'object' || testResult === null) {
    return false;
  }
  const tr = testResult as Record<string, unknown>;
  if (!isFiniteNumber(tr.pass) || !isFiniteNumber(tr.fail)) {
    return false;
  }
  if (tr.skip !== undefined && !isFiniteNumber(tr.skip)) {
    return false;
  }

  const confidence = candidate.confidence;
  if (!isFiniteNumber(confidence) || confidence < 0 || confidence > 1) {
    return false;
  }

  const deliverables = candidate.deliverables;
  if (!Array.isArray(deliverables) || !deliverables.every((d) => typeof d === 'string')) {
    return false;
  }

  return true;
}

export class FileCoordinator implements Coordinator {
  private root(): string {
    const projectRoot = process.env.PROJECT_ROOT || process.cwd();
    return process.env.CFN_RUN_DIR || path.join(projectRoot, '.artifacts/cfn-loop');
  }

  baseDir(taskId: string): string {
    return path.join(this.root(), safe(taskId));
  }

  private doneDir(taskId: string): string {
    return path.join(this.baseDir(taskId), 'done');
  }

  private resultsDir(taskId: string): string {
    return path.join(this.baseDir(taskId), 'results');
  }

  private feedbackDir(taskId: string): string {
    return path.join(this.baseDir(taskId), 'feedback');
  }

  private doneMarkerPath(taskId: string, agentId: string): string {
    return path.join(this.doneDir(taskId), safe(agentId));
  }

  private resultPath(taskId: string, agentId: string): string {
    return path.join(this.resultsDir(taskId), `${safe(agentId)}.json`);
  }

  private feedbackPath(taskId: string, iteration: number): string {
    return path.join(this.feedbackDir(taskId), `iteration-${iteration}.json`);
  }

  signalDone(taskId: string, agentId: string): void {
    const dir = this.doneDir(taskId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.doneMarkerPath(taskId, agentId), '');
  }

  async waitForDone(taskId: string, agentIds: string[], timeoutSec: number): Promise<string[]> {
    const deadline = Date.now() + timeoutSec * 1000;
    const pollIntervalMs = 300;

    for (;;) {
      const completed = agentIds.filter((agentId) =>
        fs.existsSync(this.doneMarkerPath(taskId, agentId))
      );

      if (completed.length === agentIds.length || Date.now() >= deadline) {
        return completed;
      }

      const remainingMs = deadline - Date.now();
      await delay(Math.min(pollIntervalMs, Math.max(remainingMs, 0)));
    }
  }

  setResult(taskId: string, agentId: string, result: WorkerResult): void {
    const dir = this.resultsDir(taskId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.resultPath(taskId, agentId), JSON.stringify(result));
  }

  getResult(taskId: string, agentId: string): WorkerResult | null {
    try {
      const raw = fs.readFileSync(this.resultPath(taskId, agentId), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return isValidWorkerResult(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  writeFeedback(taskId: string, iteration: number, feedback: IterationFeedbackData): void {
    const dir = this.feedbackDir(taskId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.feedbackPath(taskId, iteration), JSON.stringify(feedback));
  }

  readFeedback(taskId: string, iteration: number): IterationFeedbackData | null {
    try {
      const raw = fs.readFileSync(this.feedbackPath(taskId, iteration), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return parsed as IterationFeedbackData;
    } catch {
      return null;
    }
  }
}
