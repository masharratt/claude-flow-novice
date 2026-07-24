import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProjectPaths, stateFilePath, templateFilePath, runFilePath, isMainModule } from './paths.js';

// The engine's own on-disk location (SKILL_DIR). BLOCKER-1: nothing writable
// may ever resolve under here — every project must write to its OWN cwd.
const SKILL_DIR = dirname(fileURLToPath(import.meta.url));

describe('paths.ts (BLOCKER-1 project-local resolver)', () => {
  it('resolves root under <cwd>/.claude/prompt-optimizer, not under SKILL_DIR', () => {
    const fakeCwd = '/tmp/fake-project-a';
    const paths = resolveProjectPaths(fakeCwd);
    expect(paths.root).toBe(resolve(fakeCwd, '.claude', 'prompt-optimizer'));
    expect(paths.root.startsWith(SKILL_DIR)).toBe(false);
  });

  it('resolves every writable subpath under the project root, never under SKILL_DIR', () => {
    const fakeCwd = '/tmp/fake-project-b';
    const paths = resolveProjectPaths(fakeCwd);
    for (const p of [paths.stateDir, paths.runsDir, paths.templatesDir, paths.backupsDir, paths.budgetFile, paths.configFile]) {
      expect(p.startsWith(paths.root)).toBe(true);
      expect(p.startsWith(SKILL_DIR)).toBe(false);
    }
  });

  it('two different project cwds resolve to two disjoint roots (no cross-project collision)', () => {
    const pathsA = resolveProjectPaths('/tmp/project-a');
    const pathsB = resolveProjectPaths('/tmp/project-b');
    expect(pathsA.root).not.toBe(pathsB.root);
    expect(pathsA.budgetFile).not.toBe(pathsB.budgetFile);
  });

  it('defaults to process.cwd() when no cwd argument is given', () => {
    const paths = resolveProjectPaths();
    expect(paths.root).toBe(resolve(process.cwd(), '.claude', 'prompt-optimizer'));
  });

  it('stateFilePath / templateFilePath / runFilePath stay under their respective subdir', () => {
    const paths = resolveProjectPaths('/tmp/fake-project-c');
    expect(stateFilePath(paths, 'my-target')).toBe(resolve(paths.stateDir, 'my-target.json'));
    expect(templateFilePath(paths, 'my-target')).toBe(resolve(paths.templatesDir, 'my-target.md'));
    expect(runFilePath(paths, 'my-target', '2026-01-01T00-00-00-000Z')).toBe(
      resolve(paths.runsDir, 'my-target-2026-01-01T00-00-00-000Z.md'),
    );
  });
});

// ---------------------------------------------------------------------------
// L7: main-module detection through the reverse symlink
//
// Regression: `import.meta.url === pathToFileURL(process.argv[1]).href` is
// FALSE when the engine is invoked through `~/.claude/skills/prompt-optimizer`
// (a symlink into this repo), because import.meta.url is already realpath'd
// while argv[1] still carries the symlinked path. The guard fell through, the
// CLI ran nothing, and the process exited 0 with no output — a silent no-op
// that looks exactly like success. That is the DOCUMENTED invocation path for
// every consuming project, so the bug hit every consumer but this repo.
// ---------------------------------------------------------------------------
describe('isMainModule (L7 symlinked-entry detection)', () => {
  const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } = require('node:fs') as typeof import('node:fs');
  const { tmpdir } = require('node:os') as typeof import('node:os');
  const { pathToFileURL } = require('node:url') as typeof import('node:url');

  it('returns true when argv[1] is a SYMLINK to the module file', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'po-mainmod-'));
    try {
      const realDir = resolve(tmp, 'real');
      mkdirSync(realDir);
      const realFile = resolve(realDir, 'optimize.ts');
      writeFileSync(realFile, '// entry\n', 'utf8');
      const linkDir = resolve(tmp, 'link');
      symlinkSync(realDir, linkDir, 'dir');
      const linkedFile = resolve(linkDir, 'optimize.ts');

      // import.meta.url of a loaded module is always the REAL path.
      const metaUrl = pathToFileURL(realFile).href;
      expect(isMainModule(metaUrl, linkedFile)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns true for the plain non-symlinked case', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'po-mainmod-'));
    try {
      const file = resolve(tmp, 'optimize.ts');
      writeFileSync(file, '// entry\n', 'utf8');
      expect(isMainModule(pathToFileURL(file).href, file)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns false when argv[1] is a DIFFERENT module', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'po-mainmod-'));
    try {
      const a = resolve(tmp, 'optimize.ts');
      const b = resolve(tmp, 'other.ts');
      writeFileSync(a, '// a\n', 'utf8');
      writeFileSync(b, '// b\n', 'utf8');
      expect(isMainModule(pathToFileURL(a).href, b)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns false when argv[1] is undefined (imported as a library)', () => {
    expect(isMainModule(import.meta.url, undefined)).toBe(false);
  });

  it('falls back to href comparison when a path does not exist on disk', () => {
    const ghost = '/tmp/definitely-not-here-po/optimize.ts';
    const { pathToFileURL: p2u } = require('node:url') as typeof import('node:url');
    expect(isMainModule(p2u(ghost).href, ghost)).toBe(true);
  });
});
