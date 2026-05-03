import * as path from 'path';
import { plan } from '../../planning/goap/index.js';
import { buildSubstitutionActions } from './actions.js';
import { buildSubstitutionState } from './world-state.js';
import { substitutionGoal } from './goals.js';
import type { SubstitutionContext, SubstitutionResult } from './types.js';

interface AgentCost {
  tokens: number;
  time_ms: number;
  dollars: number;
}

type AgentAliasEntry = string | { path: string; cost?: AgentCost };

interface AgentMappings {
  categories: Record<
    string,
    {
      loop3: string[];
      loop2: string[];
    }
  >;
  agent_aliases: Record<string, AgentAliasEntry>;
}

const CROSS_CATEGORY_LOOP3_FALLBACKS = ['backend-developer', 'devops-engineer'];
const CROSS_CATEGORY_LOOP2_FALLBACKS = ['code-reviewer', 'tester'];

function loadMappings(): AgentMappings {
  const projectRoot = process.env.PROJECT_ROOT ?? process.cwd();
  const mappingsPath = path.join(
    projectRoot,
    '.claude/skills/cfn-agent-lifecycle/lib/selection/agent-mappings.json',
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(mappingsPath) as AgentMappings;
}

function agentCostTier(
  agent: string,
  mappings: AgentMappings,
  isCrossCategory: boolean,
): number {
  if (isCrossCategory) {
    return 2;
  }
  const aliasEntry = mappings.agent_aliases[agent];
  if (aliasEntry && typeof aliasEntry !== 'string' && aliasEntry.cost) {
    const { tokens } = aliasEntry.cost;
    if (tokens >= 60000) return 2;
  }
  return 1;
}

export function findSubstitute(context: SubstitutionContext): SubstitutionResult {
  const mappings = loadMappings();
  const excludedSet = new Set([...context.excludedAgents, context.failedAgent]);

  const categoryMapping = mappings.categories[context.category];
  const sameCategoryPool: string[] =
    categoryMapping != null
      ? (context.role === 'loop3' ? categoryMapping.loop3 : categoryMapping.loop2).filter(
          (a) => !excludedSet.has(a),
        )
      : [];

  const fallbacks =
    context.role === 'loop3' ? CROSS_CATEGORY_LOOP3_FALLBACKS : CROSS_CATEGORY_LOOP2_FALLBACKS;

  const crossCategoryPool = fallbacks.filter(
    (a) => !excludedSet.has(a) && !sameCategoryPool.includes(a),
  );

  const sameCategoryActions = sameCategoryPool.map((agent) => ({
    name: `assign_${agent}`,
    preconditions: {},
    effects: { substitute_found: true, chosen_agent: agent },
    cost: agentCostTier(agent, mappings, false),
  }));

  const crossCategoryActions = crossCategoryPool.map((agent) => ({
    name: `assign_${agent}`,
    preconditions: {},
    effects: { substitute_found: true, chosen_agent: agent },
    cost: agentCostTier(agent, mappings, true),
  }));

  const allActions = [...sameCategoryActions, ...crossCategoryActions];

  if (allActions.length === 0) {
    return { substitute: null, cost: 0, reachable: false };
  }

  const initialState = buildSubstitutionState(context);
  const result = plan(initialState, substitutionGoal, allActions, { maxIterations: 100 });

  if (!result.reachable || result.actions.length === 0) {
    return { substitute: null, cost: 0, reachable: false };
  }

  const lastAction = result.actions[result.actions.length - 1];
  const chosenAgent = lastAction.effects['chosen_agent'] as string;

  return {
    substitute: chosenAgent,
    cost: result.totalCost,
    reachable: true,
  };
}

export function buildSubstitutionPool(context: SubstitutionContext): string[] {
  const mappings = loadMappings();
  const excludedSet = new Set([...context.excludedAgents, context.failedAgent]);

  const categoryMapping = mappings.categories[context.category];
  const sameCategoryPool: string[] =
    categoryMapping != null
      ? (context.role === 'loop3' ? categoryMapping.loop3 : categoryMapping.loop2).filter(
          (a) => !excludedSet.has(a),
        )
      : [];

  const fallbacks =
    context.role === 'loop3' ? CROSS_CATEGORY_LOOP3_FALLBACKS : CROSS_CATEGORY_LOOP2_FALLBACKS;

  const crossCategoryPool = fallbacks.filter(
    (a) => !excludedSet.has(a) && !sameCategoryPool.includes(a),
  );

  return [...sameCategoryPool, ...crossCategoryPool];
}
