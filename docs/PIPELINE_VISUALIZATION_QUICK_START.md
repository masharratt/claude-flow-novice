# Pipeline Visualization: Quick Start Guide

**See also:** `RESEARCH_PIPELINE_VISUALIZATION.md` for detailed comparison and confidence scores.

---

## Decision Tree (Choose in <1 minute)

```
Do you have a React or Svelte codebase?
├─ YES (React)
│  └─> USE: React Flow + Dagre
│      Bundle: ~130KB | Setup: 2-3 days | Community: Largest
│
├─ YES (Svelte)
│  └─> USE: Svelte Flow + Dagre
│      Bundle: ~110KB | Setup: 2-3 days | Svelte-native
│
└─ NO (vanilla JS / other framework)
   ├─ Do you need <50KB bundle?
   │  ├─ YES
   │  │  └─> USE: Dagre + custom SVG renderer OR d3-dag
   │  │      Bundle: ~50KB | Setup: 4-5 days | Control: Full
   │  │
   │  └─ NO
   │     ├─ Do you want graph-theory approach?
   │     │  ├─ YES
   │     │  │  └─> USE: Cytoscape.js + ELK
   │     │  │      Bundle: ~600KB | Setup: 3-4 days | Power: High
   │     │  │
   │     │  └─ NO
   │     │     └─ Do you have simple pipelines (<100 nodes)?
   │     │        ├─ YES
   │     │        │  └─> USE: Mermaid + svg-pan-zoom
   │     │        │      Bundle: ~100KB | Setup: <1 day | Simplicity: Max
   │     │        │
   │     │        └─ NO
   │     │           └─> USE: React Flow (even in non-React app)
   │     │               Bundle: ~130KB | Setup: 2-3 days | Best DX
```

---

## Implementation Templates

### Template A: React Flow + Dagre (Recommended)

**Installation:**
```bash
npm install reactflow dagre
```

**Basic Component (read-only):**
```tsx
import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(
  () => ({})
);

function layoutNodes(nodes: Node[], edges: Edge[]) {
  dagreGraph.setGraph({ rankdir: 'TB', ranksep: 50, nodesep: 50 });

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: 150, height: 50 });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map(node => ({
    ...node,
    position: {
      x: dagreGraph.node(node.id).x,
      y: dagreGraph.node(node.id).y,
    },
  }));
}

export function PipelineViewer({ nodes: inputNodes, edges: inputEdges }) {
  const layoutedNodes = useMemo(
    () => layoutNodes(inputNodes, inputEdges),
    [inputNodes, inputEdges]
  );

  const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
  const [edges, , onEdgesChange] = useEdgesState(inputEdges);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable={false}
        edgesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true} // Allow selection for inspection
        attributionPosition="bottom-right"
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

// Usage:
const nodes = [
  { id: '1', data: { label: 'Extract' }, position: { x: 0, y: 0 } },
  { id: '2', data: { label: 'Transform' }, position: { x: 0, y: 0 } },
  { id: '3', data: { label: 'Load' }, position: { x: 0, y: 0 } },
];

const edges = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
];

export default () => <PipelineViewer nodes={nodes} edges={edges} />;
```

**Key Props for Read-Only:**
| Prop | Value | Purpose |
|------|-------|---------|
| `nodesDraggable` | `false` | Prevent node movement |
| `edgesDraggable` | `false` | Prevent edge dragging |
| `nodesConnectable` | `false` | Prevent new connections |
| `elementsSelectable` | `true` | Allow click inspection |

---

### Template B: Mermaid + svg-pan-zoom (Simplest)

**Installation:**
```bash
npm install mermaid svg-pan-zoom
```

