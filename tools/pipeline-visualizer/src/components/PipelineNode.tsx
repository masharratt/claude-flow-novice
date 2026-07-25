import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { PipelineNodeData, NodeCategory } from '../data/pipeline';

const CATEGORY_STYLES: Record<NodeCategory, { bg: string; border: string; icon: string }> = {
  external: { bg: '#fef2f2', border: '#ef4444', icon: '🌐' },
  setup: { bg: '#f8fafc', border: '#94a3b8', icon: '⚙' },
  tool: { bg: '#eff6ff', border: '#3b82f6', icon: '🔧' },
  decision: { bg: '#fefce8', border: '#eab308', icon: '◆' },
  outcome: { bg: '#f0fdf4', border: '#16a34a', icon: '🏁' },
  database: { bg: '#f0fdfa', border: '#14b8a6', icon: '🗄' },
};

function PipelineNode({ data }: { data: PipelineNodeData }) {
  // Outcome nodes can override bg/border from data
  const baseStyle = CATEGORY_STYLES[data.category];
  const bg = data.bg ?? baseStyle.bg;
  const border = data.border ?? baseStyle.border;
  const icon = baseStyle.icon;

  const isDecision = data.category === 'decision';

  return (
    <div
      style={{
        background: bg,
        border: `2px solid ${border}`,
        borderRadius: isDecision ? '50%' : data.category === 'database' ? 12 : 8,
        padding: isDecision ? '10px 16px' : '8px 14px',
        minWidth: isDecision ? 120 : 140,
        maxWidth: isDecision ? 160 : 220,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        textAlign: isDecision ? 'center' : 'left',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: border, width: 8, height: 8 }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: data.description || data.states || data.cost ? 4 : 0,
          justifyContent: isDecision ? 'center' : 'flex-start',
        }}
      >
        <span style={{ fontSize: 14 }}>{icon}</span>
        <strong style={{ color: '#1e293b', fontSize: 12, lineHeight: 1.3 }}>{data.label}</strong>
      </div>

      {data.description && (
        <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.3 }}>
          {data.description}
        </div>
      )}

      {data.cost && (
        <div style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace', marginTop: 3 }}>
          {data.cost}
        </div>
      )}

      {data.states && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
          {data.states.map((s) => (
            <span
              key={s}
              style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 4,
                background:
                  s === 'ready' || s === 'completed' ? '#dcfce7' :
                  s === 'failed' ? '#fee2e2' :
                  s === 'insufficient_info' ? '#fef3c7' : '#f1f5f9',
                color:
                  s === 'ready' || s === 'completed' ? '#166534' :
                  s === 'failed' ? '#991b1b' :
                  s === 'insufficient_info' ? '#92400e' : '#475569',
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {data.file && (
        <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 4, fontFamily: 'monospace' }}>
          {data.file}{data.line ? `:${data.line}` : ''}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: border, width: 8, height: 8 }} />
    </div>
  );
}

export default memo(PipelineNode);
