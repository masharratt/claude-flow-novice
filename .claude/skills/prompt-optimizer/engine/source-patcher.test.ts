import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { patchSource, PatchError } from './source-patcher.js';

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'prompt-optimizer-source-patcher-test-'));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

const TARGET_ID = 'mock-target';
const SOURCE_REL = 'src/prompt.ts';
const BACKUPS_REL = '.claude/prompt-optimizer/backups';

function writeSource(body: string): string {
  const abs = join(projectDir, SOURCE_REL);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body, 'utf8');
  return abs;
}

function backupsDirPath(): string {
  return join(projectDir, BACKUPS_REL);
}

describe('source-patcher.ts: patchSource (E2 real API)', () => {
  it('replaces the sentinel region with a new const assignment built from the template + varMap, leaving surrounding content untouched', () => {
    writeSource(
      'export function buildPrompt(input: { x: string }) {\n' +
        '  // PROMPT-OPTIMIZER:START id=mock-target\n' +
        '  const promptVar = `OLD CONTENT`;\n' +
        '  // PROMPT-OPTIMIZER:END\n' +
        '  return promptVar;\n' +
        '}\n',
    );

    const result = patchSource({
      projectDir,
      sourceFile: SOURCE_REL,
      targetId: TARGET_ID,
      template: 'Hello {{NAME}}, welcome to {{PLACE}}.',
      varMap: { NAME: 'input.name', PLACE: 'input.place' },
      assignmentVar: 'promptVar',
      backupsDir: backupsDirPath(),
    });

    const after = readFileSync(join(projectDir, SOURCE_REL), 'utf8');
    expect(after).toContain('export function buildPrompt(input: { x: string }) {');
    expect(after).toContain('// PROMPT-OPTIMIZER:START id=mock-target');
    expect(after).toContain('// PROMPT-OPTIMIZER:END');
    expect(after).toContain('return promptVar;');
    expect(after).toContain('const promptVar = `Hello ${input.name}, welcome to ${input.place}.`;');
    expect(after).not.toContain('OLD CONTENT');

    expect(existsSync(result.backupPath)).toBe(true);
    expect(readFileSync(result.backupPath, 'utf8')).toContain('OLD CONTENT');
    expect(typeof result.appliedAt).toBe('string');
  });

  it('resolves sourceFile relative to the passed projectDir, never the engine module location (BLOCKER-1)', () => {
    writeSource(
      '// PROMPT-OPTIMIZER:START id=mock-target\n' + 'const x = `OLD`;\n' + '// PROMPT-OPTIMIZER:END\n',
    );

    const result = patchSource({
      projectDir,
      sourceFile: SOURCE_REL,
      targetId: TARGET_ID,
      template: 'NEW',
      varMap: {},
      assignmentVar: 'x',
      backupsDir: backupsDirPath(),
    });

    // The backup path and patched source path must both live under THIS
    // project's temp dir, not anywhere near the engine's own SKILL_DIR.
    expect(result.backupPath.startsWith(projectDir)).toBe(true);
    expect(readFileSync(join(projectDir, SOURCE_REL), 'utf8')).toContain('NEW');
  });

  it('writes the backup file to backupsDir BEFORE the source overwrite, containing the OLD region verbatim', () => {
    writeSource(
      '// PROMPT-OPTIMIZER:START id=mock-target\n' +
        '  const x = `PRIOR REGION TEXT`;\n' +
        '// PROMPT-OPTIMIZER:END\n',
    );

    const result = patchSource({
      projectDir,
      sourceFile: SOURCE_REL,
      targetId: TARGET_ID,
      template: 'REPLACED',
      varMap: {},
      assignmentVar: 'x',
      backupsDir: backupsDirPath(),
    });

    const backupContent = readFileSync(result.backupPath, 'utf8');
    expect(backupContent).toContain('PRIOR REGION TEXT');
    expect(backupContent).not.toContain('REPLACED');
  });

  it('throws PatchError(NO_SENTINEL) and does NOT modify the file when the START sentinel is absent', () => {
    const original = 'export function buildPrompt() {\n  return "no sentinels here";\n}\n';
    writeSource(original);

    expect(() =>
      patchSource({
        projectDir,
        sourceFile: SOURCE_REL,
        targetId: TARGET_ID,
        template: 'NEW',
        varMap: {},
        assignmentVar: 'x',
        backupsDir: backupsDirPath(),
      }),
    ).toThrow(PatchError);

    try {
      patchSource({
        projectDir,
        sourceFile: SOURCE_REL,
        targetId: TARGET_ID,
        template: 'NEW',
        varMap: {},
        assignmentVar: 'x',
        backupsDir: backupsDirPath(),
      });
    } catch (err) {
      expect(err).toBeInstanceOf(PatchError);
      expect((err as PatchError).kind).toBe('NO_SENTINEL');
      expect((err as PatchError).message).toMatch(/no sentinel/i);
    }

    expect(readFileSync(join(projectDir, SOURCE_REL), 'utf8')).toBe(original);
  });

  it('throws PatchError(NO_SENTINEL) when START is present but END is missing', () => {
    const original = '// PROMPT-OPTIMIZER:START id=mock-target\nconst x = `Y`;\n';
    writeSource(original);

    let caught: unknown;
    try {
      patchSource({
        projectDir,
        sourceFile: SOURCE_REL,
        targetId: TARGET_ID,
        template: 'NEW',
        varMap: {},
        assignmentVar: 'x',
        backupsDir: backupsDirPath(),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PatchError);
    expect((caught as PatchError).kind).toBe('NO_SENTINEL');
    expect((caught as PatchError).message).toMatch(/no matching/i);
    // Untouched: the throw happens before any write.
    expect(readFileSync(join(projectDir, SOURCE_REL), 'utf8')).toBe(original);
  });

  it('throws PatchError(UNSAFE_CONTENT) when the template references a placeholder absent from varMap, and does not write', () => {
    const original = '// PROMPT-OPTIMIZER:START id=mock-target\nconst x = `OLD`;\n// PROMPT-OPTIMIZER:END\n';
    writeSource(original);

    let caught: unknown;
    try {
      patchSource({
        projectDir,
        sourceFile: SOURCE_REL,
        targetId: TARGET_ID,
        template: 'Hello {{UNKNOWN_VAR}}',
        varMap: { NAME: 'input.name' },
        assignmentVar: 'x',
        backupsDir: backupsDirPath(),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PatchError);
    expect((caught as PatchError).kind).toBe('UNSAFE_CONTENT');
    expect((caught as PatchError).message).toMatch(/UNKNOWN_VAR/);
    expect(readFileSync(join(projectDir, SOURCE_REL), 'utf8')).toBe(original);
  });

  it('escapes literal backticks and ${...} fragments in the template text so the emitted literal cannot break out', () => {
    writeSource('// PROMPT-OPTIMIZER:START id=mock-target\nconst x = `OLD`;\n// PROMPT-OPTIMIZER:END\n');

    patchSource({
      projectDir,
      sourceFile: SOURCE_REL,
      targetId: TARGET_ID,
      // Literal backtick and a literal "${" that must NOT be interpreted as
      // an interpolation. Only {{PLACEHOLDER}} tokens are substituted.
      template: 'Say `hi` and show ${literal} plus {{NAME}}',
      varMap: { NAME: 'input.name' },
      assignmentVar: 'x',
      backupsDir: backupsDirPath(),
    });

    const after = readFileSync(join(projectDir, SOURCE_REL), 'utf8');
    expect(after).toContain('\\`hi\\`');
    expect(after).toContain('\\${literal}');
    expect(after).toContain('${input.name}');
  });

  it('creates backupsDir on demand and gives each call a distinct backup filename', () => {
    writeSource('// PROMPT-OPTIMIZER:START id=mock-target\nconst x = `A`;\n// PROMPT-OPTIMIZER:END\n');
    expect(existsSync(backupsDirPath())).toBe(false);

    const r1 = patchSource({
      projectDir,
      sourceFile: SOURCE_REL,
      targetId: TARGET_ID,
      template: 'B',
      varMap: {},
      assignmentVar: 'x',
      backupsDir: backupsDirPath(),
    });

    writeSource('// PROMPT-OPTIMIZER:START id=mock-target\nconst x = `B`;\n// PROMPT-OPTIMIZER:END\n');
    const r2 = patchSource({
      projectDir,
      sourceFile: SOURCE_REL,
      targetId: TARGET_ID,
      template: 'C',
      varMap: {},
      assignmentVar: 'x',
      backupsDir: backupsDirPath(),
    });

    expect(existsSync(backupsDirPath())).toBe(true);
    expect(r1.backupPath).not.toBe(r2.backupPath);
    const files = readdirSync(backupsDirPath());
    expect(files.length).toBeGreaterThanOrEqual(2);
  });
});
