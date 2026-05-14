import type { Node, Edge } from 'reactflow';

export type NodeCategory =
  | 'external'
  | 'setup'
  | 'tool'
  | 'decision'
  | 'outcome'
  | 'database';

export interface PipelineNodeData {
  label: string;
  category: NodeCategory;
  file?: string;
  line?: number;
  description?: string;
  states?: string[];
  cost?: string;
  bg?: string;
  border?: string;
}

// --- Nodes ---

const externalNodes: Node<PipelineNodeData>[] = [
  {
    id: 'user-request',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'User / Scheduler',
      category: 'external',
      description: 'On-demand or pool episode request',
    },
  },
  {
    id: 'trigger-deepdive',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'Deep Dive Trigger',
      category: 'external',
      file: 'trigger/deep-dive.ts',
      line: 62,
      description: 'task entry',
    },
  },
];

const setupNodes: Node<PipelineNodeData>[] = [
  {
    id: 'setup-pricing',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'Load Pricing',
      category: 'setup',
      description: 'DB pricing pre-load',
    },
  },
  {
    id: 'setup-source',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'Resolve Source Text',
      category: 'setup',
      description: 'Article summary or custom topic',
    },
  },
  {
    id: 'setup-topic',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'Derive Topic & Tier',
      category: 'setup',
      description: 'Topic slug + content tier (local/standard/complex)',
    },
  },
  {
    id: 'setup-state',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'Init Pipeline State',
      category: 'setup',
      description: 'PipelineState + BudgetTracker + AuditLogger',
    },
  },
];

const toolNodes: Node<PipelineNodeData>[] = [
  {
    id: 'tool-inspect',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'inspect_state',
      category: 'tool',
      description: 'Read-only state check',
      cost: '$0.00',
    },
  },
  {
    id: 'tool-story',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'check_story_context',
      category: 'tool',
      description: 'Detect continuation via embeddings',
      cost: '$0.00',
    },
  },
  {
    id: 'tool-research',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'run_research',
      category: 'tool',
      description: 'Evidence + DailyScrape',
      cost: '~$0.02-0.04',
    },
  },
  {
    id: 'tool-deep-research',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'deep_research',
      category: 'tool',
      description: 'Targeted follow-up queries',
      cost: '~$0.01-0.02',
    },
  },
  {
    id: 'tool-synthesis',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'run_synthesis',
      category: 'tool',
      description: 'Structure research into briefing',
      cost: '~$0.01',
    },
  },
  {
    id: 'tool-personas',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'recall_personas',
      category: 'tool',
      description: 'Resolve AI personas from Memgraph',
      cost: '~$0.001',
    },
  },
  {
    id: 'tool-script',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'generate_script',
      category: 'tool',
      description: 'Gemini Flash script generation',
      cost: '~$0.01-0.02',
    },
  },
  {
    id: 'tool-verify',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'verify_claims',
      category: 'tool',
      description: 'Extract facts, verify, patch',
      cost: '~$0.005-0.01',
    },
  },
  {
    id: 'tool-quality',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'validate_quality',
      category: 'tool',
      description: 'Composite quality gate',
      cost: '~$0.002',
    },
  },
  {
    id: 'tool-rewrite',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'rewrite_section',
      category: 'tool',
      description: 'Targeted rewrite',
      cost: '~$0.005',
    },
  },
  {
    id: 'tool-audio',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'generate_audio',
      category: 'tool',
      description: 'TTS + R2 upload',
      cost: '~$0.03-0.05',
    },
  },
  {
    id: 'tool-validate-ep',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'validate_episode',
      category: 'tool',
      description: '17 rule-based pre-publish checks',
      cost: '$0.00',
    },
  },
  {
    id: 'tool-finalize',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'finalize',
      category: 'tool',
      description: 'DB write, Memgraph sync, notifications',
      cost: '~$0.002',
    },
  },
];

const decisionNodes: Node<PipelineNodeData>[] = [
  {
    id: 'decision-sufficient',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: { label: 'Research sufficient?', category: 'decision' },
  },
  {
    id: 'decision-gaps',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: { label: 'Mandatory gaps?', category: 'decision' },
  },
  {
    id: 'decision-novelty',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: { label: 'New material found?', category: 'decision' },
  },
  {
    id: 'decision-fabrication',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: { label: 'Fabrication > 10%?', category: 'decision' },
  },
  {
    id: 'decision-quality',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: { label: 'Quality recommendation?', category: 'decision' },
  },
  {
    id: 'decision-budget',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: { label: 'Budget critical?', category: 'decision' },
  },
  {
    id: 'decision-episode',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: { label: 'Episode validation?', category: 'decision' },
  },
];

