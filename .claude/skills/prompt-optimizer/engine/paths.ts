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
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/**
 * True when `metaUrl` (a module's `import.meta.url`) names the same file the
 * process was started with (`process.argv[1]`).
 *
 * L7: a plain `metaUrl === pathToFileURL(argv1).href` comparison is FALSE
 * whenever the entry point is reached through a symlink, because Node resolves
 * `import.meta.url` to the REAL path while `argv[1]` keeps the symlinked path.
 * The shared engine is invoked as `~/.claude/skills/prompt-optimizer/...`,
 * which IS such a symlink for every consuming project, so the naive guard made
 * the CLI do nothing and exit 0 — a silent no-op indistinguishable from
 * success. Both sides are realpath'd before comparison; if either path cannot
 * be resolved on disk, it falls back to the href comparison.
 */
export function isMainModule(metaUrl: string, argv1: string | undefined): boolean {
  if (argv1 === undefined) return false;
  const here = fileURLToPath(metaUrl);
  try {
    return realpathSync(here) === realpathSync(argv1);
  } catch {
    return metaUrl === pathToFileURL(argv1).href;
  }
}
