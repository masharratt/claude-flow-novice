import { execSync } from 'child_process';
import path from 'path';

// Regression test: cli.ts used require.main which throws ReferenceError in ESM scope
const CLI_PATH = path.resolve('dist/src/planning/goap/cli.js');

function runCli(input: object): { success: boolean; plan: { actions: unknown[]; totalCost: number; reachable: boolean }; error?: string } {
  const result = execSync(`echo '${JSON.stringify(input)}' | node ${CLI_PATH}`, {
    encoding: 'utf8',
  });
  return JSON.parse(result.trim());
}

describe('goap cli', () => {
  it('runs as ESM subprocess without ReferenceError', () => {
    const input = {
      state: { done: false },
      goal: { conditions: { done: true } },
      actions: [{ name: 'finish', preconditions: { done: false }, effects: { done: true }, cost: 1 }],
    };
    const output = runCli(input);
    expect(output.success).toBe(true);
    expect(output.plan.reachable).toBe(true);
  });

  it('returns optimal action sequence', () => {
    const input = {
      state: { a: false, b: false },
      goal: { conditions: { b: true } },
      actions: [
        { name: 'step_a', preconditions: { a: false }, effects: { a: true }, cost: 1 },
        { name: 'step_b', preconditions: { a: true }, effects: { b: true }, cost: 1 },
      ],
    };
    const output = runCli(input);
    expect(output.success).toBe(true);
    expect(output.plan.actions.map((a: unknown) => (a as { name: string }).name)).toEqual(['step_a', 'step_b']);
    expect(output.plan.totalCost).toBe(2);
  });

  it('returns reachable false when goal is unreachable', () => {
    const input = {
      state: { a: false },
      goal: { conditions: { b: true } },
      actions: [{ name: 'step_a', preconditions: { a: false }, effects: { a: true }, cost: 1 }],
    };
    const output = runCli(input);
    expect(output.success).toBe(false);
    expect(output.plan.reachable).toBe(false);
  });

  it('returns error on invalid JSON input', () => {
    const result = execSync(`echo 'not-json' | node ${CLI_PATH}`, { encoding: 'utf8' });
    const output = JSON.parse(result.trim());
    expect(output.success).toBe(false);
    expect(output.error).toBeTruthy();
  });
});