const outcomeNodes: Node<PipelineNodeData>[] = [
  {
    id: 'outcome-ready',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'status: ready',
      category: 'outcome',
      description: 'Success',
      bg: '#dcfce7',
      border: '#16a34a',
    },
  },
  {
    id: 'outcome-failed',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'status: failed',
      category: 'outcome',
      description: 'Failure',
      bg: '#fee2e2',
      border: '#dc2626',
    },
  },
  {
    id: 'outcome-insufficient',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'status: insufficient_info',
      category: 'outcome',
      description: 'Not enough material',
      bg: '#fef3c7',
      border: '#d97706',
    },
  },
];

const dbNodes: Node<PipelineNodeData>[] = [
  {
    id: 'db-deepdives',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'deep_dives',
      category: 'database',
      states: ['pending', 'researching', 'generating', 'ready', 'insufficient_info', 'failed'],
    },
  },
  {
    id: 'db-pipeline-stages',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'pipeline_stages',
      category: 'database',
      description: 'Audit trail per tool call',
    },
  },
  {
    id: 'db-facts',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'extracted_facts',
      category: 'database',
      description: 'Verified facts',
    },
  },
  {
    id: 'db-memgraph',
    type: 'pipeline',
    position: { x: 0, y: 0 },
    data: {
      label: 'Memgraph',
      category: 'database',
      description: 'Graph DB: episodes, entities, personas',
    },
  },
];

export const nodes: Node<PipelineNodeData>[] = [
  ...externalNodes,
  ...setupNodes,
  ...toolNodes,
  ...decisionNodes,
  ...outcomeNodes,
  ...dbNodes,
];

// --- Edges ---

type EdgeType = 'trigger' | 'conditional' | 'db-write' | 'loop-back';

interface PipelineEdgeData {
  connectionType: EdgeType;
}

const EDGE_COLORS: Record<EdgeType, string> = {
  trigger: '#3b82f6',
  conditional: '#eab308',
  'db-write': '#10b981',
  'loop-back': '#f97316',
};

let edgeCounter = 0;

function edge(
  source: string,
  target: string,
  type: EdgeType,
  label?: string,
  idSuffix?: string,
): Edge<PipelineEdgeData> {
  edgeCounter += 1;
  const id = idSuffix
    ? `${source}->${target}::${idSuffix}`
    : `${source}->${target}`;
  return {
    id,
    source,
    target,
    label,
    style: { stroke: EDGE_COLORS[type], strokeWidth: 2 },
    labelStyle: { fontSize: 10, fill: '#64748b' },
    animated: type !== 'db-write',
    data: { connectionType: type },
  };
}

// Reset counter before building edges so it's stable across hot reloads
edgeCounter = 0;

