import { parseEpicMarkdown, slugify } from './parser.js';
import { buildDAG, topologicalLevels, detectCycles, criticalPath } from './graph.js';
import { readFileSync } from 'fs';
import type { ExtractorOutput, EpicDoc } from './types.js';

function epicToOutput(epic: EpicDoc): ExtractorOutput {
  const dag = buildDAG(epic);

  if (detectCycles(dag).length > 0) {
    process.stderr.write('Warning: circular dependencies detected\n');
  }

  const levels = topologicalLevels(dag);
  const path = criticalPath(dag);

  const dependencies: Record<string, string[]> = {};
  for (const phase of epic.phases) {
    dependencies[phase.id] = phase.dependencies;
  }

  const parallel_opportunities: Array<{ sprint: string; can_run_parallel_with: string }> = [];
  for (const level of levels) {
    if (level.length >= 2) {
      for (let i = 0; i < level.length - 1; i++) {
        parallel_opportunities.push({
          sprint: level[i],
          can_run_parallel_with: level[i + 1],
        });
      }
    }
  }

  return {
    dependencies,
    execution_order: levels,
    critical_path: path,
    parallel_opportunities,
  };
}

function fallbackOutput(criteria: string): ExtractorOutput {
  const id = slugify(criteria.slice(0, 50)) || 'task-1';
  return {
    dependencies: { [id]: [] },
    execution_order: [[id]],
    critical_path: [id],
    parallel_opportunities: [],
  };
}

function main(): void {
  const args = process.argv.slice(2);
  let criteria = '';
  let epicFile = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--criteria' && i + 1 < args.length) {
      criteria = args[i + 1];
      i++;
    } else if (args[i] === '--epic-file' && i + 1 < args.length) {
      epicFile = args[i + 1];
      i++;
    }
  }

  let output: ExtractorOutput;

  if (epicFile) {
    const text = readFileSync(epicFile, 'utf-8');
    const epic = parseEpicMarkdown(text);
    if (epic.phases.length === 0) {
      output = fallbackOutput(criteria || epicFile);
    } else {
      output = epicToOutput(epic);
    }
  } else if (criteria.includes('###')) {
    const epic = parseEpicMarkdown(criteria);
    if (epic.phases.length === 0) {
      output = fallbackOutput(criteria);
    } else {
      output = epicToOutput(epic);
    }
  } else if (criteria) {
    output = fallbackOutput(criteria);
  } else {
    output = fallbackOutput('task-1');
  }

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main();
