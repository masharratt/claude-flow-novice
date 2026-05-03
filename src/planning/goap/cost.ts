export const TOKENS_PER_DOLLAR = 2_000_000;

export const PROHIBITIVE_COST = 1_000_000;

const MS_PER_SECOND = 1000;
const COST_PER_SECOND = 0.001;

export function estimateCost(
  tokens: number,
  timeMs: number,
  riskMultiplier = 1.0,
): number {
  const tokenCost = tokens / TOKENS_PER_DOLLAR;
  const timeCost = (timeMs / MS_PER_SECOND) * COST_PER_SECOND;
  return (tokenCost + timeCost) * riskMultiplier;
}
