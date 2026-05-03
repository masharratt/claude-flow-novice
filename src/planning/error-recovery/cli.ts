import { planErrorRecovery } from './planner.js';
import type { ErrorRecoveryContext } from './types.js';

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  const context: ErrorRecoveryContext = JSON.parse(raw);
  const result = planErrorRecovery(context);
  process.stdout.write(JSON.stringify(result) + '\n');
}

main().catch((err: unknown) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
