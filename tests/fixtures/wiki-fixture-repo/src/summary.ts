// Reporting (TS side): shared aggregation helper.

export function summarize(values: number[]): number {
  return values.reduce((acc, n) => acc + n, 0);
}
