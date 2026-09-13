// Reporting (TS side): builds a summary report from raw counts.
// Imports its aggregation helper from the sibling module, giving the
// fixture one cross-file TS import edge for CBM to pick up.
import { summarize } from "./summary";

export function buildReport(counts: number[]): string {
  const total = summarize(counts);
  return `report: ${counts.length} entries, total ${total}`;
}

console.log(buildReport([1, 2, 3]));
