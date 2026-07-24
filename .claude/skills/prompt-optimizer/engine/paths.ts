/**
 * Project-local path resolver (BLOCKER-1).
 *
 * The engine lives under a shared skill dir that is reverse-symlinked into
 * every project (`~/.claude/skills` -> this repo). If any writable state
 * resolved relative to the engine's own location (`SKILL_DIR`), every
 * project would write into the SAME physical directory: cross-project state
 * collision, a shared budget ledger, and one project's fixtures committed
 * into another project's repo.
 *
 * Fix: every writable path resolves under the CONSUMING project's own
 * `<cwd>/.claude/prompt-optimizer/`. The engine (this file included) never
 * imports or references its own `__dirname`/`import.meta.url` for a write
 * target. SKILL_DIR (wherever this file physically lives) is read-only code.
 */
import { resolve } from 'node:path';

export interface ProjectPaths {
  /** <cwd>/.claude/prompt-optimizer */
  root: string;
  stateDir: string;
  runsDir: string;
  templatesDir: string;
  backupsDir: string;
  /** <cwd>/.claude/prompt-optimizer/_budget.json — shared ledger, but
   *  project-local, never under the engine's SKILL_DIR. */
  budgetFile: string;
  /** <cwd>/.claude/prompt-optimizer/config.json — the plugin manifest. */
  configFile: string;
}

/** Resolve every writable path for a project from its cwd. Never derives
 *  anything from the engine's own module location. */
export function resolveProjectPaths(cwd: string = process.cwd()): ProjectPaths {
  const root = resolve(cwd, '.claude', 'prompt-optimizer');
  return {
    root,
    stateDir: resolve(root, 'state'),
    runsDir: resolve(root, 'runs'),
    templatesDir: resolve(root, 'templates'),
    backupsDir: resolve(root, 'backups'),
    budgetFile: resolve(root, '_budget.json'),
    configFile: resolve(root, 'config.json'),
  };
}

export function stateFilePath(paths: ProjectPaths, targetId: string): string {
  return resolve(paths.stateDir, `${targetId}.json`);
}

export function templateFilePath(paths: ProjectPaths, targetId: string): string {
  return resolve(paths.templatesDir, `${targetId}.md`);
}

export function runFilePath(paths: ProjectPaths, targetId: string, ts: string): string {
  return resolve(paths.runsDir, `${targetId}-${ts}.md`);
}