**Component:**
```tsx
import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import SvgPanZoom from 'svg-pan-zoom';

mermaid.initialize({ startOnLoad: true });

export function MermaidPipeline({ definition }: { definition: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGElement | null>(null);
  const panZoomRef = useRef<any>(null);

  useEffect(() => {
    const render = async () => {
      if (!containerRef.current) return;

      // Render Mermaid
      const { svg } = await mermaid.render('diagram', definition);
      containerRef.current.innerHTML = svg;

      // Get SVG and enable pan/zoom
      const svgElement = containerRef.current.querySelector('svg') as SVGElement;
      if (svgElement) {
        // Remove width/height to make responsive
        svgElement.removeAttribute('width');
        svgElement.removeAttribute('height');
        svgElement.style.width = '100%';
        svgElement.style.height = '100%';

        if (panZoomRef.current) {
          panZoomRef.current.destroy();
        }

        panZoomRef.current = SvgPanZoom(svgElement, {
          zoomEnabled: true,
          controlIconsEnabled: true,
          fit: true,
          center: true,
          minZoom: 0.5,
          maxZoom: 10,
        });
      }
    };

    render();

    return () => {
      if (panZoomRef.current) {
        panZoomRef.current.destroy();
      }
    };
  }, [definition]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100vh',
        border: '1px solid #ccc',
      }}
    />
  );
}

// Usage:
const pipelineDefinition = `
graph TD
    A[Extract] --> B[Transform]
    B --> C[Load]
    B --> D[Validate]
    D --> C
`;

export default () => <MermaidPipeline definition={pipelineDefinition} />;
```

**Total Bundle:** ~100KB (Mermaid ~80KB + svg-pan-zoom ~20KB)
**Setup Time:** <1 hour
**Best For:** Simple, text-based pipelines

---

### Template C: Dagre + Custom SVG (Minimal Bundle)

**Installation:**
```bash
npm install dagre
```

**Component:**
```tsx
import React, { useMemo } from 'react';
import dagre from 'dagre';

interface PipelineProps {
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ source: string; target: string }>;
}

export function DagrePipeline({ nodes: inputNodes, edges: inputEdges }: PipelineProps) {
  const { layoutedNodes, layoutedEdges } = useMemo(() => {
    const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', ranksep: 50, nodesep: 50 });

    inputNodes.forEach(n => g.setNode(n.id, { width: 120, height: 50 }));
    inputEdges.forEach(e => g.setEdge(e.source, e.target));

    dagre.layout(g);

    const layoutedNodes = inputNodes.map(n => ({
      ...n,
      x: g.node(n.id).x,
      y: g.node(n.id).y,
    }));

    const layoutedEdges = inputEdges.map(e => ({
      ...e,
      points: g.edge(e.source, e.target).points || [],
    }));

    return { layoutedNodes, layoutedEdges };
  }, [inputNodes, inputEdges]);

  return (
    <svg width="100%" height="600" style={{ border: '1px solid #ccc' }}>
      {/* Draw edges (paths) */}
      {layoutedEdges.map((edge, i) => {
        const points = edge.points;
        if (!points.length) return null;
        const d = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
        return (
          <path key={`edge-${i}`} d={d} stroke="#999" fill="none" strokeWidth="2" />
        );
      })}

      {/* Draw nodes */}
      {layoutedNodes.map(node => (
        <g key={node.id} transform={`translate(${node.x},${node.y})`}>
          <rect
            x="-60"
            y="-25"
            width="120"
            height="50"
            fill="#fff"
            stroke="#333"
            strokeWidth="2"
            rx="4"
          />
          <text x="0" y="0" textAnchor="middle" dy="0.3em" fontSize="12">
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
```

**Total Bundle:** ~30KB (Dagre only)
**Setup Time:** 2-3 hours (rendering boilerplate)
**Best For:** Minimal footprint, full control

---

### Template D: Cytoscape.js + ELK (Graph-Theory Approach)

**Installation:**
```bash
npm install cytoscape cytoscape-elk
```

**Component:**
```tsx
import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import elk from 'cytoscape-elk';

cytoscape.use(elk);

interface PipelineProps {
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ source: string; target: string }>;
}

export function CytoscapePipeline({ nodes, edges }: PipelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            content: 'data(label)',
            'text-halign': 'center',
            'text-valign': 'center',
            'background-color': '#fff',
            'border-width': 2,
            'border-color': '#333',
          },
        },
        {
          selector: 'edge',
          style: {
            'target-arrow-shape': 'triangle',
            'line-color': '#999',
            'width': 2,
          },
        },
      ],
      elements: [
        ...nodes.map(n => ({ data: { id: n.id, label: n.label } })),
        ...edges.map(e => ({ data: { source: e.source, target: e.target } })),
      ],
      layout: { name: 'elk' },
    });

    // Disable interactivity
    cy.userZoomingEnabled(false);
    cy.panningEnabled(false);
    cy.autolock(true);

    // Fit to viewport
    cy.fit();
  }, [nodes, edges]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100vh',
        border: '1px solid #ccc',
      }}
    />
  );
}
```