export const edges: Edge<PipelineEdgeData>[] = [
  // Entry flow
  edge('user-request', 'trigger-deepdive', 'trigger', 'trigger()'),
  edge('trigger-deepdive', 'setup-pricing', 'trigger', 'orchestrateDeepDive()'),
  edge('setup-pricing', 'setup-source', 'trigger'),
  edge('setup-source', 'setup-topic', 'trigger'),
  edge('setup-topic', 'setup-state', 'trigger'),

  // Agent loop start
  edge('setup-state', 'tool-inspect', 'trigger', 'agent loop start'),
  edge('tool-inspect', 'tool-story', 'trigger', 'always first'),
  edge('tool-story', 'tool-research', 'trigger'),
  edge('tool-research', 'decision-sufficient', 'trigger'),

  // Research sufficiency branch
  edge('decision-sufficient', 'tool-deep-research', 'conditional', 'insufficient'),
  edge('decision-sufficient', 'tool-synthesis', 'trigger', 'sufficient'),
  edge('tool-deep-research', 'tool-synthesis', 'trigger', 'merge sources'),

  // Synthesis -> mandatory gaps check
  edge('tool-synthesis', 'decision-gaps', 'trigger'),
  edge('decision-gaps', 'tool-deep-research', 'conditional', 'gaps found', 'from-gaps'),
  edge('decision-gaps', 'decision-novelty', 'trigger', 'no gaps'),

  // Novelty check
  edge('decision-novelty', 'outcome-insufficient', 'conditional', 'no new material'),
  edge('decision-novelty', 'tool-personas', 'trigger', 'has material'),

  // Script generation path
  edge('tool-personas', 'tool-script', 'trigger'),
  edge('tool-script', 'tool-verify', 'trigger'),
  edge('tool-verify', 'decision-fabrication', 'trigger'),

  // Fabrication check
  edge('decision-fabrication', 'tool-script', 'loop-back', 'retry script', 'fabrication-retry'),
  edge('decision-fabrication', 'tool-quality', 'trigger', 'acceptable'),

  // Quality gate
  edge('tool-quality', 'decision-quality', 'trigger'),
  edge('decision-quality', 'tool-script', 'loop-back', 'regenerate', 'quality-regen'),
  edge('decision-quality', 'tool-rewrite', 'conditional', 'rewrite suggested'),
  edge('decision-quality', 'decision-budget', 'trigger', 'ready for audio'),
  edge('tool-rewrite', 'tool-quality', 'loop-back', 're-validate', 'rewrite-revalidate'),

  // Budget check -> audio
  edge('decision-budget', 'tool-audio', 'trigger', 'budget OK'),
  edge('decision-budget', 'tool-audio', 'conditional', 'budget critical, skip refinement', 'budget-critical'),

  // Episode validation
  edge('tool-audio', 'tool-validate-ep', 'trigger'),
  edge('tool-validate-ep', 'decision-episode', 'trigger'),
  edge('decision-episode', 'tool-finalize', 'trigger', 'pass'),
  edge('decision-episode', 'tool-audio', 'loop-back', 'fixable: retry', 'ep-retry'),
  edge('decision-episode', 'tool-finalize', 'conditional', 'terminal: fail', 'ep-terminal'),

  // Finalize outputs
  edge('tool-finalize', 'outcome-ready', 'trigger', 'success'),
  edge('tool-finalize', 'outcome-failed', 'conditional', 'terminal failure'),
  edge('tool-finalize', 'outcome-insufficient', 'conditional', 'no material'),

  // DB writes
  edge('tool-research', 'db-pipeline-stages', 'db-write', 'audit'),
  edge('tool-verify', 'db-facts', 'db-write', 'persist facts'),
  edge('tool-audio', 'db-deepdives', 'db-write', 'audioUrl, script'),
  edge('tool-finalize', 'db-deepdives', 'db-write', 'status, SEO, sources'),
  edge('tool-finalize', 'db-memgraph', 'db-write', 'episodes, entities'),
  edge('tool-finalize', 'db-pipeline-stages', 'db-write', 'final audit'),
];

// View configurations
export type ViewMode = 'v4-full' | 'v4-happy-path' | 'v4-tools-only';

const HAPPY_PATH_NODE_IDS = new Set([
  'user-request',
  'trigger-deepdive',
  'setup-pricing',
  'setup-source',
  'setup-topic',
  'setup-state',
  'tool-inspect',
  'tool-story',
  'tool-research',
  'tool-synthesis',
  'tool-personas',
  'tool-script',
  'tool-verify',
  'tool-quality',
  'tool-audio',
  'tool-validate-ep',
  'tool-finalize',
  'outcome-ready',
  'db-deepdives',
  'db-pipeline-stages',
  'db-facts',
  'db-memgraph',
]);

const TOOLS_ONLY_NODE_IDS = new Set([
  'tool-inspect',
  'tool-story',
  'tool-research',
  'tool-deep-research',
  'tool-synthesis',
  'tool-personas',
  'tool-script',
  'tool-verify',
  'tool-quality',
  'tool-rewrite',
  'tool-audio',
  'tool-validate-ep',
  'tool-finalize',
]);

const LOOP_BACK_EDGE_IDS = new Set([
  'decision-fabrication->tool-script::fabrication-retry',
  'decision-quality->tool-script::quality-regen',
  'tool-rewrite->tool-quality::rewrite-revalidate',
  'decision-episode->tool-audio::ep-retry',
]);

const DECISION_NODE_IDS = new Set([
  'decision-sufficient',
  'decision-gaps',
  'decision-novelty',
  'decision-fabrication',
  'decision-quality',
  'decision-budget',
  'decision-episode',
]);

export function filterByView(view: ViewMode) {
  if (view === 'v4-full') {
    return { nodes, edges };
  }

  if (view === 'v4-happy-path') {
    const visibleNodes = nodes.filter((n) => HAPPY_PATH_NODE_IDS.has(n.id));
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = edges.filter(
      (e) =>
        visibleIds.has(e.source) &&
        visibleIds.has(e.target) &&
        !LOOP_BACK_EDGE_IDS.has(e.id) &&
        !DECISION_NODE_IDS.has(e.source) &&
        !DECISION_NODE_IDS.has(e.target),
    );
    return { nodes: visibleNodes, edges: visibleEdges };
  }

  // v4-tools-only
  const visibleNodes = nodes.filter((n) => TOOLS_ONLY_NODE_IDS.has(n.id));
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = edges.filter(
    (e) =>
      visibleIds.has(e.source) &&
      visibleIds.has(e.target) &&
      e.data?.connectionType === 'trigger',
  );
  return { nodes: visibleNodes, edges: visibleEdges };
}
