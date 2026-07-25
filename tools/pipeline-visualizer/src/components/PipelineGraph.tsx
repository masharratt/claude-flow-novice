import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from 'reactflow';
import type { Node, Edge } from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

import PipelineNode from './PipelineNode';
import { filterByView } from '../data/pipeline';
import type { ViewMode, PipelineNodeData } from '../data/pipeline';

const nodeTypes = { pipeline: PipelineNode };

const NODE_WIDTH = 200;
const NODE_HEIGHT = 110;

function layoutWithDagre(
  nodes: Node<PipelineNodeData>[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB',
): Node<PipelineNodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 80,
    ranksep: 100,
    marginx: 40,
    marginy: 40,
  });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  external: '#ef4444',
  setup: '#94a3b8',
  tool: '#3b82f6',
  decision: '#eab308',
  outcome: '#16a34a',
  database: '#14b8a6',
};

const VIEW_BUTTONS: { mode: ViewMode; label: string }[] = [
  { mode: 'v4-full', label: 'Full Pipeline' },
  { mode: 'v4-happy-path', label: 'Happy Path' },
  { mode: 'v4-tools-only', label: 'Tools Only' },
];

const EDGE_LEGEND = [
  { color: '#3b82f6', label: 'trigger (sequential)' },
  { color: '#eab308', label: 'conditional (branch)' },
  { color: '#10b981', label: 'db write' },
  { color: '#f97316', label: 'loop-back (retry)' },
];

export default function PipelineGraph() {
  const [viewMode, setViewMode] = useState<ViewMode>('v4-full');
  const filtered = useMemo(() => filterByView(viewMode), [viewMode]);
  const laidOut = useMemo(
    () => layoutWithDagre(filtered.nodes, filtered.edges),
    [filtered],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(laidOut);
  const [edges, setEdges, onEdgesChange] = useEdgesState(filtered.edges);

  useEffect(() => {
    const newFiltered = filterByView(viewMode);
    const newLaidOut = layoutWithDagre(newFiltered.nodes, newFiltered.edges);
    setNodes(newLaidOut);
    setEdges(newFiltered.edges);
  }, [viewMode, setNodes, setEdges]);

  const minimapColor = useCallback((node: Node<PipelineNodeData>) => {
    return CATEGORY_COLORS[node.data.category] || '#94a3b8';
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* View mode toggle */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          display: 'flex',
          gap: 8,
          background: 'white',
          padding: '8px 12px',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 13,
        }}
      >
        {VIEW_BUTTONS.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontWeight: viewMode === mode ? 600 : 400,
              background: viewMode === mode ? '#3b82f6' : '#f1f5f9',
              color: viewMode === mode ? 'white' : '#475569',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          background: 'white',
          padding: '10px 14px',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 11,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Node types</div>
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
            <span style={{ color: '#475569' }}>{cat.replace(/-/g, ' ')}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 6, paddingTop: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Edge types</div>
          {EDGE_LEGEND.map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <div style={{ width: 16, height: 2, background: color }} />
              <span style={{ color: '#475569' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Title */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          background: 'white',
          padding: '6px 16px',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 14,
          fontWeight: 600,
          color: '#1e293b',
        }}
      >
        daily-coverage V4 agentic pipeline
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        attributionPosition="bottom-left"
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls />
        <MiniMap
          nodeColor={minimapColor}
          nodeStrokeWidth={2}
          pannable
          zoomable
          style={{ borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  );
}
