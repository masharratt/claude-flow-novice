import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProjectPaths, stateFilePath, templateFilePath, runFilePath } from './paths.js';

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