**Total Bundle:** ~600KB (with ELK.js)
**Setup Time:** 1-2 hours
**Best For:** Graph-theory mindset, advanced layouts

---

## Boilerplate Comparison

| Template | Lines | Setup (hours) | Bundle | Dependencies |
|----------|-------|--------------|--------|--------------|
| **React Flow + Dagre** | 80-120 | 2-3 | ~130KB | 2 |
| **Mermaid + svg-pan-zoom** | 60 | <1 | ~100KB | 2 |
| **Dagre + custom SVG** | 150-200 | 4-5 | ~30KB | 1 |
| **Cytoscape + ELK** | 80 | 2-3 | ~600KB | 2 |

---

## Feature Support Matrix

| Feature | React Flow | Mermaid | Dagre+SVG | Cytoscape |
|---------|-----------|--------|-----------|-----------|
| **Zoom/Pan** | ✅ Built-in | ✅ svg-pan-zoom | ⚠️ DIY | ✅ Built-in |
| **Auto-Layout** | ✅ Dagre/ELK | ✅ Built-in | ✅ Dagre | ✅ ELK/Dagre |
| **Custom Nodes** | ✅ React Components | ❌ SVG only | ✅ SVG/Canvas | ⚠️ CSS styling |
| **Click Handlers** | ✅ Built-in | ⚠️ DIY | ⚠️ DIY | ✅ Built-in |
| **Node Expansion** | ✅ Easy | ⚠️ Complex | ⚠️ Complex | ✅ Easy |
| **Animation** | ✅ Smooth | ✅ Via CSS | ⚠️ DIY | ✅ Smooth |
| **Production-Ready** | ✅ Yes | ✅ Yes | ⚠️ Yes (with work) | ✅ Yes |

---

## Common Use Cases

### "I have a simple 20-node ETL pipeline, read-only view"
→ **Use Mermaid + svg-pan-zoom** (fastest, <1 hour setup)

### "I need to render generated DAGs from my Python backend"
→ **Use React Flow + Dagre** (best DX, works with JSON nodes/edges)

### "I want graph analytics + visualization"
→ **Use Cytoscape.js** (powerful graph algorithms, mature)

### "I need the absolute smallest bundle"
→ **Use Dagre + custom SVG** (30KB, but more work)

### "I have a complex workflow with custom node types"
→ **Use React Flow** (excellent custom node support via React components)

### "I'm already using Svelte"
→ **Use Svelte Flow + Dagre** (same as React Flow, Svelte-native)

---

## Performance Tips

1. **Limit nodes to <500 for smooth interactions** - React Flow handles 500+ well; Cytoscape handles 1000+
2. **Lazy-load ELK.js** if using it (500KB uncompressed, compress before sending)
3. **Use node memoization** in React Flow to prevent unnecessary re-renders
4. **Disable selection** if not needed (reduces event handling overhead)
5. **Use `elementsSelectable={false}`** if inspection not required

---

## Deployment Checklist

- [ ] Choose template based on decision tree above
- [ ] Set up read-only props (`nodesDraggable={false}`, etc.)
- [ ] Test with 10, 50, and 100+ node graphs
- [ ] Add zoom/pan controls (or verify default works)
- [ ] Add node labels / visual hierarchy
- [ ] Test mobile responsiveness (if needed)
- [ ] Check bundle size post-build (goal: <200KB gzipped)
- [ ] Verify zoom limits work (min 0.5x, max 5x recommended)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Nodes overlap / bad layout | Use ELK.js instead of Dagre; adjust `ranksep` / `nodesep` |
| Pan/zoom not working | Check if pan/zoom library initialized; test on non-IE browsers |
| Labels cut off | Increase node width/height in Dagre config |
| Graph doesn't fit viewport | Call `cy.fit()` (Cytoscape) or adjust initial zoom |
| Bundle too large | Remove ELK.js (use Dagre instead); lazy-load as needed |
| Performance degrades with 500+ nodes | Switch to Cytoscape.js or implement node culling |

---

## Next Steps

1. **Pick a template** from the decision tree
2. **Copy the component code** above
3. **Test with your data** (swap out sample nodes/edges)
4. **Read the full research doc** (`RESEARCH_PIPELINE_VISUALIZATION.md`) if you need more details
5. **Open an issue** if you hit blockers

