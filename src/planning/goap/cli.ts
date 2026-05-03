import { plan } from './astar.js';
import type { WorldState, Action, PlannerOptions, Scalar } from './types.js';

interface CliGoal {
  conditions: Record<string, Scalar>;
}

interface CliInput {
  state: Record<string, Scalar>;
  goal: CliGoal;
  actions: Action[];
  options?: PlannerOptions;
}

interface CliOutput {
  plan: {
    actions: Action[];
    totalCost: number;
    reachable: boolean;
  };
  success: boolean;
  error?: string;
}

export async function main(): Promise<void> {
  let raw = '';
  process.stdin.setEncoding('utf8');

  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  let output: CliOutput;

  try {
    const input: CliInput = JSON.parse(raw);
    const initialState: WorldState = Object.freeze(input.state);

    const goalConditions = input.goal.conditions;
    const predicate = (s: WorldState): boolean => {
      for (const [k, v] of Object.entries(goalConditions)) {
        if (s[k] !== v) return false;
      }
      return true;
    };

    const result = plan(initialState, { predicate }, input.actions, input.options);
    output = { plan: result, success: result.reachable };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    output = {
      plan: { actions: [], totalCost: 0, reachable: false },
      success: false,
      error: message,
    };
  }

  process.stdout.write(JSON.stringify(output) + '\n');
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(String(err) + '\n');
    process.exit(1);
  });
}
