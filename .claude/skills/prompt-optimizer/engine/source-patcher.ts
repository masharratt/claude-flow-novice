/**
 * Source patcher: replaces a sentinel-delimited region in a TS file with the
 * winning template, converting {{PLACEHOLDER}} tokens to ${localVar} based on
 * the target's varMap. Backs up the old region content first.
 *
 * Already generic — ported near-verbatim from fireside's lib/source-patcher.ts.
 *
 * Sentinels in the source file:
 *   // PROMPT-OPTIMIZER:START id=<target-id>
 *   const varName = `...template with ${interpolations}...`;
 *   // PROMPT-OPTIMIZER:END
 *
 * The patcher replaces the inner block (everything between the sentinels)
 * with a new `const <assignmentVar> = \`...\`;` assignment built from the
 * template.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface PatchResult {
  backupPath: string;
  appliedAt: string;
}

export class PatchError extends Error {
  constructor(message: string, readonly kind: 'NO_SENTINEL' | 'UNSAFE_CONTENT' | 'COMPILE_FAIL') {
    super(message);
  }
}

function escapeForTemplateLiteral(s: string): string {
  // Escape backticks and lone "${". Placeholders have already been substituted
  // by the caller — anything remaining in the text is literal and must escape.
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

export interface PatchInputs {
  projectDir: string;
  sourceFile: string;
  targetId: string;
  template: string;
  varMap: Record<string, string>;
  assignmentVar: string;
  backupsDir: string;
}

/**
 * Convert a template (with {{PLACEHOLDER}} tokens) into a TS template-literal body
 * by substituting each {{VAR}} with ${varMap[VAR]}. Literal text is escaped so
 * backticks / ${} fragments in the prose can't break out.
 */
function templateToLiteralBody(template: string, varMap: Record<string, string>): string {
  // Split on placeholder tokens. Unknown tokens → reject (mutator violated contract).
  const placeholderRegex = /\{\{([A-Z0-9_]+)\}\}/g;
  const parts: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = placeholderRegex.exec(template)) !== null) {
    const before = template.slice(cursor, match.index);
    if (before) parts.push(escapeForTemplateLiteral(before));
    const name = match[1]!;
    if (!(name in varMap)) {
      throw new PatchError(
        `Template references unknown placeholder {{${name}}}. Known: ${Object.keys(varMap).join(', ')}`,
        'UNSAFE_CONTENT',
      );
    }
    parts.push('${' + varMap[name] + '}');
    cursor = match.index + match[0].length;
  }
  const tail = template.slice(cursor);
  if (tail) parts.push(escapeForTemplateLiteral(tail));
  return parts.join('');
}

export function patchSource(inputs: PatchInputs): PatchResult {
  const sourcePath = resolve(inputs.projectDir, inputs.sourceFile);
  const content = readFileSync(sourcePath, 'utf8');

  const startMarker = `// PROMPT-OPTIMIZER:START id=${inputs.targetId}`;
  const endMarker = `// PROMPT-OPTIMIZER:END`;

  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) {
    throw new PatchError(`No sentinel "${startMarker}" in ${inputs.sourceFile}`, 'NO_SENTINEL');
  }
  const afterStart = startIdx + startMarker.length;
  const endIdx = content.indexOf(endMarker, afterStart);
  if (endIdx === -1) {
    throw new PatchError(`Found START but no matching ${endMarker}`, 'NO_SENTINEL');
  }

  const oldRegion = content.slice(afterStart, endIdx);

  // Backup. The filename is timestamped, but a millisecond ISO stamp is NOT
  // unique: two patches inside the same millisecond produced the same name and
  // the second silently OVERWROTE the first backup — losing the only copy of
  // the region it replaced. Write with the exclusive flag and suffix on
  // collision so every patch keeps its own recoverable backup.
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(inputs.backupsDir, { recursive: true });
  let backupPath = resolve(inputs.backupsDir, `${inputs.targetId}-${ts}.txt`);
  for (let n = 1; ; n++) {
    try {
      writeFileSync(backupPath, oldRegion, { encoding: 'utf8', flag: 'wx' });
      break;
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException)?.code !== 'EEXIST') throw e;
      backupPath = resolve(inputs.backupsDir, `${inputs.targetId}-${ts}-${n}.txt`);
    }
  }

  const literalBody = templateToLiteralBody(inputs.template, inputs.varMap);
  const newRegion = `\n  const ${inputs.assignmentVar} = \`${literalBody}\`;\n  `;

  const newContent = content.slice(0, afterStart) + newRegion + content.slice(endIdx);

  // Lightweight template-literal sanity check. Wrap the emitted body in a dummy
  // function that stubs every interpolation var, then try to parse. Cheaper than
  // tsc --noEmit and catches the realistic failure mode (mutator emits stray
  // backticks or broken ${} that escape wasn't able to neutralize).
  try {
    const varNames = new Set<string>();
    for (const expr of Object.values(inputs.varMap)) {
      // Skip function call expressions (ending with ()) — they reference existing code, not new decls
      if (expr.endsWith('()')) continue;
      // Extract leading identifier of dotted expressions: persona.domain -> persona
      const leading = expr.match(/^[A-Za-z_$][\w$]*/);
      if (leading) varNames.add(leading[0]);
    }
    const dummyDecls = [...varNames]
      .map(n => `const ${n} = ${n === 'input' ? '{ title: "" }' : n === 'persona' ? '{ domain: "", speechPattern: "" }' : '""'};`)
      .join('\n');
    const probeSrc = `(() => { ${dummyDecls}\nreturn \`${literalBody}\`; })();`;
    // eslint-disable-next-line no-new-func
    new Function(probeSrc);
  } catch (err: any) {
    // Don't write; leave file untouched, report via backup (which already holds old region).
    throw new PatchError(`Template literal parse check failed: ${err.message}`, 'COMPILE_FAIL');
  }

  writeFileSync(sourcePath, newContent, 'utf8');
  return { backupPath, appliedAt: ts };
}
