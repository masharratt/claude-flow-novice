import { findSubstitute } from './planner.js';
import type { SubstitutionContext } from './types.js';

async function main(): Promise<void> {
  let raw = '';
  process.stdin.setEncoding('utf-8');

  for await (const chunk of process.stdin) {
    raw += chunk as string;
  }

  let context: SubstitutionContext;
  try {
    context = JSON.parse(raw) as SubstitutionContext;
  } catch {
    process.stdout.write(JSON.stringify({ error: 'Invalid JSON input' }) + '\n');
    process.exit(1);
  }

  try {
    const result = findSubstitute(context);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (err) {
    process.stdout.write(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) + '\n',
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
