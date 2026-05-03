import { planNextBatch } from './planner.js';
import type { SchedulingContext } from './types.js';
import { readFileSync } from 'fs';

function main(): void {
  let inputJson = '';

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && i + 1 < args.length) {
      inputJson = readFileSync(args[i + 1], 'utf-8');
      i++;
    }
  }

  if (!inputJson) {
    const chunks: string[] = [];
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => chunks.push(chunk));
    process.stdin.on('end', () => {
      inputJson = chunks.join('');
      runAndPrint(inputJson);
    });
    return;
  }

  runAndPrint(inputJson);
}

function runAndPrint(json: string): void {
  const ctx: SchedulingContext = JSON.parse(json);
  const plan = planNextBatch(ctx);
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
}

main();
